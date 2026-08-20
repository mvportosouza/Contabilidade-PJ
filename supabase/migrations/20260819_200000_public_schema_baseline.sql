-- Lote J — Supabase Infrastructure as Code
-- Snapshot/reproducible baseline of the application's public schema.
-- Does not alter application layout or frontend code.
--
-- This migration is intentionally idempotent so it can be applied to an
-- existing project without destroying production data.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

-- Policies are created only when missing. Existing production policies/data
-- are preserved. The expressions enforce per-user isolation.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_state' and policyname='app_state_select_own') then
    create policy app_state_select_own on public.app_state for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_state' and policyname='app_state_insert_own') then
    create policy app_state_insert_own on public.app_state for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_state' and policyname='app_state_update_own') then
    create policy app_state_update_own on public.app_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_state' and policyname='app_state_delete_own') then
    create policy app_state_delete_own on public.app_state for delete to authenticated using (auth.uid() = user_id);
  end if;
end
$$;

-- Keep the SECURITY DEFINER RPC used by the application reproducible.
create or replace function public.save_app_state(
  p_state jsonb,
  p_base_updated_at timestamptz default null,
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.app_state%rowtype;
  v_now timestamptz := now();
  v_updated timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  select * into v_current from public.app_state where user_id = v_user_id for update;

  if found then
    if not p_force and p_base_updated_at is not null and v_current.updated_at <> p_base_updated_at then
      return jsonb_build_object('status','conflict','state',v_current.state,'updated_at',v_current.updated_at);
    end if;

    update public.app_state set state=p_state, updated_at=v_now where user_id=v_user_id returning updated_at into v_updated;
  else
    insert into public.app_state(user_id,state,created_at,updated_at) values(v_user_id,p_state,v_now,v_now) returning updated_at into v_updated;
  end if;

  return jsonb_build_object('status','saved','updated_at',v_updated);
end;
$$;

revoke execute on function public.save_app_state(jsonb,timestamptz,boolean) from anon;
grant execute on function public.save_app_state(jsonb,timestamptz,boolean) to authenticated;
alter function public.save_app_state(jsonb,timestamptz,boolean) set search_path=public;
