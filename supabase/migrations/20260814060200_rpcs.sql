-- The client's entire write surface, plus search.
--
-- Every function here is `security definer` so it can reach tables the caller
-- has no privilege on, and every one of them derives the account ID from
-- auth.uid() rather than accepting it as a parameter. A caller cannot write a
-- row attributed to someone else because there is no argument through which to
-- try (AUTH-4).
--
-- `set search_path = ''` on all of them: a definer function that resolves names
-- through the caller's search_path is how a definer function gets hijacked.
-- Everything is schema-qualified as a consequence, including the pgvector
-- operator, which has to be written `operator(extensions.<=>)`.
--
-- Errors are raised with a stable message plus a human hint. The message is
-- what the UI switches on ('review_exists'), the hint is what it can show.


-- ---------------------------------------------------------------------------
-- create_spot_with_review  (SPOT-3, SPOT-5, AMEN-2)
-- ---------------------------------------------------------------------------
-- Spot and first review in one transaction. A spot with zero reviews violates
-- SPOT-3 and would sit in the catalog as an empty shell, so the two writes are
-- not separately callable.
--
-- This is also the only path that ever sets amenity_tags. There is no update or
-- delete on spots anywhere in this file, which is what makes AMEN-2's
-- write-once real rather than a convention.

create function public.create_spot_with_review(
  p_building_id  uuid,
  p_area_name    text,
  p_amenity_tags public.amenity_tag[] default '{}',
  p_body         text default null,
  p_embedding    extensions.vector(1536) default null
)
returns table (spot_id uuid, review_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid := auth.uid();
  v_spot   uuid;
  v_review uuid;
begin
  if v_author is null then
    raise exception 'not_authenticated' using hint = 'Sign in first.';
  end if;

  begin
    insert into public.spots (building_id, area_name, amenity_tags, created_by)
    values (p_building_id, btrim(p_area_name), coalesce(p_amenity_tags, '{}'), v_author)
    returning id into v_spot;
  exception when unique_violation then
    -- The client already ran the inline dupe check (SPOT-5); this is the race
    -- and the case where it was ignored.
    raise exception 'spot_exists'
      using hint = 'That spot is already listed in this building.';
  end;

  -- Deliberately not deferred to create_review: doing it here keeps both rows
  -- in one statement's transaction, so a failing word-floor check rolls the
  -- spot back too.
  insert into public.reviews (spot_id, author_id, body, embedding)
  values (v_spot, v_author, btrim(p_body), p_embedding)
  returning id into v_review;

  return query select v_spot, v_review;
end;
$$;


-- ---------------------------------------------------------------------------
-- create_review  (REV-1, REV-3)
-- ---------------------------------------------------------------------------

create function public.create_review(
  p_spot_id   uuid,
  p_body      text,
  p_embedding extensions.vector(1536) default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid := auth.uid();
  v_review uuid;
begin
  if v_author is null then
    raise exception 'not_authenticated' using hint = 'Sign in first.';
  end if;

  insert into public.reviews (spot_id, author_id, body, embedding)
  values (p_spot_id, v_author, btrim(p_body), p_embedding)
  returning id into v_review;

  return v_review;

exception when unique_violation then
  -- The onboarding first-review screen has to treat this as "already
  -- contributed — unlock", not as an error: the onboarding flag is per-install
  -- (onboarding.md), so a reinstall walks a returning user back into a review
  -- they already wrote.
  raise exception 'review_exists'
    using hint = 'You have already reviewed this spot.';
end;
$$;


-- ---------------------------------------------------------------------------
-- update_review  (REV-1)
-- ---------------------------------------------------------------------------
-- Body only. Ownership is a WHERE clause, not a check on a passed-in ID.

create function public.update_review(
  p_review_id uuid,
  p_body      text,
  p_embedding extensions.vector(1536) default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid := auth.uid();
  v_review uuid;
begin
  if v_author is null then
    raise exception 'not_authenticated' using hint = 'Sign in first.';
  end if;

  update public.reviews
     set body       = btrim(p_body),
         -- Text and vector move together or the row is left unembedded rather
         -- than embedded with its previous, now-wrong, text.
         embedding  = p_embedding,
         updated_at = now()
   where id = p_review_id
     and author_id = v_author
     and not hidden
  returning id into v_review;

  if v_review is null then
    raise exception 'review_not_found'
      using hint = 'That review does not exist or is not yours.';
  end if;

  return v_review;
end;
$$;


-- ---------------------------------------------------------------------------
-- increment_expand  (REV-5, REV-6)
-- ---------------------------------------------------------------------------
-- Feeds trending_score. Debounce to once per review per session on the client;
-- there is no server-side dedupe because the counter is a ranking signal, not
-- a metric anyone reads.

create function public.increment_expand(p_review_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reviews
     set expand_count = expand_count + 1
   where id = p_review_id
     and not hidden;
$$;


-- ---------------------------------------------------------------------------
-- create_check_in  (OCC-1, OCC-2, OCC-6)
-- ---------------------------------------------------------------------------
-- The 15-minute rate limit is the BEFORE INSERT trigger from the core
-- migration, not a check here, so it applies to any future write path too.
-- Returns the timestamp so the UI can render the pill without a refetch.

create function public.create_check_in(
  p_spot_id uuid,
  p_status  public.occupancy_status
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid := auth.uid();
  v_at     timestamptz;
begin
  if v_author is null then
    raise exception 'not_authenticated' using hint = 'Sign in first.';
  end if;

  insert into public.check_ins (spot_id, author_id, status)
  values (p_spot_id, v_author, p_status)
  returning created_at into v_at;

  return v_at;
end;
$$;


-- ---------------------------------------------------------------------------
-- report_review  (MOD-1, MOD-2)
-- ---------------------------------------------------------------------------
-- Reporters cannot see the queue, so there is no select path on `reports` for
-- anyone but the dashboard. A second report of the same review by the same
-- person updates the reason instead of flooding the queue.

create function public.report_review(
  p_review_id uuid,
  p_reason    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter uuid := auth.uid();
  v_report   uuid;
begin
  if v_reporter is null then
    raise exception 'not_authenticated' using hint = 'Sign in first.';
  end if;

  insert into public.reports (review_id, reporter_id, reason)
  values (p_review_id, v_reporter, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (review_id, reporter_id) do update
    set reason = coalesce(excluded.reason, public.reports.reason)
  returning id into v_report;

  return v_report;
end;
$$;


-- ---------------------------------------------------------------------------
-- search_reviews  (SEARCH-1..4)
-- ---------------------------------------------------------------------------
-- Called by the `search` Edge Function, which embeds the query first. The
-- traps, all of which are silent failures rather than errors:
--
--   * `<=>` is cosine DISTANCE. Similarity is 1 - distance. The candidate scan
--     orders by distance ascending so the HNSW index is actually used; ordering
--     by similarity descending is equivalent arithmetic and unindexable.
--   * `distinct on` requires its expression to lead the ORDER BY, which is why
--     best_per_spot sorts by spot_id first and similarity second (SEARCH-2:
--     one card per spot, that spot's best-matching review).
--   * The occupancy join must stay LEFT. A missing report is null and renders
--     "no recent reports" (OCC-4) — an inner join would silently drop every
--     spot nobody has checked into.
--   * min_similarity IS the SEARCH-4 empty state. Zero rows means "no strong
--     match", not "no results". 0.25 is a placeholder: after seeding, run ten
--     real queries, log the spread, and set it between the worst good match and
--     the best bad one.

create function public.search_reviews(
  query_embedding extensions.vector(1536),
  filter_tags     public.amenity_tag[] default '{}',
  candidate_pool  int default 100,
  result_limit    int default 20,
  min_similarity  float default 0.25
)
returns table (
  review_id uuid, spot_id uuid, body text, similarity float,
  area_name text, building text, amenity_tags public.amenity_tag[],
  review_count bigint,
  occupancy public.occupancy_status,   -- null = no recent report
  reported_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select r.id as review_id, r.spot_id, r.body,
           1 - (r.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.reviews r
    join public.spots s on s.id = r.spot_id
    where r.hidden = false
      and r.embedding is not null
      -- SEARCH-3: hard constraint, never a ranking signal.
      and (cardinality(filter_tags) = 0 or s.amenity_tags @> filter_tags)
    order by r.embedding operator(extensions.<=>) query_embedding
    limit candidate_pool
  ),
  best_per_spot as (
    select distinct on (c.spot_id) c.*
    from candidates c
    order by c.spot_id, c.similarity desc
  )
  select b.review_id, b.spot_id, b.body, b.similarity,
         s.area_name, bl.name, s.amenity_tags,
         (select count(*) from public.reviews r2
            where r2.spot_id = b.spot_id and not r2.hidden),
         o.status, o.reported_at
  from best_per_spot b
  join public.spots s      on s.id = b.spot_id
  join public.buildings bl on bl.id = s.building_id
  left join public.spot_occupancy o on o.spot_id = b.spot_id
  where b.similarity >= min_similarity
  order by b.similarity desc
  limit result_limit;
$$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which on a definer
-- function means anon can call it. Revoke first, then grant deliberately.

revoke execute on function public.create_spot_with_review(uuid, text, public.amenity_tag[], text, extensions.vector) from public, anon;
revoke execute on function public.create_review(uuid, text, extensions.vector)                                       from public, anon;
revoke execute on function public.update_review(uuid, text, extensions.vector)                                       from public, anon;
revoke execute on function public.increment_expand(uuid)                                                             from public, anon;
revoke execute on function public.create_check_in(uuid, public.occupancy_status)                                     from public, anon;
revoke execute on function public.report_review(uuid, text)                                                          from public, anon;
revoke execute on function public.search_reviews(extensions.vector, public.amenity_tag[], int, int, float)            from public, anon;

grant execute on function public.create_spot_with_review(uuid, text, public.amenity_tag[], text, extensions.vector) to authenticated;
grant execute on function public.create_review(uuid, text, extensions.vector)                                       to authenticated;
grant execute on function public.update_review(uuid, text, extensions.vector)                                       to authenticated;
grant execute on function public.increment_expand(uuid)                                                             to authenticated;
grant execute on function public.create_check_in(uuid, public.occupancy_status)                                     to authenticated;
grant execute on function public.report_review(uuid, text)                                                          to authenticated;
grant execute on function public.search_reviews(extensions.vector, public.amenity_tag[], int, int, float)            to authenticated;
