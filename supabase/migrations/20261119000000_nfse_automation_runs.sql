-- Controle isolado das execuções assistidas de NFS-e.
-- Dados fiscais dos lançamentos continuam em app_state.pj_tx2.
-- A tabela é acessível somente pelo backend usando service_role.

begin;

create table if not exists public.nfse_automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month smallint not null check (month between 0 and 11),
  year smallint not null check (year between 2020 and 2100),
  status text not null default 'queued'
    check (status in ('queued','authenticating','awaiting_otp','validating_access','completed','failed','cancelled')),
  requested_count integer not null default 1 check (requested_count between 1 and 100),
  transaction_ids text[] not null default '{}',
  payload jsonb not null default '[]'::jsonb,
  otp_code text,
  otp_expires_at timestamptz,
  otp_submitted_at timestamptz,
  otp_consumed_at timestamptz,
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nfse_automation_runs_user_created_idx
  on public.nfse_automation_runs (user_id, created_at desc);

create index if not exists nfse_automation_runs_active_idx
  on public.nfse_automation_runs (status)
  where status in ('queued','authenticating','awaiting_otp','validating_access');

alter table public.nfse_automation_runs enable row level security;
revoke all on public.nfse_automation_runs from anon, authenticated;
grant all on public.nfse_automation_runs to service_role;

commit;
