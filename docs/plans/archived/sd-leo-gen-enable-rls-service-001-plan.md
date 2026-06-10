<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/sec-coordination-events-rls.md -->
<!-- SD Key: SD-LEO-GEN-ENABLE-RLS-SERVICE-001 -->
<!-- Archived at: 2026-06-08T16:37:08.371Z -->

# Enable RLS + service_role-only (append-only) policy on public.coordination_events

## Type
security

## Priority
high

## Summary
Supabase database-linter ERRORs: public.coordination_events has RLS DISABLED while exposed via PostgREST, and carries column session_id. Assessment empirically verified (anon-key probe INSERT succeeded, then reverted via service-role; table re-confirmed 0 rows) that the anon role can READ and WRITE arbitrary rows. Blast radius today is low-medium (table empty, detector feature default-OFF behind COORD_DETECTORS_V2, sole writer scripts/stale-session-sweep.cjs uses the service-role key, no anon/frontend reader), but the anon-WRITE path is a forward-looking log/observability-poisoning vector: an attacker holding the published anon key could inject forged SPLIT_BRAIN/STUCK_WORKER/CLAIM_HALF_WRITE anomaly rows that the planned epic-#3 self-improvement loop + coordinator will consume.

## Root Cause
The creating migration (database/migrations/20260605_create_coordination_events.sql) never added ENABLE ROW LEVEL SECURITY or any policy, so Supabase default blanket anon/authenticated table grants left it fully exposed via the API.

## Success Criteria
- RLS is enabled on public.coordination_events.
- A service_role-only SELECT + INSERT policy exists; ALL privileges revoked from anon and authenticated.
- The sole writer (stale-session-sweep.cjs via createSupabaseServiceClient, service-role key) continues to function unaffected (service-role bypasses RLS) — verified, fleet not broken.
- Optional/recommended: table is append-only (REVOKE UPDATE/DELETE/TRUNCATE from service_role + a BEFORE UPDATE/DELETE guard trigger), mirroring the immutable-observation-log intent and the leo_auto_exec_audit pattern.
- Migration is idempotent (DROP POLICY IF EXISTS).

## Scope
- New forward migration modeled on the codebase canonical analog database/migrations/20260607_auto_exec_engine_audit.sql:64-136: ALTER TABLE ... ENABLE ROW LEVEL SECURITY; service_role SELECT + INSERT policies; GRANT SELECT,INSERT TO service_role; REVOKE ALL FROM anon, authenticated.
- Pre-apply check: confirm coordination_events is not in any Realtime publication (pg_publication_tables) — no code subscribes, so expected non-issue.
- SECURITY sub-agent validates the policy + grants and confirms zero fleet/app breakage before apply.

## Notes
- ASSESS-ONLY origin: Adam Supabase-linter triage (workflow wf_8e9e43e7). Enabling RLS is SAFE — the only writer uses the service-role key. session_id is a LEO claude_sessions UUID (low intrinsic sensitivity); the value is closing whole-table exposure.
