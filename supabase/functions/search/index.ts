/**
 * SEARCH-1. Turns a phrase into review cards.
 *
 *   POST /functions/v1/search
 *   { "query": "place to lock in", "filter_tags": ["outlets"] }
 *   ->  { "results": [ … ] }
 *
 * One round trip, not two. The client could embed and then call the RPC itself,
 * but that is two mobile round trips on the critical path of the app's core
 * interaction — and the first of them would need the OpenAI key on the device.
 * (semantic-search.md, "Implementation")
 *
 * Three stages now, not one: `search_review_candidates` retrieves a shortlist,
 * `rerank.ts` judges whether each review actually satisfies the query, and the
 * dedupe to one card per spot happens here, *after* that judgement. The order
 * matters. Collapsing to one review per spot in SQL — as `search_reviews` still
 * does — picks each spot's highest-cosine review, which for "warm cozy corner in
 * winter" is the one telling you to bring a hoodie. A judge handed only that row
 * can reject the spot and nothing else; handed all three, it can also find the
 * sibling that answers.
 *
 * The tag filter stays a hard constraint in SQL (SEARCH-3) and the judge is told
 * not to re-litigate it. What moved is SEARCH-4: the empty state is now "nothing
 * here satisfies the query" rather than "nothing cleared 0.35".
 */

import { callerClient, requireUser } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { EmbeddingError, embedTexts } from '../_shared/embedding.ts';
import {
  buildCandidates,
  fallbackSpots,
  judgeCandidates,
  RerankError,
  resolveSpots,
} from '../_shared/rerank.ts';

/**
 * A query is a phrase, not prose — `embed` allows 10k because it takes a review
 * body. Anything past this is a paste, and embedding it wastes a call to rank
 * against 15-word reviews it cannot match anyway.
 */
const MAX_QUERY_CHARS = 500;

/** There are eight amenity tags, so a longer list is malformed by definition. */
const MAX_FILTER_TAGS = 8;

/** Postgres: invalid input value for enum. */
const INVALID_ENUM = '22P02';

/**
 * One row of the shortlist. Hand-declared for the same reason `SearchReviewRow`
 * is in src/lib/search.ts: the generated types mark the left-joined columns
 * non-null and they are not.
 *
 * `spot_best` is the one column the client never sees. It exists so ordering
 * stays stable across spots after the judge reshuffles reviews within them, and
 * it is stripped on the way out.
 */
type CandidateRow = {
  review_id: string;
  spot_id: string;
  body: string;
  similarity: number;
  spot_best: number;
  area_name: string;
  building: string;
  amenity_tags: string[] | null;
  review_count: number | null;
  occupancy: string | null;
  reported_at: string | null;
  image_path: string | null;
};

