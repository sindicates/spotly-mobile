/**
 * Everything the spot page reads, in one keyed request (SPOT-2).
 *
 * Four reads folded together: the spot's catalog row, its reviews in trending
 * order, its current occupancy, and whether the caller has saved it. They are
 * one hook rather than four because they render as one screen and share a
 * loading and error state — a spot page half-loaded is not a state worth
 * designing. Writes (check-in, favourite toggle, posting a review) are not here;
 * the screen fires those from `lib/` and calls `refetch()`.
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import { isFavorite } from '@/domain/favorites';
import { getOccupancy, type OccupancyReading } from '@/domain/occupancy';
import { listSpotReviews, type SpotReview } from '@/domain/reviews';
import { getSpot, type PublicSpot } from '@/domain/spots';

export type SpotDetail = {
  spot: PublicSpot;
  reviews: SpotReview[];
  occupancy: OccupancyReading;
  isFavorite: boolean;
  /** REV-1: true if any review here is the caller's, which hides "Add your review". */
  isMine: boolean;
};

/** Null when the id does not resolve — a removed spot or a stale deep link. */
async function loadSpotDetail(spotId: string): Promise<SpotDetail | null> {
  const spot = await getSpot(spotId);
  if (!spot) return null;

  const [reviews, occupancy, favorited] = await Promise.all([
    listSpotReviews(spotId),
    getOccupancy(spotId),
    isFavorite(spotId),
  ]);

  return {
    spot,
    reviews,
    occupancy,
    isFavorite: favorited,
    isMine: reviews.some((review) => review.isMine),
  };
}

export function useSpotDetail(spotId: string): AsyncState<SpotDetail | null> {
  return useAsync(() => loadSpotDetail(spotId), `spot:${spotId}`);
}
