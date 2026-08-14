-- ONB-2, ONB-6: the taste survey is stored and deliberately unused in v1.
--
-- It exists to feed personalised recommendations later, which is why it is on
-- the server at all — it is the one part of onboarding that is not routing
-- state. The completion flag went the other way, to device-local MMKV, because
-- nothing server-side ever read it (onboarding.md, 2026-08-14).
--
-- One row per account, not one per question: nothing queries an individual
-- answer yet, and a JSONB blob means adding or rewording a question is a client
-- change rather than a migration. Impose a shape on it when something actually
-- reads it.

create table public.survey_responses (
  user_id    uuid        primary key references auth.users (id) on delete cascade
                         default auth.uid(),
  answers    jsonb       not null,
  created_at timestamptz not null default now()
);

alter table public.survey_responses enable row level security;

-- Explicit, for the same reason as profiles: RLS narrows a privilege that has to
-- exist first. Without this grant PostgREST answers with 403 rather than an
-- empty result. No grant to `anon` — there is no survey without an account.
grant select, insert on public.survey_responses to authenticated;

-- Self-only, both ways. `(select auth.uid())` rather than a bare call so the
-- planner hoists it into an InitPlan and evaluates it once per statement.
create policy survey_responses_select_self on public.survey_responses
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy survey_responses_insert_self on public.survey_responses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- No update or delete policy. The survey is answered once; a second attempt from
-- a reinstall hits the primary key and the client treats that 23505 as "already
-- recorded" rather than as an error. The first answers stand.
