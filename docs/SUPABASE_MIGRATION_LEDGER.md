# SUPABASE MIGRATION LEDGER

## Lote 07 — Migration Governance / Production Reconciliation

**Snapshot date:** 2026-09-01  
**Supabase project:** `mvportosouza`  
**Project ref:** `qthvrxnldlttvyspnesc`  
**Database:** PostgreSQL 17.6  
**Baseline status:** production snapshot captured; repository and production migration histories reconciled without rewriting already-applied migrations.

> This document records the state observed in production. It does not claim that every historical production migration has an identical SQL file in the repository. Historical migrations that exist only in production are recorded as historical and must not be reconstructed from memory.

---

## 1. Current production schema snapshot

### Public tables

| Table | RLS | Rows at snapshot | Primary key | Foreign key |
|---|---|---:|---|---|
| `public.app_state` | enabled | 2 | `user_id` | `user_id → auth.users(id)` |
| `public.profiles` | enabled | 0 | `id` | `id → auth.users(id)` |

### `public.app_state`

| Column | Type | Nullable | Default |
|---|---|---|---|
| `user_id` | uuid | no | — |
| `state` | jsonb | no | `'{}'::jsonb` |
| `created_at` | timestamptz | no | `now()` |
| `updated_at` | timestamptz | no | `now()` |

Indexes:
- `app_state_pkey` — unique btree on `user_id`
- `app_state_updated_at_idx` — btree on `updated_at DESC`

### `public.profiles`

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | — |
| `display_name` | text | yes | — |
| `created_at` | timestamptz | no | `now()` |
| `updated_at` | timestamptz | no | `now()` |

Indexes:
- `profiles_pkey` — unique btree on `id`

---

## 2. Current RLS policies

### `public.app_state`

- `Users can view own app state` — SELECT — authenticated — `auth.uid() = user_id`
- `Users can insert own app state` — INSERT — authenticated — `auth.uid() = user_id`
- `Users can update own app state` — UPDATE — authenticated — `auth.uid() = user_id`, with matching `WITH CHECK`
- `Users can delete own app state` — DELETE — authenticated — `auth.uid() = user_id`

### `public.profiles`

- `Users can view own profile` — SELECT — authenticated — `auth.uid() = id`
- `Users can insert own profile` — INSERT — authenticated — `auth.uid() = id`
- `Users can update own profile` — UPDATE — authenticated — `auth.uid() = id`, with matching `WITH CHECK`

RLS is enabled on both application tables.

---

## 3. Current functions / triggers relevant to the application schema

Confirmed application/public functions:

- `public.save_app_state(jsonb, timestamptz, boolean)` — `SECURITY INVOKER`; executable by `authenticated` and `service_role`, not `anon`.
- `public.set_updated_at()` — trigger function.
- `public.rls_auto_enable()` — event-trigger function; `SECURITY DEFINER`; executable by `service_role`/`postgres`.

The current snapshot does not authorize changing these functions as part of Lote 07. They are recorded for reconciliation and future migration tracking.

---

## 4. Current object grants

### `public.app_state`

- `postgres`: full table privileges
- `authenticated`: SELECT, INSERT, UPDATE, DELETE
- `service_role`: full table privileges

### `public.profiles`

- `postgres`: full table privileges
- `authenticated`: SELECT, INSERT, UPDATE
- `service_role`: full table privileges

The application roles do not have the previously removed `TRUNCATE`, `TRIGGER`, or `REFERENCES` privileges on these application tables.

---

## 5. Installed extensions

Confirmed installed extensions:

| Extension | Version | Schema |
|---|---:|---|
| `pg_stat_statements` | 1.11 | `extensions` |
| `pgcrypto` | 1.3 | `extensions` |
| `plpgsql` | 1.0 | `pg_catalog` |
| `supabase_vault` | 0.3.1 | `vault` |
| `uuid-ossp` | 1.1 | `extensions` |

This ledger records installed extensions only; extensions merely available on the platform are not treated as part of the application baseline.

---

## 6. Production migration history vs repository

The production migration history currently contains **14 applied entries**:

