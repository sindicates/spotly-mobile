-- SEARCH-5. The candidate shortlist a reranking pass judges.
--
-- `search_reviews` answers the whole question in SQL: scan, collapse to one
-- review per spot, cut at min_similarity, return. That is the right shape when
-- cosine distance is the only judge. It is the wrong shape once something reads
-- the query and the review together, because the collapse runs first and keeps
-- each spot's *highest-cosine* review — which for "warm cozy corner in winter"
-- is the one saying "Gets cold near the windows, bring a hoodie even in
-- September" (seed.sql, KSL Fourth floor quiet stacks). A judge handed only that
-- row can reject the spot and nothing else. It never sees the two siblings that
-- might have answered, and it cannot tell "this spot is wrong" from "this spot's
-- best-scoring review is wrong".
--
-- So this function stops one step earlier: it returns the shortlist *before* the
-- collapse, several reviews per spot, and leaves both the dedupe and the
-- relevance cut to the caller. `search_reviews` is deliberately left in place —
-- calibrate-search.mjs still reads it, the rerank harness diffs against it, and
-- pointing the Edge Function back at it is a one-string rollback.
--
-- Traps. The first three are search_reviews' own, and still apply:
--   * `<=>` is cosine DISTANCE. The candidate scan orders by distance ascending
--     so reviews_embedding_hnsw is actually used; ordering by similarity
--     descending is equivalent arithmetic and unindexable.
--   * The occupancy join must stay LEFT. A missing report is null and renders
--     "no recent reports" (OCC-4).
--   * Those left joins do not fan out even though the rows are no longer
--     spot-unique: spot_occupancy is itself `distinct on (spot_id)`, and
--     building_images carries a one-primary-per-building unique index.
--   * review_count did fan out. It was a correlated subquery evaluated once per
--     spot under `distinct on`; without the collapse it would run once per
--     *review*, so it is a grouped CTE here instead.
--
-- And one that is new here: the shortlist is picked breadth-first — spots by
-- their best review, then that spot's top few reviews. A flat top-K by
-- similarity would let a single spot with several near-identical reviews fill
-- the list and starve the judge of distinct spots to choose between.

create function public.search_review_candidates(
  query_embedding extensions.vector(1536),
  filter_tags     public.amenity_tag[] default '{}',
  candidate_pool  int   default 150,
  spot_limit      int   default 10,
  per_spot_limit  int   default 3,
  -- Not the SEARCH-4 threshold. This one only keeps obvious noise out of the
  -- judge's prompt; the empty state is the judge's call now. The calibrated
  -- 0.35 lives in the Edge Function, where it still owns SEARCH-4 on the
  -- fallback path. (semantic-search.md, "The threshold")
  min_similarity  float default 0.15
)
returns table (
  review_id uuid, spot_id uuid, body text, similarity float,
  spot_best float,                     -- this spot's best cosine, for stable ordering
  area_name text, building text, amenity_tags public.amenity_tag[],
  review_count bigint,
  occupancy public.occupancy_status,   -- null = no recent report
  reported_at timestamptz,
  image_path text                      -- null = no building photo yet
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select r.id as review_id, r.spot_id, r.body,
           1 - (r.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.reviews r
    join public.spots s on s.id = r.spot_id
    where r.hidden = false
      and r.embedding is not null
      -- SEARCH-3: hard constraint, never a ranking signal. Still applied here,
      -- and the judge is told not to re-litigate it (AMEN-3).
      and (cardinality(filter_tags) = 0 or s.amenity_tags @> filter_tags)
    order by r.embedding operator(extensions.<=>) query_embedding
    limit candidate_pool
  ),
  ranked as (
    select c.*,
           row_number() over (partition by c.spot_id order by c.similarity desc) as rank_in_spot,
           max(c.similarity) over (partition by c.spot_id)                       as spot_best
    from candidates c
    where c.similarity >= min_similarity
  ),
  top_spots as (
    select distinct r.spot_id, r.spot_best
    from ranked r
    order by r.spot_best desc
    limit spot_limit
  ),
  shortlist as (
    select r.*
    from ranked r
    join top_spots t on t.spot_id = r.spot_id
    where r.rank_in_spot <= per_spot_limit
  ),
  counts as (
    select r2.spot_id, count(*)::bigint as review_count
    from public.reviews r2
    where not r2.hidden
      and r2.spot_id in (select t.spot_id from top_spots t)
    group by r2.spot_id
  )
  select sl.review_id, sl.spot_id, sl.body, sl.similarity, sl.spot_best,
         s.area_name, bl.name, s.amenity_tags,
         coalesce(cnt.review_count, 0),
         o.status, o.reported_at,
         img.storage_path
  from shortlist sl
  join public.spots s      on s.id = sl.spot_id
  join public.buildings bl on bl.id = s.building_id
  left join counts cnt               on cnt.spot_id = sl.spot_id
  left join public.spot_occupancy o  on o.spot_id  = sl.spot_id
  left join public.building_images img
    on img.building_id = bl.id and img.is_primary
  -- Grouped by spot, best spot first, best review first within each. The judge
  -- reads them in this order and the fallback path relies on it.
  order by sl.spot_best desc, sl.spot_id, sl.similarity desc;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which on a definer
-- function means anon can call it. Revoke first, then grant deliberately —
-- same as every RPC in 20260814060200_rpcs.sql. Base type in the signature,
-- not vector(1536).

revoke execute on function public.search_review_candidates(
  extensions.vector, public.amenity_tag[], int, int, int, float
) from public, anon;

grant execute on function public.search_review_candidates(
  extensions.vector, public.amenity_tag[], int, int, int, float
) to authenticated;
