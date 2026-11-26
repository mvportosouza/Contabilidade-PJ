-- Forward cleanup migration already applied to production on 2026-11-26.
-- This file is committed for repository/prod history traceability only.
-- DO NOT re-apply this migration to the production database.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists public.consume_nfse_otp(uuid);
drop table if exists public.nfse_automation_runs;

commit;
