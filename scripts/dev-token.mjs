// Mints a local-only `authenticated` JWT for a seed user, so Edge Functions and
// authenticated RPCs can be exercised with curl — no magic link, no Mailpit, no app.
//
// This works only against local Supabase, and only by accident of it being local:
// `supabase start` uses the published demo JWT_SECRET below, and config.toml leaves
// `signing_keys_path` commented out, so tokens are HS256 and forgeable by design.
// Hosted uses a real secret. Nothing here is a credential and nothing here transfers.
//
//   node scripts/dev-token.mjs                        # first seed user
//   node scripts/dev-token.mjs <uuid> <email>         # any other
//
// Seed users are axr101@case.edu .. hly868@case.edu, ids
// 11111111-1111-4111-8111-00000000000{1..8} (supabase/seed.sql).

import { createHmac } from "node:crypto";

// From `supabase status` -> JWT_SECRET. Identical on every local Supabase install.
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const API_URL = "http://127.0.0.1:54331"; // config.toml -> [api] port

const sub = process.argv[2] ?? "11111111-1111-4111-8111-000000000001";
const email = process.argv[3] ?? "axr101@case.edu";
const now = Math.floor(Date.now() / 1000);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

const header = b64({ alg: "HS256", typ: "JWT" });
const payload = b64({
  // `sub` is what auth.uid() reads. Every security-definer RPC keys off it, so
  // this claim alone decides which seed user you are.
  sub,
  email,
  // PostgREST switches to the `authenticated` role from this claim; the grants in
  // 20260814060200_rpcs.sql are what then let the write RPCs through.
  role: "authenticated",
  aud: "authenticated",
  iss: `${API_URL}/auth/v1`,
  iat: now,
  exp: now + 60 * 60 * 12,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  // No `session_id`, deliberately. PostgREST only reads claims, so a made-up one
  // was invisible here — but GoTrue looks it up, and answers `session_not_found`
  // for a session no sign-in ever created. Edge Functions resolve the token to a
  // user through GoTrue, so a fabricated session id makes every function reject
  // this token with a 401 that looks like a bug in the function.
  is_anonymous: false,
});
const signature = createHmac("sha256", SECRET)
  .update(`${header}.${payload}`)
  .digest("base64url");

process.stdout.write(`${header}.${payload}.${signature}\n`);
