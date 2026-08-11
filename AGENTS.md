# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Spotly

**`docs/SPEC.md` is the build authority. Read the relevant section before implementing anything** — the decisions in it are settled, and most of them have a reason that is not obvious from the code.

## Ground rules

- **Routes live in `src/app/`**, not `app/`. Path alias `@/*` → `src/*`.
- **Use `npx expo install`**, never bare `npm install`, for anything React-Native-adjacent. It resolves SDK-57-compatible versions.
- **NativeWind 4 requires Tailwind 3.x.** Installing `tailwindcss@latest` pulls v4 and breaks styling silently — the bundle still builds, the styles just stop applying.
- **Never give a secret an `EXPO_PUBLIC_` prefix.** That inlines it into the shipped bundle. The anon key is the only key that belongs on the client; the OpenAI key is an Edge Function secret and the service-role key is seed-script-only.

## Invariants that are easy to break

These are requirements, not preferences. Each has a section in SPEC.md.

- **Account IDs never reach the client.** Read through `public_reviews` / `public_spots` / `spot_occupancy`; write through `security definer` RPCs that set the author from `auth.uid()`. Do not grant clients direct select on `reviews`, `spots`, `check_ins`, or `reports`. (§13.3)
- **Occupancy is never stale.** No recent check-in means "no recent reports" — never a last-known status, never a "last seen N hours ago" badge. (§13.3)
- **Search returns review cards, one per spot**, ranked by each spot's best-matching review, with an explicit empty state below the similarity threshold. Weak results presented as matches are a bug. (§13.6)
- **Amenity tags are write-once**, set by the first reviewer. There is no tag edit surface. (PRD AMEN-2)
- **One review per person per spot.** Enforced by a unique constraint; the "add your review" button is how *other* people deepen a spot. (PRD REV-1)

## Verify before claiming done

```bash
npm run typecheck && npm run doctor
```
