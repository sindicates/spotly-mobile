# Reporting and moderation

**IDs:** MOD-1..4

Related: [reviews](reviews.md) · [architecture](../ARCHITECTURE.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| MOD-1 | Every review has a report control. |
| MOD-2 | Reported reviews enter a queue reviewable by the team. |
| MOD-3 | A written content policy is published in-app, stating that reviews must not name or describe identifiable individuals (staff, TAs, or students). |
| MOD-4 | Team members can remove a review from the queue. |

---

## Rationale

Anonymity plus the ability to reference specific people is the product's largest risk surface. This is the mitigation and it ships with v1, not after.

Never cut the moderation path. Unmoderated anonymous review is the first hole a judge probes.

---

## Implementation

RPC: `report_review(review_id, reason)`. Table `reports` — insert where `reporter_id = auth.uid()`. No client select; reporters cannot see the queue.

**Moderation is the Supabase dashboard in v1, not an in-app admin screen.** MOD-4 is satisfied by flipping `reviews.hidden` there. Hidden reviews are excluded from `public_reviews` and from `search_reviews`.

MOD-3 ships as a static policy screen linked from settings and from the review form. Do not cut it.

### Screen

- Report sheet (modal) — flag control on every review card. Optional reason, writes to `reports`.
