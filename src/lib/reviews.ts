/**
 * Review domain rules and the review write path. See docs/features/reviews.md.
 *
 * The word floor is enforced in three places on purpose: a database check
 * constraint (the real gate), this module (so the form and the submit path agree
 * on what counts as a word), and the live counter in the UI. A one-line review is
 * the failure mode that makes the whole corpus useless — both for reading and for
 * the embedding index — so it is worth the redundancy.
 */

import { RequestError, supabase, unwrap } from '@/lib/supabase';

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

/**
 * REV-3. Turns review text into the vector stored beside it.
 *
 * The Edge Function is the only place the OpenAI key exists — it is a function
 * secret, never an `EXPO_PUBLIC_` var — so embedding cannot happen on device.
 * `functions.invoke` attaches the caller's JWT, which is what the function
 * checks before spending a token budget on an anonymous request.
 */
export async function embedReviewBody(body: string): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke<{ embedding: number[] }>('embed', {
    body: { input: body },
  });
  if (error) throw new RequestError({ message: error.message });
  if (!data?.embedding) throw new RequestError({ message: 'The review could not be indexed.' });
  return data.embedding;
}

/**
 * A `vector(1536)` argument on the wire.
 *
 * PostgREST has no vector type — the generated schema types `p_embedding` as
 * `string`, because what Postgres accepts is pgvector's text literal, `[0.1,0.2]`.
 * `JSON.stringify` of a number array produces exactly that format, so this is a
 * serialisation rather than a cast to please the compiler.
 *
 * Passing the raw array happens to survive PostgREST's own JSON-to-text step
 * today, but that is an implementation detail of the transport, not a contract.
 * Being explicit here is what keeps a silent 400 out of the review write path.
 */
export function toVectorLiteral(embedding: number[]): string {
  return JSON.stringify(embedding);
}

/**
 * REV-1. Adds a review to a spot that already exists.
 *
 * A definer RPC rather than an insert: `author_id` is set from `auth.uid()`
 * inside the function, so the account id never leaves the server (AUTH-4) and a
 * client cannot write a review as somebody else.
 */
export async function createReview(spotId: string, body: string): Promise<string> {
  const embedding = await embedReviewBody(body);
  return unwrap(
    await supabase.rpc('create_review', {
      p_spot_id: spotId,
      p_body: body,
      p_embedding: toVectorLiteral(embedding),
    })
  );
}

/**
 * REV-1's unique constraint on `(spot_id, author_id)`, as `create_review`
 * re-raises it.
 *
 * Matched on the token rather than on SQLSTATE 23505: the RPC converts the
 * unique violation into `review_exists`, and two different unique violations are
 * reachable from the onboarding screen — this one, and a spot name that collides
 * (`spot_exists`). They need opposite responses, so the code alone is ambiguous.
 *
 * Onboarding is the caller that cares. The completion flag is per-install, so a
 * reinstall walks the same person back through the guided first review — and if
 * they name the spot they already reviewed, this fires. That is not a failure;
 * they have already contributed, so the app unlocks (onboarding.md).
 */
export function isDuplicateReviewError(error: unknown): boolean {
  return error instanceof RequestError && error.reason === 'review_exists';
}
