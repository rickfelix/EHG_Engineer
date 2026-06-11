<!-- Archived from: C:/Users/rickf/.claude/plans/sd-defense-depth-venture-stage-fns.md -->
<!-- SD Key: SD-LEO-FIX-DEFENSE-DEPTH-CHAIRMAN-001 -->
<!-- Archived at: 2026-06-09T15:00:47.823Z -->

# Defense-in-depth: chairman/service_role authz guards on three venture-stage SECURITY DEFINER functions

## Type
fix

## Priority
medium

## Target Application
EHG_Engineer

## Summary
SECURITY sub-agent follow-up surfaced during SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001 (shipped PR #4433): extend the same internal `fn_is_chairman()` / `auth.role()='service_role'` authorization guard pattern to three more privileged `SECURITY DEFINER` functions — `advance_venture_stage`, `advance_venture_to_stage`, and `rescan_stage_20`. All three already exist as SECURITY DEFINER in the migration history (e.g. `database/migrations/20251217_fn_advance_venture_stage.sql`, `20260329_rescan_stage20_artifact_check.sql`) and run with owner privileges, so they should reject non-chairman / non-service-role callers internally rather than relying solely on GRANTs. This is defense-in-depth (no confirmed live hole), grouped into ONE SD because they share the same fn-only migration write surface.

## Scope
ONE function-only `CREATE OR REPLACE` migration that adds the chairman/service_role guard to `advance_venture_stage`, `advance_venture_to_stage`, and `rescan_stage_20`, mirroring the guard shipped on `kill_venture` / `park_venture_decision`. No schema change. Inside a SECURITY DEFINER body, `auth.role()` is the only reliable caller-role signal (current_user=owner, session_user=authenticator) — use `auth.role()='service_role'` for the service escape and `fn_is_chairman()` for the chairman check, exactly as the prior DEFENSE-DEPTH SDs did. Do NOT revoke `authenticated` EXECUTE (breaks the chairman UI).

## Key Principles
- VERIFY-EACH-PREMISE-VS-LIVE-FIRST: the prior DEFENSE-DEPTH SD's filed premise was wrong about anon-vs-authenticated EXECUTE. Before scoping each function, query its LIVE grants and current guard state; only add a guard where one is genuinely missing.
- Mirror the EXACTLY-precedented guard (`fn_is_chairman()` + `auth.role()='service_role'`); do not invent a new authz shape.
- Preserve the existing error-return contract of each function (some RAISE, some swallow OTHERS and RETURN a {success:false} shape).

## Acceptance
- Each of the three functions, when present and missing a guard, gains the chairman/service_role internal authorization check
- `authenticated` EXECUTE is NOT revoked (chairman UI still works)
- A live-DB test confirms a non-chairman, non-service caller is rejected and a chairman/service caller still succeeds
- SECURITY sub-agent score >= baseline; deployed function body byte-matches the migration

## Risks
- Over-revocation breaking the chairman UI (mitigation: never touch authenticated GRANTs; guard internally only)
- Premise drift — a function may already be guarded or may be an ordinary op that should NOT be guarded (mitigation: verify-vs-live before editing each fn)
- High blast radius (stage advancement is core venture flow) — require live regression before merge

## Smoke Test Steps
1. Call `advance_venture_stage` as a non-chairman authenticated role -> expect authz rejection
2. Call the same function as service_role -> expect success
3. Advance a test venture one stage as chairman -> expect normal success (no regression)

## Success Metrics
- Functions guarded: target 3 (or fewer if some verify as already-guarded / out-of-scope)
- Live authz-rejection test: target PASS
