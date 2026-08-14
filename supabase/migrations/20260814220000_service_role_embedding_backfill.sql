-- Lets the embedding backfill write vectors for reviews seeded without them.
--
-- seed.sql leaves `reviews.embedding` null on purpose (a fabricated vector ranks
-- as a real match and makes min_similarity impossible to calibrate), so every
-- seeded review is invisible to search until something backfills it. That
-- something needs a way in, and until now no role had one: the core migration
-- revoked anon and authenticated, and service_role was never granted anything to
-- begin with. It bypasses RLS but had no privilege underneath to bypass to,
-- which is why a service-role backfill fails with `permission denied` rather
-- than with an RLS error.
--
-- This does not touch AUTH-4. That invariant is about what reaches a device, and
-- service_role never does — it is a secret held by seed scripts and Edge
-- Functions. anon and authenticated stay revoked on every column.
--
-- Column-scoped deliberately. The backfill reads text and writes a vector; it
-- has no reason to see author_id, so it cannot. `id` and `body` are the read
-- side, `embedding` is both (it has to find the null ones) and the only column
-- it may write. A backfill that can rewrite `body` or flip `hidden` is a
-- moderation bypass waiting to be reached by a typo.

grant select (id, body, embedding) on public.reviews to service_role;
grant update (embedding)           on public.reviews to service_role;

-- Note for whoever writes the script: PostgREST returns the updated row by
-- default, and rendering it needs select on every column it returns. Send
-- `Prefer: return=minimal` on the PATCH or the write succeeds and the response
-- still fails.
--
-- `spots` stays fully revoked. If enriching the embedded text with building or
-- area name ever looks tempting, note that search_reviews compares a query
-- against the review body alone — text embedded with extra context is text that
-- no longer matches how it is searched.
