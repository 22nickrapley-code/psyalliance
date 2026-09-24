-- Profile (Product Spec v1): "a short professional bio". Plain text,
-- shown to verified colleagues on the member's profile.
alter table public.profiles
  add column if not exists bio text check (bio is null or char_length(bio) <= 700);
