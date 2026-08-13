# Semantic search

**IDs:** SEARCH-1..4

Related: [reviews](reviews.md) · [amenity tags](amenity-tags.md) · [architecture](../ARCHITECTURE.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| SEARCH-1 | Free-text queries are embedded and matched against review embeddings via pgvector similarity. |
| SEARCH-2 | Results are review cards — the matching review text with its spot attached — not spot summaries. Deduped to one card per spot by taking each spot's best-matching review. Fetch ~100 candidates wide, display the top few. |
| SEARCH-3 | Amenity filters can be applied to narrow results; filters are hard constraints, not ranking signals. |
| SEARCH-4 | A query with no strong matches returns an explicit empty state, not weak results presented as matches. |

**Acceptance:** A query phrased in vibe terms ("somewhere to lock in") returns spots whose reviews describe that experience, without the user using any official location vocabulary.

---

## Rationale

Students don't think in library taxonomy, they think in vibe. Keyword search forces a translation step most people won't bother with. The differentiator isn't "search" — it's that the index is built from what students actually wrote, so results match how a place feels rather than how it's catalogued. This also compounds: more reviews means a denser embedding space and better matches, so growth improves the core feature directly rather than just adding volume.

Semantic search and amenity filters do different jobs and shouldn't be blurred. Search handles fuzzy intent; filters handle hard constraints. "I need an outlet" is a yes/no requirement and should never be inferred from review text.

---

## Implementation

One Edge Function, not two round trips — mobile latency is the whole reason:

```
POST /functions/v1/search
  { "query": "place to lock in", "filter_tags": ["outlets"] }
  → embeds the query, calls search_reviews(), returns cards
```

Share one embedding helper module between `embed` and `search`.

```sql
create or replace function search_reviews(
  query_embedding vector(1536),
  filter_tags     amenity_tag[] default '{}',
  candidate_pool  int default 100,
  result_limit    int default 20,
  min_similarity  float default 0.25
)
returns table (
  review_id uuid, spot_id uuid, body text, similarity float,
  area_name text, building text, amenity_tags amenity_tag[],
  review_count bigint,
  occupancy occupancy_status,   -- null = no recent report
  reported_at timestamptz
)
language sql stable security definer as $$
  with candidates as (
    select r.id as review_id, r.spot_id, r.body,
           1 - (r.embedding <=> query_embedding) as similarity
    from reviews r
    join spots s on s.id = r.spot_id
    where r.hidden = false
      and r.embedding is not null
      and (cardinality(filter_tags) = 0 or s.amenity_tags @> filter_tags)
    order by r.embedding <=> query_embedding
    limit candidate_pool
  ),
  best_per_spot as (
    select distinct on (spot_id) * from candidates
    order by spot_id, similarity desc
  )
  select b.review_id, b.spot_id, b.body, b.similarity,
         s.area_name, bl.name, s.amenity_tags,
         (select count(*) from reviews r2
            where r2.spot_id = b.spot_id and not r2.hidden),
         o.status, o.reported_at
  from best_per_spot b
  join spots s        on s.id = b.spot_id
  join buildings bl   on bl.id = s.building_id
  left join spot_occupancy o on o.spot_id = b.spot_id
  where b.similarity >= min_similarity
  order by b.similarity desc
  limit result_limit;
$$;
```

Implementer traps:

- `<=>` is cosine **distance**. Similarity is `1 - distance`. Order the scan by distance ascending, or index usage disappears the moment one is added.
- Postgres requires the `distinct on` expression to lead the `order by`, which is why the inner sort is by `spot_id` first.
- The occupancy join must stay a **left** join. A missing report is `null` and renders "no recent reports."
- `min_similarity` **is** the SEARCH-4 empty state. Zero rows means "no strong match." `0.25` is a placeholder — recalibrate against seeded data.

**Result design.** Tapping a card expands it to full text in place; a separate control opens the spot page. Pull ~100 candidate reviews, group by `spot_id`, take each spot's max. Design as though results 1–3 are what people see; treat the rest as overflow.

`min_similarity` **is** the SEARCH-4 empty state. Zero rows means "no strong match," and the UI says exactly that. `0.25` is a placeholder — after seeding, run ten real queries, log the similarity spread, and set the threshold between the worst good match and the best bad one. Do not ship the default unexamined.

### Screen

- `(app)/search` — vertical list of review cards, not a carousel. Each card: review body (truncated), spot name, building, occupancy pill, tag chips. Tap expands in place. Explicit empty state.
