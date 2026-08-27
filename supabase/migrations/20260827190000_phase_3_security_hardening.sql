-- FASE 3 — Security hardening
--
-- Objetivo:
-- 1. Remover EXECUTE público da função de trigger set_updated_at().
-- 2. Garantir que novas sequences no schema public não recebam
--    automaticamente privilégios para anon/authenticated.
--
-- Não altera dados, RLS, políticas, frontend ou layout.
--
-- Observação:
-- set_updated_at() é usada pelos triggers das tabelas da aplicação.
-- A função não precisa ficar executável pelo papel PUBLIC/anon/authenticated.
-- O owner e service_role mantêm EXECUTE para administração/infraestrutura.
--
-- Leaked Password Protection:
-- permanece uma configuração de Auth da plataforma, não uma migration SQL.
-- No projeto atual ela está desabilitada e o plano é Free; a documentação
-- oficial do Supabase informa que esse recurso está disponível no Pro+.

begin;

-- ============================================================
-- 1. Trigger function: remove EXECUTE do PUBLIC
-- ============================================================

revoke execute
on function public.set_updated_at()
from public;

revoke execute
on function public.set_updated_at()
from anon;

revoke execute
on function public.set_updated_at()
from authenticated;

-- Mantém explicitamente a execução para infraestrutura/administração.
grant execute
on function public.set_updated_at()
to service_role;

-- ============================================================
-- 2. DEFAULT PRIVILEGES — SEQUENCES
-- ============================================================
--
-- Nenhuma sequence pública existe atualmente, mas os privilégios
-- padrão estavam permissivos para futuras sequences.
-- A aplicação não precisa de acesso direto a sequences pelo browser.

alter default privileges
for role postgres
in schema public
revoke all on sequences from anon, authenticated;

alter default privileges
for role supabase_admin
in schema public
revoke all on sequences from anon, authenticated;

commit;
