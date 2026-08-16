# Nearby map

**IDs:** MAP-1..5

Related: [spot catalog](spot-catalog.md) · [occupancy](occupancy.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| MAP-1 | Pins are buildings that have at least one catalogued spot. Several spots in one building share one pin. Buildings with zero spots are omitted. |
| MAP-2 | When location is granted, show the user on the map and sort the list by geodesic distance to the building. Distance is a label (`0.2 mi`), not a ranking that hides far spots. CWRU is walkable; show the whole catalog, nearest first. |
| MAP-3 | Tap a pin: select that building, scroll the list to its first spot, highlight its rows. Tap a row: open the existing spot page. |
| MAP-4 | Location is requested only when this tab is opened. Denied or failed: still show the map centered on campus, no user dot, list in building-name order, with copy and a link to Settings. Do not block the tab. |
| MAP-5 | Occupancy appears on list rows only, via the same pill as everywhere else. No pin colour, no “last seen”, no geo-gated check-in (OCC-5 unchanged). |

**Acceptance:** A signed-in user can open the Map tab, see every catalogued spot on a campus map, and reach a spot page from the list. Without location permission the catalog is still usable.

---

## Rationale

Students already know the campus as buildings on a walk. Search answers “what’s it like”; the map answers “what’s near me right now.” Those are different questions, so the map is a destination of its own — a fourth tab — rather than a mode on home.

Pins are buildings because that is what has coordinates. A spot is a named area inside a building (`3rd floor, north windows`); giving each spot its own pin would stack them on the same lat/lng and invent a precision the data does not have. The list is where spots live.

This is not closest-open-spot. Occupancy is per-spot and expires in 60 minutes (OCC-4). Colouring a building pin would invent a building-level status from several spots that may disagree or have no recent report. The pill stays on the row.

Distance sorts; it does not filter. Hiding a spot 800 m away on a one-mile campus is a worse empty state than a slightly longer list.

Location is requested here and nowhere else. Check-ins stay trust-based (OCC-5). The permission copy in the binary already promised “study spots near you”; this tab is the first screen that keeps that promise.

---

## Implementation

Coordinates live on `buildings` (`latitude`, `longitude` — OSM footprint centroids). `public_spots` projects them so the map does not join the buildings table itself:

```sql
create or replace view public_spots with (security_invoker = false) as
select
  s.id, s.building_id, b.name as building, b.short_name as building_short,
  s.area_name, s.category, s.amenity_tags, s.created_at,
  (select count(*) from reviews r
    where r.spot_id = s.id and not r.hidden) as review_count,
  b.latitude, b.longitude
from spots s
join buildings b on b.id = s.building_id;
```

Clients read `public_spots` + `spot_occupancy` (left join in JS). A spot whose building has null coords is dropped — it cannot be placed. Occupancy is a left join: a miss is `null`, rendered “No recent reports”, never a stale badge (OCC-4).

Distance is haversine from the user to the **building**, in metres, formatted as miles to one decimal. No routing API.

Campus fallback centre is Kelvin Smith Library (`41.5074, -81.6096`) — the same centroid already in the buildings reference data. Used when permission is denied, the fix fails, or the user has not been located yet.

`closest-open-spot` stays deferred. Do not rank or filter by occupancy on this screen.

### Screen

- `(app)/(tabs)/map` — map on the top half (one pin per building, user location when granted, recenter when a fix exists). List on the bottom half: area name, building, distance, occupancy pill, amenity chips. Selected building’s rows use the accent surface. Empty catalog and fetch error are the usual four-state treatments; location-denied is a banner, not an empty state.
