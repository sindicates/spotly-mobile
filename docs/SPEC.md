# Spotly — Technical Specification (v1)

**Derived from:** Spotly Production Requirements Document v0.2
**Status:** Schema locked. Ready to build.
**Target:** Stellic Pathfinders submission, deadline **Aug 21** (11 days from Aug 10).
**Scope:** CWRU, study spots only, mobile only.

> **Read this before the PRD.** This document supersedes the PRD wherever they disagree.
> §1 lists every conflict explicitly. The PRD remains the authority on *why*; this document
> is the authority on *what to build*.

---

## 1. Supersedes — PRD requirements that changed

The PRD is v0.2 and predates several decisions. A coding agent reading both will hit these conflicts. Resolve them this way:

| PRD ID | PRD says | Now | Why |
|---|---|---|---|
| **SPOT-1** | Browse by category (study, dining, hangout) | **Study only.** No category browse. Home is search-first (§8.5) | Dining and lounges dropped from v1; one category isn't a browse dimension |
| **SEARCH-2** | Results return the spot, not the review | **Results return review cards**, deduped to one per spot via group-by-max (§7) | Search should show what a student *said*, not a spot summary |
| **REV-7** | Every review carries a required 1–5 star rating | **Removed.** No ratings anywhere | 15-word floor already forces substance; prose is the signal |
| **REV-8** | Spot displays average rating and review count | **Removed** (rating). Review count still displayed | Depends on REV-7 |
| **REV-9** | Ratings not broken out by dimension | **Moot** — no ratings at all | — |
| **REV-6** | Carousel order blends recency and engagement (undefined) | **Engagement = card expand count.** Formula in §10 | PRD §10's open decision, now closed. No votes table |
| **AMEN-1/2** | Tags settable at creation, editable by any authenticated user | **Set by the first reviewer at spot creation, then locked.** No edit UI | Saves a screen and an edit-war failure mode; dashboard corrections only |
| **ONB-3** | Two seeded prompts, second is "where do you go to eat?" | **One review unlocks the app** | Dining is out of scope; halving the gate protects onboarding completion |
| **ONB-5** | Unlock on submitting the second review | **Unlock on the first review** | Same |
| **§7 Data model** | Review carries `rating` | **No rating column.** Carries `expand_count` instead | REV-7 removed, REV-6 resolved |

**Unchanged and still binding:** AUTH-1..4, SPOT-2..5, SEARCH-1/3/4, REV-1..5, OCC-1..6, AMEN-3, FAV-1..3, MOD-1..4, ONB-1/2/4/6.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Expo (React Native), **expo-dev-client** | Not Expo Go — it can't load custom native modules |
| Routing | expo-router (file-based) | |
| Styling | NativeWind | |
| Backend | Supabase (Postgres 15+, Auth, RLS, Edge Functions) | |
| Vector | pgvector | |
| Embeddings | OpenAI `text-embedding-3-small`, **1536 dims** | Key lives only in Edge Function secrets |
| Build | EAS Build → internal distribution + TestFlight | |
| Location | `expo-location` (foreground only) | v1 uses it for nothing user-facing; wire the permission now so the dev build is proven |

### Environment variables

Client (`.env`, `EXPO_PUBLIC_` prefix is required for Expo to inline them):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Edge Function secrets (`supabase secrets set`) — **never in the client bundle**:
```
OPENAI_API_KEY=
```

Seed script only (local, gitignored):
```
SUPABASE_SERVICE_ROLE_KEY=
```

### Do this first, before any screens

Stand up an EAS dev build on a physical device and confirm magic-link deep-linking works end to end. EAS credentials, provisioning, and the auth redirect are the failures that surface late and cost the most. See §6.1.

---

## 3. Data model

Four core entities plus three supporting tables. Locked.

### 3.1 Extensions and types

