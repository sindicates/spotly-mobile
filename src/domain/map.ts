/**
 * Nearby-map reads and distance helpers. See docs/features/nearby-map.md.
 *
 * Pins are buildings (MAP-1): a spot is a named area inside a building, and
 * only the building has coordinates. Occupancy stays on the row, never on the
 * pin (MAP-5 / OCC-4) — colouring a building by how full it is would invent a
 * status from several spots that may disagree. Pin colour is saved vs not:
 * green if any spot in the building is a favourite.
 *
 * Reads compose `public_spots` (now projecting lat/lng) and `spot_occupancy`.
 * A miss on occupancy is `null`, the same left-join shape as favourites.
 */

import type { AmenityTag } from '@/domain/amenities';
import { listFavoriteSpotIds } from '@/domain/favorites';
import { toOccupancyReading, type OccupancyReading } from '@/domain/occupancy';
import { supabase, unwrap } from '@/lib/supabase';

export type LatLng = {
  latitude: number;
  longitude: number;
};

/**
 * Kelvin Smith Library's OSM centroid — the campus fallback when the user has
 * not been located (MAP-4). Same numbers as the buildings reference data.
 */
export const CAMPUS_CENTER: LatLng = { latitude: 41.5074, longitude: -81.6096 };

/** Initial map window: campus-sized, not a city, not a single block. */
export const CAMPUS_REGION = {
  ...CAMPUS_CENTER,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

/** A catalogued spot placed on the map via its building's coordinates. */
export type MapSpot = {
  spotId: string;
  buildingId: string;
  areaName: string;
  building: string;
  buildingShort: string | null;
  tags: AmenityTag[];
  latitude: number;
  longitude: number;
  occupancy: OccupancyReading;
  /** Null when the user has no fix — the list then sorts by building name. */
  distanceMeters: number | null;
  /** FAV-1. The pin for this building turns green when any spot in it is saved. */
  isFavorite: boolean;
};

/** One pin per building that has at least one placeable spot (MAP-1). */
export type BuildingPin = {
  buildingId: string;
  building: string;
  latitude: number;
  longitude: number;
  spotCount: number;
  /** True when at least one spot in this building is saved (MAP-5). */
  hasFavorite: boolean;
};

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_MILE = 1609.344;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Geodesic distance in metres. Used for sort and the `0.2 mi` label (MAP-2). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** One decimal mile. Distances under 0.05 mi read `<0.1 mi` rather than `0.0 mi`. */
export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.05) return '<0.1 mi';
  return `${miles.toFixed(1)} mi`;
}

/**
 * Attach distances and sort. With a fix: nearest building first (MAP-2).
 * Without: building name, then area — the denied-permission order (MAP-4).
 */
export function locateMapSpots(spots: readonly MapSpot[], origin: LatLng | null): MapSpot[] {
  const located = spots.map((spot) => ({
    ...spot,
    distanceMeters: origin
      ? haversineMeters(origin, { latitude: spot.latitude, longitude: spot.longitude })
      : null,
  }));
  return located.sort((a, b) => {
    if (a.distanceMeters != null && b.distanceMeters != null) {
      if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
    }
    const building = a.building.localeCompare(b.building);
    if (building !== 0) return building;
    return a.areaName.localeCompare(b.areaName);
  });
}

/** Collapse spots onto one pin per building. First spot supplies the coords. */
export function groupPins(spots: readonly MapSpot[]): BuildingPin[] {
  const pins = new Map<string, BuildingPin>();
  for (const spot of spots) {
    const existing = pins.get(spot.buildingId);
    if (existing) {
      existing.spotCount += 1;
      existing.hasFavorite = existing.hasFavorite || spot.isFavorite;
      continue;
    }
    pins.set(spot.buildingId, {
      buildingId: spot.buildingId,
      building: spot.building,
      latitude: spot.latitude,
      longitude: spot.longitude,
      spotCount: 1,
      hasFavorite: spot.isFavorite,
    });
  }
  return [...pins.values()];
}

/**
 * Every placeable spot in the catalog, with live occupancy.
 *
 * A spot whose building has no coordinates is dropped — it cannot be pinned
 * and would sit in the list with no map counterpart (MAP-1).
 */
export async function listMapSpots(): Promise<MapSpot[]> {
  const [spots, occupancy, favoriteIds] = await Promise.all([
    supabase
      .from('public_spots')
      .select(
        'id, building_id, building, building_short, area_name, amenity_tags, latitude, longitude'
      )
      .then(unwrap),
    supabase.from('spot_occupancy').select('spot_id, status, reported_at').then(unwrap),
    listFavoriteSpotIds(),
  ]);

  const occupancyBySpot = new Map(occupancy.map((row) => [row.spot_id, row]));
  const saved = new Set(favoriteIds);

  const result: MapSpot[] = [];
  for (const spot of spots) {
    if (
      spot.id == null ||
      spot.building_id == null ||
      spot.latitude == null ||
      spot.longitude == null
    ) {
      continue;
    }
    const occ = occupancyBySpot.get(spot.id);
    result.push({
      spotId: spot.id,
      buildingId: spot.building_id,
      areaName: spot.area_name ?? '',
      building: spot.building ?? '',
      buildingShort: spot.building_short,
      tags: spot.amenity_tags ?? [],
      latitude: spot.latitude,
      longitude: spot.longitude,
      occupancy: toOccupancyReading(occ?.status, occ?.reported_at),
      distanceMeters: null,
      isFavorite: saved.has(spot.id),
    });
  }
  return result;
}
