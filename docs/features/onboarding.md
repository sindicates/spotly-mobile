# Onboarding

**IDs:** ONB-1..6

Related: [authentication](authentication.md) · [spot catalog](spot-catalog.md) · [reviews](reviews.md)

A new user does not land on a browsable homepage. They enter a one-time required flow and unlock the app by contributing.

---

## Requirements

| ID | Requirement |
| --- | --- |
| ONB-1 | After verification, a first-time user is routed into onboarding, not the catalog. |
| ONB-2 | A short preference survey (4 questions) collects taste signals: silence or background noise, alone or around people, outlet needed, and time of day. |
| ONB-3 | The user is guided through one seeded prompt ("what's your go-to study spot?"), producing a full review: building, specific spot, amenity tags, and text. |
| ONB-4 | If the named spot doesn't exist, the structured add-spot form (SPOT-5) is used inline rather than sending the user elsewhere. |
| ONB-5 | On submitting that review, the app unlocks and the user is redirected into the catalog. Onboarding never repeats ~~for the account~~ **on that install** — see the storage note below (2026-08-14). |
| ONB-6 | Survey responses are stored but unused in v1. They exist to feed personalized recommendations later. |

**Acceptance:** A brand-new user cannot browse before contributing one review, and completing onboarding leaves the catalog measurably richer than before they signed up.

---

## Rationale

This is the cold-start mechanism. A review app with an empty catalog looks broken rather than exclusive, and every signup that contributes a review makes the next user's experience better.

Cut from two reviews to one in v0.3. Two reviews seed the catalog twice as fast, but onboarding completion is itself a success metric — a gate heavy enough to lose signups costs more than the content it collects. One review is still enough that the catalog grows with every account.

---

## Implementation

**Onboarding gating is app routing, not RLS — and it has to be.** The onboarding flow itself reads buildings and spots to check whether the named spot exists, so an RLS rule keyed on `onboarding_complete` would deadlock the very flow that sets it.

### Where the flag lives

> **Changed 2026-08-14.** ~~RPC `complete_onboarding(survey jsonb)` flips `profiles.onboarding_complete` and stores the survey JSON.~~ The completion flag is now **device-local**, in MMKV via `src/lib/storage.ts`. The `profiles.onboarding_complete` column was dropped.

The flag follows from the rule above rather than contradicting it. Nothing on the server ever read the column — no policy is keyed on it, and none may be — so it was a value the client wrote only to read back to itself, at the cost of a network round trip on every cold start. Locally it is a synchronous read, which means the session and the flag land in the same render and the route guards can never briefly disagree and flash the survey at a returning user.

It is keyed by account id, not stored bare, so a shared or reassigned phone still sends the next person through onboarding. It deliberately survives sign-out: the same user returning to the same install is not asked to onboard twice.

**The trade, accepted knowingly:** the flag is per-install. A reinstall or a second device routes the user back into onboarding, and because onboarding ends in a guided review (ONB-3), a returning user who lands on a spot they already reviewed will hit the one-review-per-person-per-spot constraint ([reviews.md](reviews.md)). The first-review screen has to treat that constraint violation as "already contributed — unlock" rather than as an error. Move the flag back to `profiles` if that stops being acceptable; it is one column and one RPC.

ONB-6's survey responses are unaffected and still belong on the server — they are future recommendation input, not routing state.

### Screens

- `(onboarding)/survey` — four one-tap questions, one per screen with a progress bar, stored to `survey_responses` as JSONB and **unused in v1**:
  1. Silence or background noise?
  2. Alone or people around?
  3. Do you need an outlet?
  4. Morning, afternoon, or late night?

  If the write fails, the error is inline with a retry **and** a "continue without saving". The survey is stored-and-unused by ONB-6, so a failing write must not be able to lock someone out of the app — the first review is the gate, not this. The screen also carries sign-out, so a wrong address is recoverable without uninstalling.
- `(onboarding)/first-review` — prompt: *"What's your go-to study spot?"* Runs the review form: building select, specific spot, then the SPOT-5 duplicate check on blur. Picking an existing spot switches the write to `create_review` and hides the tag picker (tags are locked by the first reviewer, AMEN-2); naming a new one keeps the inline add-spot form (ONB-4) and writes through `create_spot_with_review`. The review body keeps REV-11's prompt — the question above is the screen's, not the field's. On submit, `completeOnboarding()` from `useSession` writes the local flag and the app unlocks straight into home.

If time runs short, the survey is the last thing to cut after favourites and the trending home feed. Do not cut the first-review gate.