```sql
create extension if not exists vector;
create extension if not exists pgcrypto;

create type amenity_tag as enum (
  'outlets', 'quiet', 'lively', 'group_tables',
  'natural_light', 'food_nearby', 'whiteboards', 'open_late'
);

create type occupancy_status as enum ('empty', 'some', 'packed');

-- Retained but single-valued in v1. Every spot is 'study'.
-- Kept so multi-category expansion needs no migration (PRD §9).
create type spot_category as enum ('study', 'dining', 'hangout');
```

### 3.2 Buildings

Seeded lookup table. This is what prevents "KSL" / "Kelvin Smith" / "kelvin smith library" fragmenting one building into three — the duplicate problem PRD §9 calls worst for the occupancy signal.

```sql
create table buildings (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- "Kelvin Smith Library"
  short_name  text,                          -- "KSL"
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);
```

Seed with real CWRU buildings before anything else. 25–40 entries is enough. Coordinates are unused in v1 but required by the "closest open spot" roadmap item — capture them while you're already typing the list.

### 3.3 Spots

```sql
create table spots (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings(id),
  area_name     text not null,                              -- "3rd floor, north windows"
  category      spot_category not null default 'study',
  amenity_tags  amenity_tag[] not null default '{}',
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

-- Case-insensitive dedup within a building
create unique index spots_building_area_uniq
  on spots (building_id, lower(btrim(area_name)));

create index spots_tags_gin on spots using gin (amenity_tags);
```

`amenity_tags` is written once at creation from the first reviewer's form input and never updated in v1 (supersedes AMEN-2).

### 3.4 Reviews

```sql
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  spot_id       uuid not null references spots(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  body          text not null,
  embedding     vector(1536),
  expand_count  integer not null default 0,
  hidden        boolean not null default false,   -- moderation (MOD-4)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint reviews_one_per_user_per_spot unique (spot_id, author_id),

  -- 15-word floor, enforced in the database not just the form
  constraint reviews_min_words check (
    array_length(regexp_split_to_array(btrim(body), '\s+'), 1) >= 15
  )
);

create index reviews_spot on reviews (spot_id) where hidden = false;
```

**No vector index at launch.** With 20–30 spots and a few hundred reviews, exact scan is faster than HNSW and has no recall loss. Add this only if review count passes ~10,000:

```sql
-- create index reviews_embedding_hnsw on reviews
--   using hnsw (embedding vector_cosine_ops);
```

### 3.5 Check-ins

```sql
create table check_ins (
  id          uuid primary key default gen_random_uuid(),
  spot_id     uuid not null references spots(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  status      occupancy_status not null,
  created_at  timestamptz not null default now()
);

create index check_ins_spot_recent on check_ins (spot_id, created_at desc);
```

### 3.6 Profiles, favorites, reports

```sql
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  onboarding_complete boolean not null default false,
  survey_responses    jsonb,
  is_moderator        boolean not null default false,
  created_at          timestamptz not null default now()
);

create table favorites (
  account_id  uuid not null references auth.users(id) on delete cascade,
  spot_id     uuid not null references spots(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (account_id, spot_id)
);

create table reports (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (review_id, reporter_id)
);
```

Auto-create a profile on signup:

```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

---

## 4. Anonymity is a schema problem, not a UI problem

REV-2 says reviews show no author identity. AUTH-4 says the account ID is never exposed to other users **through any surface, including API responses**. With Supabase, a client doing `select * from reviews` gets `author_id` back — so a permissive RLS policy on the base table violates AUTH-4 no matter what the UI renders.

**The rule: clients never read base tables that contain `author_id`. They read views that omit it, and they write through `security definer` RPCs that set `author_id` server-side.**

```sql
revoke all on reviews, spots, check_ins, reports from anon, authenticated;

-- Reviews as the client sees them: no author_id, a flag for "this is mine",
-- and a precomputed trending score (REV-6) the client can simply ORDER BY.
create view public_reviews with (security_invoker = false) as
select
  r.id,
  r.spot_id,
  r.body,
  r.expand_count,
  r.created_at,
  r.updated_at,
  (r.author_id = auth.uid()) as is_mine,
  ln(1 + r.expand_count)
    + 3.0 * exp(-extract(epoch from (now() - r.created_at)) / 604800.0)
    as trending_score
