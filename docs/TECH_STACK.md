# Tech stack

The product is the **mobile app**. Web is a marketing landing page only — not a second client. Expo's web target exists for Metro convenience; do not build product UI against it.

Expo SDK 57 changed a lot. Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing code.

Use `npx expo install` for anything React-Native-adjacent, never bare `npm install` — it resolves SDK-57-compatible versions.

---

## Summary

| Layer | Choice |
| --- | --- |
| App | Expo SDK 57 (React Native 0.86, React 19), **expo-dev-client**. Not Expo Go — it cannot load custom native modules. |
| Routing | expo-router. Routes live in `src/app/`, not `app/`. Typed routes experiment is on. |
| Styling | NativeWind 4 on Tailwind **3.x**. Do not install `tailwindcss@latest` (v4); styles fail silently. |
| Backend | Supabase — Postgres 17, Auth, RLS, Edge Functions (Deno 2). |
| Vector | pgvector, cosine distance (`<=>`). Similarity is `1 - distance`. |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims). Key lives only in Edge Function secrets. |
| Session | `@supabase/supabase-js` + AsyncStorage. `detectSessionInUrl: false` — the web default breaks native. |
| Local state | `react-native-mmkv` v4 (JSI/Nitro, synchronous). Per-install state only — currently just the onboarding flag. |
| Location | `expo-location`, foreground only. Unused in v1 UI; wired so the dev build is proven. |
| Haptics | `expo-haptics`. Screens call `src/lib/haptics.ts`; they never import the package. Web is a no-op. |
| Build | EAS Build → custom development build. Internal distribution + TestFlight. |

---

## App

**Why a custom dev client.** `expo-location` (and anything else with native code) will not load in Expo Go. Install via `npx expo run:ios` / `npx expo run:android` locally, or an EAS `development` / `development-simulator` build.

**Routing.** File-based. The three groups `(auth)`, `(onboarding)`, `(app)` and the session gate are in [ARCHITECTURE.md](ARCHITECTURE.md). Deep-link scheme is `spotly` (`app.json`), callback URL `spotly://auth/callback`. That URL must be on the Supabase Auth redirect allowlist.

**Styling.** NativeWind 4 compiles Tailwind classes at build time. The Metro wrapper points at `src/global.css`; `tailwind.config.js` scans `src/app` and `src/components`. Pin Tailwind to 3.x — v4 is a different compiler and NativeWind 4 does not speak it. Styles then vanish while the bundle still builds.

**Auth on device.** Magic link only; password sign-in is disabled in Supabase. `expo-linking` delivers the inbound URL; `(auth)/callback` calls `supabase.auth.setSession()` from the fragment. Persist the session with AsyncStorage (or expo-secure-store). Do not turn `detectSessionInUrl` on.

**Device-local storage.** Two stores, and they are not interchangeable. AsyncStorage is async and backs the Supabase session adapter, because that is the API `createClient` expects. MMKV is synchronous and backs `src/lib/storage.ts`, because the route guards read the onboarding flag during render and an async read there means a frame with the wrong screen.

MMKV v4 is Nitro-based: it needs `react-native-nitro-modules` (a peer dependency, pinned explicitly rather than left to npm's auto-peer-install) and a native rebuild. `new MMKV()` is gone in v4 — use the `createMMKV()` factory; `MMKV` is now a type-only export. On web the package resolves a `localStorage` implementation through platform extensions, but it throws during expo-router's Node prerender pass, so `storage.ts` falls back to an in-memory store when `window` is undefined. Same guard as `supabase.ts`, same reason.

**Location.** `NSLocationWhenInUseUsageDescription` / Android fine+coarse are declared. v1 check-ins are trust-based (OCC-5) — the permission is in the binary so a later geo gate does not require a new native build. Do not show a location prompt until a screen actually needs the fix.

**Haptics.** `expo-haptics` talks to the Taptic Engine on iOS and the vibrator on Android. Android `VIBRATE` is added by the package. Intensity and when-to-fire live in `src/lib/haptics.ts` so a screen cannot pick a heavier impact than another. The helpers no-op on web (and therefore during Node prerender) and swallow failures — Low Power Mode and a user-disabled Taptic Engine must not break a press handler. There is no in-app toggle; the OS setting is enough.

**Orientation.** Portrait, iPhone only (`supportsTablet: false`).

---

## Backend

One Supabase project. Clients talk to it with the **anon key**. Schema, views, RPCs, and which tables the client may touch are in [ARCHITECTURE.md](ARCHITECTURE.md). Feature docs own the SQL.

**Auth.** Email OTP / magic link. The `.edu` gate is enforced in an auth hook or a `before insert` trigger on `auth.users`, not only in the form. Accept any `.edu` address (tightening to `case.edu` later is one predicate).

**Edge Functions.** `embed` and `search`. They are the only process allowed to hold `OPENAI_API_KEY`. Share one embedding helper so both functions cannot drift off the 1536-dim model.

**Local stack.** `supabase/config.toml` offsets default ports so this project can run beside another local Supabase. Auth `site_url` is `spotly://auth/callback`. Inbucket captures magic-link emails locally.

**Moderation.** Supabase dashboard in v1 — flip `reviews.hidden`. No in-app admin.

---

## Embeddings

| | |
| --- | --- |
| Model | `text-embedding-3-small` |
| Dimensions | 1536 — `vector(1536)` on `reviews.embedding` |
| Write path | Client → `embed` Edge Function → write RPC with the vector |
| Search path | Client → `search` Edge Function → embed query → `search_reviews()` → cards |

Do not embed on the device. Do not put the OpenAI key in `.env` as `EXPO_PUBLIC_*`.

---

## Build and distribution

`eas.json` profiles:

| Profile | What it's for |
| --- | --- |
| `development` | Dev client, internal distro, physical device (`simulator: false`) |
| `development-simulator` | Same, iOS Simulator |
| `preview` | Internal distro of a release-shaped binary |
| `production` | Store / TestFlight; `autoIncrement` from EAS |

Prefer `npx expo run:ios` / `npx expo run:android` when a Mac (or Android Studio) is available. Use EAS cloud builds when it isn't. Setup commands live in the [README](../README.md).

Bundle ID / application ID: `com.spotly.app`. EAS project id is in `app.json` → `extra.eas.projectId`.

---

## Environment

Only `EXPO_PUBLIC_*` vars are inlined into the shipped bundle. They must be safe to publish. Copy `.env.example` → `.env`.

| Variable | Where it lives | Used for |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` (client) | Supabase client |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` (client) | Supabase client — the only key that belongs on-device |
| `OPENAI_API_KEY` | `supabase secrets set` | Edge Functions `embed` and `search` |
| `SUPABASE_SERVICE_ROLE_KEY` | local shell, never committed | Seed and backfill scripts (`db:embeddings`). Bypasses RLS. Must belong to the same stack as the URL above. |

Never prefix a secret with `EXPO_PUBLIC_`.
