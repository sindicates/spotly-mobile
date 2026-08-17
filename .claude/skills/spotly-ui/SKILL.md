---
name: spotly-ui
description: Build or change any UI in the Spotly app — screens, modals, components, styling, empty states, forms. Reads the Figma wireframe and the feature doc for the screen before writing code, then builds with NativeWind + React Native Reusables. Use whenever a task touches src/app/ or src/components/, or mentions a screen name (sign-in, survey, home, search, spot detail, add review, add spot, favourites, report sheet, content policy), a component, styling, theming, dark mode, or "make it look like the design".
---

# Building UI for Spotly

Spotly's UI is specified in two places before it is code: a **Figma wireframe** that says what each screen must show, and **`docs/features/`** that says why. Both exist. Neither is optional to read.

The most common failure is building a plausible screen that quietly breaks a product invariant — a stale occupancy badge, a search result list padded with weak matches, an author name on a review. Every one of those looks fine in review and is wrong.

Do this work inline — UI is iterative, and delegating it costs you the thread. The exception is building several independent screens at once: spawn one general-purpose agent per screen, each told to follow this skill, and have each report which frame and feature docs it built from plus anything it stubbed.

---

## Workflow

### 1. Find the frame

Screens live in the Figma file `rR0AeRDO12FR0J2UYQ1MzS`, page `2:53`.

| # | Screen | Node | Route |
| --- | --- | --- | --- |
| 01 | Sign in | `4:5` | `(auth)/sign-in` |
| 02 | Magic-link callback | `4:29` | `(auth)/callback` |
| 03 | Taste survey | `4:50` | `(onboarding)/survey` |
| 04 | First review (gate) | `5:2` | `(onboarding)/first-review` |
| 05 | Home | `5:29` | `(app)/(tabs)/index` |
| 06 | Search results | `5:56` | `(app)/(tabs)/search` |
| 07 | Spot detail | `5:83` | `(app)/spot/[id]` |
| 08 | Add review | `5:113` | `(app)/review/new` |
| 09 | Search — no matches | `5:137` | `(app)/(tabs)/search`, empty state |
| 10 | Add a spot | `5:161` | `(app)/spot/new` |
| 11 | Favourites | `5:191` | `(app)/(tabs)/favorites` |
| 12 | Report sheet | `5:215` | modal, **not a route** |
| 13 | Content policy | `5:239` | static screen |
| 14 | Map | *pending — Figma MCP rate-limited; spec is in nearby-map.md* | `(app)/(tabs)/map` |

```
get_metadata fileKey=rR0AeRDO12FR0J2UYQ1MzS nodeId=<node>
```

This returns the bullet spec as text-node names — the fastest path to the requirements. Add `get_screenshot` when you need to see arrows into the screen or check a modal's proportions.

**If the screen has no frame**, say so and ask whether to add one to the wireframe before building. Do not invent a screen that was never specified. (A new frame goes in the matching band — auth and onboarding, core loop, or supporting — at 402 × 874, route label above the title and bullet spec below a divider, matching the existing frames. Modals are half height, 437.)

**If Figma is unreachable**, say so explicitly, then fall back to `docs/features/` — which is the authority anyway — and note in your summary that the wireframe was not consulted.

### 2. Read the feature doc

Every bullet in a frame ends in a requirement ID. Follow it:

`AUTH-*` → `docs/features/authentication.md` · `ONB-*` → `onboarding.md` · `SPOT-*` → `spot-catalog.md` · `SEARCH-*` → `semantic-search.md` · `REV-*` → `reviews.md` · `OCC-*` → `occupancy.md` · `AMEN-*` → `amenity-tags.md` · `FAV-*` → `favorites.md` · `MAP-*` → `nearby-map.md` · `MOD-*` → `reporting.md`

Each doc has a **Rationale** section explaining why the decision was made. Read it. Most of these choices are not obvious from the code, and several are deliberate reversals of the obvious approach.

**When the wireframe and the feature doc disagree, the feature doc wins.** Flag the mismatch in your summary.

