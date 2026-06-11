<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/sec-search-path-pin.md -->
<!-- SD Key: SD-LEO-GEN-PIN-SEARCH-PATH-001 -->
<!-- Archived at: 2026-06-08T16:37:12.010Z -->

# Pin search_path on three LEO SECURITY DEFINER functions (function_search_path_mutable)

## Type
security

## Priority
low

## Summary
Supabase database-linter WARNs: three LEO public-schema plpgsql functions have a role-mutable search_path (proconfig NULL): reset_cancelled_sd_patterns(text,text), trg_fn_reset_patterns_on_sd_cancel(), leo_auto_exec_audit_append_only(). SECURITY DEFINER + mutable search_path is a theoretical search-path-injection vector. Not reachable by anon/authenticated here (requires an attacker who can already create objects earlier on the resolution path), so this is standard hardening, not an active hole.

## Root Cause
The defining migrations omitted SET search_path on these functions.

## Success Criteria
- All three functions have a pinned search_path.
- Behavior is unchanged; the two trigger functions (which reference UNQUALIFIED issue_patterns) still fire correctly.

## Scope
- New forward migration with ALTER FUNCTION ... SET search_path = 'public', 'extensions' for each of the three functions.
- CRITICAL: use 'public','extensions' NOT empty-string '' — the trigger functions reference unqualified issue_patterns and empty-string would break resolution. This matches the convention already proven on the non-flagged sibling functions resolve_completed_sd_patterns / trg_fn_resolve_patterns_on_sd_complete (live proconfig=[public,extensions]).
- SECURITY sub-agent validates triggers still fire post-pin.

## Notes
- ASSESS-ONLY origin: Adam Supabase-linter triage. Mechanical, no behavioral change. May fold into a follow-up to SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001.
