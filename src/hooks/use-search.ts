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
 * An empty query resolves to `[]` from the fetcher rather than short-circuiting
 * the hook, following `use-spots-in-building.ts`: hooks cannot be called
 * conditionally, and returning a hand-built state object would drift from
 * `AsyncState`'s semantics the first time one of them changes.
 */

import { useAsync, type AsyncState } from '@/hooks/use-async';
import type { AmenityTag } from '@/lib/amenities';
import { searchReviews, type SearchResult } from '@/lib/search';

export function useSearch(
  query: string,
  tags: readonly AmenityTag[]
): AsyncState<SearchResult[]> {
  const trimmed = query.trim();
  // Sorted so that selecting [quiet, outlets] and [outlets, quiet] are one key
  // and not two identical requests.
  const tagKey = [...tags].sort().join(',');

  return useAsync(
    async () => (trimmed ? searchReviews(trimmed, tags) : []),
    `search:${trimmed}:${tagKey}`
  );
}
