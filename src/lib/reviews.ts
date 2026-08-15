/**
 * Review domain rules and the review write path. See docs/features/reviews.md.
 *
 * The word floor is enforced in three places on purpose: a database check
 * constraint (the real gate), this module (so the form and the submit path agree
 * on what counts as a word), and the live counter in the UI. A one-line review is
 * the failure mode that makes the whole corpus useless — both for reading and for
 * the embedding index — so it is worth the redundancy.
 */

import type { AmenityTag } from '@/lib/amenities';
import { toOccupancyReading, type OccupancyReading } from '@/lib/occupancy';
import { functionErrorMessage, RequestError, supabase, unwrap } from '@/lib/supabase';

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
 * REV-3 (revised 2026-08-14). Turns review text into the vector stored beside it.
 *
 * The Edge Function is the only place the OpenAI key exists — it is a function
 * secret, never an `EXPO_PUBLIC_` var — so embedding cannot happen on device.
 * `functions.invoke` attaches the caller's JWT, which is what the function
 * checks before spending a token budget on an anonymous request.
 *
 * Throws. Callers on the review write path want `tryEmbedReviewBody` instead —
 * see the note there for why posting no longer depends on this succeeding.
 */
export async function embedReviewBody(body: string): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke<{ embedding: number[] }>('embed', {
    body: { input: body },
  });
  if (error) throw new RequestError({ message: await functionErrorMessage(error) });
  if (!data?.embedding) throw new RequestError({ message: 'The review could not be indexed.' });
  return data.embedding;
}

/**
 * Embedding, best-effort. Returns null rather than throwing.
 *
 * REV-3 originally made embedding part of the write: no vector, no review. That
 * coupling meant an unset `OPENAI_API_KEY` blocked *posting*, which the database
 * never required — `reviews.embedding` is nullable and both write RPCs default
 * `p_embedding` to null. Losing every contributed review because an index is not
 * configured yet is the worse failure of the two, so the vector is now optional
 * and search is what degrades.
 *
 * A review with a null embedding is invisible to `search_reviews`, which filters
 * `embedding is not null` — the same state `seed.sql` deliberately leaves its
 * rows in. It is not lost, just unindexed, and a backfill pass fixes it. Nothing
 * here changes when the key is finally set: this starts returning vectors and
 * new reviews are searchable immediately. Only the existing null rows need the
 * backfill.
 */
