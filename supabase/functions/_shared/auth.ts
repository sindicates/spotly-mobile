/**
 * The signed-in check every function runs before spending an OpenAI budget.
 *
 * `verify_jwt` at the gateway is not this check. It only proves the bearer is a
 * JWT this project signed — and the anon key is exactly that, shipped inside the
 * app bundle. Resolving the token to a *user* is what separates a signed-in
 * student from anyone who unzipped the IPA.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Returns the caller's account id, or null when there is no signed-in user
 * behind the request. Null is the caller's cue to return 401 — this returns
 * rather than throws so it cannot be swallowed by a catch block meant for
 * OpenAI failures and reported as a 500.
 */
export async function requireUser(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;

  // SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform and by
  // `functions serve` — that is what the "Env name cannot start with SUPABASE_"
  // startup message is about. Do not put them in .env.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      // Forwarding the caller's header is the load-bearing part: it makes
      // getUser() evaluate *their* token. Without it the client authenticates as
      // anon, finds no user, and every request 401s — including the valid ones.
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  // AUTH-4: for logging and rate-limit decisions only. This never goes into a
  // response body — the account id does not leave the server.
  return data.user.id;
}
