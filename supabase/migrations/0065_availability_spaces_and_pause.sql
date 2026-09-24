-- Availability (Product Spec v1): "approximate spaces available, a
-- pause-until date, and last confirmed shown to colleagues". Colleagues
-- read these from profiles (verified profiles are readable by members).
alter table public.profiles
  add column if not exists approx_spaces smallint check (approx_spaces is null or (approx_spaces >= 0 and approx_spaces <= 99)),
  add column if not exists availability_paused_until date;
