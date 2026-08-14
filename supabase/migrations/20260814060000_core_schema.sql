-- Core schema: buildings, spots, reviews, check_ins, favorites, reports,
-- survey_responses.
--
-- AUTH-4 is the shape of this file. Four tables carry account IDs — spots
-- (created_by), reviews (author_id), check_ins (author_id), reports
-- (reporter_id) — and clients get *no* privilege on any of them. Reads happen
-- through the definer views in the next migration; writes happen through the
-- definer RPCs in the one after. RLS is enabled on all four with zero policies,
-- so even a mistaken future grant still denies every row.
--
-- profiles already exists (20260814033540). Do not re-declare it.

-- pgvector for review embeddings. `extensions` rather than `public` is the
-- Supabase convention and keeps the type out of the API schema.
create extension if not exists vector with schema extensions;


-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- AMEN-1: exactly eight binary tags, one type, so filtering is one operation.
-- quiet/lively are opposing tags, not a scale.
create type public.amenity_tag as enum (
  'outlets',
  'quiet',
  'lively',
  'group_tables',
  'natural_light',
  'food_nearby',
  'whiteboards',
  'open_late'
);

-- OCC-1: the three check-in states.
create type public.occupancy_status as enum ('empty', 'some_seats', 'packed');

-- SPOT-1: v1 is study-only, but dining and hangout are in the enum now so
-- widening the catalog is data entry rather than a migration.
create type public.spot_category as enum ('study', 'dining', 'hangout');


-- ---------------------------------------------------------------------------
-- buildings
-- ---------------------------------------------------------------------------
-- The only table clients select directly: it holds no account IDs, and the
-- add-spot form needs it for the building picker (SPOT-5).

create table public.buildings (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  short_name  text,
  -- Unused in v1. Seeded now because closest-open-spot needs them later and
  -- backfilling coordinates for 30 buildings by hand is the kind of chore that
  -- never gets done.
  latitude    double precision,
  longitude   double precision,
  created_at  timestamptz not null default now()
);

alter table public.buildings enable row level security;

grant select on public.buildings to authenticated;

create policy buildings_select_all on public.buildings
  for select to authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- spots
-- ---------------------------------------------------------------------------

create table public.spots (
  id           uuid             primary key default gen_random_uuid(),
  building_id  uuid             not null references public.buildings (id) on delete restrict,
  area_name    text             not null check (btrim(area_name) <> ''),
  category     public.spot_category not null default 'study',
  -- AMEN-2: write-once, set by the first reviewer via create_spot_with_review.
  -- There is no update path on this table at all, which is what enforces it.
  amenity_tags public.amenity_tag[] not null default '{}',
  -- set null, not cascade: a deleted account should not take a catalog entry
  -- (and every review attached to it) down with it.
  created_by   uuid             references public.profiles (id) on delete set null,
  created_at   timestamptz      not null default now()
);

alter table public.spots enable row level security;

-- SPOT-5 duplicate guard, in the database rather than only in the form.
-- Case- and whitespace-insensitive: "3rd Floor Quiet Room " and "3rd floor
-- quiet room" are the same place, and occupancy signal fragmenting across two
-- rows is the failure that quietly breaks the headline feature.
create unique index spots_building_area_uniq
  on public.spots (building_id, lower(btrim(area_name)));

-- AMEN-3 / SEARCH-3: `amenity_tags @> filter_tags` is a hard filter on every
-- search. GIN is the index that makes containment cheap.
create index spots_amenity_tags_gin
  on public.spots using gin (amenity_tags);

create index spots_building_id_idx on public.spots (building_id);


-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------

create table public.reviews (
  id           uuid        primary key default gen_random_uuid(),
  spot_id      uuid        not null references public.spots (id) on delete cascade,
  author_id    uuid        references public.profiles (id) on delete set null,
  body         text        not null,
  -- REV-3. Nullable because the write is two steps: the `embed` Edge Function
  -- returns the vector and the client passes it to the write RPC. A null here
  -- means "not embedded yet" and search skips the row rather than ranking it
  -- at distance zero.
  embedding    extensions.vector(1536),
  -- REV-6: engagement is expand count, not votes. At launch volume a vote
  -- signal would be almost entirely zeros.
  expand_count integer     not null default 0 check (expand_count >= 0),
  -- MOD-4: moderation is flipping this in the Supabase dashboard in v1.
  hidden       boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- REV-10: 15-word floor, in the database as well as the form. A one-line
  -- review is the failure mode that makes the corpus useless to read and
  -- useless to embed.
  constraint reviews_body_word_floor check (
    array_length(regexp_split_to_array(btrim(body), '\s+'), 1) >= 15
  )
);

alter table public.reviews enable row level security;

