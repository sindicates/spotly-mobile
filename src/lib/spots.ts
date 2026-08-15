/**
 * Spot catalog reads and the add-spot write. See docs/features/spot-catalog.md.
 *
 * Reads go through `public_spots`, never the `spots` table — `spots.created_by`
 * is an account id, and a spot's creator is by construction the author of its
 * first review, so exposing it would deanonymise that review (AUTH-4, REV-2).
 * The privilege is revoked on `spots` outright, so this is enforced rather than
 * observed. `buildings` holds no account id and is read directly.
 */

import type { Database } from '@/lib/database.types';
import { toVectorLiteral, tryEmbedReviewBody } from '@/lib/reviews';
import { RequestError, supabase, unwrap } from '@/lib/supabase';

import type { AmenityTag } from '@/lib/amenities';

/** The columns of `buildings` the picker needs. */
export type Building = Pick<
  Database['public']['Tables']['buildings']['Row'],
  'id' | 'name' | 'short_name'
>;

type PublicSpotRow = Database['public']['Views']['public_spots']['Row'];

/**
 * A row of `public_spots`. No `created_by` — the view does not select it.
 *
 * Narrowed from the generated row type, which marks every column nullable:
 * Postgres cannot prove non-null through a view, so the generator assumes the
 * worst for all of them. These columns are `not null` on the base tables, so
 * asserting them here is accurate rather than a convenience cast. `building_short`
 * keeps its null because `buildings.short_name` genuinely is nullable.
 */
export type PublicSpot = {
  [K in 'id' | 'building_id' | 'building' | 'area_name' | 'amenity_tags' | 'review_count']-?: NonNullable<
    PublicSpotRow[K]
  >;
} & {
  building_short: PublicSpotRow['building_short'];
};

export async function listBuildings(): Promise<Building[]> {
  return unwrap(
    await supabase.from('buildings').select('id, name, short_name').order('name')
  );
}

/**
 * One spot's catalog row for its detail page (SPOT-2).
 *
 * Reads `public_spots`, so `created_by` never comes across (AUTH-4). Returns
 * null for an id that does not resolve — a spot removed by moderation, or a
 * stale deep link — which the screen turns into a "spot not found" state rather
 * than a crash.
 */
export async function getSpot(spotId: string): Promise<PublicSpot | null> {
  const row = unwrap(
    await supabase
      .from('public_spots')
      .select('id, building_id, building, building_short, area_name, amenity_tags, review_count')
      .eq('id', spotId)
      .maybeSingle()
  );
  return row as PublicSpot | null;
}

/**
 * Every spot in one building, for the duplicate guard on the add-spot form.
 *
 * Fetched per building rather than searched per keystroke because a building
 * holds tens of spots, not thousands: one request makes the "did you mean…"
 * check instant and offline-tolerant while the user is still typing. Occupancy
 * signal fragmenting across duplicate entries is the failure this prevents, and
 * it only gets prevented if the check is fast enough to read.
 */
export async function listSpotsInBuilding(buildingId: string): Promise<PublicSpot[]> {
  const rows = unwrap(
    await supabase
      .from('public_spots')
      .select('id, building_id, building, building_short, area_name, amenity_tags, review_count')
      .eq('building_id', buildingId)
      .order('area_name')
  );
  // Narrowing the view's blanket nullability, as described on `PublicSpot`. The
  // underlying columns are `not null`; only the view loses that guarantee.
  return rows as PublicSpot[];
}

/** Loose substring match, for the inline "did you mean…" list. */
export function matchSpotsByName(spots: readonly PublicSpot[], query: string): PublicSpot[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return spots.filter((spot) => spot.area_name.toLowerCase().includes(needle));
}

type CreateSpotWithReviewInput = {
  buildingId: string;
  areaName: string;
  amenityTags: readonly AmenityTag[];
  body: string;
};

/**
 * SPOT-3. Creates a spot and its first review in one transaction.
 *
 * One call, not two: a spot with zero reviews is an empty shell in the catalog,
 * and a client that crashes between two calls is exactly how one gets there.
 *
 * This is also the only write that ever sets amenity tags — they are fixed by
 * the first reviewer and there is no update path (AMEN-2).
 *
 * @returns the new spot's id.
 */
export async function createSpotWithReview({
  buildingId,
  areaName,
  amenityTags,
  body,
}: CreateSpotWithReviewInput): Promise<string> {
  // Best-effort, not a gate (REV-3, revised): losing a contributed spot because
  // the embedding service is unconfigured is the worse of the two failures.
  const embedding = await tryEmbedReviewBody(body);
  // `returns table (spot_id, review_id)` is a set, so PostgREST answers with an
  // array of one row rather than a scalar.
  const rows = unwrap(
    await supabase.rpc('create_spot_with_review', {
      p_building_id: buildingId,
      p_area_name: areaName.trim(),
      p_amenity_tags: [...amenityTags],
      p_body: body,
      p_embedding: embedding ? toVectorLiteral(embedding) : undefined,
    })
  );
  return rows[0].spot_id;
}

/**
 * The unique index on `(building_id, lower(btrim(area_name)))`, as
 * `create_spot_with_review` re-raises it.
 *
 * Reachable two ways: the user typed past the inline duplicate check, or two
 * people added the same spot at once. Either way the answer is the same — the
 * spot exists, so review that one instead of creating a second entry. Occupancy
 * signal fragmenting across duplicates is the failure this is guarding.
 */
export function isDuplicateSpotError(error: unknown): boolean {
  return error instanceof RequestError && error.reason === 'spot_exists';
}
