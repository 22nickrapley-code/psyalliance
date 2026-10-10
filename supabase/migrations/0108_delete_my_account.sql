-- A member can delete their own account from Profile (Nick, 10 Oct). The
-- typed confirmation is checked here as well as in the page. Their profile
-- and everything that belongs to it goes (the profile cascades from the
-- sign-in account); documents they uploaded go first because those rows
-- don't cascade. Admin and operator accounts, and sandbox guests, can't use
-- this.

create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE in capitals to confirm.' using errcode = 'P0001';
  end if;
  if private.is_admin_user(me) or exists (select 1 from profiles where id = me and account_kind = 'operator') then
    raise exception 'Admin accounts can''t be deleted from here.' using errcode = 'P0001';
  end if;
  if private.is_sandbox_guest(me) then
    raise exception 'Sandbox accounts end on their own. Use Reset to start again.' using errcode = 'P0001';
  end if;
  delete from documents where uploaded_by = me;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
