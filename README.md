# Spotly

Spotly is a mobile app for finding study spots on the CWRU campus.

Students search the way they'd say it out loud ("place to lock in," "good wifi and no small talk") and get spots whose **reviews** actually read that way.

Each spot shows live **occupancy** reported by someone in the last hour.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`, then install a development build. Build locally when you can. EAS is already configured if you need a cloud build.

Local iOS builds require a Mac with Xcode. If you do not have a Mac, use EAS cloud builds instead. Local Android builds need Android Studio.

For anything React Native after the first install, use `npx expo install` instead of `npm install` so versions stay SDK-57-compatible.

NativeWind 4 requires Tailwind 3.x. Do not install `tailwindcss@latest`. That pulls v4 and styles stop applying even though the bundle still builds.

### Local builds (preferred)

```bash
npx expo run:ios
npx expo run:android
```

These compile on your machine, install the dev client, and start Metro. Pass `--device` to pick a connected phone.

Rerun one of these after pulling a change that adds a native module — `react-native-mmkv` is one, so a dev client built before it landed will crash on launch rather than fail gracefully. A JS-only change needs nothing but Metro.

### EAS cloud builds

Use this when you cannot build locally (no Mac, or no native toolchain set up).

```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

Install the finished build from the EAS dashboard, then start Metro with `npm start` and open the project in the installed client.

## Run

If you used `npx expo run:ios` or `npx expo run:android`, Metro is already running. Otherwise:

```bash
npm start
```

Open the project from the installed dev client.

```bash
npm run typecheck
npm run lint
npm run doctor
```

## Database

Schema lives in `supabase/migrations/`. Never edit the hosted schema by hand — local and remote drift the moment you do.

```bash
npm run db:reset      # rebuild the local database and load supabase/seed.sql
npm run db:embeddings # embed every review that has no vector yet
npm run gen:types     # regenerate src/lib/database.types.ts from the linked project
```

`db:reset` leaves `reviews.embedding` null on purpose — a fabricated vector ranks
as a real match and makes the search threshold impossible to calibrate — so
**nothing is searchable until `db:embeddings` runs.** A reset is those two
commands, not one. It is safe to re-run: a second pass reports `0 remaining`,
which is also how you confirm the first one finished.

That script needs `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` from `.env`.
The service-role key must belong to the same stack as `EXPO_PUBLIC_SUPABASE_URL`
— point one at local and the other at hosted and PostgREST quietly falls back to
`anon`, which was revoked on `reviews`, so the failure names a role you never
asked for. Local values come from `supabase status` (`SECRET_KEY`).

After writing a migration: apply it locally, regenerate types, then `npx supabase db push` to send it up. `gen:types` needs the project linked and a `supabase login`, and `db:reset` needs Docker running.

`src/lib/database.types.ts` is generated output. Editing it by hand works right up until the next regeneration silently reverts you.

Seed data is local only — `db push` applies migrations, not `seed.sql`.

### Calling authenticated endpoints locally

Most of the API is revoked from `anon` — the write RPCs, `search_reviews`, and the
`public_*` views all need an `authenticated` JWT. To get one without going through
the magic-link flow:

```bash
npm run dev:token     # prints a 12h token for the first seed user
```

Pass a uuid and email to impersonate a different seed user. This works because local
Supabase signs with the published demo `JWT_SECRET`; it has no hosted equivalent, and
the token is worthless anywhere but `127.0.0.1`.

```bash
curl "$SUPABASE_URL/rest/v1/public_reviews?select=id,is_mine&limit=3" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $(npm run -s dev:token)"
```

This token is for `curl` only — it **cannot** sign the app in. `setSession` needs a
refresh token, and only GoTrue issues those. To sign in on the booted simulator:

```bash
npm run dev:signin              # first seed user; pass an email for another
```

That runs the real magic-link flow (request → read from Mailpit → exchange) and
fires the resulting `spotly://auth/callback` deep link at the simulator, so the
app's own callback route handles it. By hand: the simulator shares the Mac's
network, so you can open Mailpit at http://127.0.0.1:54334 in simulator Safari
and tap the link.

## Edge Functions

`supabase/functions/` is the only code allowed to hold `OPENAI_API_KEY`. `embed`
turns text into a `vector(1536)`; `search` embeds a query and returns review
cards. `_shared/embedding.ts` owns the model and dimension count so the two
cannot drift off them.

```bash
npm run functions:serve    # serves every function against the local stack
```

That passes `--env-file .env`, which is where `OPENAI_API_KEY` lives locally. It
takes no function name — `supabase functions serve embed` is rejected as an
unexpected argument. Hot reload is on, so edits apply without a restart.

```bash
curl -X POST "http://127.0.0.1:54331/functions/v1/embed" -H "Authorization: Bearer $(npm run -s dev:token)" -H "Content-Type: application/json" -d '{"input":"quiet corner with outlets"}'
```

```bash
curl -X POST "http://127.0.0.1:54331/functions/v1/search" -H "Authorization: Bearer $(npm run -s dev:token)" -H "Content-Type: application/json" -d '{"query":"somewhere quiet to lock in","filter_tags":["outlets"]}'
```

`search` returns `{ "results": [ … ] }`, one card per spot, ranked by similarity.
An empty array is the SEARCH-4 answer — "no strong match" — not a failure. If
every query comes back empty, the corpus is unembedded: run `npm run
db:embeddings`.

`verify_jwt` only proves the caller holds a JWT this project signed — the anon key
qualifies — so each function also resolves the token to a real user before
spending an OpenAI call. The test that proves the guard is a request bearing the
**anon key alone**: it must answer 401, not an embedding.

Deployed functions do not read `.env`:

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...
npx supabase functions deploy embed
npx supabase functions deploy search
```

This folder is Deno, so it sits outside the app's TypeScript setup — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why `tsconfig` excludes it and
what your editor needs.

## Docs

| Need | Read |
| --- | --- |
| What Spotly is / feature list | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Tech stack | [`docs/TECH_STACK.md`](docs/TECH_STACK.md) |
| Project folder structure | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| A specific feature | [`docs/features/`](docs/features/) |
