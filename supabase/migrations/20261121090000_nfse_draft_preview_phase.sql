-- Add a non-issuing draft preview phase to the assisted NFS-e workflow.
-- No invoice is transmitted and app_state remains unchanged.
begin;

alter table public.nfse_automation_runs
  drop constraint if exists nfse_automation_runs_status_check;

alter table public.nfse_automation_runs
  add constraint nfse_automation_runs_status_check
  check (status = any (array[
    'queued'::text,
    'authenticating'::text,
    'awaiting_otp'::text,
    'validating_access'::text,
    'preparing_draft'::text,
    'preview_ready'::text,
    'completed'::text,
    'failed'::text,
    'cancelled'::text
  ]));

commit;