export async function tryEmbedReviewBody(body: string): Promise<number[] | null> {
  try {
    return await embedReviewBody(body);
  } catch (cause) {
    // Loud in dev, harmless in production. Silence here would make "why is
    // nothing searchable" an unanswerable question later.
    console.warn('[spotly] review saved without an embedding:', (cause as Error).message);
    return null;
  }
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
  // Best-effort, not a gate (REV-3, revised): an unset OPENAI_API_KEY must cost
  // the review its place in the search index, never the review itself.
  const embedding = await tryEmbedReviewBody(body);
  return unwrap(
    await supabase.rpc('create_review', {
      p_spot_id: spotId,
      p_body: body,
      p_embedding: embedding ? toVectorLiteral(embedding) : undefined,
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

/**
 * A review with its spot attached — the single card shape the app displays in a
 * list.
 *
 * The trending feed (home) and search results are both arrays of this, because
 * a search result IS a review card (SEARCH-2): the product's claim is that the
 * index is built from what students wrote, so the writing is the headline and
 * the spot is context. `ReviewCard` renders one of these. There is no author
 * field and no way to add one (REV-2).
 */
export type SpotReviewCard = {
  reviewId: string;
  spotId: string;
  body: string;
  areaName: string;
  building: string;
  tags: AmenityTag[];
  reviewCount: number;
  occupancy: OccupancyReading;
};

/** One spot's own reviews, for the carousel on the spot page. */
export type SpotReview = {
  id: string;
  body: string;
  /** REV-6 engagement signal. Bumped by `incrementExpand` on first expand. */
  expandCount: number;
  /** REV-1: true if this is the caller's review, which hides "Add your review". */
  isMine: boolean;
  createdAt: string;
};

/** How many trending reviews the home feed pulls. Design for 1–3 seen (SPOT-4). */
const TRENDING_FEED_LIMIT = 20;

/**
 * SPOT-1. The home feed: recent, engaged reviews with their spot and occupancy.
 *
 * Ordered by `trending_score`, which is a column on `public_reviews` rather than
 * a client sort because PostgREST cannot order by an arbitrary expression and
 * the weights are a product decision that belongs in the view (REV-6). This is a
 * feed of reviews, not spots — a spot with two trending reviews appears twice,
 * which is correct: the feed doubles as the thin-catalog answer, reading as a
 * fresh stream rather than an empty grid.
 *
 * Three reads, joined on the client: reviews for the order and text, spots for
 * the context, occupancy for the pill. `public_reviews` and `public_spots` are
 * separate views with no PostgREST embed between them, and occupancy is a left
 * join by nature (a spot with no recent report is simply absent, OCC-4).
 *
 * `tags` narrows the catalog before the feed is drawn, not after (AMEN-3). The
 * difference matters: filtering the twenty loaded reviews would show an empty
 * feed whenever the matching spots happen to sit lower in trending order, which
 * reads as "nothing has outlets" when the truth is "nothing on this page does".
 * Same containment operator as search uses, so a tag means the same thing on
 * both screens — a hard constraint, never a ranking weight.
 */
export async function listTrendingFeed(
  tags: readonly AmenityTag[] = []
): Promise<SpotReviewCard[]> {
  let taggedSpotIds: string[] | null = null;
  if (tags.length > 0) {
    const tagged = unwrap(
      await supabase.from('public_spots').select('id').contains('amenity_tags', [...tags])
    );
    taggedSpotIds = tagged.map((s) => s.id).filter((id): id is string => !!id);
    if (taggedSpotIds.length === 0) return [];
  }

  let query = supabase
    .from('public_reviews')
    .select('id, spot_id, body')
    .order('trending_score', { ascending: false })
    .limit(TRENDING_FEED_LIMIT);
  if (taggedSpotIds) query = query.in('spot_id', taggedSpotIds);

  const reviews = unwrap(await query);
  if (reviews.length === 0) return [];

  const spotIds = [...new Set(reviews.map((r) => r.spot_id).filter((id): id is string => !!id))];
  return joinSpotContext(reviews, spotIds);
}

/**
 * The spot rows and occupancy for a set of reviews, zipped back onto them.
 *
 * Shared by the trending feed; kept here rather than inlined because the join is
 * three reads with two failure-tolerant lookups and getting the null handling
 * right once is worth more than getting it right twice.
 */
async function joinSpotContext(
  reviews: readonly { id: string | null; spot_id: string | null; body: string | null }[],
  spotIds: readonly string[]
): Promise<SpotReviewCard[]> {
  const [spots, occupancy] = await Promise.all([
    supabase
      .from('public_spots')
      .select('id, area_name, building, amenity_tags, review_count')
      .in('id', spotIds)
      .then(unwrap),
    supabase
      .from('spot_occupancy')
      .select('spot_id, status, reported_at')
      .in('spot_id', spotIds)
      .then(unwrap),
  ]);

  const spotById = new Map(spots.map((s) => [s.id, s]));
  const occupancyBySpot = new Map(occupancy.map((o) => [o.spot_id, o]));

  const cards: SpotReviewCard[] = [];
  for (const review of reviews) {
    const spot = review.spot_id ? spotById.get(review.spot_id) : undefined;
    // A spot that vanished between the two reads (deleted, or hidden by
    // moderation) drops out rather than rendering a card with blank context.
    if (!spot || !review.id || !review.spot_id) continue;
    const occ = occupancyBySpot.get(review.spot_id);
    cards.push({
      reviewId: review.id,
      spotId: review.spot_id,
      body: review.body ?? '',
      areaName: spot.area_name ?? '',
      building: spot.building ?? '',
      tags: spot.amenity_tags ?? [],
      reviewCount: spot.review_count ?? 0,
      occupancy: toOccupancyReading(occ?.status, occ?.reported_at),
    });
  }
  return cards;
}

/**
 * REV-4, REV-6. One spot's reviews for its carousel, in trending order.
 *
 * `is_mine` comes back per row and is the only thing derived from the author id
 * (REV-2) — the screen reduces it to "does any of these belong to me" to decide
 * whether to hide the add-review button (REV-1).
 */
export async function listSpotReviews(spotId: string): Promise<SpotReview[]> {
  const rows = unwrap(
    await supabase
      .from('public_reviews')
      .select('id, body, expand_count, is_mine, created_at')
      .eq('spot_id', spotId)
      .order('trending_score', { ascending: false })
  );
  return rows.map((r) => ({
    id: r.id as string,
    body: r.body ?? '',
    expandCount: r.expand_count ?? 0,
    isMine: r.is_mine ?? false,
    createdAt: r.created_at ?? '',
  }));
}

/**
 * Reviews already counted this session. Module scope, so the debounce holds
 * across screens: the same review appears in the trending feed, in search
 * results, and in its spot's carousel, and expanding it in three places is one
 * person finding it interesting once.
 */
const countedExpands = new Set<string>();

/**
 * REV-5, REV-6. Records that a review card was expanded, feeding trending order.
 *
 * Debounced to once per review per session here rather than at each call site.
 * There is no server-side dedupe — `increment_expand` bumps unconditionally —
 * so leaving it to callers means the first screen that forgets quietly inflates
 * the ranking signal for every review on it.
 *
 * Best-effort and fire-and-forget: the count is a ranking input, not a metric
 * anyone reads, so a failed bump must never surface to the user or hold up the
 * expand it is recording.
 */
export async function incrementExpand(reviewId: string): Promise<void> {
  if (countedExpands.has(reviewId)) return;
  countedExpands.add(reviewId);
  try {
    await supabase.rpc('increment_expand', { p_review_id: reviewId });
  } catch (cause) {
    console.warn('[spotly] increment_expand failed:', (cause as Error).message);
  }
}
