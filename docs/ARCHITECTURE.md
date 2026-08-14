# Project structure

Routes live in `src/app/`, not `app/`. Path alias `@/*` → `src/*`.

Files marked *intended* are specified but not created yet.

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
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── session.tsx           SessionProvider / useSession
│   │   └── auth-url.ts           magic-link fragment parser
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

**`auth/callback.tsx` is deliberately not in the `(auth)` group.** Expo Router strips
group segments from URLs, so a file at `(auth)/callback.tsx` answers to `/callback`
and never to `/auth/callback` — which is the path baked into `site_url`, the redirect
allowlist, and every magic link already sent. Sign-in keeps its group because its URL
never leaves the app; the callback's does, so its path has to be literal.
