-- AUTH-3: an account is an id and a verified email, nothing else.
-- ONB-1: a first-time user is routed into onboarding, not the catalog.
--
-- Deliberately narrow. The full schema lands in a later migration and must NOT
-- re-declare this table — add columns there with `alter table`.
--
-- Note there is no policy keyed on onboarding_complete, and there must not be.
-- Onboarding gating is app routing, not RLS (onboarding.md): the onboarding
-- flow itself reads buildings and spots to check whether the named spot exists,
-- so an RLS rule keyed on the flag would deadlock the flow that sets it.

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  onboarding_complete boolean     not null default false,
  created_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Explicit, because the default privileges are not reliable here: without this
-- `authenticated` ends up with only REFERENCES/TRIGGER/TRUNCATE and PostgREST
-- answers the profile read with 403 rather than an empty result. RLS narrows a
-- privilege that has to exist first — enabling RLS is not what grants it.
-- No grant to `anon`: a profile row is never readable while signed out.
grant select, update on public.profiles to authenticated;

-- Self-only. `profiles` is not on AUTH-4's do-not-grant list (reviews, spots,
-- check_ins, reports) because a profile row is never visible to another
-- account — which is what keeps direct client select consistent with AUTH-4.
--
-- `(select auth.uid())` rather than a bare `auth.uid()` so the planner hoists it
-- into an InitPlan and evaluates it once instead of once per row.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert or delete policy on purpose: rows are created by the trigger below
-- (security definer, so it bypasses RLS) and removed by the auth.users cascade.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''            -- fully-qualified names only; blocks search_path hijacking
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;  -- idempotent, in case the trigger ever double-fires
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
