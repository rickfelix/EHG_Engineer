<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/fn-guards.md -->
<!-- SD Key: SD-LEO-GEN-DEFENSE-DEPTH-ADD-001 -->
<!-- Archived at: 2026-06-08T22:08:42.450Z -->

# Defense-in-depth: add internal authorization guards to privileged SECURITY DEFINER functions

## Type
security

## Priority
low

## Summary
Privileged SECURITY DEFINER functions (delete_venture, and set_stage_override / set_global_auto_proceed which guard only on authenticated rather than chairman) lack internal authorization checks. This is NOT an open exploit — migration 20260603_03 already revoked EXECUTE from anon/authenticated/PUBLIC on these (live-verified 42501 permission-denied), so the attack path is closed at the grant layer. This SD adds belt-and-suspenders internal guards so a future accidental EXECUTE re-grant cannot re-open the hole. Chairman approved filing 2026-06-08.

## Strategic Intent
Make privileged venture/governance mutators safe-by-construction: even if a future migration accidentally re-grants EXECUTE, an internal fn_is_chairman()/service_role guard prevents unauthorized execution. Defense-in-depth on the highest-blast-radius functions (delete_venture hard-deletes a venture + cascades SD cancellation).

## Business Value
Cheap insurance against a re-grant regression on the most destructive RPCs; the kind of latent footgun that is invisible until a migration accidentally re-opens it.

## Root Cause
delete_venture got the cascade logic but missed the fn_is_chairman() guard its sibling kill_venture received in the same SD; set_stage_override/set_global_auto_proceed prove only authenticated, not chairman.

## Success Criteria
- delete_venture has an internal guard (fn_is_chairman() OR service_role) that rejects unauthorized callers even if EXECUTE were re-granted.
- set_stage_override + set_global_auto_proceed enforce chairman-only intent (add fn_is_chairman()) rather than any-authenticated.
- Confirm via introspection that the unguarded 3-arg approve_chairman_decision overload was dropped (drop migration exists); park_venture_decision / bootstrap_venture_workflow carry no inherited PUBLIC EXECUTE.
- No legitimate service-role/chairman call path breaks.

## Scope
- Add internal authz guards to the named functions (migration).
- Confirm the overload/inherited-grant open questions from the security assessment.
- SECURITY sub-agent validates that added guards do not break legitimate fleet/app call paths.

## Notes
- Chairman approved filing 2026-06-08 (defense-in-depth, low priority). Source: Adam Supabase-linter security triage (wf_8e9e43e7). Not an active hole — EXECUTE already revoked.
