export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Roughly 800 words — far above the longest plausible review, and far above any
 * search query. A spend guard, not a product rule: the only limit a user is meant
 * to feel is REV-10's 15-word floor, and that one is a minimum.
 */
export const MAX_INPUT_CHARS = 4000;

export async function embed(input: string): Promise<number[]> { 

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
        throw new Error("OpenAI API key is not set");
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {

        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: input,
            dimensions: EMBEDDING_DIMENSIONS,
        })

    });


    // Status first, parse second. A failing OpenAI call does not always answer in
    // JSON — a 502 or 503 from a proxy in front of them is HTML — so parsing
    // before checking throws on the parse and loses the status that explains it.
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`OpenAI embeddings failed (${response.status}): ${detail}`);
    }

    const responseData = await response.json();

    return responseData.data[0].embedding;
    
}
