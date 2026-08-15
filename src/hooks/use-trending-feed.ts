/**
 * The home screen's trending review feed (SPOT-1).
 *
 * A feed of reviews with their spot and occupancy, ordered by `trending_score`.
 * See `listTrendingFeed` for why it is a review feed rather than a spot list.
 *
 * Keyed on the selected amenity tags, sorted so {outlets,quiet} and
 * {quiet,outlets} are the same key and do not refetch. Changing the filter
 * starts a fresh request and abandons the previous one (`useAsync`
 * supersession), which is what stops a slow unfiltered load from landing on top
 * of a filtered one.
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import type { AmenityTag } from '@/lib/amenities';
import { listTrendingFeed, type SpotReviewCard } from '@/lib/reviews';

export function useTrendingFeed(tags: readonly AmenityTag[] = []): AsyncState<SpotReviewCard[]> {
  const key = `trending-feed:${[...tags].sort().join(',')}`;
  return useAsync(() => listTrendingFeed(tags), key);
}
