-- Enum values must commit before a later migration can use them.
alter type public.referral_response_status add value if not exists 'waitlist';
