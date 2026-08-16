# Spotly

Spotly is a `.edu`-verified mobile app for finding study spots on the CWRU campus — library floors, quiet corners, and the in-between places nobody has catalogued.

Students search the way they'd say it out loud ("place to lock in," "good wifi and no small talk") and get spots whose **reviews** actually read that way. Each spot shows live **occupancy** reported by someone in the last hour. If nobody has checked in recently, it says so instead of showing a stale badge.

It is not a social network, a booking system, or a replacement for official campus data. Reviews are anonymous. v1 is study spots only, CWRU only, mobile only.

**Deferred:** busy-time prediction, closest-open-spot, study-buddy opt-in, duplicate merging, personalized recommendations, multi-campus, dining/lounges, campus API hours. `category` is already in the schema so dining/hangout need no migration.

---

## Features

| Feature | What it does |
| --- | --- |
| [Authentication](features/authentication.md) | `.edu` magic-link signup. No passwords, no profiles. Account IDs never reach other users. |
| [Onboarding](features/onboarding.md) | A short taste survey, then one guided review of a place they already know. That review unlocks the app. |
| [Spot catalog](features/spot-catalog.md) | Search-first home plus spot pages. Anyone can add a missing spot via a structured form (building, area, tags, first review). |
| [Semantic search](features/semantic-search.md) | Natural-language queries matched against review text, not building metadata. Results are review cards, one per spot. Weak matches are an empty state, not a list. |
| [Reviews](features/reviews.md) | One anonymous review per person per spot. Horizontal carousel, tap-to-expand, ordered by recency + how often a card was opened. List cards show the building's photo. No star ratings, no user-uploaded photos. |
| [Occupancy](features/occupancy.md) | Two-tap check-in: Empty / Some seats / Packed. Status is live for 60 minutes, then "no recent reports." |
| [Amenity tags](features/amenity-tags.md) | Eight write-once tags (outlets, quiet, lively, group tables, natural light, food nearby, whiteboards, open late). Used as hard search filters. |
| [Favorites](features/favorites.md) | Private saved-spot list with current occupancy. |
| [Nearby map](features/nearby-map.md) | Campus map of catalogued spots, one pin per building, list underneath sorted by walking distance. Occupancy stays on the row, not the pin. |
| [Reporting](features/reporting.md) | Flag any review. Team hides it from the Supabase dashboard. In-app content policy: no naming identifiable people. |
