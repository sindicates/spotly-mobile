import { router } from 'expo-router';
import { LocateFixedIcon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Platform, View, type ViewStyle } from 'react-native';
import type MapView from 'react-native-maps';

import { AmenityChips } from '@/components/amenity-chip';
import { CardSkeleton } from '@/components/card-skeleton';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { OccupancyPill } from '@/components/occupancy-pill';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useMapSpots } from '@/hooks/use-map-spots';
import { useUserLocation } from '@/hooks/use-user-location';
import { press, selection } from '@/lib/haptics';
import {
  CAMPUS_CENTER,
  CAMPUS_REGION,
  formatDistance,
  groupPins,
  haversineMeters,
  locateMapSpots,
  type MapSpot,
  type BuildingPin,
} from '@/domain/map';
import { THEME } from '@/lib/theme';
import { cn } from '@/lib/utils';

const TRANSPARENT_PIN = require('../../../../assets/images/transparent-pin.png');

/**
 * MAP-1..5. Campus map of catalogued spots plus a distance-sorted list.
 *
 * Pins are buildings — several spots in KSL share one pin. Occupancy lives on
 * the row, never the pin (MAP-5 / OCC-4). Pin colour is saved vs not: green if
 * any spot in the building is a favourite. Location is requested here and
 * nowhere else; a denial still shows campus (MAP-4).
 *
 * `react-native-maps` is native-only. Web is a Metro convenience, so the map
 * half becomes a placeholder rather than a second product surface.
 */
const Maps = Platform.OS === 'web' ? null : require('react-native-maps');
const NativeMap = Maps?.default as typeof MapView | undefined;
const Marker = Maps?.Marker as typeof import('react-native-maps').Marker | undefined;

type ThemeTokens = (typeof THEME)[keyof typeof THEME];

/**
 * Shared by the map markers and the legend so the two cannot drift.
 *
 * The unsaved fill used to be `THEME.light.card` unconditionally, which painted
 * a white dot with a near-white border on a dark map. It follows the scheme now
 * like everything else.
 */
function pinDotStyle(favorite: boolean, theme: ThemeTokens, size = 18): ViewStyle {
  return {
    height: size,
    width: size,
    borderRadius: size / 2,
    backgroundColor: favorite ? theme.occupancyEmpty : theme.card,
    borderWidth: 2,
    borderColor: favorite ? theme.occupancyEmpty : theme.foreground,
  };
}

export default function MapTab() {
  const catalog = useMapSpots();
  const location = useUserLocation();
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme ?? 'light'];
  const listRef = useRef<FlatList<MapSpot>>(null);
  const mapRef = useRef<MapView>(null);
  const didFitUser = useRef(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);

  // Once we have a fix, pull the user into view when they're on campus.
  // A far-away simulator location (Cupertino) must not zoom the map to the
  // whole country — recenter still flies to them.
  useEffect(() => {
    if (didFitUser.current || !location.coords || !mapRef.current) return;
    didFitUser.current = true;
    if (haversineMeters(location.coords, CAMPUS_CENTER) < 8_000) {
      mapRef.current.fitToCoordinates([location.coords, CAMPUS_CENTER], {
        edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
        animated: true,
      });
    }
  }, [location.coords]);

  const spots = useMemo(
    () => locateMapSpots(catalog.data ?? [], location.coords),
    [catalog.data, location.coords]
  );
  const pins = useMemo(() => groupPins(spots), [spots]);

  function selectBuilding(buildingId: string) {
    selection();
    setSelectedBuildingId(buildingId);
    const index = spots.findIndex((spot) => spot.buildingId === buildingId);
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true });
    }
    const pin = pins.find((p) => p.buildingId === buildingId);
    if (pin && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: pin.latitude,
        longitude: pin.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      });
    }
  }

  function recenter() {
    if (!location.coords || !mapRef.current) return;
    press();
    mapRef.current.animateToRegion({
      ...location.coords,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    });
  }

  return (
    // No in-page title: the Map tab already names this screen. Home and Search
    // set that convention and Favourites matches it.
    <Screen edges={['top']}>
      <View className="flex-1">
        {NativeMap && Marker ? (
          <View className="flex-1">
            <NativeMap
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={CAMPUS_REGION}
              showsUserLocation={location.status === 'granted'}
              showsMyLocationButton={false}
              accessibilityLabel="Campus map of study spots">
              {location.coords ? (
                <Marker
                  coordinate={location.coords}
                  title="You"
                  image={TRANSPARENT_PIN}
                  anchor={{ x: 0.5, y: 0.5 }}
                  zIndex={10}
                  accessibilityLabel="Your current location">
                  <View
                    style={{
                      height: 18,
                      width: 18,
                      borderRadius: 9,
                      backgroundColor: theme.primary,
                      borderWidth: 3,
                      borderColor: theme.background,
                    }}
                  />
                </Marker>
              ) : null}
              {pins.map((pin) => (
                <BuildingMarker
                  key={pin.buildingId}
                  pin={pin}
                  theme={theme}
                  onPress={() => selectBuilding(pin.buildingId)}
                />
              ))}
            </NativeMap>
            <PinLegend theme={theme} />
            {location.status === 'granted' ? (
              <View className="absolute bottom-3 right-3">
                <Button
                  variant="secondary"
                  size="icon"
                  onPress={recenter}
                  accessibilityLabel="Recenter on my location">
                  <Icon as={LocateFixedIcon} size={20} className="text-foreground" />
                </Button>
              </View>
            ) : null}
          </View>
        ) : (
          <View className="bg-muted flex-1 items-center justify-center px-5">
            <Text variant="muted" className="text-center">
              The map is available on iPhone and Android.
            </Text>
          </View>
        )}
      </View>

      <View className="flex-1">
        {location.status === 'denied' ? (
          <View className="gap-2 px-5 pt-3">
            <Text variant="muted">Enable location to see what&apos;s near you.</Text>
            <Button variant="outline" size="sm" onPress={() => Linking.openSettings()}>
              <Text>Open Settings</Text>
            </Button>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={spots}
          keyExtractor={(item) => item.spotId}
          contentContainerClassName="gap-3 px-5 pb-10 pt-3"
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true });
            }, 80);
          }}
          renderItem={({ item }) => (
            <MapSpotRow
              spot={item}
              selected={item.buildingId === selectedBuildingId}
              onOpen={() => router.push(`/spot/${item.spotId}`)}
            />
          )}
          ListEmptyComponent={
            catalog.loading ? (
              <View className="gap-3">
                {[0, 1, 2].map((i) => (
                  <CardSkeleton key={i} />
                ))}
              </View>
            ) : catalog.error ? (
              <ErrorState message="We couldn't load nearby spots." onRetry={catalog.refetch} />
            ) : (
              <EmptyState
                title="No spots on the map yet"
                description="Add a spot and it will show up on the building it belongs to."
                action={{ label: 'Add a spot', onPress: () => router.push('/spot/new') }}
              />
            )
          }
        />
      </View>
    </Screen>
  );
}

