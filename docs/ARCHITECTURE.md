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
│   │   ├── (onboarding)/         *intended*
│   │   │   ├── survey.tsx
│   │   │   └── first-review.tsx
│   │   └── (app)/                *intended*
│   │       ├── index.tsx         home
│   │       ├── search.tsx
│   │       ├── favorites.tsx
│   │       ├── review/
│   │       │   └── new.tsx
│   │       └── spot/
│   │           ├── [id].tsx
│   │           └── new.tsx
│   ├── components/               shared UI — pills, chips, cards, empty states
│   │   └── ui/                   React Native Reusables primitives (vendored, editable)
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── session.tsx           SessionProvider / useSession
│   │   ├── auth-url.ts           magic-link fragment parser
│   │   └── theme.ts              design-token mirror for navigation chrome
│   └── global.css                design tokens — the source of every colour
├── supabase/
│   ├── migrations/          schema, views, RPCs, RLS
│   └── functions/           *intended* — embed/ and search/ Edge Functions
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

**`src/components/`** — UI used on more than one screen. Review cards, occupancy pills, amenity chips, the report sheet. If it is a route, it does not belong here. `ui/` beneath it holds the React Native Reusables primitives, vendored as source rather than installed as a dependency — edit them for the whole app, never for one screen. See [`DESIGN.md`](DESIGN.md).

**`src/lib/`** — non-UI code the app imports: the Supabase client, session provider, API wrappers around RPCs and Edge Functions, the theme mirror, domain types and constants that mirror database enums. No React components.

**`supabase/migrations/`** — the database. Tables, views (`public_reviews`, `public_spots`, `spot_occupancy`), definer RPCs, triggers, RLS. Clients never select `reviews`, `spots`, `check_ins`, or `reports` directly.

**`supabase/functions/`** — Deno Edge Functions. `embed` turns review text into a vector; `search` embeds a query and returns cards. They are the only place the OpenAI key is allowed. Share one embedding helper so the two cannot drift.

**`docs/`** — the spec. `PRODUCT.md` is the feature list; `features/` is the requirements for each one. Do not put implementation notes that belong in a feature doc here, and do not put screens in `docs/`.

**`assets/`** — binary art referenced from `app.json` (icon, splash, adaptive icons). Not screen copy, not feature docs.
