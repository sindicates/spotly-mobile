-- The client's entire read surface.
--
-- All three are `security_invoker = false`, so they run as the view owner
-- (postgres) and see through the zero-policy RLS on the base tables. That is
-- the mechanism behind AUTH-4: the projection is the permission boundary, and
-- none of these views has a column holding an account ID.
--
-- SQL here is the SQL in the feature docs. If a definition needs to change,
-- change the doc in the same commit — these are the copies that run.

-- ---------------------------------------------------------------------------
-- public_spots  (spot-catalog.md)
-- ---------------------------------------------------------------------------
-- Omits spots.created_by. A spot's creator is by construction the author of its
-- first review, so leaking it would deanonymise that review (REV-2).

create view public.public_spots with (security_invoker = false) as
select
  s.id, s.building_id, b.name as building, b.short_name as building_short,
  s.area_name, s.category, s.amenity_tags, s.created_at,
  (select count(*) from public.reviews r
    where r.spot_id = s.id and not r.hidden) as review_count
from public.spots s
join public.buildings b on b.id = s.building_id;


-- ---------------------------------------------------------------------------
-- public_reviews  (reviews.md)
-- ---------------------------------------------------------------------------
-- REV-2: no author identity of any kind. `is_mine` is the one thing derived
-- from author_id, and it collapses to a boolean about the caller — it says
-- nothing about anyone else's row.
--
-- REV-6: `trending_score` is a column rather than an ORDER BY expression on the
-- client because PostgREST cannot order by an arbitrary expression. Change the
-- weights here, never in client code. ln(1 + expands) grows slowly so a single
-- viral card cannot pin itself to the front; the 3.0 * exp(-age / 1 week) term
-- decays with a one-week half-life, which is what keeps it "trending" rather
-- than "most-opened ever".
--
-- MOD-4: hidden rows are excluded here and in search_reviews. Those are the
-- only two read paths, so flipping `hidden` in the dashboard is a full removal.

create view public.public_reviews with (security_invoker = false) as
select
  r.id, r.spot_id, r.body, r.expand_count, r.created_at, r.updated_at,
  (r.author_id = auth.uid()) as is_mine,
  ln(1 + r.expand_count)
    + 3.0 * exp(-extract(epoch from (now() - r.created_at)) / 604800.0)
    as trending_score
from public.reviews r
where r.hidden = false;


-- ---------------------------------------------------------------------------
-- spot_occupancy  (occupancy.md)
-- ---------------------------------------------------------------------------
-- OCC-3/OCC-4. The freshness window lives in the WHERE clause, so a stale row
-- is not filtered downstream — it does not exist. A spot absent from this view
-- has no recent report: render "no recent reports" and never fall back to a
-- last-known status or a "last seen N hours ago" badge.
--
-- OCC-2: created_at is exposed as reported_at; author_id is not exposed at all.

create view public.spot_occupancy with (security_invoker = false) as
select distinct on (spot_id)
  spot_id, status, created_at as reported_at
from public.check_ins
where created_at > now() - interval '60 minutes'
order by spot_id, created_at desc;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- authenticated only. Signed-out clients read nothing; the .edu gate (AUTH-1)
-- is worth little if the catalog is public anyway.

grant select on public.public_spots   to authenticated;
grant select on public.public_reviews to authenticated;
grant select on public.spot_occupancy to authenticated;

revoke all on public.public_spots   from anon;
revoke all on public.public_reviews from anon;
revoke all on public.spot_occupancy from anon;
