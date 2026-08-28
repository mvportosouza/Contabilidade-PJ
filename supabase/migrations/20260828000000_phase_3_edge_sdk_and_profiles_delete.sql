-- FASE 3 — Security hardening
--
-- Objetivo:
-- 1. Atualizar a Edge Function delete-account para o mesmo SDK Supabase JS
--    usado pelo projeto (2.112.4).
-- 2. Remover DELETE direto de public.profiles para clientes do browser.
--
-- Não altera frontend, layout ou dados.
-- A exclusão da conta continua sendo feita exclusivamente pela
-- Edge Function usando auth.admin.deleteUser(), com a service role.
--
-- A tabela public.profiles possui FK para auth.users com ON DELETE CASCADE.
-- Portanto, o usuário não precisa de DELETE direto em profiles para excluir
-- a própria conta.

begin;

-- ============================================================
-- 1. PUBLIC.PROFILES — revogar DELETE direto
-- ============================================================

-- Remove qualquer política DELETE existente que pudesse autorizar
-- exclusão de perfil pelo cliente.
drop policy if exists "profiles_delete_own"
  on public.profiles;

drop policy if exists "Users can delete own profile"
  on public.profiles;

-- Mesmo sem uma política DELETE, revogamos explicitamente o privilégio
-- de tabela para impedir DELETE direto por authenticated/anon.
revoke delete
on table public.profiles
from authenticated;

revoke delete
on table public.profiles
from anon;

commit;
