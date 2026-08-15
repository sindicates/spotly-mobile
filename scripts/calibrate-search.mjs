// Prints the similarity spread behind SEARCH-4, so `min_similarity` can be set
// from evidence rather than left at the placeholder the doc shipped with.
//
//   npm run functions:serve      # in another shell — this calls `embed`
//   npm run db:embeddings        # the corpus has to be indexed first
//   node scripts/calibrate-search.mjs
//
// Runs ten queries: seven a student would actually type, and three that campus
// study-spot reviews have no answer for. The bad ones are the point. The rule in
// semantic-search.md is "set the threshold between the worst good match and the
// best bad one", and without queries that *should* return nothing there is no
// upper bound to place it under — every threshold looks fine if you only ever
// test things that work.
//
// Reads through `embed` rather than calling OpenAI directly, deliberately: this
// is calibrating the production search path, and a query vector produced any
// other way is not the vector search will actually use. It then calls
// search_reviews with min_similarity 0 to see everything the threshold would
// cut, which is the part a response from `search` can never show you.
//
// Not a test. It prints; a human reads it and picks the number.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

// dev-token.mjs writes a bare token to stdout precisely so it can be consumed
// this way. Do not refactor it to export a function — `$(npm run -s dev:token)`
// in the README depends on that shape.
const token = execFileSync(process.execPath, ["scripts/dev-token.mjs"], {
  encoding: "utf8",
}).trim();

const headers = {
  apikey: ANON,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const json = async (res) => {
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
};

/** `match` = should return spots. `none` = should fall below the threshold. */
const QUERIES = [
  ["somewhere to lock in for a few hours", "match"],
  ["quiet corner with an outlet", "match"],
  ["group project room with a whiteboard", "match"],
  ["open late during finals week", "match"],
  ["good natural light and a view", "match"],
  ["somewhere to eat while I study", "match"],
  ["background noise, not total silence", "match"],
  ["where to buy textbooks", "none"],
  ["parking near campus", "none"],
  ["how do I drop a class", "none"],
];

async function scores(query) {
  let embedding;
  try {
    ({ embedding } = await json(
      await fetch(`${API}/functions/v1/embed`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: query }),
      }),
    ));
  } catch (cause) {
    throw new Error(`embed failed for "${query}" — is \`npm run functions:serve\` running? ${cause.message}`);
  }

  // Straight to the RPC, not through `search`. min_similarity 0 is the whole
  // point: it shows the scores the threshold would discard.
  return json(
    await fetch(`${API}/rest/v1/rpc/search_reviews`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query_embedding: JSON.stringify(embedding),
        candidate_pool: 200,
        result_limit: 50,
        min_similarity: 0,
      }),
    }),
  );
}

const tops = { match: [], none: [] };

for (const [query, expect] of QUERIES) {
  const rows = await scores(query);
  const label = expect === "match" ? "should match" : "SHOULD NOT MATCH";
  console.log(`\n"${query}"  (${label})`);

  if (rows.length === 0) {
    console.log("   no rows at all");
    continue;
  }
  tops[expect].push({ query, top: rows[0].similarity });

  for (const row of rows.slice(0, 5)) {
    const where = `${row.building} — ${row.area_name}`.slice(0, 52).padEnd(52);
    console.log(`   ${row.similarity.toFixed(3)}  ${where}  ${row.body.slice(0, 44)}…`);
  }
}

// The band. A threshold above every off-topic query's best score makes those
// return nothing (SEARCH-4); below every on-topic query's best score keeps those
// working. Anything inside satisfies both.
const worstGood = Math.min(...tops.match.map((t) => t.top));
const bestBad = Math.max(...tops.none.map((t) => t.top));
const worstGoodQuery = tops.match.find((t) => t.top === worstGood);
const bestBadQuery = tops.none.find((t) => t.top === bestBad);

console.log(`\n${"─".repeat(72)}`);
console.log(`Worst good match: ${worstGood.toFixed(3)}  "${worstGoodQuery.query}"`);
console.log(`Best bad match:   ${bestBad.toFixed(3)}  "${bestBadQuery.query}"`);
console.log(
  bestBad < worstGood
    ? `\nUsable band: ${bestBad.toFixed(3)} .. ${worstGood.toFixed(3)}  ` +
        `(midpoint ${((bestBad + worstGood) / 2).toFixed(3)})`
    : `\nNo separation — the best off-topic score beats the worst on-topic one. ` +
        `No single threshold satisfies SEARCH-4 against this corpus.`,
);
