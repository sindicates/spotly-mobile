/**
 * The saved-spot list for the favourites screen (FAV-2).
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import { listFavoriteSpots, type FavoriteSpot } from '@/lib/favorites';

export function useFavorites(): AsyncState<FavoriteSpot[]> {
  return useAsync(listFavoriteSpots, 'favorites');
}
