/**
 * Saved spots. See docs/features/favorites.md.
 *
 * Favorites are the one place clients touch a base table directly (FAV-3): a
 * favorite row is never visible to anyone but its owner, so self-only RLS on
 * `favorites` is the whole permission boundary — no definer view is needed,
 * because there is no cross-account read to protect against. The account id is
 * private to the row and set from the session, never rendered.
 *
 * Reads compose three tables the way the trending feed does: `favorites` for the
 * set and its order, `public_spots` for context, `spot_occupancy` for the pill.
 * Occupancy stays a left join in spirit — a saved spot with no recent report
 * shows "No recent reports", never a stale badge (OCC-4).
 */

import type { AmenityTag } from '@/domain/amenities';
import { toOccupancyReading, type OccupancyReading } from '@/domain/occupancy';
import { RequestError, supabase, unwrap } from '@/lib/supabase';

/** FAV-1. Copy for the home-deck swipe-right confirmation. */
export const SAVED_TO_FAVOURITES = 'Saved to favourites';

/** A saved spot as the favourites list renders it (FAV-2). */
export type FavoriteSpot = {
  spotId: string;
  areaName: string;
  building: string;
  buildingShort: string | null;
  tags: AmenityTag[];
  reviewCount: number;
  occupancy: OccupancyReading;
};

/**
 * The signed-in account id, read from the local session.
 *
 * `getSession` rather than `getUser`: the id is needed to satisfy the insert's
 * RLS check, not to prove identity to the server (the policy does that), so the
 * local session is enough and a network round trip is not.
 */
async function currentAccountId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) {
    throw new RequestError({ message: 'not_authenticated', hint: 'Sign in first.' });
  }
  return id;
}

/** FAV-1. Whether the caller has saved this spot. */
export async function isFavorite(spotId: string): Promise<boolean> {
  // RLS scopes the select to the caller's own rows, so a match is a match for
  // this account and no `account_id` filter is needed.
  const row = unwrap(
    await supabase.from('favorites').select('spot_id').eq('spot_id', spotId).maybeSingle()
  );
  return row !== null;
}

/**
 * FAV-1. Saves a spot. Idempotent — saving an already-saved spot is a no-op, not
 * an error, so a double tap or a stale toggle cannot throw.
 */
export async function addFavorite(spotId: string): Promise<void> {
  const accountId = await currentAccountId();
  unwrap(
    await supabase
      .from('favorites')
      .upsert({ account_id: accountId, spot_id: spotId }, { ignoreDuplicates: true })
      .select()
  );
}

/** FAV-1. Removes a spot from the saved list. */
export async function removeFavorite(spotId: string): Promise<void> {
  const accountId = await currentAccountId();
  unwrap(
    await supabase
      .from('favorites')
      .delete()
      .eq('account_id', accountId)
      .eq('spot_id', spotId)
      .select()
  );
}

/** FAV-1. Spot ids the caller has already saved, for the home deck to skip. */
export async function listFavoriteSpotIds(): Promise<string[]> {
  const rows = unwrap(await supabase.from('favorites').select('spot_id'));
  return rows.map((row) => row.spot_id);
}

/**
 * FAV-2. The saved-spot list, most-recently-saved first, each with occupancy.
 */
export async function listFavoriteSpots(): Promise<FavoriteSpot[]> {
  const saved = unwrap(
    await supabase
      .from('favorites')
      .select('spot_id, created_at')
      .order('created_at', { ascending: false })
  );
  if (saved.length === 0) return [];

  const spotIds = saved.map((f) => f.spot_id);
  const [spots, occupancy] = await Promise.all([
    supabase
      .from('public_spots')
      .select('id, area_name, building, building_short, amenity_tags, review_count')
      .in('id', spotIds)
      .then(unwrap),
    supabase
      .from('spot_occupancy')
      .select('spot_id, status, reported_at')
      .in('spot_id', spotIds)
      .then(unwrap),
  ]);

  const spotById = new Map(spots.map((s) => [s.id, s]));
  const occupancyBySpot = new Map(occupancy.map((o) => [o.spot_id, o]));

  const result: FavoriteSpot[] = [];
  for (const { spot_id } of saved) {
    const spot = spotById.get(spot_id);
    // A spot deleted or hidden after it was saved drops out of the list rather
    // than rendering an empty row.
    if (!spot) continue;
    const occ = occupancyBySpot.get(spot_id);
    result.push({
      spotId: spot_id,
      areaName: spot.area_name ?? '',
      building: spot.building ?? '',
      buildingShort: spot.building_short,
      tags: spot.amenity_tags ?? [],
      reviewCount: spot.review_count ?? 0,
      occupancy: toOccupancyReading(occ?.status, occ?.reported_at),
    });
  }
  return result;
}
