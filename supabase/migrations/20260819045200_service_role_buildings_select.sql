-- seed-building-images.mjs lists buildings by name before upserting
-- building_images rows. service_role had insert on building_images but not
-- select on buildings — same gap the embedding backfill migration closed on
-- reviews (20260814220000).

grant select on public.buildings to service_role;