from reviews r
where r.hidden = false;

-- Spots leak too. `created_by` is an account UUID, and the spot's creator is by
-- construction the author of its first review — exposing it deanonymizes that
-- review. Same treatment: the client reads this view, never the table.
create view public_spots with (security_invoker = false) as
select
  s.id,
  s.building_id,
  b.name       as building,
  b.short_name as building_short,
  s.area_name,
  s.category,
  s.amenity_tags,
  s.created_at,
  (select count(*) from reviews r
    where r.spot_id = s.id and not r.hidden) as review_count
from spots s
join buildings b on b.id = s.building_id;

grant select on public_reviews, public_spots to authenticated;
```

`now()` re-evaluates per query inside a view, so `trending_score` is always current — the client orders by it directly. This matters because PostgREST cannot `order by` an arbitrary SQL expression; without the column, §8.5's trending feed has nowhere to run.

`auth.uid()` resolves per-request from the JWT claims, so `is_mine` works correctly inside a definer view — that's what lets the app show "edit your review" without ever shipping an account ID to the device.

### Live occupancy view (OCC-3, OCC-4)

```sql
create view spot_occupancy with (security_invoker = false) as
select distinct on (spot_id)
  spot_id,
  status,
  created_at as reported_at
from check_ins
where created_at > now() - interval '60 minutes'   -- freshness window
order by spot_id, created_at desc;

grant select on spot_occupancy to authenticated;
```

A spot absent from this view has no recent report. **The client renders "no recent reports" for that case and must never fall back to the last known status** — OCC-4 is the requirement not to compromise on. Do not add a "last seen 3 hours ago" badge; a stale badge shown confidently is the failure mode §5 of the PRD exists to prevent.

---

## 5. Row-level security

```sql
alter table profiles   enable row level security;
alter table buildings  enable row level security;
alter table spots      enable row level security;
alter table reviews    enable row level security;
alter table check_ins  enable row level security;
alter table favorites  enable row level security;
alter table reports    enable row level security;
```

| Table | Policy |
|---|---|
| `profiles` | select/update where `id = auth.uid()`. No cross-user reads |
| `buildings` | select to `authenticated`. No client writes (seeded only) |
| `spots` | No direct client grants — reads go through `public_spots` (§4), writes through `create_spot_with_review`. **No update, no delete** (tags locked per §1) |
| `reviews` | No direct client grants at all — see §4. All access via `public_reviews` and RPCs |
| `check_ins` | No direct client grants. Insert via `create_check_in` RPC; read via `spot_occupancy` |
| `favorites` | select/insert/delete where `account_id = auth.uid()`. Private by construction (FAV-3) |
| `reports` | insert where `reporter_id = auth.uid()`. No client select — reporters can't see the queue |

**Onboarding gating (ONB-1) is app-level routing, not RLS.** It has to be: the onboarding flow itself needs to read `buildings` and `spots` to check whether the named spot already exists, so an RLS rule keyed on `onboarding_complete` would deadlock the very flow that sets it.

---

## 6. Server-side functions

### 6.1 Auth (AUTH-1..4)

Magic link only, no passwords. Configuration:

- Supabase Auth → disable password signin, enable email OTP/magic link.
- **Redirect allowlist** must include the app scheme: `spotly://auth/callback`.
- `app.json` → `"scheme": "spotly"`.
- Handle the inbound link with `expo-linking` + `supabase.auth.setSession()` from the URL fragment.
- Persist sessions with an AsyncStorage (or expo-secure-store) adapter on the Supabase client, plus `detectSessionInUrl: false` — that option is for web and breaks native.

**Email gate:** accept any `.edu` address. Enforce it in an auth hook or a `before insert` trigger on `auth.users`, not only in the form — client-side validation is a UX affordance, not a gate.

> Decision note: the PRD's `.edu` gate and the landing page's "CWRU only" conflict. Resolved toward **any `.edu`** — it's the looser rule, costs nothing to implement, and keeps the door open for testers outside CWRU. Tightening to `case.edu` later is one predicate.
>
> This does **not** solve judge access — a judge on a `stellic.com` address fails any `.edu` rule. Judges get in via the demo video plus a pre-made test account (§12). If you later want real per-campus isolation (PRD §9), add an `allowed_domains` table and a `campus_id` on `buildings`.

