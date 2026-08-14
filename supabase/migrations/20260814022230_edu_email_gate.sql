-- AUTH-1: reject signups on any email except case.edu.
-- Wired via [auth.hook.before_user_created] in supabase/config.toml (local)
-- and Authentication -> Hooks in the dashboard (remote).
create or replace function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  user_email text := event->'user'->>'email';
begin
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
