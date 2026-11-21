
-- Registra a correção do consumo atômico do OTP da automação NFS-e.
-- A função foi aplicada e validada diretamente no banco em 2026-11-19.
-- Esta migration documenta o estado já aplicado; não altera lançamentos nem dados fiscais.

begin;

create or replace function public.consume_nfse_otp(p_run_id uuid)
returns table(otp_code text)
language plpgsql
set search_path to ''
as $function$
declare
  v_otp_code text;
begin
  select run.otp_code
    into v_otp_code
    from public.nfse_automation_runs as run
   where run.id = p_run_id
     and run.status = 'awaiting_otp'
     and run.otp_code is not null
     and run.otp_expires_at > now()
   for update;

  if not found then
    return;
  end if;

  update public.nfse_automation_runs as run
     set otp_code = null,
         otp_expires_at = null,
         otp_consumed_at = now(),
         updated_at = now()
   where run.id = p_run_id
     and run.status = 'awaiting_otp';

  return query select v_otp_code;
end;
$function$;

revoke all on function public.consume_nfse_otp(uuid) from public;
revoke all on function public.consume_nfse_otp(uuid) from anon, authenticated;
grant execute on function public.consume_nfse_otp(uuid) to service_role;

commit;
