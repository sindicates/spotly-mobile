/**
 * SEARCH-5. The satisfaction judge that runs between the RPC and the response.
 *
 * Cosine distance measures topical proximity, not satisfaction. "warm" and
 * "cold" sit close together in embedding space because they appear in the same
 * contexts, so a query for a warm corner surfaces a review that says to bring a
 * hoodie. Nothing about the threshold fixes that — semantic-search.md records
 * the same limit from the other side ("parking near campus" leaks past every
 * usable min_similarity). Closing it needs a model that reads the query and the
 * review *together*, which is what this module is.
 *
 * One listwise call over the whole shortlist rather than one call per candidate:
 * the model sees a spot's reviews side by side, which is what lets it choose
 * between swapping in a better review and rejecting the spot outright. It
 * returns a verdict per review; the ordering is done here, in TypeScript, where
 * it is deterministic. Asking a model to emit a ranking invites dropped and
 * duplicated indices for no benefit.
 *
 * Every failure in here is non-fatal by design — see the note above RerankError.
 */

/** Pre-`effort` model: it predates adaptive thinking and rejects output_config.effort. */
export const RERANK_MODEL = 'claude-haiku-4-5';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * ~21 candidates × ~26 tokens of verdict is ~550. 2048 is ~3.5x headroom, and
 * the headroom matters: truncated JSON does not parse, so hitting the cap costs
 * the whole rerank rather than the last row.
 */
export const RERANK_MAX_TOKENS = 2048;

/**
 * Deliberately generous. A timeout near the median makes the same query rerank
 * on one submit and fall back on the next, which reads as flakiness and is
 * miserable to debug. Tighten this on measured p95 from calibrate-rerank.mjs,
 * not on a guess.
 */
export const RERANK_TIMEOUT_MS = 8000;

/**
 * The calibrated SEARCH-4 threshold (semantic-search.md, "The threshold").
 * It moved here rather than being deleted: the RPC's floor is now 0.15, which is
 * a guard on prompt size, not a relevance bar. If the judge is unreachable and
 * nothing re-applies 0.35, every outage answers with a page of weak matches —
 * exactly what that number was calibrated to prevent.
 */
export const FALLBACK_MIN_SIMILARITY = 0.35;

/** Matches search_reviews' old result_limit. The screen shows ~3; the rest is overflow. */
export const RESULT_LIMIT = 20;

export type Verdict = 'satisfies' | 'contradicts' | 'no_evidence';

/** One review as the model sees it. `similarity` is deliberately not in here. */
export type RerankCandidate = {
  /** 1-based, unique across the whole shortlist. The model's only handle on a row. */
  index: number;
  spotId: string;
  /** "Kelvin Smith Library — Fourth floor quiet stacks" */
  label: string;
  body: string;
};

export type RerankJudgement = {
  index: number;
  verdict: Verdict;
  strength: number;
  reason: string;
};

/**
 * Thrown for anything that stops a judgement being produced.
 *
 * Carries a status for parity with EmbeddingError, but the search function does
 * not surface it: it logs and falls back to cosine order. That is a deliberate
 * split from embedding.ts, which turns a missing key into a 500 — embeddings are
 * load-bearing (no vector, no search at all) and this is an enhancement.
 * Failing every search because the reranker is unconfigured would be strictly
 * worse than serving the ranking we shipped last week.
 */
export class RerankError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RerankError';
    this.status = status;
  }
}

/**
 * The instructions the whole feature rests on.
 *
 * Two things it has to get right at once, pulling in opposite directions:
 *
 *   * Reject the contradiction. "Gets cold near the windows" must not answer
 *     "warm cozy corner in winter", even though both are about temperature and
 *     seating — which is precisely why cosine cannot tell them apart.
 *   * Do not reject everything else. Every seeded review answers REV-11's
 *     prompt, "what's it good for, and what's the catch?", so *every* review
 *     ends in a complaint. A judge that treats any negative clause as
 *     disqualifying empties the corpus and the search returns nothing.
 *
 * The sentence that holds those apart is "a complaint only matters when it is
 * about the thing the student asked for". Both worked examples below are real
 * rows from seed.sql, quoted verbatim so the model is calibrated on the corpus
 * it will actually see. Do not paraphrase them into something tidier.
 *
 * Written plainly and with the reasons attached, rather than as a stack of
 * CRITICAL/MUST directives. Current models follow emphasis closely enough that
 * piling it on causes over-triggering — and over-triggering here means
 * over-rejecting, which is the failure mode that loses the demo.
 */
