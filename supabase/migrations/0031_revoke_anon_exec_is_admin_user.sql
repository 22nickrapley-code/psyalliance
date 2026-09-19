-- Follow-up to 0030: is_admin_user(uuid) had a separate, explicit EXECUTE
-- grant to anon in addition to the PUBLIC grant already revoked there.
-- Revoking PUBLIC alone doesn't remove a role's own explicit grant, so this
-- closed the remaining gap (confirmed via has_function_privilege('anon', ...)
-- returning true even after 0030, then false after this).

revoke execute on function public.is_admin_user(uuid) from anon;
