# Project structure

Routes live in `src/app/`, not `app/`. Path alias `@/*` → `src/*`.

Files marked *intended* are specified but not created yet.

```
spotly-mobile/
├── src/
│   ├── app/                      expo-router
│   │   ├── _layout.tsx
│   │   ├── index.tsx             placeholder; becomes (app)/index
│   │   ├── (auth)/               *intended*
│   │   │   ├── sign-in.tsx
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
│   ├── lib/
│   │   └── supabase.ts
│   └── global.css
├── supabase/
│   ├── migrations/
│   └── functions/                *intended:* embed/, search/
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── TECH_STACK.md
│   ├── PATHFINDERS.md
│   └── features/
├── assets/
├── app.json
├── eas.json
├── package.json
└── README.md
```

Report sheet is a modal, not a route. Screen detail lives with the feature that owns it.
