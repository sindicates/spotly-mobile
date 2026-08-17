/**
 * The building list for the add-spot picker (SPOT-5, required field).
 *
 * `buildings` is the one table the client selects directly — it holds no account
 * id, so AUTH-4 does not apply to it. Everything else goes through a view.
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import { listBuildings, type Building } from '@/domain/spots';

export function useBuildings(): AsyncState<Building[]> {
  return useAsync(listBuildings, 'buildings');
}
