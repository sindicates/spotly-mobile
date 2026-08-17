/**
 * Occupancy domain types. See docs/features/occupancy.md.
 *
 * The type that matters here is `OccupancyReading`. It is nullable, and the null
 * case is not an error or a loading state — it means no one has reported this
 * spot inside the freshness window. The database expresses this the same way:
 * `spot_occupancy` only contains rows from the last 60 minutes, so a spot simply
 * drops out of the view. Reads are a left join, and a miss is `null`.
 *
 * There is deliberately no `lastKnownStatus` and no `lastReportedAt` outside a
 * live reading. A stale badge shown confidently is worse than no badge (OCC-4),
 * and the way to guarantee that in a codebase is to never carry the data that
 * would let someone render one.
 */

import type { Database } from '@/lib/database.types';
import { RequestError, supabase, unwrap } from '@/lib/supabase';

/** The `occupancy_status` enum, derived from the schema rather than copied. */
export type OccupancyStatus = Database['public']['Enums']['occupancy_status'];

/** A live reading, or `null` for "no recent reports". */
export type OccupancyReading = {
  status: OccupancyStatus;
  /** ISO timestamp. Used to sanity-check freshness, never rendered as "N ago". */
  reportedAt: string;
} | null;

export const OCCUPANCY_LABELS: Record<OccupancyStatus, string> = {
  empty: 'Empty',
  some_seats: 'Some seats',
  packed: 'Packed',
};

/** Copy for the null case. One string, used everywhere, never reworded per screen. */
export const NO_RECENT_REPORTS = 'No recent reports';

/** OCC-4. A reading older than this is not a reading. */
export const FRESHNESS_WINDOW_MINUTES = 60;

/** Order the check-in buttons appear in, least to most full. */
export const CHECK_IN_OPTIONS: readonly OccupancyStatus[] = ['empty', 'some_seats', 'packed'];

/**
 * Defence in depth against OCC-4. The view already filters by time, but a stale
 * response held in client cache would slip past that, so re-check on render.
 */
export function isFresh(reading: OccupancyReading, now: Date = new Date()): boolean {
  if (!reading) return false;
  const ageMs = now.getTime() - new Date(reading.reportedAt).getTime();
  return ageMs >= 0 && ageMs < FRESHNESS_WINDOW_MINUTES * 60_000;
}

/**
 * A `spot_occupancy` row into a reading, or `null` for "no recent report".
 *
 * `spot_occupancy` already filters to the freshness window, so a null status is
 * genuinely "nobody has reported" rather than "stale" — the two callers (spot
 * detail, and the left join baked into search cards) both hand this whatever the
 * view returned. Keeping the null case here rather than in each screen is what
 * stops one of them from inventing a fallback status (OCC-4).
 */
export function toOccupancyReading(
  status: OccupancyStatus | null | undefined,
  reportedAt: string | null | undefined
): OccupancyReading {
  if (!status || !reportedAt) return null;
  return { status, reportedAt };
}

/**
 * The current reading for one spot. Reads `spot_occupancy`, never `check_ins`.
 *
 * A spot with no report in the last 60 minutes is simply absent from the view,
 * so `maybeSingle` returns null and this returns null — which the pill renders
 * as "No recent reports".
 */
export async function getOccupancy(spotId: string): Promise<OccupancyReading> {
  // Cast at the boundary, as `getSpot` does: `unwrap` over a `maybeSingle`
  // response infers `never`, so the shape is asserted here where the columns are
  // in view. They match the select exactly.
  const row = unwrap(
    await supabase
      .from('spot_occupancy')
      .select('status, reported_at')
      .eq('spot_id', spotId)
      .maybeSingle()
  ) as { status: OccupancyStatus | null; reported_at: string | null } | null;
  return toOccupancyReading(row?.status, row?.reported_at);
}

/**
 * OCC-1. Records a check-in and returns the reading it produces.
 *
 * The RPC sets the author from `auth.uid()` and returns the insert's timestamp,
 * so the pill can update to the just-reported status without a refetch. The
 * 15-minute rate limit (OCC-6) is a database trigger, not a check here — a
 * second check-in inside the window throws `rate_limited`, which the caller
 * detects with `isRateLimitError` and shows as the trigger's hint.
 */
export async function checkIn(
  spotId: string,
  status: OccupancyStatus
): Promise<OccupancyReading> {
  const reportedAt = unwrap(
    await supabase.rpc('create_check_in', { p_spot_id: spotId, p_status: status })
  );
  return { status, reportedAt };
}

/**
 * OCC-6's rate-limit rejection, as the trigger raises it.
 *
 * Matched on the token, not the message: the trigger raises `rate_limited` and
 * puts the human sentence in the hint, so the screen shows a soft "one check-in
 * every 15 minutes" note rather than a hard error (CheckInControl renders it in
 * muted grey, not destructive red).
 */
export function isRateLimitError(error: unknown): boolean {
  return error instanceof RequestError && error.reason === 'rate_limited';
}