### 3. Read the design system

`docs/DESIGN.md` — tokens, typography, spacing, dark mode, the component inventory, and the screen patterns. One file, read it all.

### 4. Check before you build

```bash
ls src/components src/components/ui
```

Most of what a screen needs already exists. Reuse first; extend second; create last. A new component in `src/components/` needs a reason — a product rule to enforce, or a third occurrence of the same composition.

### 5. Build

Follow the patterns in `docs/DESIGN.md`. Ship all four states — loading, empty, error, success — not just the one in the happy path.

### 6. Verify

```bash
npm run typecheck && npm run doctor
```

Then walk the checklist at the bottom of this file.

---

## Non-negotiables

These are requirements with docs behind them, not preferences. Breaking one is a bug even if it looks better.

**Occupancy is never stale.** `OccupancyPill` takes a reading or `null`; `null` renders "No recent reports" in grey. Never a last-known status, never a "last seen N ago" badge, never a timestamp next to a status — not even a fresh one. Do not add a prop that would allow it. (OCC-4)

**Reviews have no author.** No name, no avatar, no initials, no "you wrote this" styling beyond hiding the add-review button. There is no `avatar` component installed, and that is deliberate. (REV-2, AUTH-4)

**Weak search results are an empty state.** Zero rows above the similarity threshold means the empty state, with the query echoed and an action. Never pad a list with the closest bad matches. (SEARCH-4)

**Search results are review cards, one per spot** — the matching review with its spot attached, not a spot summary. A plain vertical list, never a card deck. Home is a swipeable feed deck; the spot-page carousel is the other swipe surface. (SEARCH-2, SPOT-4, SPOT-1, REV-4)

**Amenity tags are write-once.** Read-only chips everywhere except the add-spot form. No edit surface, and display chips are never pressable. (AMEN-2)

**One review per person per spot.** "Add your review" is hidden when `is_mine` is true. (REV-1)

**The review prompt and the 15-word floor are fixed.** Always `ReviewBodyField`, never a bare `Textarea`. (REV-10, REV-11)

**Every review card has a report control.** (MOD-1)

**Client validation is an affordance, not a gate.** The `.edu` rule, the word floor, and the check-in rate limit are enforced server-side. Render the server's message when it disagrees.

---

## Styling rules

- **Semantic tokens only.** `bg-background`, `text-muted-foreground`, `bg-card`. Never `bg-white`, `text-black`, `#fff`, or `neutral-500` — each is a dark-mode bug.
- **Every text node is a `Text` component.** React Native has no cascading text styles; a bare string inside a `Pressable` will not style and crashes on native.
- **Icons go through `Icon`**: `<Icon as={FlagIcon} size={16} className="text-muted-foreground" />`. A raw Lucide import ignores `className`.
- **`gap-*` on containers**, not margins on children.
- **`className` on every component**, merged through `cn()`.
- **Tailwind stays on 3.x.** v4 breaks NativeWind silently — the bundle builds, the styles stop applying.
- Twelve primitives are installed, each traceable to a screen. Anything else was left out on purpose — check `docs/DESIGN.md` before adding one, then: `npx @react-native-reusables/cli@latest add <name> -y --styling-library nativewind`.

---

## Stop and ask when

- The screen has no Figma frame and no feature doc.
- The wireframe and the feature doc disagree in a way that changes what gets built.
- A requirement seems to demand something on the non-negotiables list.
- The work needs a new dependency.

State the conflict in one or two sentences, give your recommendation, and continue with everything the answer does not block.

---

## Checklist

- [ ] Read the Figma frame and the feature docs its IDs point at
- [ ] Reused existing components; anything new has a reason
- [ ] Semantic tokens only — no hardcoded colours
- [ ] Legible in light and dark
- [ ] Loading, empty, error, and success all render
- [ ] Icon-only buttons have `accessibilityLabel`; touch targets ≥ 44pt
- [ ] Meaning never carried by colour alone
- [ ] No product invariant broken
- [ ] `npm run typecheck && npm run doctor` passes
