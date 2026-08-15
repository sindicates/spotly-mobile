/**
 * Semantic search results for the search screen. See docs/features/semantic-search.md.
 *
 * **Pass a submitted query, never the raw text field.** `useAsync` derives
 * `loading` as `key !== settled.key`, so a new key blanks `data` and flips
 * loading synchronously in the same render — correct for supersession, and
 * exactly wrong for a text input. Keyed to keystrokes this would skeleton-flash
 * and blank the list on every character, and spend an OpenAI embedding call per
 * character to do it. The screen holds `input` and `submitted` separately and
 * only the latter reaches here.
 *
 * Tags are not held back the same way. Toggling a filter is already a deliberate
 * act with a result the user is waiting on, so it re-runs immediately — and a
 * filter row that needs a second confirming tap reads as broken (AMEN-3).
 *
 * An empty query is the idle state, not a search for nothing: the key is blank,
 * nothing is fetched, and `data` stays null. The screen reads that as "no search
 * yet" and shows the prompt rather than an empty-results state.
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import type { AmenityTag } from '@/lib/amenities';
import type { SpotReviewCard } from '@/lib/reviews';
import { searchReviews } from '@/lib/search';

export function useSearch(
  query: string,
  tags: readonly AmenityTag[]
): AsyncState<SpotReviewCard[]> {
  const trimmed = query.trim();
  // Tags are order-independent, so sort them into the key — {outlets,quiet} and
  // {quiet,outlets} are the same search and must not refetch.
  const key = trimmed ? `search:${trimmed}::${[...tags].sort().join(',')}` : '';
  return useAsync(
    () => (trimmed ? searchReviews(trimmed, tags) : Promise.resolve([])),
    key
  );
}
