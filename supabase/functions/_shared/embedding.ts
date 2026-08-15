/**
 * The one place an embedding is produced. Imported by `embed` and by `search`.
 *
 * Shared rather than duplicated because the model and its dimension count are a
 * contract with the database, not a local choice: `reviews.embedding` is
 * `vector(1536)`, so a function that quietly switched models would either fail
 * every insert or — worse, if the dimensions happened to match — write vectors
 * into an index they cannot be compared against. Both callers import these
 * constants; neither hardcodes them. (TECH_STACK.md, "Embeddings")
 */

export const EMBEDDING_MODEL = 'text-embedding-3-small';

/** Must equal the `vector(n)` width on `reviews.embedding`. */
export const EMBEDDING_DIMENSIONS = 1536;

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

/** Thrown for anything the caller should see a specific status for. */
export class EmbeddingError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EmbeddingError';
    this.status = status;
  }
}

/**
 * Embeds one or more strings in a single OpenAI call.
 *
 * Batched by design even though `embed` passes one string: seeding runs every
 * review body through in one request, and `search` embeds a single query. One
 * function covering both is what stops a second, drifting implementation from
 * appearing the first time someone needs a batch.
 *
 * OpenAI returns embeddings out of order under batching, so results are sorted
 * back to input order by `index` rather than trusted as received.
 */
export async function embedTexts(inputs: readonly string[]): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    // A deploy without the secret set is the likeliest failure here, and it is
    // invisible from the client unless it is said out loud.
    throw new EmbeddingError(
      'OPENAI_API_KEY is not set on this project. Run: supabase secrets set OPENAI_API_KEY=sk-...',
      500,
    );
  }

  if (inputs.length === 0) return [];

  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });

  if (!response.ok) {
    const detail = await response.text();
    // 429 and 5xx are retryable upstream; passing the status through rather than
    // flattening to 500 is what lets a caller tell "try again" from "give up".
    throw new EmbeddingError(
      `OpenAI embeddings request failed (${response.status}): ${detail.slice(0, 500)}`,
      response.status === 429 || response.status >= 500 ? 503 : 502,
    );
  }

  const payload = (await response.json()) as {
    data?: { index: number; embedding: number[] }[];
  };
  const rows = payload.data;
  if (!rows || rows.length !== inputs.length) {
    throw new EmbeddingError('OpenAI returned an unexpected embeddings payload.', 502);
  }

  const ordered = [...rows].sort((a, b) => a.index - b.index).map((row) => row.embedding);

  // Guard the database contract at the boundary. A wrong-width vector is
  // otherwise a 400 from PostgREST much later, with nothing pointing back here.
  for (const embedding of ordered) {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(
        `Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings, got ${embedding.length}.`,
        502,
      );
    }
  }

  return ordered;
}
