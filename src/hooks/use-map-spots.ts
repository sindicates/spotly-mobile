/**
 * Catalog + occupancy for the map tab (MAP-1, MAP-5).
 *
 * Location is a separate hook: a denied permission is a valid MAP-4 state, not
 * a fetch error, and must not blank the catalog.
 *
 * NativeTabs keep this screen mounted, so a fetch-on-mount would freeze the
 * catalog (and occupancy, which is pull-on-view) at whatever was true the
 * first time Map was opened. Refetch on later focuses; skip the first because
 * `useAsync` already ran.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { useAsync, type AsyncState } from '@/hooks/use-async';
import { listMapSpots, type MapSpot } from '@/domain/map';

export function useMapSpots(): AsyncState<MapSpot[]> {
  const state = useAsync(listMapSpots, 'map-spots');
  const mounted = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (mounted.current) state.refetch();
      else mounted.current = true;
    }, [state.refetch])
  );

  return state;
}