const SYSTEM_PROMPT = `You decide whether a student who searched for something would be happy sitting in a given study spot.

This is a judgement about satisfaction, not about subject matter. A review can be entirely about the thing the student asked about and still be the wrong answer, because it says the opposite.

For each numbered review, return one verdict:

- satisfies — the review gives positive evidence that what the student asked for holds here.
- contradicts — the review gives evidence that it does not hold here.
- no_evidence — the review does not speak to what was asked, either way.

Most of these reviews end with a complaint; they were written to a prompt that asked for one. A complaint only matters when it is about the thing the student asked for. Ignore complaints about anything else.

  Query: "quiet place to focus"
  Review: "Old wooden tables and tall windows, feels like a different decade. Very quiet. No outlets anywhere near the good seats, which is the whole catch."
  satisfies — the complaint is about outlets, and the student asked about quiet. The review says it is very quiet.

  Query: "warm cozy corner in winter"
  Review: "Best place on campus to actually lock in for four hours straight without talking to anyone. Gets cold near the windows, bring a hoodie even in September."
  contradicts — the student asked for warm and the review says it is cold. Both sentences are about temperature and seating, which is exactly why similarity scoring gets this one wrong.

Opposites count as contradictions even when the words differ: warm against cold, drafty, chilly; quiet against loud, noisy, chatty; "open late" against "closes at six"; spacious against cramped.

When a review simply does not address what was asked, that is no_evidence, never a weak satisfies. A student searching for parking should get nothing back rather than a lounge that happens to be on the same campus.

Amenities are not yours to judge. Tag filters — outlets, whiteboards, and the rest — were already applied as hard constraints before you saw these reviews. A spot that reached you has the tag whether or not anyone wrote about it.

strength is how strongly the review supports the query: 3 clear and direct, 2 solid, 1 weak or implied. Use 0 for contradicts and no_evidence.

reason is at most eight words. For satisfies and contradicts, quote the phrase that decided it. For no_evidence write exactly: none`;

/**
 * Structured-output schema.
 *
 * Every object needs `additionalProperties: false` and `required`. Numeric and
 * length constraints (minimum, maximum, maxItems) are not supported and are
 * silently unavailable, so `strength` is bounded by an integer enum and the
 * array length is checked in code instead.
 */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['judgements'],
  properties: {
    judgements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['i', 'verdict', 'strength', 'reason'],
        properties: {
          i: { type: 'integer' },
          verdict: { type: 'string', enum: ['satisfies', 'contradicts', 'no_evidence'] },
          strength: { type: 'integer', enum: [0, 1, 2, 3] },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

const VERDICTS: ReadonlySet<string> = new Set<Verdict>(['satisfies', 'contradicts', 'no_evidence']);

/**
 * Groups the shortlist by spot so the model weighs a spot's evidence together —
 * that adjacency is what makes "swap the review" and "reject the spot" both
 * reachable. Candidates arrive already ordered by spot, so a label change marks
 * a new group.
 *
 * Indices are integers rather than review UUIDs: a uuid is ~12 tokens, and at
 * twenty-odd candidates that is pure waste in both directions.
 */
function renderCandidates(query: string, candidates: readonly RerankCandidate[]): string {
  const lines: string[] = [`Query: ${query}`, ''];
  let currentLabel: string | null = null;
  let spotNumber = 0;

  for (const candidate of candidates) {
    if (candidate.label !== currentLabel) {
      currentLabel = candidate.label;
      spotNumber += 1;
      if (lines.length > 2) lines.push('');
      lines.push(`Spot ${spotNumber} — ${candidate.label}`);
    }
    lines.push(`  [${candidate.index}] ${candidate.body}`);
  }

  return lines.join('\n');
}

/**
 * Judges every candidate in one call.
 *
 * Throws RerankError on anything that stops a usable answer coming back. The
 * caller degrades rather than surfacing it; nothing here should end a search.
 */
export async function judgeCandidates(
  query: string,
  candidates: readonly RerankCandidate[],
): Promise<RerankJudgement[]> {
  if (candidates.length === 0) return [];

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Same shape of message as embedding.ts: a deploy without the secret is the
    // likeliest failure and is invisible in the logs unless it is said outright.
    // Unlike embedding.ts this degrades rather than 500s — see RerankError.
    throw new RerankError(
      'ANTHROPIC_API_KEY is not set on this project. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...',
      500,
    );
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      // No retry. The fallback is already a correct answer, and a retry inside
      // an 8s budget mostly turns one slow search into one very slow search.
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
      body: JSON.stringify({
        model: RERANK_MODEL,
        max_tokens: RERANK_MAX_TOKENS,
        // Valid on Haiku 4.5, which predates the removal of sampling parameters.
        // Moving to a 4.7-or-later model means deleting this line or eating a 400.
        temperature: 0,
        // `thinking` is deliberately absent. Haiku 4.5 predates adaptive
        // thinking, so omitting it means no thinking — right for a latency-bound
        // classification. `output_config.effort` is not passed either; it errors
        // on this model.
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: renderCandidates(query, candidates) }],
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      }),
    });
  } catch (cause) {
    // Timeout (AbortSignal) and connection failures both land here.
    throw new RerankError(`Anthropic request did not complete: ${String(cause)}`, 503);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new RerankError(
      `Anthropic messages request failed (${response.status}): ${detail.slice(0, 500)}`,
      response.status === 429 || response.status >= 500 ? 503 : 502,
    );
  }

  const payload = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };

  // `max_tokens` means truncated JSON, which would fail to parse a line later
  // with nothing pointing back here. `refusal` means content[0] is not text.
  if (payload.stop_reason === 'max_tokens' || payload.stop_reason === 'refusal') {
    throw new RerankError(`Anthropic stopped early: ${payload.stop_reason}`, 502);
  }

  const block = payload.content?.[0];
  if (!block || block.type !== 'text' || typeof block.text !== 'string') {
    throw new RerankError('Anthropic returned no text block.', 502);
  }

  let parsed: { judgements?: unknown };
  try {
    parsed = JSON.parse(block.text);
  } catch {
    throw new RerankError('Anthropic returned unparseable JSON.', 502);
  }

  if (!Array.isArray(parsed.judgements)) {
    throw new RerankError('Anthropic returned no judgements array.', 502);
  }

  // Per-item validation drops bad rows rather than failing the batch: one
  // malformed verdict should cost that candidate, not the whole search. Anything
  // dropped here is absent from the map and defaults to no_evidence downstream.
  const known = new Set(candidates.map((c) => c.index));
  const seen = new Set<number>();
  const judgements: RerankJudgement[] = [];

  for (const raw of parsed.judgements) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const index = item.i;
    const verdict = item.verdict;
    const strength = item.strength;

    if (typeof index !== 'number' || !known.has(index) || seen.has(index)) continue;
    if (typeof verdict !== 'string' || !VERDICTS.has(verdict)) continue;
    if (typeof strength !== 'number' || strength < 0 || strength > 3) continue;

    seen.add(index);
    judgements.push({
      index,
      verdict: verdict as Verdict,
      strength,
      reason: typeof item.reason === 'string' ? item.reason : '',
    });
  }

  return judgements;
}

