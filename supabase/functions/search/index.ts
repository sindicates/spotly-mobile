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
 * The ranking lives in `search_reviews`, not here: dedupe to one card per spot,
 * the tag filter as a hard constraint, and the similarity floor that is the
 * SEARCH-4 empty state. This function embeds and forwards.
 */

import { callerClient, requireUser } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { EmbeddingError, embedTexts } from '../_shared/embedding.ts';

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

    const [embedding] = await embedTexts([query.trim()]);

    const { data, error } = await callerClient(request).rpc('search_reviews', {
      // pgvector's text literal, not a JSON array. PostgREST has no vector type;
      // what Postgres accepts here is `[0.1,0.2]`, which is what stringifying a
      // number array produces. Same reason toVectorLiteral() exists on the write
      // path in src/lib/reviews.ts.
      query_embedding: JSON.stringify(embedding),
      filter_tags: rawTags,
      // candidate_pool, result_limit and min_similarity are deliberately not
      // passed. Their defaults live in the migration, which is what makes
      // recalibrating the SEARCH-4 threshold a schema change and nothing else —
      // and what stops a client from sending min_similarity: 0 and turning the
      // empty state into a page of weak matches presented as results.
    });

    if (error) {
      if (error.code === INVALID_ENUM) {
        return jsonResponse({ error: 'One of those amenity filters is not a real tag.' }, 400);
      }
      console.error('search failed:', error.message);
      return jsonResponse({ error: 'The search could not be completed.' }, 500);
    }

    // Zero rows is a valid answer, not an error: it is SEARCH-4, and the screen
    // renders it as "no strong match" rather than as a failure.
    return jsonResponse({ results: data ?? [] });
  } catch (cause) {
    if (cause instanceof EmbeddingError) {
      console.error('search failed:', cause.message);
      return jsonResponse({ error: cause.message }, cause.status);
    }
    console.error('search failed:', cause);
    return jsonResponse({ error: 'The search could not be completed.' }, 500);
  }
});
