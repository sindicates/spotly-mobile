# Reviews

**IDs:** REV-1..11

Related: [spot catalog](spot-catalog.md) · [semantic search](semantic-search.md) · [reporting](reporting.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| REV-1 | Any authenticated user can leave one review per spot, editable afterward. |
| REV-2 | Reviews display with no author identity of any kind. |
| REV-3 | Review text is embedded on write and stored alongside the review. |
| REV-4 | A spot's reviews render as a horizontally swipeable card carousel. |
| REV-5 | Tapping a card expands it to show the full review text. |
| REV-6 | Carousel order blends recency and engagement, where engagement is the number of times a card was expanded (REV-5). "Trending," not chronological. |
| REV-7 | ~~Every review carries a required 1–5 star rating.~~ **Cut in v0.3.** There are no ratings anywhere in the product. |
| REV-8 | A spot displays its review count. ~~Average rating~~ removed with REV-7. |
| REV-9 | Moot — there are no ratings to break out by dimension. Amenity tags carry the entire structured signal. |
| REV-10 | Review text has a **15-word floor**, enforced in the database as well as the form. A one-line review is the failure mode that makes the whole corpus useless — both for reading and for the embedding index. |
| REV-11 | The review field is a single prompt: *"What's it good for, and what's the catch?"* Asking for the catch is what produces the honest half most review products never get. |

**Acceptance:** A student can skim a spot's reviews by swiping, expand any that look relevant, and see recent useful reviews before old ones.

---

## Rationale

**Anonymity (REV-2):** Campus is socially small. If your name is attached to a blunt review, most people soften it or don't post — and the soft version is the useless version. Anonymity is what makes "real answers from real students" true rather than aspirational. The accepted tradeoff: no reviewer reputation layer, so the app can't surface "this person has good taste," and fake reviews are marginally harder to spot without a track record. For a spot-review product that's the right trade — users want to know whether something is true right now, not who said it.

REV-2 is not a UI requirement. Clients never read `reviews` directly.

```sql
create view public_reviews with (security_invoker = false) as
select
  r.id, r.spot_id, r.body, r.expand_count, r.created_at, r.updated_at,
  (r.author_id = auth.uid()) as is_mine,
  ln(1 + r.expand_count)
    + 3.0 * exp(-extract(epoch from (now() - r.created_at)) / 604800.0)
    as trending_score
from reviews r
where r.hidden = false;
```

`trending_score` exists as a column because PostgREST cannot order by an arbitrary expression. Change weights in the view, not client code.

**Carousel (REV-4, REV-6):** Two problems solved at once. The carousel avoids the wall-of-text failure where useful recent reviews are buried under years of old ones. Tap-to-expand keeps the default view scannable while putting full text one tap away — skim until something's relevant, then dig in.

Engagement is expand count, not votes. At launch volume an explicit-vote signal would be almost entirely zeros, collapsing trending order into pure recency.

---

## Implementation

Unique on `(spot_id, author_id)`. Word floor is a DB check constraint, not just form validation.

RPCs: `create_review`, `update_review` (must verify `author_id = auth.uid()` and bump `updated_at`), `increment_expand`.

Write path: client → `embed` Edge Function (`POST /functions/v1/embed`, JWT required, `{ "input": "…" }` → `{ "embedding": [1536 floats] }`) → client calls the write RPC with the vector. Known exposure (accepted): a crafted client could submit a mismatched vector; blast radius is one row (the attacker's own review). Closing it means generating the embedding inside the RPC so text and vector are computed together.

Trending formula lives in `public_reviews.trending_score` — change weights in the view, not client code. Debounce `increment_expand` to once per review per session.

### Screens

- Spot detail carousel — horizontal swipe, tap-to-expand, trending order.
- `(app)/review/new` — body field only. Building, spot, and tags are already fixed. Hidden when `is_mine` is already true on that spot.
- Review form prompt and 15-word live counter: [spot catalog](spot-catalog.md).
