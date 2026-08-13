# Tech stack

The product is the mobile app. Web is a marketing landing page only — not a second client.

| Layer | Choice |
| --- | --- |
| App | Expo (React Native), **expo-dev-client**. Not Expo Go — it cannot load custom native modules. |
| Routing | expo-router. Routes live in `src/app/`, not `app/`. |
| Styling | NativeWind 4 on Tailwind 3.x. Do not install `tailwindcss@latest` (v4); styles fail silently. |
| Backend | Supabase — Postgres, Auth, RLS, Edge Functions |
| Vector | pgvector |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims). Key lives only in Edge Function secrets. |
| Build | EAS Build → custom development build. Internal distribution + TestFlight. |
| Location | `expo-location`, foreground only. Unused in v1 UI; wired so the dev build is proven. |

Use `npx expo install` for anything React-Native-adjacent, never bare `npm install`.
