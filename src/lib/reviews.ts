/**
 * Review domain rules. See docs/features/reviews.md.
 *
 * The word floor is enforced in three places on purpose: a database check
 * constraint (the real gate), this module (so the form and the submit path agree
 * on what counts as a word), and the live counter in the UI. A one-line review is
 * the failure mode that makes the whole corpus useless — both for reading and for
 * the embedding index — so it is worth the redundancy.
 */

/** REV-10. Mirrored by a check constraint; do not lower one without the other. */
export const REVIEW_WORD_FLOOR = 15;

/**
 * REV-11. One prompt, used identically on the add-review, add-spot, and
 * onboarding first-review forms. Asking for the catch is what produces the honest
 * half most review products never get, so do not reword it per screen.
 */
export const REVIEW_PROMPT = "What's it good for, and what's the catch?";

/** Whitespace-separated tokens. Matches how the database constraint counts. */
export function countWords(body: string): number {
  const trimmed = body.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function meetsWordFloor(body: string): boolean {
  return countWords(body) >= REVIEW_WORD_FLOOR;
}
