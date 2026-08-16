-- REV-12: a catalog of building photos, inherited by reviews via the spot's
-- building. Reviews have no image_id and there is no user-upload path.
--
-- Same access model as `buildings`: no account ids, authenticated select, no
-- client writes. Files live in the public `building-images` bucket; this table
-- holds the path plus the Commons attribution the seed script recorded.

create table public.building_images (
  id            uuid        primary key default gen_random_uuid(),
  building_id   uuid        not null references public.buildings (id) on delete cascade,
  storage_path  text        not null,
  is_primary    boolean     not null default false,
  source_url    text,
  license       text,
  attribution   text,
  created_at    timestamptz not null default now(),
  unique (building_id, storage_path)
);

-- One cover photo per building. Extra rows are allowed for a future gallery;
-- only the primary is projected onto public_spots / search_reviews.
create unique index building_images_one_primary
  on public.building_images (building_id)
  where is_primary;

alter table public.building_images enable row level security;

grant select on public.building_images to authenticated;
revoke all on public.building_images from anon;

create policy building_images_select_all on public.building_images
  for select to authenticated
  using (true);

-- The seed script writes as service_role. Bypass-RLS is not a table privilege,
-- so grant the columns it actually writes — same pattern as the embedding
-- backfill (20260814220000).
grant select, insert, update on public.building_images to service_role;


-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
-- Public because these are campus reference photos, not user content. The
-- public URL is what expo-image loads; authenticated can also select via the
-- Storage API. Nobody but service_role writes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'building-images',
  'building-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy building_images_objects_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'building-images');


-- ---------------------------------------------------------------------------
-- public_spots — append image_path
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE can only append columns, so image_path goes after
-- latitude / longitude (20260816010000). A left join: null is "no photo yet."

create or replace view public.public_spots with (security_invoker = false) as
select
  s.id, s.building_id, b.name as building, b.short_name as building_short,
  s.area_name, s.category, s.amenity_tags, s.created_at,
  (select count(*) from public.reviews r
    where r.spot_id = s.id and not r.hidden) as review_count,
  b.latitude, b.longitude,
  img.storage_path as image_path
from public.spots s
join public.buildings b on b.id = s.building_id
left join public.building_images img
  on img.building_id = b.id and img.is_primary;


-- ---------------------------------------------------------------------------
-- search_reviews — same column, so search cards stay one round-trip
-- ---------------------------------------------------------------------------
-- Return type changed, so this is a drop + create. Re-grant after.

drop function public.search_reviews(
  extensions.vector,
  public.amenity_tag[],
  int,
  int,
  float
);

create function public.search_reviews(
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
         o.status, o.reported_at,
         img.storage_path
  from best_per_spot b
  join public.spots s      on s.id = b.spot_id
  join public.buildings bl on bl.id = s.building_id
  left join public.spot_occupancy o on o.spot_id = b.spot_id
  left join public.building_images img
    on img.building_id = bl.id and img.is_primary
  where b.similarity >= min_similarity
  order by b.similarity desc
  limit result_limit;
$$;

revoke execute on function public.search_reviews(
  extensions.vector, public.amenity_tag[], int, int, float
) from public, anon;

grant execute on function public.search_reviews(
  extensions.vector, public.amenity_tag[], int, int, float
) to authenticated;