/** The shape this module needs off an RPC row. The RPC returns more. */
type ResolvableRow = {
  spot_id: string;
  body: string;
  area_name: string;
  building: string;
  similarity: number;
  spot_best: number;
};

/**
 * Builds the model's view of the shortlist.
 *
 * The index↔row contract lives here and only here: **candidate index N is
 * rows[N - 1]**. resolveSpots relies on it to map a verdict back to a row
 * without carrying a second array around, so the two must change together.
 */
export function buildCandidates(rows: readonly ResolvableRow[]): RerankCandidate[] {
  return rows.map((row, position) => ({
    index: position + 1,
    spotId: row.spot_id,
    label: `${row.building} — ${row.area_name}`,
    body: row.body,
  }));
}

/**
 * Turns per-review verdicts into SEARCH-2's one card per spot.
 *
 * Pure, and the only piece of this module that can be reasoned about without a
 * network. The rules, in order:
 *
 *   1. A candidate the model skipped, duplicated, or scored invalidly counts as
 *      no_evidence. Never throw — a partial answer still ranks.
 *   2. Within a spot, keep only `satisfies` rows, best strength first.
 *   3. A spot with no satisfying review is dropped. That covers both "every
 *      review contradicts" and "nothing here speaks to the query", which is what
 *      turns the SEARCH-4 empty state into a judgement instead of a threshold.
 *   4. A satisfying review outranks a contradicting sibling rather than being
 *      cancelled by it. Deliberate: with every review carrying a complaint,
 *      letting one contradiction poison a spot would collapse recall. The spot
 *      is represented by the review that answers the question.
 */
export function resolveSpots<T extends ResolvableRow>(
  rows: readonly T[],
  judgements: readonly RerankJudgement[],
): T[] {
  const best = new Map<string, { row: T; strength: number }>();

  for (const judgement of judgements) {
    // Rule 3 lives here. Only a satisfying review can carry a spot, so a spot
    // whose every review contradicts or says nothing never enters the map.
    if (judgement.verdict !== 'satisfies') continue;

    // The buildCandidates contract: candidate index N is rows[N - 1].
    const row = rows[judgement.index - 1];
    if (!row) continue;

    const incumbent = best.get(row.spot_id);
    if (
      !incumbent ||
      judgement.strength > incumbent.strength ||
      (judgement.strength === incumbent.strength && row.similarity > incumbent.row.similarity)
    ) {
      best.set(row.spot_id, { row, strength: judgement.strength });
    }
  }

  return [...best.values()]
    .sort((a, b) => b.strength - a.strength || b.row.spot_best - a.row.spot_best)
    .slice(0, RESULT_LIMIT)
    .map((entry) => entry.row);
}

/**
 * The cosine-only ranking, used when the judge is unreachable or switched off.
 *
 * This is search_reviews' logic in TypeScript: one card per spot, that spot's
 * best-scoring review, cut at the calibrated 0.35. Not identical to what shipped
 * before — the new RPC trades breadth for per-spot depth, so this ranks ~10
 * spots rather than 20. The screen shows about three, so the difference is not
 * visible, but it is a difference.
 */
export function fallbackSpots<T extends ResolvableRow>(rows: readonly T[]): T[] {
  const best = new Map<string, T>();

  for (const row of rows) {
    if (row.spot_best < FALLBACK_MIN_SIMILARITY) continue;
    const incumbent = best.get(row.spot_id);
    if (!incumbent || row.similarity > incumbent.similarity) best.set(row.spot_id, row);
  }

  return [...best.values()]
    .sort((a, b) => b.spot_best - a.spot_best || b.similarity - a.similarity)
    .slice(0, RESULT_LIMIT);
}
