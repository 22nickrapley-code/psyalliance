-- Nick, 11 Oct: every fictional person must share nothing with a real one.
-- Fictional members kept their ordinary first names but get invented
-- surnames, each checked against the US national provider register (NPI):
-- no licensed clinician anywhere has any of them. This renames the 1,200
-- sandbox members and the story's cast (Maya, Samuel, Eli, Lena, Imani,
-- Noah and the sandbox's own Alex), in the data and in the functions that
-- create them, so a reset or a new sandbox uses the new names too.
-- Safe to run on both projects: the real project has no fictional members.

drop table if exists pa_name_map;
create temporary table pa_name_map (old text primary key, new text not null);
insert into pa_name_map (old, new) values
  ('Rivers', 'Thornvale'),
  ('Chen', 'Calderwick'),
  ('Okafor', 'Brindlemoor'),
  ('Ramirez', 'Kestrelby'),
  ('Park', 'Larkhollow'),
  ('Brooks', 'Ambershaw'),
  ('Patel', 'Wrenmoor'),
  ('Ellis', 'Rosethorne'),
  ('Hale', 'Fernhallow'),
  ('Garcia', 'Glenmarrow'),
  ('Howard', 'Hollisford'),
  ('Dalton', 'Ivorwick'),
  ('Quinn', 'Kellingsby'),
  ('Marsh', 'Maplestone'),
  ('Schmidt', 'Orrinwood'),
  ('Nguyen', 'Marrowby'),
  ('Kim', 'Pellbrook'),
  ('Rodriguez', 'Quintmoor'),
  ('Rossi', 'Ravelsby'),
  ('Singh', 'Sallowmere'),
  ('Haddad', 'Tamberlyn'),
  ('Levy', 'Vallowbrook'),
  ('Cohen', 'Westerhaze'),
  ('Murphy', 'Yarrowby'),
  ('Sullivan', 'Belloway'),
  ('Brennan', 'Corvanne'),
  ('Walsh', 'Everholt'),
  ('Novak', 'Fallowmere'),
  ('Silva', 'Garrowby'),
  ('Reyes', 'Islecombe'),
  ('Castillo', 'Jessamore'),
  ('Morales', 'Lowenthorpe'),
  ('Ortiz', 'Merriwick'),
  ('Bianchi', 'Ollerwick'),
  ('Moreau', 'Pennacroft'),
  ('Larsson', 'Rillsworth'),
  ('Kowalski', 'Strathmorn'),
  ('Petrov', 'Venwick'),
  ('Osei', 'Wexcombe'),
  ('Mensah', 'Ashbrindle'),
  ('Abara', 'Bramblewick'),
  ('Khan', 'Cindervale'),
  ('Ali', 'Duskmoor'),
  ('Rahman', 'Elderwyn'),
  ('Tanaka', 'Foxmarrow'),
  ('Ito', 'Greyhollow'),
  ('Lee', 'Hartwhistle'),
  ('Choi', 'Ironbrook'),
  ('Hughes', 'Jadewick'),
  ('Bennett', 'Kinvarrow'),
  ('Carter', 'Larkspurn'),
  ('Foster', 'Owlstead'),
  ('Hayes', 'Pinewhistle'),
  ('Harper', 'Quellmoor'),
  ('Jordan', 'Ruskmere'),
  ('Keller', 'Tidewell'),
  ('Lawson', 'Yewbury'),
  ('Mitchell', 'Abberlay'),
  ('Nelson', 'Brackenmoor'),
  ('Porter', 'Coldmarrow'),
  ('Reed', 'Dunmarrow'),
  ('Russell', 'Emberwick'),
  ('Shaw', 'Farrowdale'),
  ('Stone', 'Gildenmoor'),
  ('Turner', 'Hazelwick'),
  ('Warren', 'Ivelmoor'),
  ('Wells', 'Kilmarrow'),
  ('Adler', 'Lanternby'),
  ('Baxter', 'Mirewick'),
  ('Coleman', 'Nettlewick'),
  ('Fischer', 'Pemberwick'),
  ('Gordon', 'Quarrelby'),
  ('Hart', 'Rookhollow'),
  ('Irwin', 'Sablewick'),
  ('Jensen', 'Thistlecombe'),
  ('Klein', 'Umbervale'),
  ('Lowe', 'Vintermoor'),
  ('Nolan', 'Wilderby'),
  ('Owens', 'Ashenford'),
  ('Pierce', 'Briarwick'),
  ('Ross', 'Copperlane'),
  ('Stein', 'Dovemarrow'),
  ('Thorne', 'Elmswhistle');

