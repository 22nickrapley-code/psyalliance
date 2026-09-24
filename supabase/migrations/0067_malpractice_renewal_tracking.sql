-- Credentials (Product Spec v1): self-tracked renewals include malpractice
-- insurance, with a reminder before it lapses. Member-entered, never shown
-- as a reviewed fact.
alter table public.profiles
  add column if not exists malpractice_carrier text,
  add column if not exists malpractice_expires date;
