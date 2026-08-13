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
| ONB-5 | On submitting that review, the app unlocks and the user is redirected into the catalog. Onboarding never repeats. |
| ONB-6 | Survey responses are stored but unused in v1. They exist to feed personalized recommendations later. |

**Acceptance:** A brand-new user cannot browse before contributing one review, and completing onboarding leaves the catalog measurably richer than before they signed up.

---

## Rationale

This is the cold-start mechanism. A review app with an empty catalog looks broken rather than exclusive, and every signup that contributes a review makes the next user's experience better.

Cut from two reviews to one in v0.3. Two reviews seed the catalog twice as fast, but onboarding completion is itself a success metric — a gate heavy enough to lose signups costs more than the content it collects. One review is still enough that the catalog grows with every account.

---

## Implementation

**Onboarding gating is app routing, not RLS — and it has to be.** The onboarding flow itself reads buildings and spots to check whether the named spot exists, so an RLS rule keyed on `onboarding_complete` would deadlock the very flow that sets it.

RPC: `complete_onboarding(survey jsonb)` flips `profiles.onboarding_complete` and stores the survey JSON.

### Screens

- `(onboarding)/survey` — four one-tap questions, stored to `survey_responses` as JSONB and **unused in v1**:
  1. Silence or background noise?
  2. Alone or people around?
  3. Do you need an outlet?
  4. Morning, afternoon, or late night?
- `(onboarding)/first-review` — prompt: *"What's your go-to study spot?"* Runs the review form. On submit, `complete_onboarding` flips the flag and the app unlocks straight into home. Never repeats.

If time runs short, the survey is the last thing to cut after favourites and the trending home feed. Do not cut the first-review gate.
