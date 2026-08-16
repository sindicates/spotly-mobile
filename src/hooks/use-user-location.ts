/**
 * One-shot GPS for the map tab. See docs/features/nearby-map.md (MAP-4).
 *
 * Requested on focus, not on mount: NativeTabs may mount every tab up front,
 * and the permission prompt must not fire until the user actually opens Map.
 * No watch in v1 — a fresh fix each time the tab is focused is enough.
 *
 * Denied / failed is a state, not an error. The map still shows campus.
 */

import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import type { LatLng } from '@/lib/map';

export type LocationStatus = 'loading' | 'granted' | 'denied';

export type UserLocation = {
  coords: LatLng | null;
  status: LocationStatus;
  refetch: () => void;
};

export function useUserLocation(): UserLocation {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>('loading');
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function locate() {
        // Web is a Metro convenience, not a client. Do not prompt there.
        if (Platform.OS === 'web') {
          if (!cancelled) setStatus('denied');
          return;
        }

        setStatus((current) => (current === 'granted' ? current : 'loading'));

        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== 'granted') {
            if (!cancelled) {
              setCoords(null);
              setStatus('denied');
            }
            return;
          }

          // Permission is the gate. A failed fix (simulator with no location
          // set, or a brief GPS miss) must not look like a denial — the map
          // can still show the native user dot from Core Location.
          setStatus('granted');
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) {
            setCoords({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          }
        } catch {
          if (!cancelled) {
            setCoords(null);
            setStatus((current) => (current === 'granted' ? current : 'denied'));
          }
        }
      }

      void locate();
      return () => {
        cancelled = true;
      };
    }, [nonce])
  );

  return { coords, status, refetch };
}
