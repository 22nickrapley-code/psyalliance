-- Psychiatrists in this platform are represented via qualification_level =
-- 'MD', but some psychiatrists (and other physicians) hold a DO (Doctor of
-- Osteopathic Medicine) degree instead of an MD - equally licensed to
-- practice medicine and prescribe, just a different credentialing path.
-- Adding it so the psychologist/psychiatrist split Nick wants surfaced in
-- search doesn't misrepresent a real subset of practitioners.
alter type qualification_level add value if not exists 'DO';
