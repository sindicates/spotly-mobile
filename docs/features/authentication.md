# Authentication

**IDs:** AUTH-1..4

Related: [tech stack](../TECH_STACK.md) · [onboarding](onboarding.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| AUTH-1 | Signup requires an email address on the `case.edu` domain. Non-`case.edu` addresses are rejected at entry. |
| AUTH-2 | Verification is by magic link. No password is set or stored. |
| AUTH-3 | An account consists of an ID and a verified email. No display name, avatar, or profile page exists. |
| AUTH-4 | Account ID is never exposed to other users through any surface, including API responses. |

**Acceptance:** A user can go from cold open to authenticated session without typing a password or filling a profile form.

---

## Rationale

The `.edu` gate is the trust foundation for everything else — it guarantees the person reviewing a study spot is a student here, not a bot, a business owner, or a stranger. It also makes rate limiting and per-spot deduplication possible, since every action ties back to a verified account. Magic link over password is a contribution-cost decision: a password field is a drop-off point on a product whose value depends on people bothering to contribute.

AUTH-4 is a schema requirement, not a UI one. Clients never read tables containing account IDs. They read views that omit them (`public_reviews`, `public_spots`, `spot_occupancy`) and write through definer RPCs that set `author_id` from `auth.uid()`. Do not grant clients direct select on `reviews`, `spots`, `check_ins`, or `reports`. `spots.created_by` leaks the same way — a spot's creator is by construction the author of its first review.

---

## Implementation

Magic link only, no passwords.

- Supabase Auth → disable password signin, enable email OTP/magic link.
- **Redirect allowlist** must include the app scheme: `spotly://auth/callback`.
- `app.json` → `"scheme": "spotly"`.
- Handle the inbound link with `expo-linking` + `supabase.auth.setSession()` from the URL fragment.
- Persist sessions with an AsyncStorage (or expo-secure-store) adapter on the Supabase client, plus `detectSessionInUrl: false` — that option is for web and breaks native.

**Email gate:** accept only `case.edu` addresses. Enforce it in an auth hook or a `before insert` trigger on `auth.users`, not only in the form — client-side validation is a UX affordance, not a gate.

> Decision note: the PRD's `.edu` gate and the landing page's "CWRU only" conflict. Resolved toward **`case.edu` only** — it matches the landing page's "CWRU only" claim and keeps the gate meaningful as a trust signal.
>
> This does **not** solve judge access — a judge on a `stellic.com` address fails the `case.edu` rule. Judges get in via the demo video plus a pre-made test account. See [PATHFINDERS.md](../PATHFINDERS.md#judge-access-spotly-specific).

### Screens

- `(auth)/sign-in` — email field, "Send me a link." Client validates `case.edu` for the error message (per the decision note above — the wireframe's looser `.edu` is superseded); the server enforces it. On send the form is *replaced* by the success state, not annotated: there is nothing left to do here, and a live button only rate-limits the link already sent.
- `auth/callback` — deep-link target, outside the `(auth)` group so it answers to `/auth/callback` rather than `/callback`. Parses tokens, calls `setSession`, then routes on the device-local onboarding flag ([onboarding.md](onboarding.md)): false → onboarding, true → home. No profile fetch — `setSession` fires `onAuthStateChange` and the provider reads the flag synchronously in that handler.
