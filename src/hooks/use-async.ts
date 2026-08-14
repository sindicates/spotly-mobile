/**
 * The shared read primitive every data hook in this folder is built on.
 *
 * Deliberately small and dependency-free. Spotly has no data-fetching library in
 * the stack yet ([TECH_STACK.md](../../docs/TECH_STACK.md) lists none), so this
 * covers the one thing hand-rolled fetching reliably gets wrong — a slow request
 * resolving after a newer one and overwriting fresher state — without pretending
 * to be a cache. There is no deduplication, no background refetch, and no shared
 * store across components. When two screens need the same data at the same time,
 * that is the signal to adopt React Query rather than to grow this.
 *
 * No hook here is used for writes. Writes go straight to the `lib/` function from
 * the submit handler, because a write's result belongs to the screen that fired
 * it and its errors are rendered inline, not held in shared state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> = {
  data: T | null;
  /**
   * True until this key's first result settles.
   *
   * A `refetch()` deliberately leaves it false: the previous data is still on
   * screen and correct-until-proven-otherwise, and flipping back to a spinner
   * would blank a list the user is currently reading.
   */
  loading: boolean;
  /** The thrown value, for `errorMessage()` to turn into copy. */
  error: unknown;
  refetch: () => void;
};

type Settled<T> = { key: string; data: T | null; error: unknown };

/**
 * Runs `fetcher` on mount and whenever `key` changes.
 *
 * `key` is the identity of the request, not a React dependency list — build it
 * from whatever the fetch is parameterised by (a spot id, a query string). A new
 * key starts a new request and abandons the previous one's result.
 *
 * `fetcher` is read through a ref, so callers pass an inline arrow without
 * restarting the request on every render. Whatever it closes over is current at
 * the moment it runs.
 */
export function useAsync<T>(fetcher: () => Promise<T>, key: string): AsyncState<T> {
  // One state object holding the key its contents belong to, so `loading` can be
  // derived rather than stored. Storing it would mean setting state synchronously
  // at the top of the effect, which cascades an extra render on every key change.
  const [settled, setSettled] = useState<Settled<T>>({ key: '', data: null, error: null });
  const [nonce, setNonce] = useState(0);

  // Latest-ref: keeps the effect keyed on `key` alone while still invoking the
  // current closure. Assigned on commit, so it is never a render behind.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    // Covers both unmount and supersession: changing `key` runs this effect's
    // cleanup before the next one starts, so an in-flight response from the old
    // key can never land. Switching buildings quickly is exactly how a slow first
    // response arrives last and renders the wrong building's spots.
    let cancelled = false;

    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setSettled({ key, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ key, data: null, error });
      });

    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const isCurrent = settled.key === key;
  return {
    data: isCurrent ? settled.data : null,
    loading: !isCurrent,
    error: isCurrent ? settled.error : null,
    refetch,
  };
}
