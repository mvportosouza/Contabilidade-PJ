-- LOTE 03 — Account lifecycle
-- Garante que a exclusão de auth.users remova automaticamente os dados
-- associados da aplicação.
--
-- Esta migration é idempotente e não cria DELETE direto para clientes.

begin;

-- profiles.id -> auth.users.id
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname = 'profiles'
      and pg_get_constraintdef(c.oid) ilike '%REFERENCES auth.users(id)%'
      and pg_get_constraintdef(c.oid) ilike '%ON DELETE CASCADE%'
  ) then
    raise exception 'profiles.id must reference auth.users(id) with ON DELETE CASCADE';
  end if;
end
$$;

-- app_state.user_id -> auth.users.id
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname = 'app_state'
      and pg_get_constraintdef(c.oid) ilike '%REFERENCES auth.users(id)%'
      and pg_get_constraintdef(c.oid) ilike '%ON DELETE CASCADE%'
  ) then
    raise exception 'app_state.user_id must reference auth.users(id) with ON DELETE CASCADE';
  end if;
end
$$;

commit;
