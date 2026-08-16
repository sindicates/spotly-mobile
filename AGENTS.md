# Spotly

Expo SDK 57 changed a lot. Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing code.

**`docs/` is the build authority.** Read the relevant doc before implementing — the decisions there are settled, and the reasons usually aren't visible in the code.

| Need | Read |
| --- | --- |
| What Spotly is / feature list | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Tech stack | [`docs/TECH_STACK.md`](docs/TECH_STACK.md) |
| Folder structure | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| A specific feature | [`docs/features/`](docs/features/) |
| Building any UI | [`docs/DESIGN.md`](docs/DESIGN.md) — and the `spotly-ui` skill |
| Backend: tables, views, RPCs, edge functions | [`docs/infra/supabase.md`](docs/infra/supabase.md) |
| Validating text input | [`docs/infra/input-validation.md`](docs/infra/input-validation.md) |
| Haptic feedback | [`docs/infra/haptics.md`](docs/infra/haptics.md) |

## Ground rules

- Routes live in `src/app/`, not `app/`. Path alias `@/*` → `src/*`.
- Use `npx expo install`, never bare `npm install`, for anything React-Native-adjacent — it resolves SDK-57-compatible versions.
- NativeWind 4 requires Tailwind 3.x. `tailwindcss@latest` pulls v4 and styles stop applying silently.
- Every screen is wireframed in Figma before it is built. Read the frame, then the feature doc its bullets cite. Invoke the `spotly-ui` skill for any UI work — it carries the frame-to-route node map.
- Style with semantic tokens (`bg-background`, `text-muted-foreground`), never a hex value or a `neutral-*`. Hardcoded colour is a dark-mode bug.
- Never prefix a secret with `EXPO_PUBLIC_` — that inlines it into the shipped bundle. The anon key is the only key that belongs on the client; the OpenAI key is an Edge Function secret and the service-role key is seed-script-only.

## Invariants

Requirements, not preferences. Breaking one is a bug even if it builds.

- **Account IDs never reach the client.** Read through `public_reviews` / `public_spots` / `spot_occupancy`; write through `security definer` RPCs that set the author from `auth.uid()`. Clients get no direct select on `reviews`, `spots`, `check_ins`, `reports`. ([authentication.md](docs/features/authentication.md))
- **Occupancy is never stale.** No recent check-in means "no recent reports" — never a last-known status or "last seen N hours ago". ([occupancy.md](docs/features/occupancy.md))
- **Search returns one review card per spot**, ranked by that spot's best-*satisfying* review — judged before the dedupe, so a review that contradicts the query is dropped rather than ranked. The empty state is that judgement, not a similarity threshold; the calibrated floor still owns it when the judge is unreachable. ([semantic-search.md](docs/features/semantic-search.md))
- **Amenity tags are write-once**, set by the first reviewer. No tag edit surface. ([amenity-tags.md](docs/features/amenity-tags.md))
- **One review per person per spot**, enforced by a unique constraint. ([reviews.md](docs/features/reviews.md))

## Keep docs current

`docs/` is the spec, not a changelog. Update it in the same change as the decision, not after the code has drifted.

| You changed… | Update |
| --- | --- |
| A product decision / requirement | The feature doc (and `PRODUCT.md` if the feature list changed) |
| Routes, folders that were `*intended*` | `docs/ARCHITECTURE.md` |
| Stack, env vars, setup/run commands | `README.md` and `docs/TECH_STACK.md` |
| Design tokens, shared components, UI patterns | `docs/DESIGN.md` (and the Figma wireframe, if a screen changed) |
| An invariant or ground rule | `AGENTS.md` |

Do not rewrite a feature doc to match code. If they disagree, fix the code or explicitly record the decision change (strike-through + date, like REV-7).

