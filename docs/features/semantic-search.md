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
  → embeds the query, calls search_reviews()
  → { "results": [ … ] }        // empty array is SEARCH-4, not an error
```

The function passes neither `min_similarity` nor the pool sizes — their defaults live in the migration, which is what keeps recalibrating the threshold a schema change and stops a client from sending `min_similarity: 0` and turning the empty state into a page of weak matches. It calls the RPC as the caller (anon key plus the caller's `Authorization`), never as service_role, because `search_reviews` is granted to `authenticated` alone.

Share one embedding helper module between `embed` and `search`.

```sql
create or replace function search_reviews(
  query_embedding vector(1536),
  filter_tags     amenity_tag[] default '{}',
  candidate_pool  int default 100,
  result_limit    int default 20,
  min_similarity  float default 0.35   -- calibrated 2026-08-15, see below
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
- `min_similarity` **is** the SEARCH-4 empty state. Zero rows means "no strong match." Now `0.35`, calibrated — see the threshold section below before changing it.

**Result design.** Tapping a card expands it to full text in place; a separate control opens the spot page. Pull ~100 candidate reviews, group by `spot_id`, take each spot's max. Design as though results 1–3 are what people see; treat the rest as overflow.

### The threshold

`min_similarity` **is** the SEARCH-4 empty state. Zero rows means "no strong match," and the UI says exactly that.

~~`0.25` is a placeholder — after seeding, run ten real queries, log the similarity spread, and set the threshold between the worst good match and the best bad one.~~ **Calibrated 2026-08-15: `0.35`.** The pass ran (`node scripts/calibrate-search.mjs`, ten queries against the 56 seeded reviews once backfilled) and the rule above turned out to be unsatisfiable — there is no band between the worst good match and the best bad one:

| | Query | Top similarity |
| --- | --- | --- |
| worst on-topic | "background noise, not total silence" | 0.416 |
| **best off-topic** | **"parking near campus"** | **0.475** |
| next off-topic | "where to buy textbooks" | 0.314 |
| next off-topic | "how do I drop a class" | 0.305 |

`0.35` clears the two off-topic queries it can clear, with margin on both sides, and keeps all seven on-topic queries. Raising it to silence "parking near campus" would need `≥ 0.475`, which also silences "background noise, not total silence" and "good natural light and a view" — real queries with real answers in the corpus.

**Known residual: an off-topic query that is still *about campus places* leaks weak results instead of the empty state.** No threshold fixes it. The reviews are campus-place prose — "newest building on campus", "long walk from main campus", "shuttle ride … health campus" — so a query about campus places really is near them in the embedding space. Cosine distance over review bodies cannot make the judgment "this is about a place to sit." That is the measured limit of the instrument, not a threshold still needing tuning, and it is why "parking near campus" stays in the calibration set rather than being dropped for making the numbers untidy.

Biased toward recall deliberately. 56 reviews is a sparse space; on-topic queries only score higher as the corpus densifies, so this can be raised later on evidence — and it cannot easily come down once people have learned that search returns nothing. **Rerun the calibration when real reviews replace seed volume.**

### Screen

- `(app)/(tabs)/search` — vertical list of review cards, not a carousel. Each card: review body (truncated), spot name, building, occupancy pill, tag chips. Tap expands in place. Explicit empty state. The route is still `/search`; the tab group does not change the URL.
