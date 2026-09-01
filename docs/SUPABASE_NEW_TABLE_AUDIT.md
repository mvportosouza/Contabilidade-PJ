# Supabase New Table Audit

## Purpose

This checklist is mandatory for every new application table in an exposed schema.

It is intentionally read-only: it describes what must be verified before a table is considered complete.

## Required sequence

```text
new table
   ↓
RLS?
   ↓
policies?
   ↓
grants?
   ↓
indexes?
   ↓
migration?
   ↓
review
   ↓
CI
   ↓
production
```

## 1. RLS

For every new table in `public`:

- [ ] RLS is enabled.
- [ ] `FORCE ROW LEVEL SECURITY` is considered where appropriate.
- [ ] Anonymous access is explicitly justified or absent.
- [ ] Policies use the intended ownership/authorization predicate.
- [ ] UPDATE policies have both `USING` and `WITH CHECK` where applicable.

## 2. Policies

For every operation that the application needs:

- [ ] SELECT policy exists.
- [ ] INSERT policy exists.
- [ ] UPDATE policy exists.
- [ ] DELETE policy exists.
- [ ] Policy role targets are explicit (`TO authenticated`, `TO anon`, etc.).
- [ ] No policy relies on user-editable `user_metadata` for authorization.

## 3. Grants

Verify the effective privileges for:

- `anon`
- `authenticated`
- `service_role`

Apply least privilege.

RLS and grants are separate controls: a grant makes an object reachable through the Data API; RLS controls which rows are accessible.

## 4. Indexes

Review:

- [ ] primary key index;
- [ ] foreign-key lookup indexes where justified;
- [ ] indexes used by frequent RLS predicates;
- [ ] indexes used by common filters/sorts;
- [ ] no redundant indexes.

Do not add indexes merely to satisfy the checklist; justify them from actual query patterns.

## 5. Migration

Every structural change must have a migration file under:

`supabase/migrations/`

The migration must:

- [ ] be new, never a rewrite of an applied migration;
- [ ] contain the structural change;
- [ ] include required RLS/policies/grants when those are part of the table's security model;
- [ ] be reviewed before production;
- [ ] be verifiable against Supabase migration history.

## 6. Production verification

After applying a migration:

- [ ] table exists;
- [ ] columns/defaults are correct;
- [ ] constraints are correct;
- [ ] indexes are correct;
- [ ] RLS is enabled;
- [ ] policies are correct;
- [ ] grants are correct;
- [ ] migration appears in `supabase_migrations.schema_migrations`;
- [ ] application smoke test passes.

## 7. Drift rule

If a table exists in production but no repository migration can account for it:

**STOP.**

Do not create an arbitrary new migration that pretends to be the original history.

Instead:

1. record the table as production-only historical state;
2. capture its schema/security state;
3. reconcile it deliberately;
4. use a new forward migration for any future modification.

## 8. Read-only audit SQL

The following query can be used against production to inspect all application tables without changing anything:

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  (
    select count(*)
    from pg_policies p
    where p.schemaname = n.nspname
      and p.tablename = c.relname
  ) as policy_count,
  (
    select count(*)
    from pg_indexes i
    where i.schemaname = n.nspname
      and i.tablename = c.relname
  ) as index_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;
```

This query is an audit aid only. It does not establish migration provenance by itself; migration provenance must be reconciled against the repository and Supabase migration history.
