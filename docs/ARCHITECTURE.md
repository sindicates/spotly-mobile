# Project structure

Routes live in `src/app/`, not `app/`. Path alias `@/*` → `src/*`.

Folders marked *intended* are specified but not created yet. Screen detail lives with the [feature that owns it](features/). The report sheet is a modal, not a route.

```
spotly-mobile/
├── src/
│   ├── app/                 screens (expo-router)
│   │   ├── (auth)/          *intended* — sign-in + magic-link callback
│   │   ├── (onboarding)/    *intended* — survey + first review
│   │   └── (app)/           *intended* — home, search, spots, reviews, favorites
│   ├── components/          *intended* — shared UI (cards, pills, sheets)
│   └── lib/                 clients and helpers (Supabase, etc.)
├── supabase/
│   ├── migrations/          schema, views, RPCs, RLS
│   └── functions/           *intended* — embed/ and search/ Edge Functions
├── docs/
│   └── features/            one file per product feature
├── assets/                  icons, splash, static images
└── README.md
```

---

## What goes where

**`src/app/`** — one file per screen, nothing else. File-based routing. The three groups are the session gate: no session → `(auth)`, signed in but not onboarded → `(onboarding)`, otherwise `(app)`. The root `_layout` picks the group; it does not live in RLS.

**`src/components/`** — UI used on more than one screen. Review cards, occupancy pills, amenity chips, the report sheet. If it is a route, it does not belong here.

**`src/lib/`** — non-UI code the app imports: the Supabase client, API wrappers around RPCs and Edge Functions, small shared helpers. No React components.

**`supabase/migrations/`** — the database. Tables, views (`public_reviews`, `public_spots`, `spot_occupancy`), definer RPCs, triggers, RLS. Clients never select `reviews`, `spots`, `check_ins`, or `reports` directly.

**`supabase/functions/`** — Deno Edge Functions. `embed` turns review text into a vector; `search` embeds a query and returns cards. They are the only place the OpenAI key is allowed. Share one embedding helper so the two cannot drift.

**`docs/`** — the spec. `PRODUCT.md` is the feature list; `features/` is the requirements for each one. Do not put implementation notes that belong in a feature doc here, and do not put screens in `docs/`.

**`assets/`** — binary art referenced from `app.json` (icon, splash, adaptive icons). Not screen copy, not feature docs.
