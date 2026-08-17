# Supabase

The complete backend inventory — every table, view, function, trigger, Edge
Function, and secret, and the access model that ties them together. The database
is migration-driven: [`supabase/migrations/`](../../supabase/migrations/) is the
source of truth, and this doc is the map of what those migrations produce.

- **Project ref:** `txycwxxeojodgrlupnzm` (name `spotly-mobile`, region West US / Oregon)
- **Client:** a single `@supabase/supabase-js` client ([`src/lib/supabase.ts`](../../src/lib/supabase.ts)), parameterised by the generated [`database.types.ts`](../../src/lib/database.types.ts)

---

## The access model (AUTH-4)

This is the shape of everything below. **Account IDs never reach a device.** Four
tables carry them — `spots.created_by`, `reviews.author_id`, `check_ins.author_id`,
`reports.reporter_id` — and clients have **no privilege on any of them**. Instead:

| Clients read through | Clients write through | Clients touch directly |
| --- | --- | --- |
| the three `public_*` **views** | the `security definer` **RPCs** | `buildings`, `building_images`, `profiles`, `favorites`, `survey_responses` |

- **Views** are the read surface: they project away every account ID, so a leak is impossible by construction rather than by discipline.
- **RPCs** are the write surface: each derives the author from `auth.uid()` internally, so a client cannot attribute a row to someone else — there is no argument to try.
- The **direct-access tables** hold no cross-account data: a building (and its photos) is public reference data, and a profile / favorite / survey row is only ever the caller's own, guarded by self-only RLS. Cards read `image_path` through `public_spots` / `search_reviews`; they do not need a second join onto `building_images`.

Base tables `spots`, `reviews`, `check_ins`, `reports` are **fully revoked** from
`anon` and `authenticated`, and their RLS has zero policies — so even a mistaken
future `grant` still denies every row. `anon` reads nothing at all; the `.edu` gate
is worthless if the catalog is public anyway.

---

## Extensions

| Extension | Schema | For |
| --- | --- | --- |
| `vector` (pgvector) | `extensions` | Review embeddings — `vector(1536)`, HNSW index, cosine distance in `search_reviews` (SEARCH-1). |

Plus the standard Supabase default set (`pgcrypto`, `pg_graphql`, `pg_stat_statements`, …). `vector` is the only one the app added.

---

## Enums

| Enum | Values | Notes |
| --- | --- | --- |
| `amenity_tag` | `outlets`, `quiet`, `lively`, `group_tables`, `natural_light`, `food_nearby`, `whiteboards`, `open_late` | AMEN-1. Eight binary tags; quiet/lively oppose rather than scale. |
| `occupancy_status` | `empty`, `some_seats`, `packed` | OCC-1. The three check-in states. |
| `spot_category` | `study`, `dining`, `hangout` | SPOT-1. v1 is study-only; the other two exist so widening the catalog is data entry, not a migration. |

---

## Tables

All nine have RLS **enabled**. "Grants" is what `authenticated` holds; `anon` holds
nothing on any of them.

| Table | Grants (authenticated) | RLS policies | Purpose |
| --- | --- | --- | --- |
| `profiles` | select, update | self-only (`id = auth.uid()`) | AUTH-3 account record: id + FK to `auth.users`. Rows created by trigger, removed by cascade. |
| `buildings` | select | select all (`true`) | Reference data — 60 CWRU buildings. The only table read directly with no self-scope; holds no account id. |
| `building_images` | select | select all (`true`) | Team-seeded building photos (REV-12). Same access model as `buildings`. No client writes. |
| `spots` | **none (revoked)** | none | Catalog entries. Read via `public_spots`, written via `create_spot_with_review`. |
| `reviews` | **none (revoked)** | none | Anonymous reviews + embeddings. Read via `public_reviews` / `search_reviews`, written via `create_review` / `update_review`. |
| `check_ins` | **none (revoked)** | none | Occupancy reports. Read via `spot_occupancy`, written via `create_check_in`. |
| `reports` | **none (revoked)** | none | Moderation queue. Written via `report_review`; **no read path for anyone but the dashboard** (MOD-2). |
| `favorites` | select, insert, delete | self-only (`account_id = auth.uid()`) | FAV-3. Saved spots, private by construction. No update — created or removed. |
| `survey_responses` | select, insert | self-only (`user_id = auth.uid()`) | ONB-6 taste survey, one JSONB row per account. Stored, deliberately unused in v1. |

### Key columns & constraints

