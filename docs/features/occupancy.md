# Occupancy

**IDs:** OCC-1..6

Related: [spot catalog](spot-catalog.md)

---

## Requirements

| ID | Requirement |
| --- | --- |
| OCC-1 | A user can report a spot as Empty / Some seats / Packed. |
| OCC-2 | Reports are timestamped and attributed to an account ID internally, never displayed. |
| OCC-3 | The displayed status reflects the most recent report within the freshness window. |
| OCC-4 | Freshness window is 60 minutes. Outside it, the spot shows "no recent reports" — never a stale status. |
| OCC-5 | Check-ins are trust-based; no geolocation verification at launch. |
| OCC-6 | A user is rate-limited to one check-in per spot per 15 minutes. |

**Acceptance:** A spot with no report in the last hour visibly communicates that it has no current data, and cannot display a stale badge under any condition.

---

## Rationale

This is the feature static review apps structurally cannot do, and it's the one that addresses the costlier of the two problems in the product write-up. It answers the real question behind texting a group chat at 9pm: not "is this place good" but "is it packed right now."

Trust-based rather than geo-gated at launch (OCC-5) is a deliberate tradeoff. The exposure accepted: someone can mark a spot packed from their dorm without going there. At CWRU scale, with `.edu`-verified accounts and per-spot rate limiting, that risk is low, and geo-gating is a drop-in addition if abuse appears. Shipping the friction-free version first is worth more than defending against an attack nobody has attempted.

OCC-4 is the requirement not to compromise on. A stale badge shown confidently is worse than no badge.

Never cut occupancy. It is the differentiator.

---

## Implementation

Clients read `spot_occupancy`, never `check_ins`. Insert via `create_check_in`. A spot absent from the view has no recent report — render "no recent reports" and never fall back to a last-known status. Do not add a "last seen 3 hours ago" badge.

```sql
create view spot_occupancy with (security_invoker = false) as
select distinct on (spot_id)
  spot_id, status, created_at as reported_at
from check_ins
where created_at > now() - interval '60 minutes'
order by spot_id, created_at desc;
```

Rate limiting (OCC-6) uses a trigger rather than an RLS check, because an RLS violation surfaces as an opaque "new row violates row-level security policy" and this needs a message the UI can show.

```sql
create or replace function enforce_check_in_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from check_ins
    where spot_id = new.spot_id
      and author_id = new.author_id
      and created_at > now() - interval '15 minutes'
  ) then
    raise exception 'rate_limited'
      using hint = 'One check-in per spot every 15 minutes.';
  end if;
  return new;
end $$;
```

Search cards join occupancy with a **left** join so a missing report is `null` in one round trip.

### Screen

- Occupancy pill on `(app)/spot/[id]` with the three check-in buttons. Same pill (read-only) on search result cards and favorites.
