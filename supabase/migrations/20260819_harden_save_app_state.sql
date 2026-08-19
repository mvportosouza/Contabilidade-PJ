-- Lote I — Hardening Supabase
-- Objetivo: remover execução desnecessária por anon da RPC usada
-- pelo aplicativo. Não altera tabelas, dados ou layout da aplicação.
--
-- A função continua disponível para authenticated, que é a role
-- utilizada pelo cliente após o login.
--
-- A função já valida auth.uid() e usa SECURITY DEFINER com
-- search_path = public.

REVOKE EXECUTE ON FUNCTION public.save_app_state(
  jsonb,
  timestamptz,
  boolean
) FROM anon;

GRANT EXECUTE ON FUNCTION public.save_app_state(
  jsonb,
  timestamptz,
  boolean
) TO authenticated;

-- Defesa adicional: mantém o search_path explicitamente restrito
-- para evitar resolução inesperada de objetos durante SECURITY DEFINER.
ALTER FUNCTION public.save_app_state(
  jsonb,
  timestamptz,
  boolean
) SET search_path = public;
