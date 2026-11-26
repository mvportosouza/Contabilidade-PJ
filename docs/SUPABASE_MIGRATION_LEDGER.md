# SUPABASE MIGRATION LEDGER

## Lote 07 — Migration Governance / Production Reconciliation

**Snapshot date:** 2026-11-26  
**Supabase project ref:** `qthvrxnldlttvyspnesc`  
**Database:** PostgreSQL 17.6  
**Baseline status:** production migration history verified through the NFS-e cleanup migration; historical migration records preserved.

> This document records observed production state. It does not claim every historical production migration has an identical SQL file in the repository. Never reconstruct historical migrations from memory or rename/rewrite migrations already applied.

---

## 1. Current production schema snapshot

### Public application tables

| Table | RLS | Rows at last verified count | Primary key | Foreign key |
|---|---|---:|---|---|
| `public.app_state` | enabled | 3 | `user_id` | `user_id → auth.users(id)` |
| `public.profiles` | enabled | not re-counted in this cleanup verification | `id` | `id → auth.users(id)` |

The cleanup verification confirmed that the application tables remained present. The count of `app_state` was 3 at the time of that check. Do not infer row counts for any later date from this snapshot.

The detailed column, index, RLS policy, grant and extension baseline below is retained from the 2026-09-01 schema audit. It was not re-enumerated as part of the 2026-11-26 cleanup, so treat those details as the last recorded baseline rather than a fresh re-audit.

### `public.app_state` — last detailed snapshot 2026-09-01

| Column | Type | Nullable | Default |
|---|---|---|---|
| `user_id` | uuid | no | — |
| `state` | jsonb | no | `'{}'::jsonb` |
| `created_at` | timestamptz | no | `now()` |
| `updated_at` | timestamptz | no | `now()` |

Indexes recorded: `app_state_pkey` (unique btree on `user_id`) and `app_state_updated_at_idx` (btree on `updated_at DESC`).

### `public.profiles` — last detailed snapshot 2026-09-01

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | — |
| `display_name` | text | yes | — |
| `created_at` | timestamptz | no | `now()` |
| `updated_at` | timestamptz | no | `now()` |

Index recorded: `profiles_pkey` (unique btree on `id`).

---

## 2. RLS policies — last detailed snapshot 2026-09-01

### `public.app_state`
- `Users can view own app state` — SELECT — authenticated — `auth.uid() = user_id`
- `Users can insert own app state` — INSERT — authenticated — `auth.uid() = user_id`
- `Users can update own app state` — UPDATE — authenticated — `auth.uid() = user_id`, with matching `WITH CHECK`
- `Users can delete own app state` — DELETE — authenticated — `auth.uid() = user_id`

### `public.profiles`
- `Users can view own profile` — SELECT — authenticated — `auth.uid() = id`
- `Users can insert own profile` — INSERT — authenticated — `auth.uid() = id`
- `Users can update own profile` — UPDATE — authenticated — `auth.uid() = id`, with matching `WITH CHECK`

RLS was recorded enabled on both application tables in the prior baseline.

---

## 3. Functions / triggers relevant to application schema — last detailed snapshot 2026-09-01

- `public.save_app_state(jsonb, timestamptz, boolean)` — `SECURITY INVOKER`; executable by `authenticated` and `service_role`, not `anon`.
- `public.set_updated_at()` — trigger function.
- `public.rls_auto_enable()` — event-trigger function; `SECURITY DEFINER`; executable by `service_role`/`postgres`.

The following historical NFS-e function was removed by the cleanup migration described in Section 6:
- `public.consume_nfse_otp(uuid)` — no longer exists in production after migration `20261126103509`.

---

## 4. Object grants — last detailed snapshot 2026-09-01

### `public.app_state`
- `postgres`: full table privileges
- `authenticated`: SELECT, INSERT, UPDATE, DELETE
- `service_role`: full table privileges

### `public.profiles`
- `postgres`: full table privileges
- `authenticated`: SELECT, INSERT, UPDATE
- `service_role`: full table privileges

The prior baseline recorded no `TRUNCATE`, `TRIGGER`, or `REFERENCES` privileges for application roles on these tables.

---

## 5. Installed extensions — last detailed snapshot 2026-09-01

| Extension | Version | Schema |
|---|---:|---|
| `pg_stat_statements` | 1.11 | `extensions` |
| `pgcrypto` | 1.3 | `extensions` |
| `plpgsql` | 1.0 | `pg_catalog` |
| `supabase_vault` | 0.3.1 | `vault` |
| `uuid-ossp` | 1.1 | `extensions` |

---

## 6. Production migration history vs repository

The production migration history contains **18 applied entries**, verified on 2026-11-26:

