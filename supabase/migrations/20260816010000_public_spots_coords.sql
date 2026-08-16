-- Project buildings.latitude / longitude onto public_spots so the map tab
-- (MAP-1) can place pins without joining the buildings table itself.
--
-- CREATE OR REPLACE can only append columns, so lat/lng go at the end, after
-- review_count. Other clients select explicit columns and are unaffected.
-- Grants on the view are preserved.

create or replace view public.public_spots with (security_invoker = false) as
select
  s.id, s.building_id, b.name as building, b.short_name as building_short,
  s.area_name, s.category, s.amenity_tags, s.created_at,
  (select count(*) from public.reviews r
    where r.spot_id = s.id and not r.hidden) as review_count,
  b.latitude, b.longitude
from public.spots s
join public.buildings b on b.id = s.building_id;
