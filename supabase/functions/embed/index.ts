/**
 * REV-3. Turns review text into the vector stored beside it.
 *
 *   POST /functions/v1/embed
 *   { "input": "…" }  ->  { "embedding": [1536 floats] }
 *
 * This exists because the OpenAI key is an Edge Function secret and nothing
 * else: embedding on device would mean shipping the key in the bundle. The
 * client calls this, then passes the vector to `create_review` /
 * `create_spot_with_review`. (reviews.md, write path)
 *
 * Known exposure, accepted in the feature doc: a crafted client can call the
 * write RPC with a vector that does not match its text. Blast radius is one row
 * — the attacker's own review. Closing it means embedding inside the RPC.
 */

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { EmbeddingError, embedTexts } from '../_shared/embedding.ts';

/** Generous, but bounded. A review is prose, not a payload. */
const MAX_INPUT_CHARS = 10_000;

/**
 * Rejects anything that is not a signed-in user.
 *
 * The platform's `verify_jwt` gate is not sufficient on its own: supabase-js
 * sends the anon key as a bearer token when there is no session, and that key is
 * a valid JWT, so the gateway lets it through. Resolving the token to an actual
 * user is what stops an anonymous caller spending the project's token budget.
 */
async function resolveUser(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  return response.ok;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Use POST.' }, 405);
  }

  try {
    if (!(await resolveUser(request.headers.get('Authorization')))) {
      return jsonResponse({ error: 'Sign in to post a review.' }, 401);
    }

    let payload: { input?: unknown };
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Expected a JSON body.' }, 400);
    }

    const input = payload.input;
    if (typeof input !== 'string' || input.trim().length === 0) {
      return jsonResponse({ error: 'Expected { "input": "…" } with review text.' }, 400);
    }
    if (input.length > MAX_INPUT_CHARS) {
      return jsonResponse({ error: `Review text must be under ${MAX_INPUT_CHARS} characters.` }, 400);
    }

    // The word floor is deliberately NOT re-checked here. It lives in the check
    // constraint, in src/lib/reviews.ts, and in the live counter — three places
    // that already have to agree. A fourth would be one more thing to drift.
    const [embedding] = await embedTexts([input]);
    return jsonResponse({ embedding });
  } catch (cause) {
    if (cause instanceof EmbeddingError) {
      console.error('embed failed:', cause.message);
      return jsonResponse({ error: cause.message }, cause.status);
    }
    console.error('embed failed:', cause);
    return jsonResponse({ error: 'The review could not be indexed.' }, 500);
  }
});
