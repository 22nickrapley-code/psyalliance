-- PsyAlliance 1.0 corrections. Safe to run more than once.

-- 1. Lifecycle events (review F09) ----------------------------------------------------------------
-- A visitor (anon) can no longer write the "real" namespace; only a signed-in member's own product
-- actions can. "demo_started" separates opening a demo from completing an exercise.
alter table public.lifecycle_events drop constraint if exists lifecycle_events_event_check;
alter table public.lifecycle_events add constraint lifecycle_events_event_check check (event in (
  'guide_start', 'guide_choice', 'demo_started', 'interaction_complete', 'interaction_skip', 'recipient_preview', 'summary_continue',
  'handoff_adopted', 'handoff_cleared', 'task_start', 'first_result', 'review_send', 'first_response', 'collaboration_complete',
  'return_resume', 'pause', 'delivery_failure'));

create or replace function public.log_lifecycle_event(p_namespace text, p_event text, p_need text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_namespace not in ('demo', 'practice', 'real') then return; end if;
  -- Real product events come only from a signed-in member, never from an anonymous caller.
  if p_namespace = 'real' and auth.uid() is null then return; end if;
  insert into lifecycle_events (namespace, event, need) values (p_namespace, p_event, nullif(p_need, ''));
exception when check_violation then null;  -- an unknown event is ignored, never an error for the visitor
end;
$$;
revoke all on function public.log_lifecycle_event(text, text, text) from public;
grant execute on function public.log_lifecycle_event(text, text, text) to anon, authenticated;
