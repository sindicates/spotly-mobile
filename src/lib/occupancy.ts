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

/** Mirrors the `occupancy_status` enum. Keep in sync with the migration. */
export type OccupancyStatus = 'empty' | 'some_seats' | 'packed';

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

/** OCC-6. Enforced by a database trigger; the UI only explains the rejection. */
export const CHECK_IN_RATE_LIMIT_MINUTES = 15;

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
