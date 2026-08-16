// LEAD-phase field polish for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001.
// The SD's `description` (written at /leo create time, likely by Solomon/a prior security
// analysis pass) is exceptionally detailed and evidence-grounded — a genuine 5-dimension scan
// triaging 42 SECURITY DEFINER functions into 3 verified buckets. But success_criteria,
// success_metrics, key_changes, risks and smoke_test_steps were all left as /leo create's
// generic template placeholders ("See description for details", "Implement core changes for:
// [title]"), which GATE_PLACEHOLDER_CONTENT_DETECTION / SMOKE_TEST_SPECIFICATION will reject.
// This grounds them in the actual bucket content. Also corrects sd_type: infrastructure ->
// security (this is unambiguously permission/RLS-adjacent work per CLAUDE.md's Work Item
// Routing risk-keyword table), which changes the gate threshold from 80% to 90% and requires
// the SECURITY sub-agent.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';

const rationale = `Sequel to the role-flag RPC revoke (chairman verbal 'go' 2026-07-28) that closed 4 of 46 exposed SECURITY DEFINER functions — a class of exposure already responsible for a real incident (the 2026-07-27T02:00:08Z nil-UUID row, which recorded set_solomon_flag and set_coordinator_flag as its minting writers, deposed the live coordinator, and outranked the real Solomon session). The remaining 42 carry the same structural risk: SECURITY DEFINER functions owned by postgres bypass RLS entirely, and any function still granted EXECUTE to anon or PUBLIC is callable by anyone holding the client-shipped Supabase anon key. A blanket revoke would be faster but was rejected in favor of a per-function, five-dimension caller scan (app .rpc() call sites, 1563 RLS policy bodies, 746 function bodies, 451 triggers, 181 views) after three separate false positives — three functions that looked safe to revoke on a superficial pass were in fact app-called, RLS-policy-backing, or anon-facing-policy-backed, and revoking them would have broken production. The recurrence mechanism (ALTER DEFAULT PRIVILEGES) matters as much as the cleanup: Postgres grants EXECUTE to PUBLIC on every new function by default, which is how 46 of 137 SECURITY DEFINER functions became exposed with zero migration ever having written a REVOKE for them.`;

const success_criteria = [
  { criterion: 'Bucket A (6 functions: fn_enforce_stage_advancement_artifact_gate, fn_quick_fixes_validate_target_application, fn_stage_artifact_precondition, fn_user_has_company_access, fn_verify_and_consume_stepup_token, fn_write_kill_audit_trail) has EXECUTE revoked from BOTH anon and authenticated — verified via has_function_privilege() catalog check post-migration, not migration-file presence alone', measure: 'audit query returns anon_exec=false AND auth_exec=false for all 6' },
  { criterion: 'Bucket B (27 functions, app-called or RLS-policy-backed) has EXECUTE revoked from anon ONLY — authenticated grant is explicitly preserved, verified by re-running scripts/audit-rpc-execute-grants.mjs post-migration with zero missing-grant failures', measure: 'audit-rpc-execute-grants.mjs exits 0 after migration; anon_exec=false for all 27 via direct catalog check' },
  { criterion: 'Bucket C (9 functions: anon-facing-policy-backed or genuinely unplaced-and-treated-as-external-integration) has ZERO grant changes — the migration must not touch any of these 9, verified by diffing pg_proc grants before/after for exactly this set', measure: 'grant state for all 9 Bucket C functions is byte-identical before and after migration' },
  { criterion: 'ALTER DEFAULT PRIVILEGES is scoped to the correct creating role(s) and does not silently widen or narrow beyond the SD description\'s intent — tested against a throwaway function created post-migration to confirm it does NOT inherit PUBLIC EXECUTE', measure: 'a test function created after the ALTER DEFAULT PRIVILEGES statement has no PUBLIC/anon EXECUTE grant by default' },
  { criterion: 'The companion standing check (CI-parseable: any migration creating a SECURITY DEFINER function must include an explicit REVOKE...FROM PUBLIC or record why not) exists as a real, runnable guard, not just documented intent', measure: 'a seeded violation (a fixture migration with SECURITY DEFINER and no REVOKE) is caught by the guard; a seeded compliant migration passes' },
  { criterion: 'The migration is delivered as a chairman-gated deliverable (per the SD\'s own CHAIRMAN GATE clause: permission changes are non-delegable, stay on the 3-factor --prod-deploy path) — @approved-by is left blank, never filled by an automated agent', measure: 'migration file header has @approved-by: <blank> and a comment naming the 3-factor path requirement' },
];

const success_metrics = [
  { metric: 'Functions with anon/PUBLIC EXECUTE closed', target: '33 of 42 (Buckets A+B) revoked; 9 (Bucket C) deliberately left untouched', actual: 'TBD — pending chairman approval + application' },
  { metric: 'App-facing regressions from the revoke', target: '0 — scripts/audit-rpc-execute-grants.mjs must report 0 missing-grant failures post-migration', actual: 'TBD' },
  { metric: 'Recurrence prevention coverage', target: 'ALTER DEFAULT PRIVILEGES applied for the creating role(s); companion CI check catches a seeded future violation', actual: 'TBD' },
];

