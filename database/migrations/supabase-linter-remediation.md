---
Category: Database
Status: Approved
Version: 1.0.0
Author: EHG Engineering
Last Updated: 2026-06-03
Tags: [security, supabase, database-linter, rls, migration]
---

# Supabase database-linter remediation — 2026-06-03

Closes the residual Supabase **SECURITY** linter warnings on the platform DB
(`dedlbzhpgkmetvhbkyzq`) that the 2026-06-02 sweep
(`security_definer_view` / `rls_disabled_in_public` / `function_search_path_mutable`
in **public**) did not reach. All findings trace to **Supabase's blanket default
grants to `anon`/`authenticated`**; the platform's real access model is
**service_role-only** (server uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS;
the only `anon` consumer — `src/services/realtime-dashboard.js` — does read-only
table subscriptions and never writes or calls `.rpc()`).

Everything was live-verified read-only before authoring. Apply via the normal
merge → migration process (these were **not** run against the live DB).

## Migrations (apply in order; **05 is high-risk — see below**)

| File | Linter finding | What it does | Risk |
|------|----------------|--------------|------|
| `20260603_01_pin_search_path_nonpublic_functions.sql` | `function_search_path_mutable` (6) | `SET search_path = <schema>, public, extensions` on 6 `postgres`-owned fns in `governance`/`governance_archive`/`portfolio` (residual of the public-only June sweep). | none (behavior-preserving) |
| `20260603_02_revoke_matview_api_exposure.sql` | `materialized_view_in_api` (4) | `REVOKE ALL` from `anon`/`authenticated` on `mv_sd_summary`, `mv_operations_dashboard`, `stage_zero_experiment_telemetry`, `v_gate_health_metrics`. Not in any publication; only server-side (service_role) readers. | very low |
| `20260603_03_revoke_secdef_execute_from_anon_authenticated.sql` | `anon`/`authenticated_security_definer_function_executable` (~230) | `REVOKE EXECUTE` from `anon`/`authenticated` on **112** public SECDEF RPCs; keeps an allowlist of **6** RLS/auth primitives executable (or RLS/auth breaks). | low |
| `20260603_04_tighten_permissive_write_rls_policies.sql` | `rls_policy_always_true` (125) | Drops 104 write-only always-true policies for `anon`/`authenticated`/PUBLIC; converts 21 `FOR ALL` policies to **SELECT-only** (preserves reads incl. Realtime). Snapshots originals to `migration_backup.*` for exact rollback. | medium |
| `20260603_05_move_extensions_out_of_public.sql` | `extension_in_public` (3) | Moves `vector`/`ltree`/`pg_trgm` to the `extensions` schema; first adds `extensions` to the `anon`/`authenticated`/`service_role` `search_path`. | **HIGH** |

Each migration is idempotent, guarded, ends in a **failing verification assert**,
and ships with a `_rollback.sql` companion (04's rollback replays the snapshot;
05's reverses the move + role search_path).

### ⚠️ Migration 05 (extensions) — apply separately

`vector` (237 members), `ltree` (145), `pg_trgm` (47) are all `extrelocatable=true`
with **no relation members**, so the move is a clean metadata relocation — existing
`vector`-typed columns and trgm/ltree indexes keep working by OID. **But** unqualified
type/operator references resolve via `search_path` at query time, so the migration
adds `extensions` to the API roles' path *before* moving. Still:

- Apply it **in a maintenance window, after testing on a Supabase DB branch.**
- Afterwards, verify embedding queries (`<->`/`<=>`/`::vector`), `pg_trgm`
  similarity/`%`, and `ltree` operators, plus that new index creation works.
- Apply **after** 01–04 are validated. Keep it as its own deploy step.

## Not fixable via SQL — platform/dashboard actions (do manually)

| Finding | Action |
|---------|--------|
| `auth_leaked_password_protection` | Supabase Dashboard → **Authentication → Policies/Passwords** → enable **"Leaked password protection"** (HaveIBeenPwned). Or via Management API `PATCH /v1/projects/{ref}/config/auth` with `password_hibp_enabled=true`. |
| `vulnerable_postgres_version` | Supabase Dashboard → **Settings → Infrastructure** → **Upgrade** Postgres (`supabase-postgres-17.4.1.074` has pending security patches). Schedule a maintenance window; take a backup first. |

## Accepted-by-design residual warnings (after applying)

These linter findings will (correctly) remain and should be **acknowledged, not
fixed** — remediating them would break authorization:

- `authenticated_security_definer_function_executable` for the 6 allowlisted
  RLS/auth primitives: `fn_is_chairman`, `fn_user_has_venture_access`,
  `is_leo_admin`, `fn_is_service_role`, `fn_user_has_company_access`,
  `check_feedback_rate_limit`. They are invoked inside RLS policy evaluation for the
  `authenticated` role; PostgreSQL checks `EXECUTE` against the *calling* role even
  for SECURITY DEFINER functions, so revoking them breaks RLS on the venture-scoped
  tables (`strategic_directives_v2`, `product_requirements_v2`, …).

## Out of scope (separate follow-up)

Migration 04 deliberately **preserves existing read access** (the conservative,
no-breakage choice for `rls_policy_always_true`, which only targets always-true
*writes*). Whether some tables should additionally **restrict SELECT** for
`anon`/PUBLIC (e.g. `chairman_constraints`, `session_coordination`, whose misnamed
`*_service_all` policies currently expose PUBLIC read) is a separate hardening task
not covered by this linter category.