- **`building_images`** — `building_id` (FK, cascade), `storage_path`, `is_primary`, `source_url`, `license`, `attribution`. Partial unique index: at most one primary per building. Files live in the `building-images` Storage bucket.
- **`spots`** — `building_id` (FK, `on delete restrict`), `area_name`, `category` (default `study`), `amenity_tags amenity_tag[]` (write-once, AMEN-2), `created_by` (FK profiles, `on delete set null`).
- **`reviews`** — `spot_id` (FK, cascade), `author_id` (FK, set null), `body`, `embedding vector(1536)` (nullable — embedded in a second step; null = unindexed, invisible to search), `expand_count` (REV-6 engagement), `hidden` (MOD-4 moderation flag), `created_at` / `updated_at`.
- **`check_ins`** — `spot_id`, `author_id`, `status occupancy_status`, `created_at`.
- **`reports`** — `review_id`, `reporter_id`, `reason`, `resolved_at` (null = open queue).

### Indexes worth knowing

| Index | On | Why |
| --- | --- | --- |
| `building_images_one_primary` (unique, partial) | `building_images (building_id) where is_primary` | REV-12 — one cover photo per building. |
| `spots_building_area_uniq` (unique) | `spots (building_id, lower(btrim(area_name)))` | SPOT-5 duplicate guard — case/whitespace-insensitive. |
| `spots_amenity_tags_gin` (GIN) | `spots (amenity_tags)` | AMEN-3 / SEARCH-3 hard filter (`@>`). |
| `reviews_spot_author_uniq` (unique) | `reviews (spot_id, author_id)` | REV-1 — one review per person per spot. |
| `reviews_embedding_hnsw` (HNSW) | `reviews (embedding vector_cosine_ops)` | SEARCH-1 — must match the `<=>` opclass or it's ignored. |
| `reviews_body_word_floor` (check) | `reviews.body` | REV-10 — ≥ 15 words, in the database, not just the form. |
| `check_ins_rate_limit_idx` | `check_ins (spot_id, author_id, created_at desc)` | OCC-6 rate-limit lookup. |
| `reports_review_reporter_uniq` (unique) | `reports (review_id, reporter_id)` | One report per person per review — a repeat tap updates the reason. |

---

## Views — the read surface

All three are `security_invoker = false` (run as owner, see through the base-table
RLS). Granted `select` to `authenticated`, revoked from `anon`. None exposes an
account id.

