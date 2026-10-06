-- Sandbox link landing page: say on arrival whether a link still works
-- (6 Oct 2026). Returns only the state of the pass the caller holds the
-- token for; nothing about anyone else.
create or replace function public.sandbox_pass_status(p_token text)
 returns table(state text, expires_at timestamptz)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
           when p.id is null then 'unknown'
           when p.revoked_at is not null then 'revoked'
           when p.expires_at < now() then 'expired'
           else 'ok'
         end,
         p.expires_at
  from (select 1) one
  left join sandbox_passes p on p.token = p_token and coalesce(private.cfg('app_env'), '') = 'demo';
$function$;
revoke execute on function public.sandbox_pass_status(text) from public;
grant execute on function public.sandbox_pass_status(text) to anon, authenticated;