### 6.2 Check-in rate limit (OCC-6)

One check-in per user per spot per 15 minutes. Use a trigger rather than an RLS `with check` — RLS violations surface as an opaque "new row violates row-level security policy," and this needs a message the UI can show.

```sql
create or replace function enforce_check_in_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from check_ins
    where spot_id = new.spot_id
      and author_id = new.author_id
      and created_at > now() - interval '15 minutes'
  ) then
    raise exception 'rate_limited'
      using hint = 'One check-in per spot every 15 minutes.';
  end if;
  return new;
end $$;

create trigger check_ins_rate_limit
  before insert on check_ins
  for each row execute function enforce_check_in_rate_limit();
```

Check-ins are trust-based — no geolocation verification (OCC-5). Accepted exposure: someone can mark a spot packed from their dorm. At CWRU scale with `.edu` accounts and per-spot rate limiting, that risk is low, and geo-gating is a drop-in addition later.

### 6.3 Write RPCs

All `security definer`, all set `author_id = auth.uid()` internally so it never travels over the wire.

```sql
-- Creates spot + first review together (SPOT-3, SPOT-5). Tags come from this call only.
create function create_spot_with_review(
  p_building_id  uuid,
  p_area_name    text,
  p_amenity_tags amenity_tag[],
  p_body         text,
  p_embedding    vector(1536)
) returns uuid ...   -- returns spot_id

-- Adds a review to an existing spot (REV-1). No tags — they're locked.
create function create_review(
  p_spot_id   uuid,
  p_body      text,
  p_embedding vector(1536)
) returns uuid ...   -- returns review_id

create function update_review(
  p_review_id uuid,
  p_body      text,
  p_embedding vector(1536)
) returns void ...   -- must verify author_id = auth.uid(); also sets updated_at

create function create_check_in(
  p_spot_id uuid,
  p_status  occupancy_status
) returns void ...

create function increment_expand(p_review_id uuid) returns void ...

create function report_review(p_review_id uuid, p_reason text) returns void ...

create function complete_onboarding(p_survey jsonb) returns void ...
```

`create_spot_with_review` must run the insert of spot and review in one transaction — a spot with zero reviews violates SPOT-3 and would appear in the catalog as an empty shell.

**Duplicate guard:** before calling `create_spot_with_review`, the client queries existing spots in the selected building and shows them inline ("Did you mean *3rd floor, north windows*?"). This is the cheap half of PRD §9's duplicate-merging item and it's worth doing now, because occupancy signal fragmenting across duplicate entries is the failure that quietly breaks the headline feature.

---

## 7. Search pipeline (SEARCH-1..4)

**What a result is:** a review card — body text plus its spot's name, tags, and live occupancy. Not a spot summary. This supersedes SEARCH-2.

**Dedup:** one card per spot. One spot can own many of the top-matching reviews, so ~100 candidate reviews might collapse to 12 spots. That's expected — fetch wide, display narrow.

