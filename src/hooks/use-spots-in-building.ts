/**
 * Every spot in one building, for the add-spot duplicate guard (SPOT-5).
 *
 * Fetched per building and matched client-side rather than queried per keystroke:
 * a building holds tens of spots, not thousands, so one request makes the "did
 * you mean…" list instant while the user is still typing. A guard that lags
 * behind the typing is a guard nobody reads, and occupancy signal fragmenting
 * across duplicate entries is the failure it exists to prevent.
 *
 * Pass `null` before a building is chosen — the form renders the field disabled
 * until then, and there is nothing to fetch.
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import { listSpotsInBuilding, type PublicSpot } from '@/lib/spots';

export function useSpotsInBuilding(buildingId: string | null): AsyncState<PublicSpot[]> {
  return useAsync(
    async () => (buildingId ? listSpotsInBuilding(buildingId) : []),
    `spots-in-building:${buildingId ?? 'none'}`
  );
}
