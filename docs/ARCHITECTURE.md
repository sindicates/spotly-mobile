# Project structure

Routes live in `src/app/`, not `app/`. Path alias `@/*` → `src/*`.

Folders marked *intended* are specified but not created yet. Screen detail lives with the [feature that owns it](features/). The report sheet is a modal, not a route.

```
spotly-mobile/
├── src/
│   ├── app/                      expo-router
│   │   ├── _layout.tsx           session provider + Stack.Protected guards
│   │   ├── (auth)/
│   │   │   └── sign-in.tsx
│   │   ├── auth/                 NOT a group — see note below
│   │   │   └── callback.tsx
│   │   ├── (onboarding)/
│   │   │   ├── survey.tsx
│   │   │   └── first-review.tsx
│   │   └── (app)/
│   │       ├── (tabs)/           the native tab bar — the app's four destinations
│   │       │   ├── _layout.tsx   NativeTabs, themed from lib/theme.ts
│   │       │   ├── index.tsx     home — daily swipeable review deck
│   │       │   ├── search.tsx    results + SEARCH-4 empty state
│   │       │   ├── map.tsx       nearby spots — campus map + distance list
│   │       │   └── favorites.tsx
│   │       ├── content-policy.tsx   MOD-3, linked from the review forms + report sheet
│   │       ├── review/
│   │       │   └── new.tsx
│   │       └── spot/
│   │           ├── [id].tsx
│   │           └── new.tsx
│   ├── components/               shared UI — pills, chips, cards, deck, empty states, toast host
│   │   └── ui/                   React Native Reusables primitives (vendored, editable)
│   ├── hooks/                    data-fetching hooks — one per read path
│   │   ├── use-async.ts          the shared read primitive
│   │   ├── use-field.ts          field value + error timing (the sign-in form)
│   │   ├── use-buildings.ts      building picker
│   │   ├── use-spots-in-building.ts   add-spot duplicate guard
│   │   ├── use-trending-feed.ts  home deck, ~10 per day (SPOT-1)
│   │   ├── use-search.ts         semantic search results, keyed on query + tags
│   │   ├── use-spot-detail.ts    spot page — spot, reviews, occupancy, favourite
│   │   ├── use-favorites.ts      saved-spot list
│   │   ├── use-map-spots.ts      catalog + occupancy for the map list
│   │   ├── use-user-location.ts  one-shot GPS for the map tab (MAP-4)
│   │   └── use-review-interactions.ts   expand + increment_expand + report-sheet state
│   ├── domain/                   product logic — one file per feature doc
│   │   ├── amenities.ts          the eight tags
│   │   ├── occupancy.ts          occupancy states, copy, check-in write, freshness
│   │   ├── reviews.ts            word floor, prompt, embed, review writes, feed reads
│   │   ├── spots.ts              buildings / public_spots reads, add-spot write
│   │   ├── favorites.ts          save / unsave + saved-spot reads (direct table, FAV-3)
│   │   ├── search.ts             calls the search Edge Function → review cards
│   │   ├── map.ts                nearby-map reads, haversine, pin grouping
│   │   ├── reporting.ts          report_review write (MOD-1)
│   │   ├── onboarding.ts         survey questions, first-review prompt
│   │   └── validation.ts         pure field validators (infra/input-validation.md)
│   ├── lib/                      client infrastructure — no product logic
│   │   ├── supabase.ts           client, RequestError / unwrap, functionErrorMessage
│   │   ├── database.types.ts     GENERATED — `npm run gen:types`, never hand-edit
│   │   ├── session.tsx           SessionProvider / useSession
│   │   ├── storage.ts            MMKV — device-local state (the onboarding flag)
│   │   ├── auth-url.ts           magic-link fragment parser
│   │   ├── haptics.ts            semantic haptic helpers (press/selection/success/…)
│   │   ├── toast.ts              showToast / showErrorToast — never import the library from a screen
│   │   ├── utils.ts              cn + errorMessage
│   │   └── theme.ts              design-token mirror for navigation chrome
│   └── global.css                design tokens — the source of every colour
├── supabase/
│   ├── migrations/          schema, views, RPCs, RLS, buildings reference data
│   ├── seed.sql             local fake data — runs on `supabase db reset`
│   └── functions/           Deno Edge Functions
│       ├── _shared/         embedding helper, rerank judge, auth guard, CORS — never deployed
│       ├── embed/           text → vector(1536)
│       └── search/          embeds a query, calls search_reviews, returns cards
├── docs/
│   ├── DESIGN.md            the design system — tokens, type, components, patterns
│   └── features/            one file per product feature
├── assets/                  icons, splash, static images
└── README.md
```

