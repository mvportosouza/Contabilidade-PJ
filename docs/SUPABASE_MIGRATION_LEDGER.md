# Supabase Migration Ledger — Lote Q

The production database has historical migrations that predate the current
repository migration directory. They are intentionally **not rewritten**:
changing or deleting an already-applied migration can make environments
diverge.

## Production migration history

| Version | Production name | Repository file |
|---|---|---|
| 20260816175545 | create_app_state_and_profiles | historical / not present in current repo |
| 20260816175554 | harden_public_functions | historical / not present in current repo |
| 20260816175602 | revoke_rls_helper_execute | historical / not present in current repo |
| 20260818161411 | 20260818_harden_app_state_rls_lote_a | historical / not present in current repo |
| 20260818173145 | 20260818_fix_save_app_state_rpc_lote_a | historical / not present in current repo |
| 20260819192927 | 20260819_harden_save_app_state_lote_i | historical / not present in current repo |
| 20260820000510 | 20260819_200000_public_schema_baseline | `supabase/migrations/20260819_200000_public_schema_baseline.sql` |
| 20260821101438 | lote_n_supabase_security_final_v2 | current production security state |
| — | Lote Q least privilege | `supabase/migrations/20260821_lote_q_least_privilege.sql` |

## Reconciliation rule

The repository must not invent or rewrite SQL for historical migrations whose
original files are unavailable. The current schema and security state are
instead captured by the existing baseline plus the new Lote Q migration.

Future schema changes must be added as new migrations and never retroactively
edited into an already-applied migration.

## Verified current state

- `public.profiles`: RLS enabled.
- `public.app_state`: RLS enabled.
- Per-user RLS policies use `(select auth.uid())`.
- `save_app_state`: executable by `authenticated`, not `anon`.
- `authenticated` no longer has `TRUNCATE`, `TRIGGER` or `REFERENCES` on the
  application tables.