```sql
create or replace function search_reviews(
  query_embedding vector(1536),
  filter_tags     amenity_tag[] default '{}',
  candidate_pool  int default 100,
  result_limit    int default 20,
  min_similarity  float default 0.25
)
returns table (
  review_id    uuid,
  spot_id      uuid,
  body         text,
  similarity   float,
  area_name    text,
  building     text,
  amenity_tags amenity_tag[],
  review_count bigint,
  occupancy    occupancy_status,   -- null = no recent report (OCC-4)
  reported_at  timestamptz
)
language sql stable security definer as $$
  with candidates as (
    select
      r.id as review_id,
      r.spot_id,
      r.body,
      1 - (r.embedding <=> query_embedding) as similarity
    from reviews r
    join spots s on s.id = r.spot_id
    where r.hidden = false
      and r.embedding is not null
      -- Amenity filters are HARD constraints, never ranking signals (SEARCH-3)
      and (cardinality(filter_tags) = 0 or s.amenity_tags @> filter_tags)
    order by r.embedding <=> query_embedding      -- distance asc = closest first
    limit candidate_pool
  ),
  best_per_spot as (
    select distinct on (spot_id) *
    from candidates
    order by spot_id, similarity desc
  )
  select
    b.review_id, b.spot_id, b.body, b.similarity,
    s.area_name, bl.name, s.amenity_tags,
    (select count(*) from reviews r2 where r2.spot_id = b.spot_id and not r2.hidden),
    o.status, o.reported_at
  from best_per_spot b
  join spots s        on s.id = b.spot_id
  join buildings bl   on bl.id = s.building_id
  left join spot_occupancy o on o.spot_id = b.spot_id   -- LEFT: absent = no report
  where b.similarity >= min_similarity
  order by b.similarity desc
  limit result_limit;
$$;
```

Notes for the implementer:

- `<=>` is pgvector's **cosine distance**. Similarity is `1 - distance`. Order the ANN by distance ascending, not similarity descending, or you lose index usage the moment you add one.
- Order the inner `select distinct on` by `spot_id` first — Postgres requires the `distinct on` expression to lead the `order by`.
- The `left join spot_occupancy` is what feeds §8.6's occupancy pill in one round trip instead of a second query per result page. It must stay a **left** join: a spot with no report in the window is absent from that view, comes back `null`, and the card renders "no recent reports."
- **`min_similarity` is the SEARCH-4 empty state.** Zero rows back means "no strong match," and the UI says exactly that rather than showing weak results as matches. `0.25` is a placeholder: after seeding, run 10 real queries, log the similarity distribution, and set the threshold between the worst good match and the best bad one. Do not ship the default unexamined.
- **The first 3 results are the answer.** About 4–5 list items fit above the fold on a phone. Design as though results 1–3 are what people see; treat the rest as overflow.

---

## 8. Screens

Eleven screens. Requirement IDs in brackets.

### 8.1 Sign in `(auth)/sign-in`
Email field, "Send me a link." Client validates `.edu` for the error message; server enforces it. Success state explains to check email and return to the app. [AUTH-1, AUTH-2]

### 8.2 Auth callback `(auth)/callback`
Deep-link target. Parses tokens, calls `setSession`, then routes on `profiles.onboarding_complete`: false → onboarding, true → home. [ONB-1]

### 8.3 Onboarding survey `(onboarding)/survey`
Four one-tap questions, stored to `survey_responses` as JSONB and **unused in v1** [ONB-2, ONB-6]:
1. Silence or background noise?
2. Alone or people around?
3. Do you need an outlet?
4. Morning, afternoon, or late night?

### 8.4 Onboarding first review `(onboarding)/first-review`
Prompt: *"What's your go-to study spot?"* Runs the review form (§8.9). On submit, `complete_onboarding` flips the flag and the app unlocks straight into home. Never repeats. [ONB-3, ONB-4, ONB-5]

### 8.5 Home `(app)/index`
Search bar up top, amenity filter chips below it, then a trending review feed — the same review cards search returns, ordered by the §10 trending formula. Doubles as the thin-catalog answer: a small catalog reads as a fresh feed, not an empty grid. [supersedes SPOT-1]

### 8.6 Search results `(app)/search`
Vertical list of review cards, not a carousel — scanning many results beats swiping through them one at a time. Each card: review body (truncated), spot name, building, occupancy pill, tag chips. Tap expands in place to full text. A separate control opens the spot page. Empty state is explicit. [SEARCH-4, SPOT-4]

### 8.7 Spot detail `(app)/spot/[id]`
Spot name and building; occupancy pill with the three check-in buttons; amenity tag chips; **review carousel** — horizontal swipe, tap-to-expand, trending order; review count; favorite toggle; "Add your review" (hidden if `is_mine` is already true on any review here). [SPOT-2, REV-4, REV-5, REV-6, OCC-1, FAV-1]