/** Drops `spot_best` so the wire shape is exactly what shipped before. */
function toCard({ spot_best: _spotBest, ...card }: CandidateRow) {
  return card;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Use POST.' }, 405);
  }

  try {
    if (!(await requireUser(request))) {
      return jsonResponse({ error: 'Sign in to search.' }, 401);
    }

    let payload: { query?: unknown; filter_tags?: unknown };
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Expected a JSON body.' }, 400);
    }

    const query = payload.query;
    if (typeof query !== 'string' || query.trim().length === 0) {
      return jsonResponse({ error: 'Expected { "query": "…" } with something to search for.' }, 400);
    }
    if (query.length > MAX_QUERY_CHARS) {
      return jsonResponse({ error: `Search queries must be under ${MAX_QUERY_CHARS} characters.` }, 400);
    }

    // Shape only. The eight tag values are deliberately not listed here: the app
    // derives them from the generated schema types (src/lib/amenities.ts) so a
    // ninth tag cannot drift, and a hand-copied mirror in Deno would be exactly
    // the thing that arrangement exists to prevent. Postgres owns the vocabulary
    // and rejects anything else — that rejection is translated below.
    const rawTags = payload.filter_tags ?? [];
    if (!Array.isArray(rawTags) || !rawTags.every((t) => typeof t === 'string' && t.length > 0)) {
      return jsonResponse({ error: 'filter_tags must be an array of amenity tags.' }, 400);
    }
    if (rawTags.length > MAX_FILTER_TAGS) {
      return jsonResponse({ error: 'Too many amenity filters.' }, 400);
    }

    const trimmed = query.trim();
    const [embedding] = await embedTexts([trimmed]);

    const { data, error } = await callerClient(request).rpc('search_review_candidates', {
      // pgvector's text literal, not a JSON array. PostgREST has no vector type;
      // what Postgres accepts here is `[0.1,0.2]`, which is what stringifying a
      // number array produces. Same reason toVectorLiteral() exists on the write
      // path in src/lib/reviews.ts.
      query_embedding: JSON.stringify(embedding),
      filter_tags: rawTags,
      // candidate_pool, spot_limit, per_spot_limit and min_similarity are
      // deliberately not passed. Their defaults live in the migration, which is
      // what keeps retuning the shortlist a schema change and nothing else — and
      // what stops a client from widening the pool until the rerank bill hurts.
    });

    if (error) {
      if (error.code === INVALID_ENUM) {
        return jsonResponse({ error: 'One of those amenity filters is not a real tag.' }, 400);
      }
      console.error('search failed:', error.message);
      return jsonResponse({ error: 'The search could not be completed.' }, 500);
    }

    const rows = (data ?? []) as CandidateRow[];

    // Nothing cleared even the pool guard. No judgement to make, and no reason
    // to spend a rerank call proving it.
    if (rows.length === 0) {
      return jsonResponse({ results: [] });
    }

    const startedAt = Date.now();
    let ranked: CandidateRow[];
    let mode: 'reranked' | 'fallback';
    let verdicts: Record<string, number> = {};

    // Demo-day insurance. `supabase secrets set RERANK_ENABLED=false` puts search
    // back on pure cosine without a redeploy or a rollback.
    if (Deno.env.get('RERANK_ENABLED') === 'false') {
      ranked = fallbackSpots(rows);
      mode = 'fallback';
    } else {
      try {
        const judgements = await judgeCandidates(trimmed, buildCandidates(rows));
        ranked = resolveSpots(rows, judgements);
        mode = 'reranked';
        verdicts = judgements.reduce<Record<string, number>>((tally, j) => {
          tally[j.verdict] = (tally[j.verdict] ?? 0) + 1;
          return tally;
        }, {});
      } catch (cause) {
        // Fail open, always. A missing key, a timeout, a 529, malformed JSON —
        // none of them are worth failing a search over, because the ranking we
        // shipped last week is still a correct answer. This is the deliberate
        // split from embedding.ts, which turns a missing key into a 500: without
        // an embedding there is no search at all, whereas without a judgement
        // there is just a worse one. fallbackSpots re-applies the calibrated
        // 0.35, so degrading never means serving weak matches as matches.
        console.error(
          'search rerank degraded:',
          cause instanceof RerankError ? cause.message : cause,
        );
        ranked = fallbackSpots(rows);
        mode = 'fallback';
      }
    }

    // One line per search, for calibration and for spotting a silent fallback in
    // production. Never the review bodies, and never the account id — requireUser
    // resolves one but it does not leave the server (AUTH-4).
    console.log(
      JSON.stringify({
        at: 'search',
        mode,
        query: trimmed,
        tags: rawTags.length,
        candidates: rows.length,
        spots: ranked.length,
        verdicts,
        ms: Date.now() - startedAt,
      }),
    );

    // Zero rows is a valid answer, not an error: it is SEARCH-4, and the screen
    // renders it as "no strong match" rather than as a failure. On this path it
    // means the judge found nothing that satisfies the query; on the fallback
    // path it means nothing cleared 0.35.
    return jsonResponse({ results: ranked.map(toCard) });
  } catch (cause) {
    if (cause instanceof EmbeddingError) {
      console.error('search failed:', cause.message);
      return jsonResponse({ error: cause.message }, cause.status);
    }
    console.error('search failed:', cause);
    return jsonResponse({ error: 'The search could not be completed.' }, 500);
  }
});
