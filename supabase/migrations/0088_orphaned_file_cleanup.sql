-- Orphaned files. When an account is deleted its photos and uploads stay
-- in Storage with nothing pointing at them. Admins can list them and
-- remove them through the Storage API (Admin overview → Storage), which
-- deletes the file itself, not just its record.

create or replace function public.admin_orphaned_files()
returns table(bucket_id text, name text, size_bytes bigint)
language sql
stable security definer
set search_path to 'public', 'storage'
as $$
  select o.bucket_id, o.name, coalesce((o.metadata ->> 'size')::bigint, 0)
  from storage.objects o
  where private.is_admin_user(auth.uid())
    and (
      (o.bucket_id = 'avatars'
        and not exists (select 1 from public.profiles p where p.id::text = (storage.foldername(o.name))[1]))
      or (o.bucket_id = 'documents'
        and not exists (select 1 from public.documents d where d.storage_path = o.name)
        and not exists (select 1 from public.profiles p where p.id::text = (storage.foldername(o.name))[2]))
    );
$$;
revoke execute on function public.admin_orphaned_files() from public, anon;
grant execute on function public.admin_orphaned_files() to authenticated;

-- Admins may delete a photo only when its owner no longer exists.
drop policy if exists "admins can delete orphaned avatars" on storage.objects;
create policy "admins can delete orphaned avatars" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and private.is_admin_user((select auth.uid()))
    and not exists (select 1 from public.profiles p where p.id::text = (storage.foldername(name))[1])
  );

-- And orphaned personal files (owner deleted, no document row).
drop policy if exists "admins can delete orphaned personal files" on storage.objects;
create policy "admins can delete orphaned personal files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'personal'
    and private.is_admin_user((select auth.uid()))
    and not exists (select 1 from public.profiles p where p.id::text = (storage.foldername(name))[2])
  );