| View | Feature | Shape |
| --- | --- | --- |
| `public_spots` | [spot-catalog](../features/spot-catalog.md) · [nearby-map](../features/nearby-map.md) · [reviews](../features/reviews.md) | Spot + building name + live `review_count` + building `latitude` / `longitude` + primary `image_path`. Omits `created_by`. |
| `public_reviews` | [reviews](../features/reviews.md) | Review body + `expand_count`, `is_mine` (the only thing derived from `author_id`, collapsed to a boolean about the caller), and `trending_score` (a column because PostgREST can't order by an expression, REV-6). Excludes `hidden` rows. |
| `spot_occupancy` | [occupancy](../features/occupancy.md) | `distinct on (spot_id)` most recent check-in **within 60 minutes**. OCC-4 lives in the WHERE clause: a stale row doesn't exist, so a spot absent from the view has no recent report. |

---

## RPCs — the write & search surface

All `security definer`, `set search_path = ''`, derive the author from
`auth.uid()`, and are granted `execute` to `authenticated` only (revoked from
`public`/`anon`). Defined in [`20260814060200_rpcs.sql`](../../supabase/migrations/20260814060200_rpcs.sql).

| RPC | Args → Returns | Feature |
| --- | --- | --- |
| `create_spot_with_review` | `(building_id, area_name, amenity_tags, body, embedding?)` → `(spot_id, review_id)` | SPOT-3/5, AMEN-2 — spot + first review in one transaction; the **only** path that sets tags. |
| `create_review` | `(spot_id, body, embedding?)` → `uuid` | REV-1 — raises `review_exists` on the unique violation. |
| `update_review` | `(review_id, body, embedding?)` → `uuid` | REV-1 — ownership is a WHERE clause; bumps `updated_at`. |
| `increment_expand` | `(review_id)` → `void` | REV-5/6 — trending signal; no server-side dedupe. |
| `create_check_in` | `(spot_id, status)` → `timestamptz` | OCC-1 — returns the timestamp so the pill updates without a refetch. |
| `report_review` | `(review_id, reason?)` → `uuid` | MOD-1 — upserts on `(review_id, reporter_id)`. |
| `search_reviews` | `(query_embedding, filter_tags?, candidate_pool?, result_limit?, min_similarity?)` → table of cards | SEARCH-1..4 — pgvector scan, one card per spot, cut at `min_similarity`. **No longer called by the app** as of SEARCH-5; kept installed for `calibrate-search.mjs`, the before/after column in `calibrate-rerank.mjs`, and as a one-string rollback. |
| `search_review_candidates` | `(query_embedding, filter_tags?, candidate_pool?, spot_limit?, per_spot_limit?, min_similarity?)` → table of cards **+ `spot_best`** | SEARCH-5 — same scan, but returns the shortlist *uncollapsed* (up to 3 reviews per spot) so the rerank judge can pick between a spot's reviews rather than only accept or reject the one cosine chose. Dedupe happens in the Edge Function. Defined in [`20260818010000_search_rerank_candidates.sql`](../../supabase/migrations/20260818010000_search_rerank_candidates.sql). |

Error convention: RPCs raise a stable machine token as the message
(`review_exists`, `spot_exists`, `not_authenticated`, `rate_limited`) with the
human sentence in `hint`. The client branches on the token (`RequestError.reason`)
and shows the hint (`RequestError.message`).

---

## Triggers & internal functions

Not callable by clients — they run on the database's own events.

| Function | Trigger | Does |
| --- | --- | --- |
| `handle_new_user()` | `on_auth_user_created` — after insert on `auth.users` | Creates the `profiles` row (definer, idempotent). |
| `enforce_check_in_rate_limit()` | `check_ins_rate_limit` — before insert on `check_ins` | OCC-6 — raises `rate_limited` with a hint if the same account checked into the same spot inside 15 minutes. A trigger, not RLS, so the message is showable. |
| `before_user_created_hook(event)` | Auth hook (below) | AUTH-1 — the `.edu` gate. |

### Auth hook — the `.edu` gate

`before_user_created_hook` rejects any signup whose email isn't `@case.edu`, at the
`auth.users` boundary. This is the **real** gate; the client's `caseEmail()`
validator ([input-validation.md](input-validation.md)) is only the affordance.
Wired via `[auth.hook.before_user_created]` in
[`config.toml`](../../supabase/config.toml) locally, and **Authentication → Hooks**
in the dashboard remotely. Granted `execute` to `supabase_auth_admin`.

---

## Edge Functions

Deno, in [`supabase/functions/`](../../supabase/functions/). Both are `ACTIVE` with
`verify_jwt: true` at the gateway **and** a `requireUser` check in code — the
gateway only proves the bearer is a JWT this project signed (the anon key is one),
so resolving it to a real user is a separate, non-optional step.

| Function | Version | Endpoint | Does |
| --- | --- | --- | --- |
| `embed` | 2 | `POST /functions/v1/embed` `{ input }` → `{ embedding }` | REV-3 — review text → `vector(1536)`. |
| `search` | 2 | `POST /functions/v1/search` `{ query, filter_tags? }` → `{ results }` | SEARCH-1..5 — embeds the query, calls `search_review_candidates`, has Haiku 4.5 judge satisfaction, dedupes to one card per spot. |

**Shared modules** ([`_shared/`](../../supabase/functions/_shared/), the `_` prefix
keeps them from deploying as endpoints):

- `embedding.ts` — the one embedder. Model **`text-embedding-3-small`**, **1536** dimensions (must equal the `vector(n)` width). Imported by both functions so the model can't drift.
- `rerank.ts` — the SEARCH-5 judge. Model **`claude-haiku-4-5`**, one listwise call, structured output. Also owns `FALLBACK_MIN_SIMILARITY` (`0.35`) and the pure `resolveSpots` / `fallbackSpots` rankers. Used by `search` only.
- `auth.ts` — `requireUser`, forwarding the caller's JWT to `getUser()`.
- `cors.ts` — browser preflight headers (web target).

### Function secrets

Two are set by hand, and neither is ever `EXPO_PUBLIC_`: `OPENAI_API_KEY` (used by
`embed` and `search`) and `ANTHROPIC_API_KEY` (used by `search` for the SEARCH-5
rerank). The Anthropic key is **optional** — without it `search` logs and degrades
to cosine ranking rather than failing, which is why it is not treated like the
OpenAI key. `RERANK_ENABLED=false` forces that same fallback deliberately.

The rest are platform-injected: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`,
`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`. ~~`search` uses the injected
service-role key to run the ranked scan as owner after it has already resolved the
caller.~~ **Corrected 2026-08-15:** it never did. `search` calls the RPC through
`callerClient` — anon key plus the caller's forwarded `Authorization` — and the
search RPCs are `security definer` granted to `authenticated` alone. A function
holding the service key would be a way around every grant in
[`20260814060200_rpcs.sql`](../../supabase/migrations/20260814060200_rpcs.sql), so
it does not hold one.

---

## Storage

One public bucket, `building-images`. Campus photos are reference data, not user content — the same reason `buildings` is readable without a self-scope. Clients resolve a path with `storage.from('building-images').getPublicUrl(...)`. Authenticated can select objects; nobody but the service-role seed script writes. Accounts still have no avatars (AUTH-3, REV-2).

## Not used

- **Realtime** — not enabled. Occupancy is pull-on-view, not a live subscription.

---

## Migrations

Thirteen, all applied to the remote (verified via `supabase migration list`).

| Timestamp | Name | Produces |
| --- | --- | --- |
| `20260814022230` | edu_email_gate | `before_user_created_hook` (AUTH-1). |
| `20260814033540` | profiles | `profiles` + `handle_new_user` trigger. |
| `20260814045610` | drop_profiles_onboarding_complete | Drops the flag column — onboarding moved to device-local MMKV. |
| `20260814060000` | core_schema | Enums; `buildings`, `spots`, `reviews`, `check_ins`, `reports`, `favorites`; rate-limit trigger; the AUTH-4 revokes. |
| `20260814060100` | public_views | `public_spots`, `public_reviews`, `spot_occupancy`. |
| `20260814060200` | rpcs | The seven RPCs + grants. |
| `20260814061500` | survey_responses | `survey_responses` (ONB-6). |
| `20260814194500` | buildings_reference_data | 60 CWRU buildings (idempotent on `name`). |
| `20260814220000` | service_role_embedding_backfill | Grants `service_role` `select(id, body, embedding)` + `update(embedding)` on `reviews` so a backfill can index seeded reviews. |
| `20260815030300` | search_min_similarity | `search_reviews` similarity floor (SEARCH-4). |
| `20260816010000` | public_spots_coords | Projects `buildings.latitude` / `longitude` onto `public_spots` (MAP-1). |
| `20260817010000` | building_images | `building_images` table, `building-images` bucket, `image_path` on `public_spots` and `search_reviews` (REV-12). |
| `20260818010000` | search_rerank_candidates | `search_review_candidates` — the uncollapsed shortlist the rerank judge reads (SEARCH-5). Additive; `search_reviews` is left installed. |

Regenerate types after any migration: `npm run gen:types`.

---

## Seed & reference data

- **`buildings` is reference data, not seed** — populated by migration `20260814194500`, so it's present in every environment (60 rows). It's a required field on the add-spot form, so an empty table is a dead end, not a thin catalog.
- **`building_images` is reference data too**, but the files live in Storage, not in git. `npm run db:images` (`scripts/seed-building-images.mjs`) downloads Wikimedia Commons thumbs (and a few CC-BY Flickr photos where Commons has no match), uploads them, and upserts the rows. Buildings with no freely licensed photo stay `image_path = null`.
- **`supabase/seed.sql`** — local fake data (spots, reviews, check-ins, favourites, one open report), applied only by `supabase db reset`. It leaves `reviews.embedding` **null on purpose**: a fabricated vector ranks as a real match and makes `min_similarity` impossible to calibrate. Seeded reviews are invisible to `search_reviews` until a backfill indexes them (the grant migration above is what lets that run).
- **`scripts/seed-catalog.sql`** — idempotent catalog seed for the hosted project (`npm run db:seed-catalog`), also loaded after `seed.sql` on local reset. Same eight seed accounts; extra spots in buildings that already have photos; does not overwrite student-created rows. Still leaves embeddings null — follow with `npm run db:embeddings`.

---

## Client keys & env

| Key | Where | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env`, shipped in the bundle | The anon key is the **only** key that belongs on the client. |
| `OPENAI_API_KEY` | Edge Function secret | Never `EXPO_PUBLIC_`. |
| service-role key | seed scripts only | Bypasses RLS; never in the app, never `EXPO_PUBLIC_`. |

`scripts/dev-token.mjs` mints a bare access token for `curl`; `scripts/dev-signin.mjs`
runs the real magic-link flow against a **local** stack (Mailpit) to sign the
simulator in. Neither works against a remote project.
