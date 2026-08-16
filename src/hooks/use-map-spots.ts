/**
 * Catalog + occupancy for the map tab (MAP-1, MAP-5).
 *
 * Location is a separate hook: a denied permission is a valid MAP-4 state, not
 * a fetch error, and must not blank the catalog.
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import { listMapSpots, type MapSpot } from '@/lib/map';

export function useMapSpots(): AsyncState<MapSpot[]> {
  return useAsync(listMapSpots, 'map-spots');
}