type MapSpotRowProps = {
  spot: MapSpot;
  selected: boolean;
  onOpen: () => void;
};

type BuildingPinProps = {
  pin: BuildingPin;
  theme: ThemeTokens;
  onPress: () => void;
};

/**
 * Custom green/white dots. The default Marker is a red teardrop — it shows
 * whenever the custom child has not been snapshotted yet (`tracksViewChanges`
 * false too early). A transparent `image` replaces that default; we track
 * view changes for one layout pass so the coloured dot actually paints.
 */
function BuildingMarker({ pin, theme, onPress }: BuildingPinProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  if (!Marker) return null;

  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      title={pin.building}
      description={pin.spotCount === 1 ? '1 spot' : `${pin.spotCount} spots`}
      image={TRANSPARENT_PIN}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      accessibilityLabel={
        pin.hasFavorite ? `${pin.building}, favourite` : pin.building
      }
      onPress={onPress}>
      <View
        onLayout={() => {
          requestAnimationFrame(() => setTracksViewChanges(false));
        }}
        style={pinDotStyle(pin.hasFavorite, theme)}
      />
    </Marker>
  );
}

function PinLegend({ theme }: { theme: ThemeTokens }) {
  return (
    // Floats over the map, so it takes the raised level rather than resting.
    <Card
      elevation="lifted"
      accessible
      accessibilityLabel="Pin colours: green is favourites, white is other buildings"
      className="absolute bottom-3 left-3 gap-1.5 px-3 py-2">
      <LegendRow favorite theme={theme} label="Favourites" />
      <LegendRow favorite={false} theme={theme} label="Other" />
    </Card>
  );
}

function LegendRow({
  favorite,
  theme,
  label,
}: {
  favorite: boolean;
  theme: ThemeTokens;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View style={pinDotStyle(favorite, theme, 10)} />
      <Text variant="small">{label}</Text>
    </View>
  );
}

function MapSpotRow({ spot, selected, onOpen }: MapSpotRowProps) {
  return (
    // `flat` — these rows sit in a list under the map, not floating above it,
    // and a shadow on every row would read as noise rather than depth.
    <Card
      elevation="flat"
      onPress={() => {
        press();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${spot.areaName}`}
      accessibilityState={{ selected }}
      className={cn('gap-3 p-4', selected && 'bg-accent')}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="shrink gap-0.5">
          <Text className="font-semibold">{spot.areaName}</Text>
          <Text variant="muted">{spot.building}</Text>
        </View>
        {spot.distanceMeters != null ? (
          <Text variant="muted">{formatDistance(spot.distanceMeters)}</Text>
        ) : null}
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <OccupancyPill reading={spot.occupancy} size="sm" />
        {spot.tags.length > 0 ? <AmenityChips tags={spot.tags} className="shrink" /> : null}
      </View>
    </Card>
  );
}