### 8.8 Add review `(app)/review/new?spot_id=`
Body field only. Building, spot, and tags are already fixed. [REV-1]

### 8.9 Create spot + review `(app)/spot/new`
The structured form. Free text is what produces a mess; constraining entry is where duplicates actually get prevented. [SPOT-5]

| Field | Control | Rule |
|---|---|---|
| Building | Select from `buildings` | Required |
| Specific spot | Text | Required. On blur, show existing spots in that building as a dupe check |
| Amenity tags | Multi-select, the 8 in §3.1 | Optional, **write-once** |
| Review | Textarea — *"What's it good for, and what's the catch?"* | Required, **15-word floor**, live counter |

### 8.10 Favorites `(app)/favorites`
Vertical list of saved spots, each showing current occupancy — turns "is my usual place packed" into two taps. Private. [FAV-2, FAV-3]

### 8.11 Report sheet (modal)
Flag control on every review card. Optional reason, writes to `reports`. [MOD-1, MOD-2]

**Moderation queue is the Supabase dashboard in v1, not an in-app admin screen.** MOD-4 is satisfied by flipping `reviews.hidden` there. MOD-3 (the written content policy — reviews must not name or describe identifiable individuals) ships as a static screen linked from settings and from the review form. Don't cut MOD-3: anonymity plus the ability to name specific people is the product's largest risk surface, and an unmoderated anonymous review app is the first hole a judge will probe.

---

## 9. Embeddings and seeding

### 9.1 Write path (live)

Client → `embed` Edge Function → back to client → client calls the write RPC with the vector.

```
POST /functions/v1/embed
  Authorization: Bearer <user JWT>
  { "input": "the review text" }
  → { "embedding": [1536 floats] }
```

The function requires a valid JWT, calls OpenAI `text-embedding-3-small`, and returns the vector. **The OpenAI key exists only here.** Never in the client bundle, never in a `EXPO_PUBLIC_` var.

> Known exposure, accepted: because the client passes the embedding into the RPC, a crafted client could submit a vector that doesn't match its text — poisoning that review's searchability. It can only affect the attacker's own review (RPCs bind `author_id` to `auth.uid()`), so blast radius is one row. If you want it closed, move embedding generation inside the RPC path so text and vector are computed together server-side.

### 9.2 Search path

One Edge Function, not two round trips — mobile latency is the whole reason:

```
POST /functions/v1/search
  { "query": "place to lock in", "filter_tags": ["outlets"] }
  → embeds the query, calls search_reviews(), returns cards
```

Share one embedding helper module between `embed` and `search`.

### 9.3 Seed pipeline

Seeded spots are what make the app demo-able before real users exist. Target **20–30 spots** with real reviews (PRD §12, feature freeze).

Input `seed/spots.json`:
```json
[
  {
    "building": "Kelvin Smith Library",
    "area_name": "3rd floor, north windows",
    "amenity_tags": ["outlets", "quiet", "natural_light"],
    "reviews": [
      "Good for long solo sessions when you need to actually finish something...",
      "The catch is it fills up by 7pm during midterms and there is no backup..."
    ]
  }
]
```

Node script, run locally with the **service role key** (bypasses RLS):
1. Upsert buildings.
2. Collect *every* review string across the whole file into one array.
3. **One batch** OpenAI embeddings call — the API accepts an array of inputs. Not one call per review.
4. Insert spots, then insert reviews with the `embedding` column already populated.

This path deliberately bypasses the Edge Function and the RPCs.

> **Blocker a coding agent will hit:** `reviews` has `UNIQUE(spot_id, author_id)`. If every seeded review is authored by a single seed account, **you can only ever insert one review per spot** and step 4 fails on the second. Create a pool of **6–8 seed accounts** and round-robin `author_id` across the reviews of each spot. Do this before writing the seeder, not after it throws.
>
> Those seed accounts go through the same `.edu` auth gate as everyone else. Create them with `supabase.auth.admin.createUser()` using `.edu`-form addresses and `email_confirm: true` — otherwise the gate rejects them, or they land unconfirmed, and the seeder fails at step 0 before it ever reaches the interesting bug above.

