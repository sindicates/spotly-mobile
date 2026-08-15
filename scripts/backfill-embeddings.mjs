// Fills in `reviews.embedding` for every row that does not have one yet.
//
// seed.sql leaves the column null on purpose — a fabricated vector ranks as a
// real match and makes min_similarity impossible to calibrate — so every seeded
// review is invisible to search_reviews until this runs. Reviews posted while
// OPENAI_API_KEY was unset land in the same state (tryEmbedReviewBody returns
// null rather than blocking the write), so this is not a one-time seeding step.
//
//   npm run db:embeddings
//
// Safe to re-run: the query is `embedding is null`, so a second pass finds
// nothing and says so. That is also how you verify the first one finished.
//
// Deliberately NOT going through the `embed` Edge Function. That endpoint takes
// one string per request, and the plan for a corpus has always been one batched
// OpenAI call rather than one per row (seed.sql, semantic-search.md). It calls
// OpenAI directly for the same reason, and reads OPENAI_API_KEY from .env — this
// runs on a laptop, not on a device, so the key never ships anywhere.
//
// Deliberately NOT guarded to localhost, unlike dev-signin.mjs. Backfilling a
// hosted project is a legitimate run; point .env at it and go. It prints the
// host and the row count before writing anything so you can see which it is.

import { readFileSync } from "node:fs";

// Mirrors supabase/functions/_shared/embedding.ts, which is the source of truth.
// Node cannot import that file (Deno, .ts), so these are copied — and a copy that
// drifts is the exact failure the shared module exists to prevent: a wrong model
// still returns 1536 valid floats, still writes, and search silently degrades
// into ranking by noise. Hence the length assertion before every write.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

// Rows per OpenAI call. Well inside the endpoint's input limits for prose this
// short, and it bounds how much work is lost if a single request fails.
const PAGE_SIZE = 100;

// Same hand-rolled .env parse as dev-signin.mjs — no dotenv dependency, and
// reusing the app's file means the script and the app agree on which stack they
// mean (the URL is a LAN IP so a physical device can reach it).
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
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = env.OPENAI_API_KEY;

if (!API) throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL in .env");
if (!SERVICE_ROLE) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY in .env");

// service_role bypasses RLS, but bypassing RLS is not the same as having a
// privilege underneath it — 20260814220000 is the migration that grants one, and
// it is column-scoped: select on (id, body, embedding), update on (embedding)
// alone. A backfill that could rewrite `body` or flip `hidden` is a moderation
// bypass waiting to be reached by a typo.
const restHeaders = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

const json = async (res) => {
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
};

/** How many reviews are still unembedded, via PostgREST's exact count header. */
async function countPending() {
  const res = await fetch(
    `${API}/rest/v1/reviews?select=id&embedding=is.null&limit=1`,
    { headers: { ...restHeaders, Prefer: "count=exact" } },
  );
  if (!res.ok) {
    const detail = await res.text();
    // A key the stack does not recognise is not rejected outright — PostgREST
    // falls through to anon, which was revoked on this table in the core
    // migration, so the symptom is a permission error naming a role this script
    // never asked for. Worth translating: the usual cause is a .env holding the
    // hosted key while the URL points at local (or the reverse).
    if (detail.includes("anon")) {
      throw new Error(
        `Request ran as anon, not service_role. SUPABASE_SERVICE_ROLE_KEY in .env ` +
          `does not belong to the stack at ${new URL(API).host}. ` +
          `For local, use SECRET_KEY from \`supabase status\`.`,
      );
    }
    throw new Error(`count failed: ${res.status} ${detail}`);
  }
  // Content-Range: 0-0/57
  return Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
}

/**
 * One OpenAI call for the whole batch.
 *
 * The two guards here are the ones _shared/embedding.ts documents and this file
 * cannot inherit: OpenAI returns embeddings out of order under batching, so the
 * response is sorted back to input order by `index` rather than trusted as
 * received, and a short response would otherwise pair vectors with the wrong
 * review ids — silently, and permanently.
 */
async function embedTexts(inputs) {
  const payload = await json(
    await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
    }),
  );

  const rows = payload.data;
  if (!rows || rows.length !== inputs.length) {
    throw new Error(
      `OpenAI returned ${rows?.length ?? 0} embeddings for ${inputs.length} inputs.`,
    );
  }
  return [...rows].sort((a, b) => a.index - b.index).map((row) => row.embedding);
}

/**
 * Writes one vector.
 *
 * `Prefer: return=minimal` is not optional. PostgREST returns the updated row by
 * default and rendering it needs select on every column it returns — the grant
 * covers three. Without this header the write succeeds and the response fails,
 * which reads as a failed backfill that actually half-worked.
 *
 * The value goes over the wire as pgvector's text literal, `[0.1,0.2]`, for the
 * same reason toVectorLiteral() exists in src/lib/reviews.ts: PostgREST has no
 * vector type, and what Postgres accepts here is text.
 */
async function writeEmbedding(id, embedding) {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings, got ${embedding.length}. ` +
        `Check EMBEDDING_MODEL against supabase/functions/_shared/embedding.ts.`,
    );
  }
  const res = await fetch(`${API}/rest/v1/reviews?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...restHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ embedding: JSON.stringify(embedding) }),
  });
  if (!res.ok) throw new Error(`PATCH ${id} failed: ${res.status} ${await res.text()}`);
}

console.log(`Target: ${API}`);
const pending = await countPending();
console.log(`${pending} review${pending === 1 ? "" : "s"} without an embedding.`);

// Page without an offset. The filter is `embedding is null` and each pass clears
// exactly the rows it read, so the next page is the remainder — an offset here
// would skip rows as the result set shrinks under it. Any failure throws, so a
// page can never come back unchanged and loop forever.
//
// Note this includes hidden reviews. The grant does not cover `hidden`, and
// Postgres needs select on any column named in a where clause, so they cannot be
// excluded here. That is the right outcome anyway: search_reviews filters hidden
// itself, and un-hiding a moderated review should not leave it unsearchable.
let written = 0;
while (written < pending) {
  const rows = await json(
    await fetch(
      `${API}/rest/v1/reviews?select=id,body&embedding=is.null&limit=${PAGE_SIZE}`,
      { headers: restHeaders },
    ),
  );
  if (rows.length === 0) break;

  // Bodies alone, never enriched with the building or area name. search_reviews
  // compares a query against the review body, so text embedded with extra
  // context is text that no longer matches how it is searched.
  const embeddings = await embedTexts(rows.map((r) => r.body));

  for (const [i, row] of rows.entries()) {
    await writeEmbedding(row.id, embeddings[i]);
  }
  written += rows.length;
  console.log(`  ${written}/${pending}`);
}

const remaining = await countPending();
console.log(`Done. ${written} embedded, ${remaining} remaining.`);
