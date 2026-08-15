/**
 * Semantic search, client side. See docs/features/semantic-search.md.
 *
 * One Edge Function call, not two round trips: `search` embeds the query and
 * calls `search_reviews` in the same request. The client could embed first and
 * call the RPC itself, but that is two mobile round trips on the critical path of
 * the app's core interaction — and the first of them would need the OpenAI key on
 * the device, which is a function secret and never an `EXPO_PUBLIC_` var.
 *
 * Ranking is not this module's job. Dedupe to one card per spot (SEARCH-2), the
 * tag filter as a hard constraint (SEARCH-3), and the similarity floor that IS
 * the empty state (SEARCH-4) all live in the migration. Nothing here re-sorts,
 * re-filters, or pads the list.
 */

import type { AmenityTag } from '@/lib/amenities';
import type { OccupancyReading, OccupancyStatus } from '@/lib/occupancy';
import { functionErrorMessage, RequestError, supabase } from '@/lib/supabase';

/**
 * One row as `search_reviews` puts it on the wire.
 *
 * Hand-declared rather than taken from `Database['public']['Functions']
 * ['search_reviews']['Returns']`, because the generated type is wrong here in a
 * way that a cast would hide: it marks `occupancy` and `reported_at` non-null,
 * and they are not. The RPC **left** joins `spot_occupancy`, and a spot nobody
 * has checked into inside the freshness window simply is not in that view — so a
 * miss is null on both columns (occupancy.md, OCC-4).
 *
 * This is the `PublicSpot` situation inverted. There the generator assumed the
 * worst because Postgres cannot prove non-null through a view; here it assumed
 * the best because a `returns table` column has no null marker to read. Both are
 * narrowed at the boundary with the reason written down, per ARCHITECTURE.md —
 * the difference is that this direction is the dangerous one, since trusting it
 * renders `undefined` inside a pill instead of "No recent reports".
 */
type SearchReviewRow = {
  review_id: string;
  spot_id: string;
  body: string;
  similarity: number;
  area_name: string;
  building: string;
  amenity_tags: AmenityTag[];
  review_count: number;
  /** Null when there is no recent report. The left join's miss. */
  occupancy: OccupancyStatus | null;
  /** Null with `occupancy`; the two are set together or not at all. */
  reported_at: string | null;
};

/** A review card with its spot attached — what `ReviewCard` renders. */
export type SearchResult = {
  reviewId: string;
  spotId: string;
  body: string;
  similarity: number;
  areaName: string;
  building: string;
  amenityTags: AmenityTag[];
  reviewCount: number;
  /** `null` is "no recent reports", not missing data. */
  occupancy: OccupancyReading;
};

/**
 * SEARCH-1. Embeds `query` and returns the matching review cards, best first.
 *
 * An empty array is the SEARCH-4 answer — "nothing matched strongly" — not an
 * error, and not a cue to widen the search and show the closest bad matches.
 *
 * `filterTags` is a hard constraint, never a ranking hint (SEARCH-3, AMEN-3): a
 * spot either carries every selected tag or it does not appear.
 *
 * Deliberately sends neither `min_similarity` nor the pool sizes. Their defaults
 * live in the migration, which is what makes recalibrating the threshold a schema
 * change — and what stops a client from sending `min_similarity: 0` and turning
 * the empty state into a page of weak matches presented as results. The Edge
 * Function does not forward them either; adding them here would accomplish
 * nothing except to look like they work.
 */
export async function searchReviews(
  query: string,
  filterTags: readonly AmenityTag[] = []
): Promise<SearchResult[]> {
  const { data, error } = await supabase.functions.invoke<{ results: SearchReviewRow[] }>(
    'search',
    { body: { query, filter_tags: filterTags } }
  );
  if (error) throw new RequestError({ message: await functionErrorMessage(error) });
  // `results: []` is valid and common; a missing `results` is a broken response.
  if (!data?.results) throw new RequestError({ message: 'The search could not be completed.' });

  return data.results.map((row) => ({
    reviewId: row.review_id,
    spotId: row.spot_id,
    body: row.body,
    similarity: row.similarity,
    areaName: row.area_name,
    building: row.building,
    amenityTags: row.amenity_tags ?? [],
    reviewCount: row.review_count,
    // The whole reason the wire type above is hand-written. Both columns come
    // from the same left join, so they arrive together or not at all — and
    // requiring both is what keeps a status with no timestamp behind it
    // unrepresentable. `OccupancyPill` re-checks freshness against `reportedAt`
    // (OCC-4), so a status paired with a placeholder date would defeat exactly
    // the check that exists to stop a stale badge.
    occupancy:
      row.occupancy && row.reported_at
        ? { status: row.occupancy, reportedAt: row.reported_at }
        : null,
  }));
}
