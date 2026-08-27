-- Lote R — Reconciliation of save_app_state security mode
--
-- Objetivo:
-- Tornar explícito no histórico versionado que a RPC save_app_state
-- utiliza SECURITY INVOKER no estado atual de produção.
--
-- A baseline histórica de 2026-08-19 criou a função como SECURITY DEFINER.
-- O banco de produção atualmente está em SECURITY INVOKER. Esta migration
-- reconcilia os dois estados sem reescrever nenhuma migration já aplicada.
--
-- Não altera dados, RLS, permissões DML ou layout/frontend.

begin;

alter function public.save_app_state(
  jsonb,
  timestamptz,
  boolean
)
security invoker;

revoke execute on function public.save_app_state(
  jsonb,
  timestamptz,
  boolean
) from anon;

grant execute on function public.save_app_state(
  jsonb,
  timestamptz,
  boolean
) to authenticated;

alter function public.save_app_state(
  jsonb,
  timestamptz,
  boolean
) set search_path = public;

commit;
