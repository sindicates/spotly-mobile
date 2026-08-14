import { embed, MAX_INPUT_CHARS } from "../_shared/embedding.ts";
import { requireUser } from "../_shared/auth.ts";

function json(body: unknown, status = 200) {

    return new Response(JSON.stringify(body), {

        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req) => {

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    const userId = await requireUser(req);
    if (!userId) {
        return json({ error: "Sign in first." }, 401);
    }

    // Its own try, so a caller sending junk is a 400 and not lumped in with an
    // OpenAI outage below. A 5xx tells the caller "retry, my fault" — a malformed
    // body will never succeed no matter how many times it is retried.
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Body must be JSON" }, 400);
    }

    const input = (body as { input?: unknown } | null)?.input;

    if (typeof input !== "string") {
        return json({ error: "Input must be a string" }, 400);
    }

    if (input.trim().length === 0) {
        return json({ error: "Input must not be empty" }, 400);
    }

    // Everything past here costs money, so the cap is checked before the call.
    if (input.length > MAX_INPUT_CHARS) {
        return json({ error: `Input must be ${MAX_INPUT_CHARS} characters or fewer` }, 400);
    }

    try {
        const embedding = await embed(input);

        if (!Array.isArray(embedding)) throw new Error('OpenAI returned no embedding');

        return json({ embedding });

    } catch (error) {

        console.error(error);
        return json({ error: "Embedding failed"}, 500);

    }

});