Report sheet is a modal, not a route. Screen detail lives with the feature that owns it.

**`auth/callback.tsx` is deliberately not in the `(auth)` group.** Expo Router strips
group segments from URLs, so a file at `(auth)/callback.tsx` answers to `/callback`
and never to `/auth/callback` — which is the path baked into `site_url`, the redirect
allowlist, and every magic link already sent. Sign-in keeps its group because its URL
never leaves the app; the callback's does, so its path has to be literal.

---

## What goes where

**`src/app/`** — one file per screen, nothing else. File-based routing. The three groups are the session gate: no session → `(auth)`, signed in but not onboarded → `(onboarding)`, otherwise `(app)`. The root `_layout` picks the group; it does not live in RLS.

**`(app)/(tabs)/` is destinations; everything beside it is pushed over them.** The tab bar is the real platform one ([`NativeTabs`](https://docs.expo.dev/router/advanced/native-tabs/), alpha in SDK 57, hence the `unstable-native-tabs` import), and it holds the four places you can *be*: home, search, map, favourites. Spot detail, the two forms, and the content policy stay siblings of the group in the root stack, so they push over the whole navigator with a back button rather than into one tab's history — the spot page is reached from all four tabs and belongs to none of them. Adding a spot is an action, not a place, so it has no tab.

Group segments are stripped from URLs, so `/`, `/search`, `/map`, and `/favorites` are unchanged by the move. What did change is lifetime: a tab screen mounts once and survives every visit, where a pushed screen remounted per visit. State seeded from params at mount is therefore only correct the first time — see the hand-off marker in `search.tsx`. Navigate between tabs with `router.navigate`, not `router.push`.

**`src/components/`** — UI used on more than one screen. Review cards, occupancy pills, amenity chips, the report sheet. If it is a route, it does not belong here. `ui/` beneath it holds the React Native Reusables primitives, vendored as source rather than installed as a dependency — edit them for the whole app, never for one screen. See [`DESIGN.md`](DESIGN.md).

**`src/domain/`** — the product logic: API wrappers around RPCs, views, and Edge Functions, plus the domain types and constants that mirror database enums. One file per feature, mapping 1:1 onto [`features/`](features/) — plus `validation.ts`, owned by [input-validation.md](infra/input-validation.md). No React components, no hooks.

Organised **by domain, not by kind** — `occupancy.ts` holds the occupancy type, its constants, and its helpers together, rather than scattering them across `types/`, `constants/`, and `services/`. This is load-bearing rather than stylistic: the comment explaining why `OccupancyReading` carries no `lastKnownStatus` sits directly above the type it constrains, and OCC-4 survives contact with the next person to edit that file only because the two cannot be read apart. The same applies to AMEN-2 in `amenities.ts`.

> **Changed 2026-08-16.** ~~Everything non-UI lived flat in `src/lib/`.~~ The feature modules now live in `src/domain/`; `src/lib/` keeps only client infrastructure. The by-domain-not-by-kind rule above is unchanged — what changed is that product logic and plumbing no longer share a folder. The dependency direction is one-way: `domain/` imports `lib/`, never the reverse.

**`src/lib/`** — client infrastructure: the Supabase client, session provider, device-local storage, the haptics/toast/theme platform helpers, `cn`/`errorMessage`. No React components, no hooks, no product logic — a `lib/` file importing from `domain/` is a layering bug.

**`src/lib/database.types.ts` is generated — never hand-edit it.** `npm run gen:types` rewrites it from the linked project's live schema. It is what `createClient<Database>` is parameterised by, so every table name, selected column, and RPC argument is checked against the real schema: a migration that renames a column fails `npm run typecheck` instead of returning `undefined` at runtime. Domain types derive from it (`AmenityTag` is `Database['public']['Enums']['amenity_tag']`), which is what stops the hand-copied enum mirrors from drifting. Regenerate in the same change as any migration.

Note that view rows come back with every column nullable — Postgres cannot prove non-null through a view, so the generator assumes the worst. Narrow at the boundary and say why, as `PublicSpot` does; do not push the nullability into screens that would then render a defensive fallback for a column that is `not null` in the table.

**`src/hooks/`** — React hooks that wrap a `domain/` read for a screen. One file per read path, named `use-<thing>.ts`, all built on `useAsync`. Writes do not belong here: a write's result belongs to the screen that fired it and its errors render inline, so screens call the `domain/` function directly from the submit handler.

`useAsync` is a deliberate minimum, not a cache — no dedupe, no background refetch, no store shared between components. It exists to get request supersession right, which is the bug hand-rolled fetching always has. When two screens need the same data at once, adopt React Query rather than growing it.

**`src/lib/storage.ts` is for per-install state only.** Right now that is one value: the onboarding flag, keyed by account id ([onboarding.md](features/onboarding.md)). Anything a second device or the server has to agree on goes in Postgres. Reaching for MMKV to avoid writing a migration is how the two drift.

**`supabase/migrations/`** — the database. Tables, views (`public_reviews`, `public_spots`, `spot_occupancy`), definer RPCs, triggers, RLS. Clients never select `reviews`, `spots`, `check_ins`, or `reports` directly.

**Buildings are reference data, not seed data.** `buildings` is populated by a migration, so it is present in every environment. It is the one table holding real-world facts rather than rows users create, and it is a required field on the add-spot form — an empty `buildings` blocks the flow outright rather than degrading it. Fixtures that need a building join it by `short_name`.

**Building photos are reference data too**, stored in `building_images` plus the `building-images` Storage bucket. Reviews inherit the building's primary photo (REV-12); they do not carry their own. Files are not in git — `npm run db:images` downloads Wikimedia Commons thumbs and uploads them. A building with no freely licensed photo stays `image_path = null`, and the card renders a muted placeholder rather than a photo of a different building.

**`supabase/seed.sql`** — local fake data, applied automatically by `supabase db reset`. Spots, reviews, check-ins, favourites, one open report. It leaves `reviews.embedding` null on purpose: a fabricated vector ranks as a real match and makes the `min_similarity` threshold impossible to calibrate. **`scripts/seed-catalog.sql`** is the idempotent hosted catalog (`npm run db:seed-catalog`) and also runs after `seed.sql` on local reset. Seeded reviews are invisible to search until `npm run db:embeddings` (`scripts/backfill-embeddings.mjs`) backfills real ones, so a reset is two commands.

**`supabase/functions/`** — Deno Edge Functions. `embed` turns review text into a vector; `search` embeds a query and returns cards. They are the only place the OpenAI key is allowed. Share one embedding helper so the two cannot drift.

A folder prefixed `_` is skipped by the CLI rather than deployed as an endpoint, which is what lets `_shared/` sit here as a library. `embedding.ts` owns the model name and dimension count together, because drift between the two functions is silent — a query embedded by a different model still returns 1536 valid floats and still scores, so search degrades into ranking by noise without erroring anywhere. `auth.ts` holds the guard both functions run before spending an OpenAI call: `verify_jwt` at the gateway only proves the bearer is a JWT this project signed, and the anon key is one, shipped in the bundle. Resolving the token to a user is a separate step and not optional.

This folder is Deno, not React Native. `tsconfig.json` excludes it and `eslint.config.js` ignores it — `Deno` is a global here, imports carry `.ts` extensions, and packages resolve through `npm:` specifiers, all of which the Expo toolchain reports as errors. Editors need the Deno extension scoped by `deno.enablePaths` in `.vscode/settings.json`; do not fix it by adding Deno types to the root tsconfig, which mixes the two runtimes.

**`scripts/`** — developer tooling, run by hand via `npm run`, never imported by the app. Plain `.mjs` on bare Node: `node:` builtins only, no dependencies, and `.env` parsed by hand rather than through `dotenv`. Reusing the app's `.env` is deliberate — it is what keeps a script and the app pointed at the same stack. Nothing here ships, which is why these are the only files allowed to hold the service-role key.

`dev-token.mjs` mints a local-only JWT for `curl` and `dev-signin.mjs` drives the real magic-link flow at the simulator (both local-only by construction). `backfill-embeddings.mjs`, `calibrate-search.mjs` and `calibrate-rerank.mjs` are the search set: the first indexes the corpus, the second prints the similarity spread the `min_similarity` floors are set from, the third runs the labelled query set against the rerank pass and reports recall, precision, latency, and a before/after against cosine-only ranking ([semantic-search.md](features/semantic-search.md)). `seed-building-images.mjs` fills the `building-images` bucket from the Wikimedia Commons manifest ([reviews.md](features/reviews.md), REV-12).

**`docs/`** — the spec. `PRODUCT.md` is the feature list; `features/` is the requirements for each one. Do not put implementation notes that belong in a feature doc here, and do not put screens in `docs/`.

**`assets/`** — binary art referenced from `app.json` (icon, splash, adaptive icons). Not screen copy, not feature docs.
