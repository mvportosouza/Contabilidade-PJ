-- Lote Q.1 — Final Least Privilege Hardening
--
-- Objetivo:
-- Remover privilégios desnecessários das roles anon/authenticated
-- sem alterar dados, RLS, políticas, frontend ou layout.
--
-- Leaked Password Protection não faz parte deste lote.
-- A funcionalidade permanece desabilitada devido à limitação do plano.
--
-- IMPORTANTE:
-- Esta migration NÃO altera os privilégios DML necessários
-- (SELECT / INSERT / UPDATE / DELETE) das tabelas da aplicação.
--
-- authenticated continuará podendo trabalhar somente com os
-- dados permitidos pelas políticas RLS.

begin;

-- ============================================================
-- 1. PUBLIC.PROFILES
-- ============================================================

revoke
  maintain,
  truncate,
  trigger,
  references
on table public.profiles
from authenticated;

-- ============================================================
-- 2. PUBLIC.APP_STATE
-- ============================================================

revoke
  maintain,
  truncate,
  trigger,
  references
on table public.app_state
from authenticated;

-- ============================================================
-- 3. PROTEGER A FUNÇÃO DE TRIGGER
-- ============================================================
--
-- set_updated_at() é utilizada exclusivamente pelos triggers
-- das tabelas da aplicação.
--
-- O cliente não precisa executar essa função diretamente.

revoke execute
on function public.set_updated_at()
from anon;

revoke execute
on function public.set_updated_at()
from authenticated;

-- ============================================================
-- 4. DEFAULT PRIVILEGES — TABELAS
-- ============================================================
--
-- Novas tabelas criadas no schema public não devem nascer
-- automaticamente com CRUD para anon/authenticated.
--
-- O acesso deverá ser concedido explicitamente somente quando
-- uma nova tabela realmente precisar ser exposta à aplicação.

alter default privileges
for role postgres
in schema public
revoke all on tables from anon, authenticated;

alter default privileges
for role supabase_admin
in schema public
revoke all on tables from anon, authenticated;

-- ============================================================
-- 5. DEFAULT PRIVILEGES — FUNCTIONS
-- ============================================================
--
-- Novas funções também não devem receber EXECUTE automaticamente
-- para anon/authenticated.
--
-- Quando uma RPC precisar ser utilizada pelo frontend, o EXECUTE
-- deverá ser concedido explicitamente na própria migration.

alter default privileges
for role postgres
in schema public
revoke execute on functions from anon, authenticated;

alter default privileges
for role supabase_admin
in schema public
revoke execute on functions from anon, authenticated;

commit;