---

## 10. Constants

Put these in one config module. They are the things you will tune during polish.

| Constant | Value | Where | Rationale |
|---|---|---|---|
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Edge Functions | 1536 dims |
| `OCCUPANCY_FRESHNESS` | **60 min** | `spot_occupancy` view | PRD says 45–60; pinned to 60 |
| `CHECKIN_COOLDOWN` | **15 min** per spot | trigger | OCC-6 |
| `REVIEW_MIN_WORDS` | **15** | DB constraint + form | |
| `CANDIDATE_POOL` | **100** | `search_reviews` | Fetch wide, display narrow |
| `RESULT_LIMIT` | **20** | `search_reviews` | Results 1–3 are what people see |
| `MIN_SIMILARITY` | **0.25** *(calibrate)* | `search_reviews` | Recalibrate after seeding — see §7 |

### Trending order (REV-6)

Exposed as `public_reviews.trending_score` (§4) so both consumers — the home feed (§8.5) and the spot carousel (§8.7) — just `.order('trending_score', { ascending: false })`:

```sql
ln(1 + expand_count)
  + 3.0 * exp(-extract(epoch from (now() - created_at)) / 604800.0)
```

A brand-new review starts with a +3.0 recency boost decaying to ~+1.1 over a week (604800s); 20 expands contributes ~+3.0. So fresh reviews lead, and genuinely useful older ones hold their place. Both weights are tunable — change them in the view definition, not in client code.

Increment `expand_count` via `increment_expand` on tap-to-expand, **debounced to once per review per session** client-side — otherwise a single user swiping back and forth inflates the signal that decides the ordering.

---

## 11. Build order

11 days. This sequence front-loads what fails late and what the demo can't survive without.

1. **Dev build on a physical device + magic-link deep link working.** Nothing else is real until this is. Half a day, possibly more, and it's unskippable.
2. Schema, RLS, views, triggers, RPCs — all of §3–6. One migration file.
3. Seed buildings + the seed-account pool.
4. `embed` and `search` Edge Functions.
5. Seed pipeline → 20–30 spots with real reviews. **The app is now demo-able**, which de-risks everything after this point.
6. Auth + onboarding + the review form (§8.1–8.4, 8.9).
7. Home, search results, spot detail (§8.5–8.7) — the core loop.
8. Occupancy check-in.
9. Favorites, report flow, content policy screen.
10. Calibrate `MIN_SIMILARITY` against real seeded data.
11. Freeze. Empty states, device testing, demo video with time to reshoot.

**If time runs short, cut in this order:** favorites → trending feed on home (leave search-only) → survey. **Never cut:** occupancy (it's the differentiator no existing tool has), the moderation path (it's the hole a judge probes first), or honest empty states.

---

## 12. Still open

**Judges cannot sign up.** The submission requires "a working link a judge can open," but the `.edu` gate blocks every judge on a `stellic.com` address — and the gate is a headline feature, so weakening it for judging would undercut the pitch. Ship a **pre-made test account** in the submission materials instead: one of the seed accounts from §9.3, already onboarded, with its magic-link flow swapped for a known password or a long-lived session. Note it explicitly in the write-up next to the link. Decide this before recording the demo video, since the video is the fallback if a judge never gets in.

**Not technical, but it gates the submission:** Pathfinders requires the project to be built inside the **July 20 – Aug 21** window. Spotly had setup, schema, and auth work before that. Either scope the submission to what's genuinely new — the Expo rebuild, semantic search, occupancy, and the review carousel, which is most of the current product anyway — or email `pathfinders@stellic.com` to clarify. Stated response time is 2–3 business days, and there are 11 days left, so **send it today if you're going to**.

**Deferred with reasoning** (do not relitigate mid-build): busy-time prediction, closest-open-spot, study-buddy opt-in, duplicate/canonical merging, personalized recommendations from survey data, multi-campus, campus API integration. All are named in PRD §9 and all are fine to cite in the 500-word write-up as evidence you thought past the MVP.
