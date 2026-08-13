# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Spotly

**`docs/` is the build authority.** Read the relevant doc before implementing anything — the decisions in it are settled, and most of them have a reason that is not obvious from the code.

| Need | Read |
| --- | --- |
| What Spotly is / feature list | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Tech stack | [`docs/TECH_STACK.md`](docs/TECH_STACK.md) |
| Project folder structure | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Competition / write-up | [`docs/PATHFINDERS.md`](docs/PATHFINDERS.md) |
| A specific feature | [`docs/features/`](docs/features/) |

## Ground rules

- **Routes live in `src/app/`**, not `app/`. Path alias `@/*` → `src/*`.
- **Use `npx expo install`**, never bare `npm install`, for anything React-Native-adjacent. It resolves SDK-57-compatible versions.
- **NativeWind 4 requires Tailwind 3.x.** Installing `tailwindcss@latest` pulls v4 and breaks styling silently — the bundle still builds, the styles just stop applying.
- **Never give a secret an `EXPO_PUBLIC_` prefix.** That inlines it into the shipped bundle. The anon key is the only key that belongs on the client; the OpenAI key is an Edge Function secret and the service-role key is seed-script-only.

## Invariants that are easy to break

These are requirements, not preferences. Each has a dedicated feature doc.

- **Account IDs never reach the client.** Read through `public_reviews` / `public_spots` / `spot_occupancy`; write through `security definer` RPCs that set the author from `auth.uid()`. Do not grant clients direct select on `reviews`, `spots`, `check_ins`, or `reports`. ([authentication.md](docs/features/authentication.md), AUTH-4)
- **Occupancy is never stale.** No recent check-in means "no recent reports" — never a last-known status, never a "last seen N hours ago" badge. ([occupancy.md](docs/features/occupancy.md))
- **Search returns review cards, one per spot**, ranked by each spot's best-matching review, with an explicit empty state below the similarity threshold. Weak results presented as matches are a bug. ([semantic-search.md](docs/features/semantic-search.md))
- **Amenity tags are write-once**, set by the first reviewer. There is no tag edit surface. ([amenity-tags.md](docs/features/amenity-tags.md), AMEN-2)
- **One review per person per spot.** Enforced by a unique constraint; the "add your review" button is how *other* people deepen a spot. ([reviews.md](docs/features/reviews.md), REV-1)

Older notes that disagree: study-only with no category browse (SPOT-1), search returns review cards not spot summaries (SEARCH-2), no ratings anywhere (REV-7), tags locked after the first reviewer (AMEN-2), one review unlocks onboarding (ONB-3/5). The feature docs are the current truth.

## Build order

1. Dev build on a physical device, magic link working end to end.
2. Schema, RLS, views, triggers, RPCs — one migration.
3. Seed buildings and the seed-account pool.
4. `embed` and `search` edge functions.
5. Seed pipeline, 20–30 spots. Demo-able here.
6. Auth, onboarding, review form.
7. Home, search results, spot detail.
8. Occupancy check-in.
9. Favourites, report flow, content policy screen.
10. Recalibrate minimum similarity against seeded data.
11. Freeze. Empty states, device testing, demo video.

**If time runs short, cut in this order:** favourites, then the trending feed on home, then the survey. **Never cut:** occupancy, the moderation path, or honest empty states.

## Verify before claiming done

```bash
npm run typecheck && npm run doctor
```
