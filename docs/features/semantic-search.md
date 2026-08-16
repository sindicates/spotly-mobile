# Semantic search

**IDs:** SEARCH-1..5

Related: [reviews](reviews.md) · [amenity tags](amenity-tags.md) · [architecture](../ARCHITECTURE.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| SEARCH-1 | Free-text queries are embedded and matched against review embeddings via pgvector similarity. |
| SEARCH-2 | Results are review cards — the matching review text with its spot attached — not spot summaries. Deduped to one card per spot by taking each spot's best ~~matching~~ **satisfying** review (SEARCH-5, 2026-08-15). Fetch ~100 candidates wide, display the top few. |
| SEARCH-3 | Amenity filters can be applied to narrow results; filters are hard constraints, not ranking signals. |
| SEARCH-4 | A query with no strong matches returns an explicit empty state, not weak results presented as matches. ~~Below the similarity threshold.~~ **Owned by SEARCH-5's verdicts as of 2026-08-15**; the calibrated threshold still owns it whenever the judge is unreachable. |
| SEARCH-5 | Candidate reviews are judged for *satisfaction*, not just topical similarity: a review describing the opposite of what was asked is dropped rather than ranked. Judgement happens before the one-card-per-spot dedupe, so a spot can be represented by a different review than similarity would have picked. |

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
  → embeds the query
  → search_review_candidates()   retrieve: ~10 spots, up to 3 reviews each
  → rerank.ts                    judge: satisfies | contradicts | no_evidence
  → resolveSpots()               dedupe: one card per spot, survivors only
  → { "results": [ … ] }         // empty array is SEARCH-4, not an error
```

The dedupe is the third step, not the first. That ordering is the whole point of SEARCH-5 — see "The satisfaction judge" below.

The function passes neither `min_similarity` nor the pool sizes — their defaults live in the migration, which is what keeps retuning the shortlist a schema change and stops a client from widening the pool until the rerank bill hurts. It calls the RPC as the caller (anon key plus the caller's `Authorization`), never as service_role, because the search RPCs are granted to `authenticated` alone.

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
  reported_at timestamptz,
  image_path text               -- null = no building photo yet (REV-12)
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
         o.status, o.reported_at,
         img.storage_path
  from best_per_spot b
  join spots s        on s.id = b.spot_id
  join buildings bl   on bl.id = s.building_id
  left join spot_occupancy o on o.spot_id = b.spot_id
  left join building_images img on img.building_id = bl.id and img.is_primary
  where b.similarity >= min_similarity
  order by b.similarity desc
  limit result_limit;
$$;
```

Implementer traps:

- `<=>` is cosine **distance**. Similarity is `1 - distance`. Order the scan by distance ascending, or index usage disappears the moment one is added.
- Postgres requires the `distinct on` expression to lead the `order by`, which is why the inner sort is by `spot_id` first.
- The occupancy join must stay a **left** join. A missing report is `null` and renders "no recent reports."
- ~~`min_similarity` **is** the SEARCH-4 empty state.~~ **Changed 2026-08-15 (SEARCH-5).** It is now one of two floors and no longer the empty state on the happy path — see the threshold section below before changing either.

**Result design.** Tapping a card expands it to full text in place; a separate control opens the spot page. Pull ~100 candidate reviews, group by `spot_id`, take each spot's max. Design as though results 1–3 are what people see; treat the rest as overflow.

### The threshold

~~`min_similarity` **is** the SEARCH-4 empty state.~~ **Changed 2026-08-15.** With SEARCH-5 shipped there are two floors, doing different jobs, and the calibrated number moved rather than being deleted:

| Floor | Lives in | Value | Job |
| --- | --- | --- | --- |
| Pool guard | `search_review_candidates` arg default | `0.15` | Keeps obvious noise out of the judge's prompt. Not a relevance bar. |
| Fallback floor | `FALLBACK_MIN_SIMILARITY` in `_shared/rerank.ts` | `0.35` | The calibration below, still owning SEARCH-4 whenever the judge is unreachable. |

Both are needed. Dropping to a single low floor would mean every Anthropic outage answers with a page of weak matches — precisely what the calibration below exists to prevent. The rest of this section is why `0.35` is `0.35`, and it still governs the fallback path.

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

### Future scope: a reranking pass

~~Not built.~~ **Built 2026-08-15 as SEARCH-5** — `_shared/rerank.ts`, on Claude Haiku 4.5. The scoping notes below are kept as recorded rationale so the model-family tradeoff doesn't have to be re-derived; what shipped is described under "The satisfaction judge" after them.

**The gap.** Cosine similarity over embeddings measures topical proximity, not satisfaction. It can't judge "user wants warm, review says bring a hoodie" — that requires reading the review and the query together and drawing an inference, which is exactly what the "known residual" above describes as the measured limit of the instrument. A reranking pass — something that sees the query and each candidate review together, after the RPC and before the response — is the layer that could close this.

**Two families of model, different tradeoffs:**

- **Dedicated cross-encoder rerankers** (Voyage `rerank-2.5`/`rerank-2.5-lite`, Cohere `rerank-v3.5`) — fast, cheap per-candidate, trained specifically for query↔document relevance. But they fail predictably on: negation ("not quiet at all" still scores high on "quiet"), numeric/temporal comparison ("open until 11pm" vs "open past midnight"), conditionals ("great if you don't mind noise"), multi-constraint conjunction (one scalar score can't verify each clause of "quiet, has outlets, open late" independently), sarcasm, and campus-specific vocabulary the reranker wasn't trained on. Score is also a relative rank signal, not a calibrated probability — harder to found a stable SEARCH-4 empty-state cutoff on than an explicit boolean.
  - **Billing note:** Voyage is Anthropic-owned but appears to run a separate account/API key/billing from Claude API credits (confirmed by docs as of 2026-08; no evidence of a unified balance). Budget for it as a separate line item if chosen.
  - OpenAI has no equivalent dedicated rerank endpoint — only embeddings.
- **Fast general LLMs prompted as the judge** (Claude Haiku 4.5, Gemini 2.5 Flash/Flash-Lite, GPT-5-mini/nano) — handle the inferential cases (negation, implication, conditionals) better because they reason rather than pattern-match on relevance training data, at somewhat higher latency/cost per candidate. Mitigate cost by batching the shortlist into one **listwise** call with a structured-output schema, not one call per candidate.

**Leaning:** a hybrid — keep the existing cosine-similarity cut from ~100 candidates down to a shortlist (~10–20), then one listwise LLM call over just that shortlist for the satisfaction judgment. Keeps the expensive layer scoped to near-threshold candidates instead of the full pool.

~~**Open before building:** does the LLM pass *re-rank* the RPC's results, or *filter* out candidates that clear `min_similarity` but fail satisfaction (the SEARCH-4 leak case)? That decision changes the response schema and belongs in this doc once made.~~

**Resolved 2026-08-15: both, and the schema does not change.** The two bugs need different halves of it. Filtering alone drops the hoodie review but leaves the review that *does* answer wherever cosine put it; reranking alone leaves "parking near campus" returning a page of weak matches, which SEARCH-4 forbids. Doing both is expressible as "a filtered, reordered list of the same rows", so the wire shape stays the eleven fields it already was and no client code changes.

### The satisfaction judge

One listwise call to Claude Haiku 4.5 over the whole shortlist, structured output, one verdict per review: `satisfies`, `contradicts`, or `no_evidence`. Ordering is done in TypeScript from those verdicts rather than asked for — models drop and duplicate indices when made to emit a ranking, and there is nothing to gain from it.

**Judgement runs before the dedupe, and that is the point.** `search_reviews` collapses to one review per spot in SQL, keeping each spot's highest-cosine review — which for "warm cozy corner in winter" is KSL Fourth floor's *"Gets cold near the windows, bring a hoodie even in September."* A judge handed only that row can reject the spot and nothing else. Handed all three of that spot's reviews, it can also find the sibling that answers, so `search_review_candidates` returns the shortlist uncollapsed and `resolveSpots` does the dedupe afterwards.

**The recall trap, which is the thing most likely to break this.** Every seeded review answers REV-11 — *"what's it good for, and what's the catch?"* — so every single one ends in a complaint. A judge that reads any negative clause as disqualifying returns nothing for everything, and it looks like a working build until you try it. The prompt's load-bearing sentence is therefore *"a complaint only matters when it is about the thing the student asked for"*, anchored on two verbatim rows from `seed.sql`: Sears' *"Very quiet. No outlets anywhere near the good seats, which is the whole catch"* as `satisfies` for a quiet query, and the KSL hoodie line as `contradicts` for a warm one. Both examples must stay verbatim; paraphrasing them decalibrates the judge against the corpus it actually sees. **Recall is the first number to read in `scripts/calibrate-rerank.mjs`, before precision.**

A spot is dropped when none of its reviews satisfies — that covers "every review contradicts" and "nothing here speaks to the query" alike, and it is what turns SEARCH-4 into a judgement. A satisfying review outranks a contradicting sibling rather than being cancelled by it; with every review carrying a complaint, letting one contradiction poison a spot would collapse recall.

**Failure is always open.** Missing key, timeout, 429, malformed JSON, `stop_reason` of `max_tokens` or `refusal` — every one of them logs and falls back to the cosine ranking at `0.35`. This deliberately differs from `_shared/embedding.ts`, which turns a missing key into a 500: without an embedding there is no search at all, whereas without a judgement there is just a worse one. `RERANK_ENABLED=false` forces the same path without a redeploy.

**Measured 2026-08-15** (`node scripts/calibrate-rerank.mjs`, 24 runs over 12 queries, ~20 candidates each):

| | Before | After |
| --- | --- | --- |
| Recall (on-topic queries returning results) | 9/9 | **9/9** — no recall cliff |
| Precision (off-topic queries returning nothing) | 2/3 | **3/3** — "parking near campus" now empty |
| Latency p50 / p95 | 238ms / 678ms | **3.9s / 5.0s** |
| Identical across two identical runs | 12/12 | **7/12** |

The residual the threshold could never fix is closed, and recall survived — the two things this was for. Two costs came in worse than scoped, and both are real:

- **Latency is ~4s, not the 1–3s estimated.** Search fires on submit with skeletons showing, so it is affordable, but `RERANK_TIMEOUT_MS` (8000) now sits only ~1.6× above p95. Cut candidates before cutting the timeout: `per_spot_limit` and `spot_limit` drive both prefill and output length. A new structured-output schema also pays a one-time compile cost cached for 24h — the first search after a deploy took **5.5s**. Fire a throwaway query before demoing.
- **The judge is not deterministic at `temperature: 0`,** and five of twelve queries reshuffled between identical runs. Top results are stable; the churn is in borderline candidates flipping `satisfies` ↔ `no_evidence`, which makes spots appear and disappear from the tail. Worth watching before it is worth fixing — but it is the reason `calibrate-rerank.mjs` runs everything twice.

**Costs about $0.005 per search**, and the free tier on the Pathfinders credits covers development comfortably.

### Screen

- `(app)/(tabs)/search` — vertical list of review cards, not a carousel. Each card: building photo (REV-12), review body (truncated), spot name, building, occupancy pill, tag chips. Tap expands in place. Explicit empty state. The route is still `/search`; the tab group does not change the URL.
