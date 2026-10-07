-- 0101: point a Practice Library template at a newly uploaded file. Used
-- by Admin's "Update files from the repository" (templates renamed from PA
-- numbers to names, 7 Oct). Admins only; the file must already be in the
-- shared library folder. Applied to both projects.
create or replace function public.admin_set_library_file(p_document bigint, p_path text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare old_path text;
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  if p_path is null or p_path !~ '^shared/' or not exists (select 1 from storage.objects where bucket_id = 'documents' and name = p_path) then
    raise exception 'That file isn''t in the library folder.' using errcode = 'P0001';
  end if;
  select storage_path into old_path from documents where id = p_document and owner_scope = 'world' and library_code is not null;
  if not found then
    raise exception 'We couldn''t find that template.' using errcode = 'P0001';
  end if;
  -- One change, one new version: the file and the title without its PA number.
  update documents set storage_path = p_path, title = regexp_replace(title, '^PA-\d+:\s*', '') where id = p_document;
  return old_path;
end;
$function$;

-- Demo project only, 7 Oct: the seeded group charter text and the template
-- titles were renamed by hand; versions put back to 1 so both sites move to
-- version 2 together when the new files go in.