| Production version | Production migration name | Repository correspondence / current status |
|---|---|---|
| `20260816175545` | `create_app_state_and_profiles` | historical — SQL file not present in current repository |
| `20260816175554` | `harden_public_functions` | historical — SQL file not present in current repository |
| `20260816175602` | `revoke_rls_helper_execute` | historical — SQL file not present in current repository |
| `20260818161411` | `20260818_harden_app_state_rls_lote_a` | historical — SQL file not present in current repository |
| `20260818173145` | `20260818_fix_save_app_state_rpc_lote_a` | historical — SQL file not present in current repository |
| `20260819192927` | `20260819_harden_save_app_state_rpc_lote_i` | historical — SQL file not present in current repository |
| `20260820000510` | `20260819_200000_public_schema_baseline` | `supabase/migrations/20260819_200000_public_schema_baseline.sql` |
| `20260821101438` | `lote_n_supabase_security_final_v2` | production history entry; related repository security migration has different filename/version |
| `20260821140537` | `lote_q_least_privilege` | repository has `20260821_lote_q_least_privilege.sql`; production timestamp differs |
| `20260822101358` | `20260822_lote_q1_least_privilege_final_v2` | repository has `20260822_lote_q1_least_privilege_final.sql`; production timestamp differs |
| `20260827102052` | `reconcile_save_app_state_security` | `supabase/migrations/20260827102052_reconcile_save_app_state_security.sql` |
| `20260827200228` | `phase_3_security_hardening` | related repository file `20260827190000_phase_3_security_hardening.sql`; timestamp differs |
| `20260828004150` | `phase_3_edge_sdk_and_profiles_delete` | related repository file `20260828000000_phase_3_edge_sdk_and_profiles_delete.sql`; timestamp differs |
| `20260830202840` | `lote_03_enforce_account_cascade` | related repository file `20260830000000_lote_03_account_lifecycle.sql`; timestamp/name differs |
| `20261119220623` | `nfse_automation_runs` | historical NFS-e automation migration; table subsequently removed by forward migration |
| `20261119224301` | `nfse_consume_otp_atomic` | historical NFS-e OTP migration; function subsequently removed by forward migration |
| `20261122142512` | `nfse_draft_preview_phase` | historical migration retained as provenance; old NFS-e automation discontinued |
| `20261126103509` | `remove_nfse_automation_artifacts` | production-applied cleanup; matching SQL file: `supabase/migrations/20261126103509_remove_nfse_automation_artifacts.sql` |

### Cleanup migration — important operational note

The forward migration `20261126103509_remove_nfse_automation_artifacts` was already applied to production. Its SQL removes only:
- `public.consume_nfse_otp(uuid)`
- `public.nfse_automation_runs`

The SQL file included in this repository upload pack is provided solely to restore GitHub migration traceability. **Do not reapply it to production.** Historical migration rows `20261119220623`, `20261119224301` and `20261122142512` remain in Supabase's migration ledger intentionally; do not delete or rewrite them.

### Historical drift

1. The first six production entries have no corresponding SQL file in the current repository.
2. Several later entries have repository files with a different timestamp and/or filename.

These are immutable historical records. Do not rename or rewrite files/migration history to make them appear sequential. Use new forward migrations for future changes.

---

## 7. Baseline and reconciliation rules

The baseline consists of production schema state, production migration history, repository migration directory and recorded security configuration. Where detailed schema properties are only available from the 2026-09-01 snapshot, that older observation is explicitly labeled; do not interpret it as a fresh 2026-11-26 re-audit.

The production cleanup verification confirmed that `public.nfse_automation_runs` and `public.consume_nfse_otp(uuid)` no longer exist. `public.app_state` remained present with 3 rows at the time of verification; `public.profiles` remained present. The Edge Function `delete-account` remained ACTIVE (version 9, `verify_jwt=true`).

Security advisor: one warning remains for Leaked Password Protection in Supabase Auth. Performance advisor: no findings. Health advisor: no findings. No changes to these settings were made by the NFS-e cleanup.

---

## 8. Default privileges review — last detailed snapshot 2026-09-01

For the application `public` schema, the prior audit recorded:
- defaults owned by `postgres` grant table privileges to `postgres` and `service_role`; function defaults grant execution to `postgres` and `service_role`;
- separate defaults owned by `supabase_admin` remain broader and include `anon`, `authenticated` and `service_role`.

Decision: document these platform-managed defaults; do not make blanket `ALTER DEFAULT PRIVILEGES` changes without a separate review of ownership and impact.

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

GitHub is the versioned source of migration intent. Supabase production is the runtime database. This ledger is the reconciliation layer connecting the two. For every future change, the repository migration and resulting production migration-history entry must be traceable to the same change.

---

## 11. Verification notes

- Migration count: 18 applied entries, verified 2026-11-26.
- NFS-e cleanup: table and OTP function absent after forward migration.
- `delete-account`: Edge Function ACTIVE, version 9, `verify_jwt=true`.
- Supabase advisor: one existing Auth warning for Leaked Password Protection; no performance or health findings.
- No changes to application financial records or user authentication data were made as part of the cleanup.