-- The functions that create fictional people.
do $$
declare fn text; d text;
begin
  foreach fn in array array['private.seed_demo_network', 'private.seed_demo_viewer', 'private.sandbox_story_event', 'public.claim_sandbox'] loop
    d := pg_get_functiondef(fn::regproc);
    d := regexp_replace(d, 'l_names text\[\] := array\[[^;]*\];', 'l_names text[] := array[''Calderwick'',''Wrenmoor'',''Glenmarrow'',''Marrowby'',''Pellbrook'',''Quintmoor'',''Brindlemoor'',''Ravelsby'',''Sallowmere'',''Tamberlyn'',''Vallowbrook'',''Westerhaze'',''Yarrowby'',''Belloway'',''Corvanne'',''Everholt'',''Fallowmere'',''Garrowby'',''Islecombe'',''Jessamore'',
    ''Kestrelby'',''Lowenthorpe'',''Merriwick'',''Ollerwick'',''Pennacroft'',''Orrinwood'',''Rillsworth'',''Strathmorn'',''Venwick'',''Wexcombe'',''Ashbrindle'',''Bramblewick'',''Cindervale'',''Duskmoor'',''Elderwyn'',''Foxmarrow'',''Greyhollow'',''Larkhollow'',''Hartwhistle'',''Ironbrook'',
    ''Jadewick'',''Kinvarrow'',''Larkspurn'',''Owlstead'',''Pinewhistle'',''Hollisford'',''Quellmoor'',''Ruskmere'',''Tidewell'',''Yewbury'',''Abberlay'',''Brackenmoor'',''Coldmarrow'',''Dunmarrow'',''Emberwick'',''Farrowdale'',''Gildenmoor'',''Hazelwick'',''Ivelmoor'',''Kilmarrow'',
    ''Lanternby'',''Mirewick'',''Nettlewick'',''Ivorwick'',''Rosethorne'',''Pemberwick'',''Quarrelby'',''Rookhollow'',''Sablewick'',''Thistlecombe'',''Umbervale'',''Vintermoor'',''Maplestone'',''Wilderby'',''Ashenford'',''Briarwick'',''Kellingsby'',''Copperlane'',''Dovemarrow'',''Elmswhistle''];');
    d := replace(d, 'Alex Rivers', 'Alex Thornvale');
    d := replace(d, 'Maya Chen', 'Maya Calderwick');
    d := replace(d, 'Eli Ramirez', 'Eli Kestrelby');
    d := replace(d, 'Imani Brooks', 'Imani Ambershaw');
    d := replace(d, 'Samuel Okafor', 'Samuel Brindlemoor');
    d := replace(d, 'Lena Park', 'Lena Larkhollow');
    d := replace(d, 'Noah Patel', 'Noah Wrenmoor');
    d := replace(d, ''' Hale''', ''' Fernhallow''');
    d := replace(d, 'alex.rivers@example.com', 'alex.thornvale@example.com');
    d := replace(d, 'example.com/alex-rivers', 'example.com/alex-thornvale');
    execute d;
  end loop;
end $$;

-- The fictional people already in the sandbox (and any sandbox still open).
update public.profiles p
   set full_name = split_part(p.full_name, ' ', 1) || ' ' || m.new
  from pa_name_map m
 where (p.is_demo or private.is_sandbox_guest(p.id))
   and split_part(p.full_name, ' ', 2) = m.old
   and split_part(p.full_name, ' ', 3) = '';

update public.profiles p
   set practice_website = replace(p.practice_website, 'alex-rivers', 'alex-thornvale'),
       contact_email = replace(p.contact_email, 'alex.rivers@', 'alex.thornvale@')
 where (p.is_demo or private.is_sandbox_guest(p.id)) and (p.practice_website like '%alex-rivers%' or p.contact_email like 'alex.rivers@%');

-- Sandbox overflow pages named after the old surnames (alex-rivers).
update public.overflow_pages o
   set slug = regexp_replace(o.slug, '(^|-)' || lower(m.old) || '($|-)', '\1' || lower(m.new) || '\2')
  from pa_name_map m, public.profiles p
 where p.id = o.profile_id
   and (p.is_demo or private.is_sandbox_guest(p.id))
   and o.slug ~ ('(^|-)' || lower(m.old) || '($|-)')
   and not exists (select 1 from public.overflow_pages x
                    where x.slug = regexp_replace(o.slug, '(^|-)' || lower(m.old) || '($|-)', '\1' || lower(m.new) || '\2'));

-- Their internal sign-in addresses (never shown, but no real names either).
update auth.users u
   set email = regexp_replace(u.email, '\.' || lower(m.old) || '(-|@)', '.' || lower(m.new) || '\1')
  from pa_name_map m
 where u.email like 'demo-%@seed.psyalliance.test'
   and u.email ~ ('\.' || lower(m.old) || '(-|@)');

-- Check: these should all be zero.
select
  (select count(*) from public.profiles p join pa_name_map m on split_part(p.full_name, ' ', 2) = m.old where p.is_demo) as demo_people_with_old_surnames,
  (select count(*) from pg_proc where proname in ('seed_demo_network', 'seed_demo_viewer', 'sandbox_story_event', 'claim_sandbox')
     and pg_get_functiondef(oid) ~ '(Maya Chen|Samuel Okafor|Eli Ramirez|Lena Park|Imani Brooks|Noah Patel|Alex Rivers|''Chen'',''Patel'')') as functions_with_old_names,
  (select count(*) from public.overflow_pages where slug ~ 'alex-rivers') as old_page_addresses;

drop table if exists pa_name_map;