-- REV-1: one review per person per spot. Orphaned rows (author deleted) hold
-- null and are exempt, which is correct — there is no person left to dedupe.
create unique index reviews_spot_author_uniq
  on public.reviews (spot_id, author_id);

create index reviews_spot_id_idx on public.reviews (spot_id) where not hidden;

-- SEARCH-1. vector_cosine_ops matches the `<=>` in search_reviews; an index
-- built on a different opclass is silently ignored by that query.
create index reviews_embedding_hnsw
  on public.reviews using hnsw (embedding extensions.vector_cosine_ops);


-- ---------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------

create table public.check_ins (
  id         uuid        primary key default gen_random_uuid(),
  spot_id    uuid        not null references public.spots (id) on delete cascade,
  -- OCC-2: attributed internally, never displayed. spot_occupancy omits it.
  author_id  uuid        references public.profiles (id) on delete set null,
  status     public.occupancy_status not null,
  created_at timestamptz not null default now()
);

alter table public.check_ins enable row level security;

-- Serves both the freshness window scan (OCC-3/4) and the rate-limit lookup.
create index check_ins_spot_created_idx
  on public.check_ins (spot_id, created_at desc);

create index check_ins_rate_limit_idx
  on public.check_ins (spot_id, author_id, created_at desc);

-- OCC-6: one check-in per spot per 15 minutes.
--
-- A trigger rather than an RLS check, because an RLS violation surfaces as an
-- opaque "new row violates row-level security policy" and this needs a message
-- the UI can actually show the user.
create function public.enforce_check_in_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.check_ins
    where spot_id = new.spot_id
      and author_id = new.author_id
      and created_at > now() - interval '15 minutes'
  ) then
    raise exception 'rate_limited'
      using hint = 'One check-in per spot every 15 minutes.';
  end if;
  return new;
end;
$$;

create trigger check_ins_rate_limit
  before insert on public.check_ins
  for each row execute function public.enforce_check_in_rate_limit();


-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

create table public.reports (
  id          uuid        primary key default gen_random_uuid(),
  review_id   uuid        not null references public.reviews (id) on delete cascade,
  reporter_id uuid        references public.profiles (id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now(),
  -- MOD-2/MOD-4: the queue is "reports where resolved_at is null", worked from
  -- the Supabase dashboard. No in-app admin in v1.
  resolved_at timestamptz
);

alter table public.reports enable row level security;

create index reports_open_queue_idx
  on public.reports (created_at desc) where resolved_at is null;

-- One report per person per review. A second tap is a no-op, not a queue flood.
create unique index reports_review_reporter_uniq
  on public.reports (review_id, reporter_id);


-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
-- FAV-3: private by construction. Self-only RLS rather than a definer view,
-- because a favorites row is never visible to another account — the same
-- reasoning that lets `profiles` take direct client select under AUTH-4.

create table public.favorites (
  account_id uuid        not null references public.profiles (id) on delete cascade,
  spot_id    uuid        not null references public.spots (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, spot_id)
);

alter table public.favorites enable row level security;

-- Explicit, because RLS narrows a privilege that has to exist first — enabling
-- RLS is not what grants it. No update: a favorite is created or removed.
grant select, insert, delete on public.favorites to authenticated;

-- `(select auth.uid())` rather than a bare call so the planner hoists it into
-- an InitPlan and evaluates it once per statement instead of once per row.
create policy favorites_select_self on public.favorites
  for select to authenticated
  using (account_id = (select auth.uid()));

create policy favorites_insert_self on public.favorites
  for insert to authenticated
  with check (account_id = (select auth.uid()));

create policy favorites_delete_self on public.favorites
  for delete to authenticated
  using (account_id = (select auth.uid()));

create index favorites_spot_id_idx on public.favorites (spot_id);


-- survey_responses (ONB-6) is deliberately not here. It lands in
-- 20260814061500_survey_responses.sql, which owns its shape and its self-only
-- policies. Two files must not both declare it.


-- ---------------------------------------------------------------------------
-- AUTH-4 backstop
-- ---------------------------------------------------------------------------
-- Supabase's default privileges in `public` grant table access to anon and
-- authenticated on creation. Revoking is not belt-and-braces here, it is the
-- thing that keeps `created_by` and `author_id` off the wire. RLS with no
-- policies already denies every row; this removes the privilege underneath it
-- too, so a future `create policy` typo cannot open the table by itself.

revoke all on public.spots     from anon, authenticated;
revoke all on public.reviews   from anon, authenticated;
revoke all on public.check_ins from anon, authenticated;
revoke all on public.reports   from anon, authenticated;

-- Nothing is readable while signed out.
revoke all on public.buildings from anon;
revoke all on public.favorites from anon;
