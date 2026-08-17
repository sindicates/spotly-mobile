/**
 * The behaviour shared by every surface that lists review cards — the home feed,
 * search results, and the spot-page carousel.
 *
 * Two pieces of stateful logic that must not be re-implemented per screen:
 *
 *  - Expand tracking (REV-5) with the `increment_expand` debounce (REV-6). The
 *    count is a ranking signal, so it is bumped once per review per session on
 *    the first expand and never again — a `ref` set holds what has already been
 *    counted, surviving re-renders without causing them.
 *  - Which review's report sheet is open (MOD-1). One `ReportSheet` per screen
 *    serves every card; this holds the id it is reporting.
 */

import { useCallback, useRef, useState } from 'react';

import { incrementExpand } from '@/domain/reviews';

export function useReviewInteractions() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const counted = useRef<Set<string>>(new Set());
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);

  const toggleExpand = useCallback((reviewId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) {
        next.delete(reviewId);
      } else {
        next.add(reviewId);
        // First expand this session bumps the trending signal; later ones don't.
        if (!counted.current.has(reviewId)) {
          counted.current.add(reviewId);
          void incrementExpand(reviewId);
        }
      }
      return next;
    });
  }, []);

  const isExpanded = useCallback((reviewId: string) => expanded.has(reviewId), [expanded]);

  return {
    isExpanded,
    toggleExpand,
    reportReviewId,
    openReport: useCallback((reviewId: string) => setReportReviewId(reviewId), []),
    closeReport: useCallback(() => setReportReviewId(null), []),
  };
}
