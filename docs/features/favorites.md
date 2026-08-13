# Favorites

**IDs:** FAV-1..3

Related: [occupancy](occupancy.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| FAV-1 | A user can save and unsave any spot. |
| FAV-2 | Saved spots appear in a personal list showing current occupancy status. |
| FAV-3 | Favorites are private. No public lists, no visibility to other users. |

---

## Rationale

Small feature, disproportionate effect on retention. Most students rotate between a handful of reliable spots; favorites turns "check whether my usual place is packed" into a two-tap action, which is the behavior that brings people back daily rather than once.

If time runs short, this is the first thing to cut. Do not cut occupancy, moderation, or honest empty states instead.

---

## Implementation

Table `favorites` with primary key `(account_id, spot_id)`. RLS: select/insert/delete where `account_id = auth.uid()`. Private by construction.

Toggle lives on `(app)/spot/[id]`. List lives on `(app)/favorites` — vertical list of saved spots, each showing current occupancy from `spot_occupancy`.