const key_changes = [
  { change: 'Author (not apply) a migration implementing Bucket A: REVOKE EXECUTE ON FUNCTION <6 sigs> FROM PUBLIC, anon, authenticated; re-GRANT to service_role/postgres only where those functions are still legitimately invoked internally', impact: 'Closes the 6 highest-confidence exposures — trigger functions and functions called only by other SECURITY DEFINER functions, which never need a client-facing grant at all' },
  { change: 'Author Bucket B: REVOKE EXECUTE ... FROM anon (authenticated explicitly preserved) for the 27 app-called/policy-backing functions', impact: 'Closes the anon-key attack surface for functions the authenticated app genuinely needs, without breaking any real app workflow' },
  { change: 'Explicitly do NOT modify Bucket C (9 functions) — anon-facing-policy-backed or genuinely external-integration-shaped (e.g. fn_relay_insert_sms_candidate, almost certainly the Twilio inbound webhook) — this is a deliberate exclusion, not an oversight', impact: 'Prevents a false-positive revoke from breaking the chairman\'s inbound SMS channel or any policy that legitimately needs anon access' },
  { change: 'Add ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC for the creating role, scoped and tested against a throwaway post-migration function', impact: 'Closes the actual root cause — Postgres granting PUBLIC EXECUTE to every new function by default is why 46 of 137 functions were exposed with no migration ever having revoked it' },
  { change: 'Add a CI-parseable standing check: any future migration creating a SECURITY DEFINER function must include an explicit REVOKE...FROM PUBLIC or record why not', impact: 'Converts a one-time cleanup into a durable guard — without this, the same exposure class reappears the next time someone writes CREATE FUNCTION ... SECURITY DEFINER' },
];

const risks = [
  {
    risk: 'Revoking authenticated EXECUTE from a Bucket B function the app secretly still calls (a caller the 5-dimension scan missed) causes HTTP 403 in production',
    impact: 'high', likelihood: 'low',
    mitigation: 'Bucket B explicitly PRESERVES authenticated (only anon is revoked) — the highest-risk action (revoking authenticated) is reserved for Bucket A, whose 6 functions are verified as trigger-only or SECDEF-internal-only, not app-reachable at all. Re-run scripts/audit-rpc-execute-grants.mjs post-migration as the final check.',
  },
  {
    risk: 'A Bucket C function is later mis-classified by a future change as safe-to-revoke, since "revoke nothing" reads as a lower-priority bucket than A/B',
    impact: 'medium', likelihood: 'low',
    mitigation: 'The migration file documents WHY each Bucket C function is excluded (anon-facing policy vs. genuinely-external-integration) so a future reader has the reasoning, not just the outcome.',
  },
  {
    risk: 'ALTER DEFAULT PRIVILEGES is scoped to the wrong role or schema, either silently failing to prevent future exposure (too narrow) or unexpectedly restricting a legitimate future grant (too broad)',
    impact: 'medium', likelihood: 'medium',
    mitigation: 'Test against a throwaway function created post-migration under the same creating role, confirming it does NOT inherit PUBLIC EXECUTE by default — this is a success_criteria item, not just an assumption.',
  },
  {
    risk: 'Live grant-state verification (has_function_privilege() catalog checks over the pooler) is currently BLOCKED by a broken SUPABASE_DB_PASSWORD/pooler credential (signaled as a harness-bug, session 642532a6, 2026-08-15) — the SD\'s bucket assignments are grounded in detailed prior analysis but were not independently re-verified against live grant state by LEAD',
    impact: 'medium', likelihood: 'high (already occurred)',
    mitigation: 'Re-run the live catalog verification (this exact check) at PLAN or EXEC phase once pooler credentials are restored, and BEFORE the migration is handed to the chairman for the 3-factor approval — do not let this gap survive to production application.',
  },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Before the migration is applied, run scripts/audit-rpc-execute-grants.mjs and record its baseline output (should currently show the app-called RPC set with authenticated EXECUTE intact — this SD does not touch authenticated grants for app-called functions)', expected_outcome: 'Baseline: 0 missing-grant failures (current state, pre-migration)' },
  { step_number: 2, instruction: 'After the migration is applied (post chairman approval), re-run scripts/audit-rpc-execute-grants.mjs', expected_outcome: 'Still 0 missing-grant failures — no app-called RPC lost its authenticated EXECUTE grant' },
  { step_number: 3, instruction: 'Directly query has_function_privilege() for one function from each bucket (e.g. fn_write_kill_audit_trail from A, claim_sd from B, fn_is_chairman from C) via the pooler', expected_outcome: 'A: anon=false, authenticated=false. B: anon=false, authenticated=true. C: unchanged from pre-migration baseline.' },
];

const { data: before, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (fetchErr) throw fetchErr;
if (!before) throw new Error(`SD not found: ${SD_KEY}`);

const { data: updated, error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    sd_type: 'security',
    rationale,
    success_criteria,
    success_metrics,
    key_changes,
    risks,
    smoke_test_steps,
    scope_reduction_percentage: 21, // 9 of 42 candidate functions (Bucket C) deliberately excluded from action
    governance_metadata: {
      type_change_reason: 'Auto-created by /leo create as infrastructure; the actual scope is REVOKE/GRANT EXECUTE permission changes on SECURITY DEFINER functions plus ALTER DEFAULT PRIVILEGES -- unambiguously security-classified per CLAUDE.md Work Item Routing risk keywords (auth, authorization, rls, permissions). Reclassifying to security to require the SECURITY sub-agent and the 90% gate threshold rather than infrastructure\'s 80%.',
    },
  })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key, sd_type, scope_reduction_percentage')
  .maybeSingle();
if (updateErr) throw updateErr;

console.log('UPDATED:', updated.sd_key, '| sd_type:', updated.sd_type, '| scope_reduction_percentage:', updated.scope_reduction_percentage);
