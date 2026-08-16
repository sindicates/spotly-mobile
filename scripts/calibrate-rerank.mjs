// Measures what the rerank pass (SEARCH-5) actually changed, against labelled
// expectations rather than a similarity spread.
//
//   npm run functions:serve      # in another shell — this calls `search`
//   npm run db:embeddings        # the corpus has to be indexed first
//   node scripts/calibrate-rerank.mjs
//
// calibrate-search.mjs answers "where should the threshold go", which stopped
// being the question once a model owns the empty state. This one answers three
// different ones:
//
//   1. Did recall survive? Every seeded review answers REV-11 — "what's it good
//      for, and what's the catch?" — so every single one ends in a complaint. A
//      judge that reads any negative clause as disqualifying returns nothing for
//      everything, and the failure looks like a working build until you try it.
//      This is the number to read first. If it regressed, loosen the prompt in
//      _shared/rerank.ts; do not loosen the resolver.
//   2. Did the two bugs actually get fixed? "warm cozy corner in winter" must
//      stop returning the review that says to bring a hoodie, and "parking near
//      campus" must return nothing at all.
//   3. What did it cost? Latency per query, and whether two identical runs
//      disagree — temperature 0 should make them identical but does not promise
//      it, and a reranker that reshuffles between submits is worse than a slow
//      one.
//
// Reads through `search` rather than assembling the pipeline here, deliberately:
// this is calibrating the production path, and a ranking produced any other way
// is not the ranking the app will show. It also calls search_reviews directly
// for the before/after column — that RPC is still installed precisely so this
// comparison stays possible.
//
// Not a test. It prints; a human reads it and decides.

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

// `expect` is the recall/precision contract: "match" must return something,
// "none" must return nothing. `must` names an area_name that has to appear in
// the top three; `mustNot` names one that must not appear anywhere.
//
// The first ten are calibrate-search.mjs's set, unchanged, so a regression in
// the queries the threshold was tuned on is visible. The last two are the
// adversarial pair the rerank pass exists for — and "quiet place to focus" is
// the recall guard: Sears' rear reading room is very quiet and its catch is
// about outlets, so a judge that over-rejects will drop it and reveal itself.
const QUERIES = [
  { q: "somewhere to lock in for a few hours", expect: "match" },
  { q: "quiet corner with an outlet", expect: "match" },
  { q: "group project room with a whiteboard", expect: "match" },
  { q: "open late during finals week", expect: "match" },
  { q: "good natural light and a view", expect: "match" },
  { q: "somewhere to eat while I study", expect: "match" },
  { q: "background noise, not total silence", expect: "match" },
  { q: "where to buy textbooks", expect: "none" },
  { q: "parking near campus", expect: "none" },
  { q: "how do I drop a class", expect: "none" },
  {
    q: "warm cozy corner in winter",
    expect: "match",
    must: "Second floor bench nook",
    mustNot: "Fourth floor quiet stacks",
  },
  { q: "quiet place to focus", expect: "match", must: "Rear reading room" },
];

/** The production path: embeds, retrieves, judges, dedupes. */
async function search(query) {
  const started = Date.now();
  const body = await json(
    await fetch(`${API}/functions/v1/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    }),
  );
  return { rows: body.results ?? [], ms: Date.now() - started };
}

/** The ranking before this change, for the before/after column. */
async function cosineOnly(query) {
  const { embedding } = await json(
    await fetch(`${API}/functions/v1/embed`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: query }),
    }),
  );
  return json(
    await fetch(`${API}/rest/v1/rpc/search_reviews`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query_embedding: JSON.stringify(embedding) }),
    }),
  );
}

const areas = (rows) => rows.map((r) => r.area_name);
const line = (r) =>
  `   ${r.similarity.toFixed(3)}  ${`${r.building} — ${r.area_name}`.slice(0, 58)}`;

const timings = [];
const failures = [];
let recallHits = 0;
let recallTotal = 0;
let precisionHits = 0;
let precisionTotal = 0;
let unstable = 0;

for (const { q, expect, must, mustNot } of QUERIES) {
  const first = await search(q);
  // Same query twice. Any difference is nondeterminism the UI would show as a
  // reshuffle between one submit and the next.
  const second = await search(q);
  const before = await cosineOnly(q);

  timings.push(first.ms, second.ms);
  const rows = first.rows;
  const top = areas(rows);
  const stable = JSON.stringify(top) === JSON.stringify(areas(second.rows));
  if (!stable) unstable += 1;

  console.log(`\n"${q}"  (expect ${expect})  ${first.ms}ms${stable ? "" : "  UNSTABLE"}`);
  if (rows.length === 0) console.log("   no results");
  for (const r of rows.slice(0, 3)) console.log(line(r));
  if (rows.length > 3) console.log(`   … and ${rows.length - 3} more`);

  if (expect === "match") {
    recallTotal += 1;
    if (rows.length > 0) recallHits += 1;
    else failures.push(`${q} — returned nothing (recall)`);
  } else {
    precisionTotal += 1;
    if (rows.length === 0) precisionHits += 1;
    else failures.push(`${q} — returned ${rows.length} (should be empty)`);
  }

  if (must) {
    const ok = top.slice(0, 3).includes(must);
    console.log(`   ${ok ? "PASS" : "FAIL"}  must appear in top 3: ${must}`);
    if (!ok) failures.push(`${q} — "${must}" missing from top 3`);
  }
  if (mustNot) {
    const ok = !top.includes(mustNot);
    console.log(`   ${ok ? "PASS" : "FAIL"}  must not appear: ${mustNot}`);
    if (!ok) failures.push(`${q} — "${mustNot}" still present`);
  }

  console.log(`   before: ${areas(before).slice(0, 3).join(", ") || "(none)"}`);
}

const sorted = [...timings].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

console.log(`\n${"─".repeat(72)}`);
console.log(`Recall     ${recallHits}/${recallTotal} on-topic queries returned results`);
console.log(`Precision  ${precisionHits}/${precisionTotal} off-topic queries returned nothing`);
console.log(`Latency    p50 ${pct(0.5)}ms   p95 ${pct(0.95)}ms   max ${sorted.at(-1)}ms`);
console.log(`Stability  ${QUERIES.length - unstable}/${QUERIES.length} queries identical across two runs`);

if (failures.length === 0) {
  console.log("\nAll assertions passed.");
} else {
  console.log(`\n${failures.length} failing:`);
  for (const f of failures) console.log(`  - ${f}`);
  // Recall first. An empty search reads as a broken build; a leaked weak match
  // reads as a mediocre one.
  console.log("\nRecall failures come first — loosen the prompt, not the resolver.");
}