| Production version | Production migration name | Repository correspondence |
|---|---|---|
| `20260816175545` | `create_app_state_and_profiles` | historical — SQL file not present in current repository |
| `20260816175554` | `harden_public_functions` | historical — SQL file not present in current repository |
| `20260816175602` | `revoke_rls_helper_execute` | historical — SQL file not present in current repository |
| `20260818161411` | `20260818_harden_app_state_rls_lote_a` | historical — SQL file not present in current repository |
| `20260818173145` | `20260818_fix_save_app_state_rpc_lote_a` | historical — SQL file not present in current repository |
| `20260819192927` | `20260819_harden_save_app_state_lote_i` | historical — SQL file not present in current repository |
| `20260820000510` | `20260819_200000_public_schema_baseline` | `supabase/migrations/20260819_200000_public_schema_baseline.sql` |
| `20260821101438` | `lote_n_supabase_security_final_v2` | production history entry; repository has related security migration under a different filename/version |
| `20260821140537` | `lote_q_least_privilege` | repository has `20260821_lote_q_least_privilege.sql`; production history timestamp differs from repository filename |
| `20260822101358` | `20260822_lote_q1_least_privilege_final_v2` | repository has `20260822_lote_q1_least_privilege_final.sql`; production history timestamp differs from repository filename |
| `20260827102052` | `reconcile_save_app_state_security` | `supabase/migrations/20260827102052_reconcile_save_app_state_security.sql` |
| `20260827200228` | `phase_3_security_hardening` | repository has related migration under `20260827190000_phase_3_security_hardening.sql`; production timestamp differs |
| `20260828004150` | `phase_3_edge_sdk_and_profiles_delete` | repository has related migration under `20260828000000_phase_3_edge_sdk_and_profiles_delete.sql`; production timestamp differs |
| `20260830202840` | `lote_03_enforce_account_cascade` | repository has related migration under `20260830000000_lote_03_account_lifecycle.sql`; production timestamp/name differs |

### Important reconciliation finding

There are two distinct forms of historical drift:

1. **Production-only migrations:** the first six production entries have no corresponding SQL file in the current repository.
2. **Timestamp/name drift:** several later migrations are represented in the repository by files whose timestamp and/or filename differs from the production migration-history entry.

These are **not** to be silently renamed or rewritten. Already-applied production migrations are immutable historical records.

The repository therefore treats the current production state as the authoritative runtime state, while the ledger explicitly records the missing historical lineage.

---

## 7. Baseline definition

For Lote 07, the baseline is:

**Production schema snapshot + production migration history + repository migration directory + security state captured above.**

The baseline is considered established when:
- all production tables are listed;
- columns/defaults/constraints/indexes are recorded;
- RLS and policies are recorded;
- relevant functions/triggers are recorded;
- effective grants are recorded;
- installed extensions are recorded;
- every production migration is classified as repository-backed, repository-related with filename/version drift, or production-only historical.

No historical production migration is recreated merely to make filenames look sequential.

---

## 8. Default privileges review

The production database currently has explicit default ACL entries for several platform-managed roles/schemas.

For the application `public` schema:
- defaults owned by `postgres` grant table privileges to `postgres` and `service_role`, while function defaults grant execution to `postgres` and `service_role`;
- separate defaults owned by `supabase_admin` remain broader and include `anon`, `authenticated`, and `service_role`.

**Decision for Lote 07:** observe and document these defaults; do not attempt blanket `ALTER DEFAULT PRIVILEGES` changes against platform-managed ownership where the current role/plan may not permit or where doing so could affect Supabase-managed objects.

Future application migrations must explicitly define the intended grants and RLS state for newly exposed objects.

---

## 9. Governance rule for future structural changes

Every future structural database change must have a corresponding migration committed to the repository.

Required flow:

`schema change → migration file → review → CI → apply to production → migration history verification`

Forbidden flow:

`production schema change → no migration → undocumented drift`

Already-applied migrations must not be edited retroactively. Corrections are implemented as new forward migrations.

---

## 10. Relationship between GitHub and Supabase

GitHub is the versioned source of migration intent.

Supabase production is the runtime database.

The migration ledger is the reconciliation layer connecting the two.

For every future change, the repository migration and the resulting production migration-history entry must be traceable to the same change.

---

## 11. Verification notes

Security advisor: one existing warning was reported for **Leaked Password Protection** in Supabase Auth. No new schema change was made to address it in Lote 07.

Performance advisor: no findings.

No database DDL was executed as part of this governance snapshot.
