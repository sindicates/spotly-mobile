# Haptics

Tactile feedback is a design-system behaviour, not a per-screen decision. Screens
never import `expo-haptics`. They call the named helpers in
[`src/lib/haptics.ts`](../../src/lib/haptics.ts), and the primitives fire the
interaction ones so a tap can't be forgotten.

Related: [`DESIGN.md` → Haptics](../DESIGN.md)

---

## The five signals

Semantic, not literal — the call site says *what happened*, and intensity lives in
one file so a press cannot drift heavier on one screen than another.

| Helper | Meaning | Fired by |
| --- | --- | --- |
| `press()` | A control was pressed. | `Button`, on `onPressIn`. |
| `selection()` | A choice changed. | `Toggle`, `SelectItem`, and raw selection `Pressable`s (review-card expand, the add-spot duplicate pick). |
| `success()` | A write landed. | The screen, from the write **result** — link sent, survey saved, review posted, check-in accepted, spot saved. |
| `warning()` | A soft rejection. | The screen, from the result — a rate-limited check-in, a favourite toggle that failed and rolled back, a duplicate that becomes "review the existing one". |
| `error()` | A hard failure. | The screen, from the result — network drop, a submit the server rejected. |

Under the hood: `press` is a light impact, `selection` is the selection tick, and
`success`/`warning`/`error` are the three notification types. That mapping is the
only thing `haptics.ts` decides, and it decides it once.

---

## The split that matters: interaction vs. outcome

Two kinds of feedback fire from two different places, and conflating them is how a
tap ends up buzzing twice or not at all.

- **Interaction haptics (`press`, `selection`) fire from the primitive, on the
  tap.** A `Button` buzzes on `onPressIn` before its handler runs; a `Toggle`
  buzzes as it flips. The screen does nothing — it gets this for free by using the
  primitive.
- **Outcome haptics (`success`, `warning`, `error`) fire from the screen, on the
  *result* of the write.** The tap already buzzed; the outcome is a second,
  different signal that arrives when the network does. These live in the submit
  handler's `try`/`catch`, next to where the error message is set.

```ts
async function onCheckIn(status) {
  // press() already fired from the Button on tap.
  try {
    const reading = await checkIn(id, status);
    success();                 // outcome: the write landed
    setCheckedIn(reading);
  } catch (cause) {
    if (isRateLimitError(cause)) warning();   // outcome: soft rejection
    else error();                             // outcome: hard failure
  }
}
```

### The one opt-out: `haptic={false}`

`Button` fires `press()` on every tap unless told not to. Pass `haptic={false}`
when the same gesture will *immediately* fire a stronger outcome haptic, so the
two don't stack into a buzz-buzz. The report sheet's **Report** button and the
spot page's favourite toggle both do this — they resolve a write and fire
`success`/`warning` themselves.

### Raw `Pressable`s buzz themselves

A `Pressable` that is **not** a primitive has no haptic of its own, so if it is a
real control it calls the helper directly:

- review-card expand → `selection()` (a choice: show more / show less)
- the favourites row → `press()` (navigation)
- the add-spot "did you mean…" pick → `selection()` (choosing a spot)

Do **not** add a haptic to a display-only surface. A card you can read but not act
on should be silent.

---

## Platform and failure behaviour

- **Web (and the Node prerender pass) is a no-op.** Spotly is a mobile app;
  `Platform.OS === 'web'` returns early. This is also why the static web export
  renders every screen without touching a native API.
- **Failures are swallowed.** Low Power Mode, a disabled Taptic Engine, or a
  missing vibrator must never break a press handler, so every call is fire-and
  forget with a caught, ignored rejection.
- **There is no in-app toggle.** The OS haptic setting is the control; duplicating
  it in-app would be a setting that can disagree with the system one.

---

## Adding feedback to a new interaction

1. Using a `Button`, `Toggle`, or `SelectItem`? The interaction haptic is already
   there — do nothing.
2. Firing a write? Call `success()` on the resolved result, and `warning()` /
   `error()` on the two failure shapes, from the handler — never from `onPress`.
3. Building a raw `Pressable` that is a real control? Call `press()` (navigation /
   action) or `selection()` (a choice) inside its handler.
4. Never import `expo-haptics` in a screen or component. If you need an intensity
   that doesn't exist yet, add a named helper to `haptics.ts` and call that.
