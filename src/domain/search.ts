/**
 * Semantic search, client side. See docs/features/semantic-search.md.
 *
 * One Edge Function call, not two round trips: `search` embeds the query and
 * calls `search_reviews` in the same request. The function returns cards already
 * shaped as reviews-with-spot (SEARCH-2); this module maps the wire rows onto
 * `SpotReviewCard`, the same type the home feed uses, so `ReviewCard` renders
 * both identically.
 *
 * Ranking is not this module's job. Dedupe to one card per spot (SEARCH-2), the
 * tag filter as a hard constraint (SEARCH-3), and the similarity floor that IS
 * the empty state (SEARCH-4) all live in the migration. Nothing here re-sorts,
 * re-filters, or pads the list. An empty array is SEARCH-4, not an error.
 */

import type { AmenityTag } from '@/lib/amenities';
import { toOccupancyReading } from '@/lib/occupancy';
import type { OccupancyStatus } from '@/lib/occupancy';
import type { SpotReviewCard } from '@/lib/reviews';
import { buildingImageUrl } from '@/lib/spots';
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
  amenity_tags: AmenityTag[] | null;
  review_count: number | null;
  /** Null when there is no recent report. The left join's miss. */
  occupancy: OccupancyStatus | null;
  /** Null with `occupancy`; the two are set together or not at all. */
  reported_at: string | null;
  /** Null when the building has no seeded photo (REV-12). */
  image_path: string | null;
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
): Promise<SpotReviewCard[]> {
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
    areaName: row.area_name,
    building: row.building,
    tags: row.amenity_tags ?? [],
    reviewCount: row.review_count ?? 0,
    // Both occupancy columns come from the same left join, so they arrive
    // together or not at all. `toOccupancyReading` is what keeps a status with
    // no timestamp behind it unrepresentable (OCC-4).
    occupancy: toOccupancyReading(row.occupancy, row.reported_at),
    imageUrl: buildingImageUrl(row.image_path),
  }));
}
