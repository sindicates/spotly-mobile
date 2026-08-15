# Spot catalog

**IDs:** SPOT-1..5

Related: [reviews](reviews.md) · [amenity tags](amenity-tags.md) · [architecture](../ARCHITECTURE.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| SPOT-1 | Every spot is a study spot in v1, so there is no category browse. Home is search-first, with a trending review feed beneath the search bar. `category` stays in the schema, single-valued, so dining and hangout need data entry rather than a migration. |
| SPOT-2 | A spot page shows building and area name, amenity tags, current occupancy status with the check-in control, and its review carousel. |
| SPOT-3 | Any authenticated user can create a spot that isn't listed yet, supplying building, area name, amenity tags, and a first review. |
| SPOT-4 | Search results render as a standard vertical list, not a card deck. The review carousel (REV-4) is the one deliberate exception. |
| SPOT-5 | Adding a spot uses a structured form, not free text: building (select), area name (text), amenity tags (multi-select), first review (required). No category field — v1 is study-only. No building → sub-spot hierarchy; spots stay flat with building as an attribute. |

**Acceptance:** A user can find an existing spot by searching, and can add a missing spot in a single flow that ends with their review attached.

---

## Rationale

Discovery is the base layer. The add-spot path matters more than it looks — it means the catalog grows with real usage instead of being capped at whatever the team seeded, and it gives early users a reason to contribute ("your review could be the first anyone sees for this place"). The structured form (SPOT-5) is what keeps that openness from producing a mess: constraining entry is where duplicates actually get prevented, and `building` as a flat select preserves the option to roll up to building-level views later without any parent-child structure.

---

## Implementation

Unique on `(building_id, lower(btrim(area_name)))`. Writes go through `create_spot_with_review` in one transaction — a spot with zero reviews violates SPOT-3 and would appear in the catalog as an empty shell. Tags come from this call only; there is no update/delete on spots.

**Duplicate guard.** Before calling `create_spot_with_review`, the client queries existing spots in the selected building and shows them inline ("Did you mean *3rd floor, north windows*?"). Occupancy signal fragmenting across duplicate entries is the failure that quietly breaks the headline feature.

Clients read `public_spots`, never the `spots` table (`created_by` is an account ID).

```sql
create view public_spots with (security_invoker = false) as
select
  s.id, s.building_id, b.name as building, b.short_name as building_short,
  s.area_name, s.category, s.amenity_tags, s.created_at,
  (select count(*) from reviews r
    where r.spot_id = s.id and not r.hidden) as review_count
from spots s
join buildings b on b.id = s.building_id;
```

**Seeding.** Target 20–30 spots with real reviews. A local script (service role key, bypasses Edge Functions and RPCs) batch-embeds every review string in one OpenAI call, then inserts spots and reviews. Use a pool of 6–8 `.edu` seed accounts with `email_confirm: true` — `reviews` is unique on `(spot_id, author_id)`, so one account can only hold one review per spot.

**Buildings are not seed data.** ~~Seed 25–40 CWRU buildings first, including coordinates (unused in v1, needed later for closest-open-spot).~~ **Changed 2026-08-14.** Buildings ship as reference data in `20260814194500_buildings_reference_data.sql`, not in `seed.sql`. Building is a *required* field on the add-spot form (SPOT-5), so an empty table is not a thin catalog — it is a dead end, and `seed.sql` runs on local `supabase db reset` and nowhere else, which left every hosted environment with a picker that could not be used. 60 buildings, names and codes from the CWRU registrar, coordinates from OpenStreetMap footprint centroids. The insert is idempotent on `name`, so corrections propagate on re-run.

### Screens

- `(app)/index` — search bar up top, amenity filter chips below it, then a trending review feed ordered by `trending_score`. Doubles as the thin-catalog answer: a small catalog reads as a fresh feed, not an empty grid.
- `(app)/spot/[id]` — name and building; occupancy pill with the three check-in buttons; amenity tag chips; review carousel; review count; favorite toggle; "Add your review" hidden if `is_mine` is already true.
- `(app)/spot/new` — the structured form:

| Field | Control | Rule |
| --- | --- | --- |
| Building | Select from `buildings` | Required |
| Specific spot | Text | Required. On blur, show existing spots in that building as a dupe check |
| Amenity tags | Multi-select, the 8 in AMEN-1 | Optional, **write-once** |
| Review | Textarea — *"What's it good for, and what's the catch?"* | Required, **15-word floor**, live counter |
