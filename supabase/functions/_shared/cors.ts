/**
 * CORS headers for the browser preflight.
 *
 * Native never sends one, but `expo-router` builds a web target too, and without
 * these the function works on device and fails only on web — the kind of split
 * that gets found late.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** JSON response with CORS applied. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
