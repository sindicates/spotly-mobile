// Signs the app in on the booted iOS simulator, without touching the UI.
//
// Runs the real magic-link flow end to end — request link, read it out of
// Mailpit, exchange it for a session — then fires the resulting deep link at the
// simulator. The app's own callback route handles it, so this exercises the
// production path rather than bypassing it.
//
//   npm run dev:signin                  # first seed user
//   npm run dev:signin jpu9@case.edu    # any user that exists in auth.users
//
// Note this is NOT scripts/dev-token.mjs. That mints a bare access token for
// curl; it deliberately cannot sign the app in, because supabase-js `setSession`
// needs a refresh token and only GoTrue can issue one. Anything driving the app
// needs a real session, which means a real link. Hence this script.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAILPIT = "http://127.0.0.1:54334";
const email = process.argv[2] ?? "axr101@case.edu";

// Reuse the app's own env so the script and the simulator always agree on which
// Supabase they mean — the app points at a LAN IP so a physical device can reach
// it, and a hardcoded 127.0.0.1 here would silently sign into a different stack.
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const API = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!API || !ANON) throw new Error("Missing Supabase vars in .env");
if (!API.includes("127.0.0.1") && !/:\/\/(\d|localhost)/.test(API)) {
  throw new Error(`Refusing to run against a non-local Supabase: ${API}`);
}

const headers = { apikey: ANON, "Content-Type": "application/json" };
const json = async (res) => {
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
};

// 1. Ask for the link. create_user:false so a typo'd address fails loudly here
// rather than quietly creating an account that then fails the .edu gate.
const before = (await json(await fetch(`${MAILPIT}/api/v1/messages?limit=1`))).messages[0]?.ID;
const otp = await fetch(`${API}/auth/v1/otp`, {
  method: "POST",
  headers,
  body: JSON.stringify({ email, create_user: false }),
});
if (!otp.ok) throw new Error(`otp request failed: ${otp.status} ${await otp.text()}`);

// 2. Wait for it to land. Mailpit is a local container, so this is fast, but the
// send is async on GoTrue's side and polling beats an arbitrary sleep.
let message;
for (let i = 0; i < 40; i++) {
  const list = await json(await fetch(`${MAILPIT}/api/v1/messages?limit=1`));
  const newest = list.messages[0];
  if (newest && newest.ID !== before && newest.To.some((t) => t.Address === email)) {
    message = newest;
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}
if (!message) throw new Error(`No mail for ${email} — is that address in auth.users?`);

const body = await json(await fetch(`${MAILPIT}/api/v1/message/${message.ID}`));
const token = ((body.Text || body.HTML).match(/token=([a-f0-9]+)/) || [])[1];
if (!token) throw new Error("Could not find a token in the email body");

// 3. Exchange it. The parameter is `token_hash`, not `token` — `token` is the
// six-digit OTP variant and rejects the hashed value the link carries.
const session = await json(
  await fetch(`${API}/auth/v1/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "magiclink", token_hash: token }),
  }),
);

// 4. Hand it to the app exactly as the real link would. Tokens go in the
// fragment because auth-js uses the implicit flow; src/lib/auth-url.ts parses
// the fragment by hand for that reason, and src/app/auth/callback.tsx calls
// setSession with what it finds.
const deepLink =
  `spotly://auth/callback#access_token=${session.access_token}` +
  `&refresh_token=${session.refresh_token}` +
  `&expires_in=${session.expires_in}&token_type=bearer&type=magiclink`;

execFileSync("xcrun", ["simctl", "openurl", "booted", deepLink], { stdio: "inherit" });
console.log(`Signed in as ${session.user.email} (${session.user.id})`);
