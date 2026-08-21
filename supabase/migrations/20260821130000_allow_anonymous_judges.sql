-- Anonymous judge sessions are authenticated Supabase users without an email.
-- They still receive an auth.uid(), so the existing RLS and definer RPCs keep
-- every judge's reviews, favourites, and check-ins isolated to that session.
create or replace function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  new_user jsonb := event->'user';
  user_email text := new_user->>'email';
begin
  if new_user->>'is_anonymous' = 'true' then
    return '{}'::jsonb;
  end if;

  if user_email !~* '^[^@]+@case\.edu$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Only case.edu email addresses are allowed.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.before_user_created_hook to supabase_auth_admin;
