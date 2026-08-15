/**
 * Reporting and the content policy. See docs/features/reporting.md.
 *
 * A report is a definer RPC write, never a direct insert: `reporter_id` is set
 * from `auth.uid()` inside `report_review`, and reporters have no select on
 * `reports` at all — they cannot see the queue (MOD-2). A second report of the
 * same review by the same person updates the reason rather than flooding the
 * queue, so the client never has to dedupe or block a repeat tap.
 *
 * There is no in-app moderation surface. MOD-4 is the team flipping
 * `reviews.hidden` in the Supabase dashboard, which drops the row from every
 * read path. Nothing disappears on the reporter's screen when they submit — the
 * report is filed, not enacted client-side.
 */

import { supabase, unwrap } from '@/lib/supabase';

/**
 * MOD-1. Files a report against a review, with an optional free-text reason.
 *
 * @returns the report id, which the caller ignores — a successful resolve is the
 * only signal the UI needs.
 */
export async function reportReview(reviewId: string, reason?: string): Promise<string> {
  const trimmed = reason?.trim();
  return unwrap(
    await supabase.rpc('report_review', {
      p_review_id: reviewId,
      p_reason: trimmed && trimmed.length > 0 ? trimmed : undefined,
    })
  );
}
