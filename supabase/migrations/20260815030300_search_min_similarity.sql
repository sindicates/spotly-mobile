-- SEARCH-4: replaces the placeholder similarity floor with a calibrated one.
--
-- 0.25 was never a measurement, and 20260814060200 said so: "after seeding, run
-- ten real queries, log the spread, and set it between the worst good match and
-- the best bad one." That pass has now run (scripts/calibrate-search.mjs, against
-- the 56 seeded reviews once backfilled), and it did not produce the clean band
-- the instruction assumes:
--
--   worst on-topic query   0.416  "background noise, not total silence"
--   best off-topic query   0.475  "parking near campus"
--   next off-topic queries 0.314  "where to buy textbooks"
--                          0.305  "how do I drop a class"
--
-- "parking near campus" outscores three legitimate queries, and no threshold
-- fixes it. Silencing it needs >= 0.475, which also silences "background noise"
-- and "good natural light and a view" — real queries with real answers in the
-- corpus. The cause is not a bug in the ranking: the reviews are campus-place
-- prose ("newest building on campus", "long walk from main campus", "shuttle
-- ride ... health campus"), so a query about campus places is genuinely near
-- them in the embedding space. Cosine distance over review bodies cannot make
-- the judgment "this is about a place to sit" — that is the measured limit of
-- the instrument, not a threshold that needs more tuning.
--
-- So: 0.35. It clears the two off-topic queries it can clear, with margin on
-- both sides (0.314 below, 0.416 above), and keeps all seven on-topic queries.
-- Nothing between 0.416 and 0.475 buys anything — "parking near campus" leaks
-- the same ~5 rows at 0.40 as at 0.35, while the headroom under legitimate
-- queries disappears.
--
-- Biased toward recall on purpose. 56 reviews is a sparse space; good queries
-- only score higher as the corpus densifies, so this can be raised later on
-- evidence. It cannot easily come down once people have learned that search
-- returns nothing. Rerun the calibration when real reviews replace seed volume.
--
-- `create or replace` with the argument types unchanged, so the grants in
-- 20260814060200 survive: a default is not part of a function's identity. The
-- body below is that migration's verbatim, `set search_path = ''` and
-- `operator(extensions.<=>)` included — replacing it with the unqualified sketch
-- in semantic-search.md would break the function while still applying cleanly.

create or replace function public.search_reviews(
  query_embedding extensions.vector(1536),
  filter_tags     public.amenity_tag[] default '{}',
  candidate_pool  int default 100,
  result_limit    int default 20,
  min_similarity  float default 0.35
)
returns table (
  review_id uuid, spot_id uuid, body text, similarity float,
  area_name text, building text, amenity_tags public.amenity_tag[],
  review_count bigint,
  occupancy public.occupancy_status,   -- null = no recent report
  reported_at timestamptz
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
      -- SEARCH-3: hard constraint, never a ranking signal.
      and (cardinality(filter_tags) = 0 or s.amenity_tags @> filter_tags)
    order by r.embedding operator(extensions.<=>) query_embedding
    limit candidate_pool
  ),
  best_per_spot as (
    select distinct on (c.spot_id) c.*
    from candidates c
    order by c.spot_id, c.similarity desc
  )
  select b.review_id, b.spot_id, b.body, b.similarity,
         s.area_name, bl.name, s.amenity_tags,
         (select count(*) from public.reviews r2
            where r2.spot_id = b.spot_id and not r2.hidden),
         o.status, o.reported_at
  from best_per_spot b
  join public.spots s      on s.id = b.spot_id
  join public.buildings bl on bl.id = s.building_id
  left join public.spot_occupancy o on o.spot_id = b.spot_id
  where b.similarity >= min_similarity
  order by b.similarity desc
  limit result_limit;
$$;
