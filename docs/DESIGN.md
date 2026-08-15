# Design system

NativeWind 4 for styling, [React Native Reusables](https://reactnativereusables.com) for the primitives, and a thin Spotly layer that encodes the product invariants.

Screens are wireframed in Figma before they are built — [Spotly — screen flow](https://www.figma.com/design/rR0AeRDO12FR0J2UYQ1MzS/Spotly?node-id=2-53), file key `rR0AeRDO12FR0J2UYQ1MzS`, page `2:53`. The frame-to-route node map lives in the `spotly-ui` skill. Frames are blank phone screens with a bullet spec, not visual comps: they say what a screen must show, this file says what it looks like. When a frame and a feature doc disagree, **the feature doc wins**.

---

## Layers

Build downward. If a layer below already solves it, do not solve it again above.

| Layer | Lives in | Rule |
| --- | --- | --- |
| Tokens | `src/global.css`, `tailwind.config.js`, `src/lib/theme.ts` | Semantic names only. No screen writes a hex value. |
| Primitives | `src/components/ui/` | Vendored from RNR. Edit for the whole app, never for one screen. |
| Spotly components | `src/components/` | Where product rules live. |
| Screens | `src/app/` | Composition and data only. |

**A product invariant is enforced by a component, not by remembering it.** `OccupancyPill` takes a reading or `null` and has no `lastKnownStatus` prop, so the stale badge OCC-4 forbids is unrepresentable rather than merely discouraged. `ReviewCard` has no author prop and no avatar slot (REV-2). When you add a feature with a rule attached, ask what API makes breaking it impossible, and build that.

---

## Colour

Three files, one source of truth:

| File | Holds | Consumed by |
| --- | --- | --- |
| `src/global.css` | The values, as bare HSL channels under `:root` and `.dark:root` | Everything, indirectly |
| `tailwind.config.js` | `hsl(var(--x))` mappings | Class names |
| `src/lib/theme.ts` | The same palette in TypeScript | Navigation chrome, Reanimated worklets |

`theme.ts` is a **mirror** — change a variable in `global.css` and change it there too. They drift silently, and the symptom is a navigation header that stays light while the app goes dark.

Two details that look like style and are not:

- Values are bare channels (`209 87% 53%`), not `hsl(...)`. Tailwind wraps them, and that indirection is the only reason `bg-primary/90` can inject an alpha channel.
- Dark mode uses `.dark:root`, **not** `.dark`. NativeWind requires the `:root` suffix; the plain shadcn/ui selector fails silently on native. Themes copied from ui.shadcn.com need this edit, and the Tailwind **v3** version of the theme.

### Roles

| Token | Use |
| --- | --- |
| `background` / `foreground` | The page and its default text |
| `card` / `card-foreground` | Raised surfaces — review cards, list rows |
| `popover` / `popover-foreground` | Overlays floating above the page |
| `primary` / `primary-foreground` | The one action per screen that matters most. Colour: `#208AEF` |
| `secondary` / `secondary-foreground` | Supporting actions, read-only chips |
| `muted` / `muted-foreground` | Secondary text, absent data, disabled surfaces |
| `accent` / `accent-foreground` | Selected filter chips, pressed states |
| `destructive` | Report, delete, errors. Nothing else — it stays rare enough to mean something |
| `border` / `input` / `ring` | Hairlines, field outlines, focus |

### Occupancy — the one semantic scale

The only place Spotly uses colour to carry meaning rather than emphasis.

| State | Token | Reads as |
| --- | --- | --- |
| Empty | `occupancy-empty` on `occupancy-empty-surface` | Green |
| Some seats | `occupancy-some` on `occupancy-some-surface` | Amber |
| Packed | `occupancy-packed` on `occupancy-packed-surface` | Red |
| **No recent reports** | `muted` / `muted-foreground` | **Grey** |

Three reported states and a fourth, load-bearing non-state. **The fourth has no colour of its own on purpose.** Grey reads as absence of data; anything else reads as a fourth status, and a stale badge shown confidently is worse than no badge (OCC-4). Never add an `occupancy-unknown` token, and never dim one of the three instead.

---

## Typography

Use the `Text` component's `variant`, not raw size classes, so the ramp changes in one place.

| Variant | Used for |
| --- | --- |
| `h1`–`h4` | Headings. Spotly rarely goes above `h3` — these are phone screens |
| `default` | Body copy, including review text |
| `p` | Body copy in prose needing paragraph spacing |
| `lead` | A single introductory line — onboarding prompts |
| `large` | Empty-state titles, emphasised rows |
| `small` | Metadata, counters, helper text |
| `muted` | `small`, already in muted grey |

**React Native has no cascading text styles.** A `<Text>` inside a styled `<View>` inherits nothing — every text node is styled directly. RNR works around this with `TextClassContext`: `Button` and `Icon` publish a class their children pick up, which is why `<Button><Text>Save</Text></Button>` colours correctly without you setting a colour. Always wrap button labels in `Text`; a bare string will not style and crashes on native.

---

## Spacing and shape

- Spacing is the default Tailwind scale in 4px steps. Prefer `gap-*` on a flex container over margins on children — margins collapse differently in Yoga than on the web, producing spacing that depends on child order.
- Screen padding is `px-5`. Cards inside it use `p-4`.
- Radius derives from `--radius` (0.75rem): `rounded-sm` / `rounded-md` / `rounded-lg` all compute from it, so one variable reshapes the app. Pills use `rounded-full`.
- Hairlines use `border-hairline` — a true 1-device-pixel line. A plain `border` is heavier on high-density screens than the design implies.
- Touch targets are at least 44pt. `Button size="sm"` is 36pt and needs padding around it in a dense row.

---

## Dark mode

`app.json` sets `userInterfaceStyle: "automatic"`; NativeWind's `useColorScheme` reports it and the root layout feeds the matching palette to `ThemeProvider`.

Every token has a dark value, so **correct code gets dark mode for free**. It breaks in exactly one way: hardcoding. `bg-white`, `text-black`, and `#fff` are all light-mode-only. The token you want is `bg-background`, `text-foreground`, or `bg-card`.

---

## Components

### Primitives — `src/components/ui/`

Vendored from RNR — the CLI copies source into the repo rather than adding a dependency. **These are your files.**

`text` · `button` · `icon` · `input` · `textarea` · `label` · `select` · `toggle` · `progress` · `skeleton` · `dialog` · `native-only-animated-view`

Twelve, each traceable to a wireframed screen. Anything not on this list was left out on purpose — most of the RNR catalogue answers problems Spotly does not have. `avatar` in particular stays out because there are no identities: accounts have an ID and an email, no display name (AUTH-3), and reviews show no author (REV-2).

Add one only when a screen needs it:

```bash
npx @react-native-reusables/cli@latest add <name> -y --styling-library nativewind
```

Two with sharp edges:

- **`Icon`** — always `<Icon as={FlagIcon} size={16} className="text-muted-foreground" />`. The wrapper applies `cssInterop` so `className` reaches the SVG; a raw Lucide import ignores every class you give it.
- **`Dialog`** — renders through the `PortalHost` in the root layout. React Native has no DOM portals. If an overlay appears behind the screen that opened it, the host is missing or is not the last child of the providers.

### Spotly components — `src/components/`

| Component | Enforces |
| --- | --- |
| `OccupancyPill` | OCC-4 — takes a reading or `null`, renders "No recent reports" in grey. No prop could produce a stale badge |
| `CheckInControl` | OCC-1, OCC-6 — three buttons, no confirm step. Rate limiting is a DB trigger; this renders the server's message |
| `AmenityChips` | AMEN-2 — read-only, never pressable. Tags lock after the first reviewer |
| `AmenityFilterChips` | AMEN-3 — selection is a hard constraint on search, never a ranking weight |
| `ReviewCard` | REV-2, REV-5, SEARCH-2 — no author, tap expands in place, a separate control navigates |
| `ReviewBodyField` | REV-10, REV-11 — the prompt and the 15-word counter, in one place |
| `EmptyState` | SEARCH-4 — title, description, action |
| `Screen` | Safe area and background, decided once |

Domain types mirroring database enums live in `src/lib/` — `occupancy.ts`, `amenities.ts`, `reviews.ts`. Keep them in sync with the migration.

Build a new component when a rule needs enforcing, or when the same composition appears on a third screen. Two occurrences are a coincidence. A single screen's layout belongs in the screen file.

---

## Patterns

### The four states

Any screen that reads data has four, and **all four ship together**. A screen with only the success state is not done.

| State | Treatment |
| --- | --- |
| Loading | `Skeleton` in the shape of the real content. Never a centred full-screen spinner — it hides the layout and makes the wait feel longer |
| Empty | `EmptyState` with an action, in plain words |
| Error | Inline, beside the control that caused it, with a retry. Not a banner |
| Success | The content |

The empty state is the one that gets skipped, and it is on the never-cut list. "No strong matches" is a correct answer; padding the list with weak results to avoid an empty screen is the specific bug SEARCH-4 exists to prevent.

### Occupancy, wherever it appears

`reading` is `null` when nobody has reported in 60 minutes. That is not a loading state and not an error — do not swap in a skeleton, and do not hide the pill. "No recent reports" **is** the information.

Never render a timestamp beside a status — not even a fresh one. The freshness window makes the age irrelevant, and showing it lets the stale-badge failure back in through a side door. Never fall back to a previous status. The check-in control appears on the spot page only; cards and favourites show the pill read-only.

### Forms

- One `Label` per field, wired with `nativeID` / `aria-labelledby`. Placeholder text is not a label — it disappears exactly when it is needed.
- Validation messages render under the field in `text-destructive`, and only after a blur or a submit attempt. Validating every keystroke tells someone their half-typed email is wrong.
- Submit stays disabled until valid, then shows a pending state. Disabled is the feedback for "not yet"; a spinner is the feedback for "working".
- **Client validation is an affordance, not a gate.** The `.edu` rule, the 15-word floor, and the check-in rate limit are enforced server-side; the client copy explains, and the server's message wins when they disagree.
- Review body always uses `ReviewBodyField`, never a bare `Textarea`.

### Lists and modals

- Search results are a **plain vertical list**, never a card deck (SPOT-4). The spot-page review carousel is the one deliberate exception.
- Design as though results 1–3 are all anyone sees; treat the rest as overflow.
- The only modal in v1 is the report sheet (MOD-1) — a modal, not a route. Build it with `Dialog`; there is no bottom-sheet primitive installed and one surface does not justify the dependency. In Figma, modals are drawn at half a screen's height with a grabber handle. Dismissing must always be possible without completing the action.

### Copy

Copy is part of the component, not a decoration applied after.

- Say what happened, not what the system did. "Nothing matches that yet", not "Query returned 0 results".
- Fixed strings live next to the rule they express — `NO_RECENT_REPORTS` in `lib/occupancy.ts`, `REVIEW_PROMPT` in `lib/reviews.ts`. A string on two screens is a constant, so it cannot be reworded on one of them.
- No exclamation marks, no "Oops". The voice is a straight answer from someone who has been there.

### Accessibility

Icon-only buttons need an `accessibilityLabel`. Never encode meaning in colour alone — the occupancy pill pairs every colour with a word, which is why it survives colour blindness and grayscale screenshots. Avoid fixed `h-*` on anything containing text, so it scales with the system font size.

---

## Setup already done

Checked in; do not redo.

- **Tailwind must stay on 3.x.** v4 breaks NativeWind silently — the bundle builds, the styles stop applying.
- `metro.config.js` sets `inlineRem: 16`, pinning the rem scale RNR sizes against.
- `babel-preset-expo` 57 auto-injects `react-native-worklets/plugin`. Do **not** add it manually — a duplicate breaks animated components.
- `components.json` points the RNR CLI at `src/components/ui` and `@/lib/utils`.
- The root layout mounts `ThemeProvider` and `PortalHost`. Both are required.

```bash
npm run typecheck && npm run doctor           # project
npx @react-native-reusables/cli@latest doctor # UI system wiring
```

Run the RNR doctor **without `-y`**. With it, the command deleted six installed primitives rather than reporting on them — recovering meant re-running `add`. Read its output and act on it yourself.
