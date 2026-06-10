<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/anon-scope.md -->
<!-- SD Key: SD-LEO-GEN-SCOPE-ANON-KEY-001 -->
<!-- Archived at: 2026-06-08T22:08:32.601Z -->

# Scope anon-key SELECT on LEO governance tables to authenticated/admin (close the public read exposure)

## Type
security

## Priority
high

## Summary
The published Supabase anon key (shipped in the EHG app's browser bundle) can SELECT internal LEO governance tables: strategic_directives_v2 (~3,606 rows live-verified readable), sd_phase_handoffs (~23,945), sub_agent_execution_results (~26,505), quick_fixes (~470), companies (~1,303). These SELECT USING(true) policies were intentionally kept for the Realtime dashboard, but they publicly expose internal strategy/process/handoff data to anyone holding the anon key. Chairman decision 2026-06-08: SCOPE reads to authenticated (not accept-as-is, not split-DB).

## Strategic Intent
Protect internal governance data (the system's own strategy, handoffs, and sub-agent reasoning) from anonymous public read while preserving the legitimate dashboard. As the platform moves from dummy pilot data toward real venture data, publicly-readable governance is a confidentiality exposure that should be closed before it carries sensitive content.

## Business Value
Closes a live, confirmed information-disclosure exposure (anyone with the public anon key can enumerate 3,606+ SDs and the full handoff/sub-agent history) with a bounded, reversible policy change — no architecture split required.

## Root Cause
SELECT USING(true) anon policies on governance tables were preserved for the Realtime dashboard consumer; no authenticated-scoping was applied.

## Success Criteria
- Anon-key SELECT on strategic_directives_v2 / sd_phase_handoffs / sub_agent_execution_results / quick_fixes / companies returns 0 rows (RLS scoped to authenticated/admin).
- The Realtime dashboard still functions (its reader role authenticates or uses a service/admin path).
- Service-role access (the fleet) is unaffected.
- Change is reversible (migration-down restores prior policy).

## Scope
- CRITICAL FIRST STEP (fail-safe): verify the Realtime dashboard's ACTUAL reader role/path BEFORE tightening. If the dashboard reads these tables via the anon key, scoping to authenticated WILL break it — the dashboard must first authenticate (or read via a dedicated role). Do NOT apply the policy change until the dashboard's continued function is confirmed (test against the live dashboard consumer).
- Migration: replace SELECT USING(true) with SELECT scoped to authenticated/admin (or a dedicated dashboard role) on the named governance tables; idempotent + reversible (migration-down).
- SECURITY sub-agent validates the policy + confirms zero dashboard/app breakage and zero fleet (service-role) impact before apply.

## Notes
- Chairman-directed 2026-06-08 (decision: scope to authenticated). Source: Adam Supabase-linter security triage (wf_8e9e43e7).
- Single-repo EHG_Engineer migration; the dashboard reader verification spans the EHG app.
