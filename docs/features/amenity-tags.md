# Amenity tags

**IDs:** AMEN-1..3

Related: [spot catalog](spot-catalog.md) · [semantic search](semantic-search.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| AMEN-1 | Spots carry eight binary tags: outlets, quiet, lively, group tables, natural light, food nearby, whiteboards, open late. All one type, so filtering is a single operation and the multi-select stays uniform. Quiet and lively are opposing tags rather than a scale. |
| AMEN-2 | Tags are set once, by the first reviewer, in the add-spot form — then locked. No in-app edit surface in v1; corrections happen in the Supabase dashboard. This drops an edit screen, a cross-user write permission, and an edit-war failure mode there would be no audit trail for. |
| AMEN-3 | Tags are usable as hard filters on search results. ~~and as the filter chips on the home screen.~~ **Home dropped filter chips 2026-08-16** — search is its own tab; home is a swipe deck. |

---

## Rationale

Amenity tags turn fuzzy needs into something the system can act on, and with ratings cut (REV-7) they are the only structured signal a spot carries. That is also why they sit on the spot rather than the review: a filter has to be a property of the place, not one person's opinion about it.

Semantic search and filters do different jobs. "I need an outlet" is a yes/no requirement and should never be inferred from review text (SEARCH-3).

---

## Implementation

Enum `amenity_tag`: `outlets`, `quiet`, `lively`, `group_tables`, `natural_light`, `food_nearby`, `whiteboards`, `open_late`. Stored as `amenity_tag[]` on `spots` with a GIN index.

Written only through `create_spot_with_review`. No update, no delete on spots. `create_review` has no tags parameter.

Search `filter_tags` are hard constraints (`s.amenity_tags @> filter_tags`), never ranking signals.
