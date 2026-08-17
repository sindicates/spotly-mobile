/**
 * The home screen's daily review deck (SPOT-1).
 *
 * A handful of reviews with their spot and occupancy. See `listTrendingFeed`
 * for why it is a random-per-day set rather than a ranked dump of the catalog.
 *
 * Keyed on the local calendar day so midnight starts a new shuffle without a
 * manual refresh.
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import { homeDeckDayKey, listTrendingFeed, type SpotReviewCard } from '@/domain/reviews';

export function useTrendingFeed(): AsyncState<SpotReviewCard[]> {
  return useAsync(() => listTrendingFeed(), `home-deck:${homeDeckDayKey()}`);
}
