<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\supabase-security-followups-plan.md -->
<!-- SD Key: SD-LEO-INFRA-SUPABASE-DATABASE-LINTER-001 -->
<!-- Archived at: 2026-06-03T14:51:38.594Z -->

# Supabase database-linter security follow-ups (extensions move, HIBP, Postgres upgrade, SELECT-policy tightening)

## Type
infrastructure

## Priority
medium

## Summary
Tracks the remaining Supabase database-linter SECURITY items not closed by PR #4197
(which shipped migrations for `function_search_path_mutable`, `materialized_view_in_api`,
`anon`/`authenticated_security_definer_function_executable`, and `rls_policy_always_true`).
These are deferred because they are either HIGH-RISK to apply, dashboard/ops-only
(no SQL), or a separate hardening pass. The platform DB (`dedlbzhpgkmetvhbkyzq`) runs a
service_role-only access model (see database/migrations/20260603_supabase_linter_remediation_README.md).

## Scope
1. APPLY migration `database/migrations/20260603_05_move_extensions_out_of_public.sql`
   (extension_in_public): move vector/ltree/pg_trgm to the `extensions` schema. HIGH RISK
   — apply in a maintenance window, AFTER testing on a Supabase DB branch. The migration
   already adds `extensions` to the anon/authenticated/service_role search_path before the
   move; afterward verify vector (`<->`/`<=>`/`::vector`), pg_trgm (`%`/`similarity`),
   ltree operators, and new index creation. Rollback companion exists.
2. Enable Supabase Auth "Leaked password protection" (auth_leaked_password_protection):
   Dashboard -> Authentication -> Passwords, or Management API
   `PATCH /v1/projects/{ref}/config/auth { password_hibp_enabled: true }`. No code.
3. Upgrade Postgres (vulnerable_postgres_version): `supabase-postgres-17.4.1.074` has
   pending security patches. Dashboard -> Settings -> Infrastructure -> Upgrade. Take a
   backup; schedule a maintenance window. No code.
4. Tighten anon/PUBLIC SELECT policies on tables whose misnamed `*_service_all` /
   "Service role full access" policies expose PUBLIC read (e.g. chairman_constraints,
   session_coordination, discovery_strategies, eva_architecture_decisions). PR #4197
   migration 04 deliberately preserved reads (only closed always-true WRITES); this is the
   separate SELECT-restriction pass — author a new migration converting those SELECT
   policies to service_role-only (or a real predicate) after confirming no anon/Realtime
   read dependency per table.

## Risks
- Item 1 (extensions move) can break vector/trgm/ltree queries or index builds if the
  search_path change is incomplete — must be validated on a DB branch first.
- Item 3 (Postgres upgrade) requires downtime/maintenance window and a verified backup.
- Item 4 must not remove SELECT for any table the anon Realtime client subscribes to.

## Success Criteria
- vector/ltree/pg_trgm no longer in `public` and all vector/trgm/ltree functionality verified.
- Leaked-password protection enabled (HaveIBeenPwned).
- Postgres upgraded to a patched version.
- No remaining `extension_in_public` / `auth_leaked_password_protection` /
  `vulnerable_postgres_version` linter findings, and the targeted PUBLIC-readable tables
  no longer expose anon/PUBLIC SELECT where unintended.

## Notes
Source: 2026-06-03 Supabase database-linter remediation session. Companion artifacts in
PR #4197 (branch fix/supabase-linter-security-hardening) and the migrations README.
Accepted-by-design residuals (do NOT file): the 6 allowlisted RLS/auth-primitive
SECURITY DEFINER functions that must remain authenticated-executable.
