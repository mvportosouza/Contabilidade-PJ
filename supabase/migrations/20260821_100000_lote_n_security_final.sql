-- Lote N — Supabase Security Final
-- Limpeza das políticas RLS duplicadas e padronização de auth.uid().
--
-- IMPORTANTE:
-- Não altera dados da aplicação.
-- Não altera o frontend.
-- Não altera layout.
--
-- Mantém uma única política permissiva por operação/tabela.
-- Usa (select auth.uid()) para permitir caching por statement.

begin;

-- ============================================================
-- PROFILES
-- ============================================================

drop policy if exists "profiles_select_own"
  on public.profiles;

drop policy if exists "profiles_insert_own"
  on public.profiles;

drop policy if exists "profiles_update_own"
  on public.profiles;

drop policy if exists "Users can view own profile"
  on public.profiles;

drop policy if exists "Users can insert own profile"
  on public.profiles;

drop policy if exists "Users can update own profile"
  on public.profiles;


create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
);


create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (
  (select auth.uid()) = id
);


create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);


-- ============================================================
-- APP STATE
-- ============================================================

drop policy if exists "app_state_select_own"
  on public.app_state;

drop policy if exists "app_state_insert_own"
  on public.app_state;

drop policy if exists "app_state_update_own"
  on public.app_state;

drop policy if exists "app_state_delete_own"
  on public.app_state;

drop policy if exists "Users can view own app state"
  on public.app_state;

drop policy if exists "Users can insert own app state"
  on public.app_state;

drop policy if exists "Users can update own app state"
  on public.app_state;

drop policy if exists "Users can delete own app state"
  on public.app_state;


create policy "Users can view own app state"
on public.app_state
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


create policy "Users can insert own app state"
on public.app_state
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);


create policy "Users can update own app state"
on public.app_state
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);


create policy "Users can delete own app state"
on public.app_state
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- RLS MUST REMAIN ENABLED
-- ============================================================

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;


-- ============================================================
-- SAVE APP STATE RPC
-- ============================================================

revoke execute
on function public.save_app_state(
  jsonb,
  timestamptz,
  boolean
)
from anon;

grant execute
on function public.save_app_state(
  jsonb,
  timestamptz,
  boolean
)
to authenticated;

alter function public.save_app_state(
  jsonb,
  timestamptz,
  boolean
)
set search_path = public;

commit;
