# Spotly

`.edu`-verified, mobile-first app for finding campus study spots at CWRU — natural-language search over what students actually wrote, plus live crowdsourced occupancy.

Built for the [Stellic Pathfinders Challenge](https://www.stellic.com/pathfinders), Campus Connection category.

> **Status: baseplate.** Project scaffolding, tooling, and config only. **No features are implemented.**
> Everything to build is specified in [`docs/SPEC.md`](docs/SPEC.md) — read §13 before writing code.

---

## Stack

| | |
|---|---|
| App | Expo SDK 57 (React Native 0.86, React 19.2), expo-router, TypeScript |
| Styling | NativeWind 4 (Tailwind 3.4) |
| Backend | Supabase — Postgres, Auth, RLS, Edge Functions |
| Vector search | pgvector + OpenAI `text-embedding-3-small` (1536 dims) |
| Builds | EAS Build → custom dev client, **not Expo Go** |

Expo Go cannot load custom native modules, which is why every profile in `eas.json` builds a dev client.

---

## Setup

```bash
npm install
cp .env.example .env    # then fill in the two Supabase values
```

`.env` is gitignored. Only `EXPO_PUBLIC_*` vars reach the bundle — see the warnings in `.env.example` about the two keys that must never get that prefix.

### First real step: get a dev build onto a physical device

Do this **before writing any screens.** EAS credentials, provisioning, and the magic-link deep link are the failures that surface late and cost the most.

```bash
npx eas init
npx eas build --profile development --platform ios
```

`eas init` links the project to your Expo account, so it has to be run by you — it is deliberately not done here.

Then verify the auth redirect end to end. `scheme: "spotly"` is already set in `app.json`; add `spotly://auth/callback` to the Supabase redirect allowlist.

Once the dev build is installed:

```bash
npm start          # then open on the device
npm run typecheck
npm run doctor
```

---

## What's here

```
src/
  app/               expo-router routes — only a placeholder index.tsx
  lib/supabase.ts    configured client (AsyncStorage session, detectSessionInUrl: false)
  global.css         tailwind directives
supabase/
  migrations/        empty — schema DDL is SPEC.md §13.2
  functions/         empty — embed + search are SPEC.md §13.11
docs/SPEC.md         the build authority
```

`src/app/` contains exactly one placeholder screen. The real route tree — `(auth)`, `(onboarding)`, `(app)` groups and the eleven screens under them — is specified in SPEC.md §13.7 and deliberately not stubbed out.

## What's deliberately not here

Schema migration, RLS policies and views, edge functions, seed data, and every screen. All of it is specified; none of it is started. Build order is SPEC.md §13.13.

---

## Three things that will bite

Pulled forward from SPEC.md because they cost the most when discovered late.

**Anonymity is a schema problem, not a UI one.** REV-2 and AUTH-4 require that account IDs never reach other users. A client running `select * from reviews` gets `author_id` back no matter what the UI renders, so reads go through views that omit it and writes go through definer functions that set it server-side. `spots.created_by` leaks the same way, and worse — a spot's creator is by construction the author of its first review. SPEC.md §13.3.

**The seeder fails on its second row if you use one seed account.** `reviews` is unique on `(spot_id, author_id)`, so one account can hold at most one review per spot. Use a pool of 6–8, and create them with `email_confirm: true` so they clear the `.edu` gate. SPEC.md §13.10.

**Never show a stale occupancy badge.** A spot with no check-in inside the 60-minute window is absent from `spot_occupancy` and must render "no recent reports" — never a last-known status. Wrong-but-confident is the fastest way to lose a first-time user's trust, and trust is the whole product. SPEC.md §13.3, PRD §5.
