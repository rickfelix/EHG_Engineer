#!/usr/bin/env node
/**
 * PLAN-TO-EXEC-phase PRD correction for SD-LEO-INFRA-WIRE-MODEL-POLICY-001, informed by
 * testing-agent PLAN_TO_EXEC evidence (da29641a-82c6-474a-89e1-98b41e66e6e2), which measured
 * against current main that FR-1 as LEAD-approved was dead by construction:
 *
 * B1: existingMetadata is NEVER null/undefined (always {} on first-session/GET-failure/bad-data),
 *     so the PRD's "skip when null/undefined" mitigation never fires -- verdictFromMetadata({})
 *     returns 'worker', so the coordinator/first-session false positive this SD exists to fix
 *     would still be live.
 * B2: existingMetadata is function-local to upsertSessionRow(), which has 6 return points, all
 *     bare `return;` (no value) -- main() literally cannot receive it as FR-1 was written.
 * B3: LEO_HOOK_DRY_RUN=1's existing early-returns are local to upsertSessionRow() and the
 *     tick-spawn block; neither returns from main() itself, so a tail-call signal function would
 *     still fire (and INSERT) during dry-run tests -- the exact QF-20260903-195 defect class.
 * C1: hooks-harness-tests.yml is path-filtered to scripts/hooks/** and would never run on an
 *     FR-2-only PR; .github/workflows/unit-tier.yml (no path filter) is the authoritative gate.
 *
 * Corrects functional_requirements, technical_requirements, risks, and test_scenarios in place.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-SD-LEO-INFRA-WIRE-MODEL-POLICY-001';
const SD_KEY = 'SD-LEO-INFRA-WIRE-MODEL-POLICY-001';

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'SessionStart model-policy mismatch signal',
    priority: 'critical',
    description: "In scripts/hooks/capture-session-id.cjs, modify upsertSessionRow() to return { existingMetadata, hadPriorRow } at EVERY one of its existing return points (measured: 6 bare `return;` statements across its retry/attempt loop -- since no existing caller reads the return value today, adding a return object is purely additive and changes zero observable behavior). hadPriorRow MUST be true only when the metadata GET actually succeeded (getRes.ok) AND returned at least one row; a genuinely-first-ever session (no row), a GET failure/timeout, and a row whose metadata failed the object-shape check must ALL set hadPriorRow=false -- this is the correct generalization of 'skip when we cannot classify', replacing the LEAD-phase draft's null/undefined check, which was measured to never actually fire (existingMetadata is always initialized to {} and verdictFromMetadata({}) returns 'worker', not 'unknown'). main() must capture upsertSessionRow()'s return value (currently discarded) and pass it to a new exported function signalModelPolicyMismatch({ existingMetadata, hadPriorRow, model, supabase, emit, now }). That function's OWN FIRST guard clauses, checked before anything else and before touching hadPriorRow: (a) if process.env.LEO_MODEL_POLICY_SIGNAL === '0', return immediately -- kill switch; (b) if process.env.LEO_HOOK_DRY_RUN === '1', return immediately -- do NOT rely on upsertSessionRow's or the tick-spawn block's existing dry-run early-returns, neither of which returns from main() itself (measured: a tail-call after upsertSessionRow would still fire and INSERT during a dry-run test without this explicit check -- the QF-20260903-195 defect class). Then: if hadPriorRow is not strictly true, return (skip -- no signal, no further work). Classify existingMetadata via lib/fleet/role-status-identity.cjs's verdictFromMetadata -- NEVER lib/fleet/model-policy.cjs's seatClassFor, which collapses an absent/unknown role to 'worker' and reproduces the exact false positive this SD fixes. If the verdict is 'unknown', return (skip). Only for a definitive 'role' or 'worker' verdict: compute the expected model via model-policy.cjs's policyModelFor(verdict) -- NEVER call policyModelFor with anything other than the literal strings 'role'/'worker' (it silently falls back to the worker model for any other input, including 'unknown', with no error). Compare the observed model via model-policy.cjs's OWN coarseModelAlias (not the hook-local coarseModelAlias, which passes an unrecognized id through unchanged). On mismatch, call emit() (real emitFeedback in production; injected for tests) which performs its own day-salted dedup_hash insert-or-noop -- never an UPDATE-based dedup, since public.feedback's append-only trigger (confirmed live) rejects every UPDATE outright. Do NOT use lib/fleet/model-policy.cjs's own checkModelMismatch() -- it internally calls the banned seatClassFor() and would silently reintroduce the exact defect this SD fixes. Wrap the entire call to signalModelPolicyMismatch in its own try/catch at the call site in main(), placed as the LAST statement inside main(), so a throw anywhere inside it can never block, delay, or fail the existing env-file write, identity markers, /current pointer, claude_sessions upsert, or tick-daemon spawn.",
    acceptance_criteria: [
      'A session where upsertSessionRow reports hadPriorRow=false (first-ever session, OR the metadata GET failed/timed out, OR the row\'s metadata failed the object-shape check) never signals, regardless of the observed model -- this is the corrected, verified-firing version of the false-positive fix (the LEAD-phase draft\'s null/undefined check never actually fired).',
      'A session where hadPriorRow=true and existingMetadata has no role key, no is_coordinator, and no non_fleet flag classifies as \'worker\' via verdictFromMetadata; a session with is_coordinator:true, non_fleet:true, or a recognized role string classifies as \'role\' -- classification is delegated entirely to role-status-identity.cjs, never re-implemented, and lib/fleet/model-policy.cjs\'s checkModelMismatch/seatClassFor are never called anywhere in this path.',
      'process.env.LEO_HOOK_DRY_RUN=1 suppresses signalModelPolicyMismatch entirely, verified by a test that forces hadPriorRow=true and a genuine mismatch, sets LEO_HOOK_DRY_RUN=1, and asserts the injected emit is never called and no live feedback row is inserted.',
      'process.env.LEO_MODEL_POLICY_SIGNAL=0 suppresses the check entirely (asserted via an injected emit spy never being invoked, and no supabase call being made).',
      'A worker-classified session (hadPriorRow=true) observed running any Fable-family model id signals exactly once per day; an identical second SessionStart the same day inserts zero additional feedback rows (emitFeedback\'s built-in dedup).',
      'A role-classified session (hadPriorRow=true) observed running its policy model (claude-fable-5-1 alias) never signals.',
      'Forcing the injected emit (or supabase call) to throw does not prevent main() from completing and calling resolve() -- proves session registration is unaffected by a bug in the new code.',
      'upsertSessionRow\'s return-value change is verified to have zero effect on any existing caller/behavior: existing tests for upsertSessionRow (that ignore its return value) still pass unmodified.',
    ],
  },
  {
    id: 'FR-2',
    title: 'Fleet-dashboard "seats off policy" count',
    priority: 'high',
    description: "In scripts/fleet-dashboard.cjs, at the existing per-session metadata projection (already selects the full metadata JSONB blob -- no new query, no new column, confirmed against current main), classify each session using the SAME two modules as FR-1 (role-status-identity.cjs's verdictFromMetadata, already-in-hand metadata, purely synchronous; model-policy.cjs's policyModelFor/coarseModelAlias -- never checkModelMismatch/seatClassFor) and add one summary line reporting the count of sessions currently off their seat-class policy. This item has no dependency on FR-1 and may ship in its own commit, before or after FR-1. On any degraded input (a malformed metadata row, or the classification modules failing to load), the line MUST abstain (e.g. render 'N/A' or omit the line) rather than silently render a false '0 seats off policy'. New tests for this FR live under tests/unit/coordinator/ (the measured existing test-location convention for fleet-dashboard.cjs), as a new *.test.js file, exporting a pure classify-and-count helper so it is directly unit-testable without invoking the full dashboard CLI.",
    acceptance_criteria: [
      'Given a fixture set of session rows including a coordinator-shaped row (is_coordinator:true, no role string), a genuine worker-on-Fable row, and a role-seat-on-its-policy-model row, the computed off-policy count matches the hand-computed expected count exactly (1, from the worker-on-Fable row only).',
      'The dashboard issues no additional Supabase query beyond what it already runs to build the session list (confirmed by a query-count assertion in the new test).',
      'A simulated classification failure (e.g. an unparseable/non-object metadata value on one row) causes the summary line to abstain, never to render 0.',
    ],
  },
  {
    id: 'FR-3',
    title: 'Fail-open safety, and CI-visible test coverage',
    priority: 'high',
    description: "The FR-1 mismatch-signal path must be provably incapable of degrading existing SessionStart behavior, and the new tests for FR-1/FR-2 must be genuinely exercised by CI, not merely present on disk. New tests MUST be authored as new *.test.js files (measured: vitest's config only collects *.test.js; three pre-existing *.test.cjs suites in tests/unit/hooks/ are dark, never collected). CORRECTED CI enforcer citation: .github/workflows/hooks-harness-tests.yml is path-filtered to scripts/hooks/** and would NEVER run on an FR-2-only PR that touches only scripts/fleet-dashboard.cjs -- .github/workflows/unit-tier.yml (no path filter, runs on every PR, node 22) is the authoritative CI gate that must be confirmed to collect BOTH new test files, not just the hook one. Because emitFeedback (ESM, lib/governance/emit-feedback.js) is invoked from a CommonJS hook, the require() call itself must live inside the SAME fail-open try/catch as the rest of signalModelPolicyMismatch -- confirmed (prospective testing-agent measurement) that require() of this ESM module from CJS succeeds on the actual Node version in use; CI-runtime parity must still be independently confirmed, not assumed identical to any single local run.",
    acceptance_criteria: [
      'New FR-1 and FR-2 test files are named *.test.js (never *.test.cjs) and are confirmed collected by `npx vitest list` before being relied upon as CI-enforced coverage.',
      'The exact vitest invocation .github/workflows/unit-tier.yml runs in CI (not hooks-harness-tests.yml) is reproduced locally and confirmed to include BOTH new test files in its collected set.',
      'A CI-runtime check confirms require()-ing lib/governance/emit-feedback.js from the CJS hook context does not throw ERR_REQUIRE_ESM on the CI runner\'s actual Node version.',
    ],
  },
];

const technical_requirements = [
  { id: 'TR-1', title: 'No schema change', description: 'All new signals persist through the existing feedback table (INSERT only, compatible with its live append-only trigger) and the existing claude_sessions.metadata JSONB column; fleet-dashboard.cjs consumes only already-selected columns. No migration, no new table, no new column.' },
  { id: 'TR-2', title: 'Zero observable behavior change to existing SessionStart registration', description: "The env-file write, identity markers, /current pointer, claude_sessions upsert, and tick-daemon spawn are untouched in what they DO. upsertSessionRow()'s return value changes from implicit undefined to an explicit { existingMetadata, hadPriorRow } object at all 6 of its return points -- this is additive only (no existing caller reads the return value today) and must not alter any of upsertSessionRow's existing retry/timeout/4xx-bail/409-race logic." },
  { id: 'TR-3', title: 'Single source of truth for classification and policy', description: "lib/fleet/role-status-identity.cjs's verdictFromMetadata is the ONLY role classifier used by FR-1 and FR-2; lib/fleet/model-policy.cjs's policyModelFor/coarseModelAlias is the ONLY policy/alias logic used. lib/fleet/model-policy.cjs's checkModelMismatch and seatClassFor are explicitly NEVER called anywhere in FR-1 or FR-2 -- they reproduce the false-positive defect this SD exists to fix." },
  { id: 'TR-4', title: 'Fail-safe collapse of "cannot determine" states', description: 'hadPriorRow must be false (not merely existingMetadata being falsy) for every state where the hook cannot be certain a real prior row exists: no row found, GET request failed/timed out/aborted, or the row\'s metadata value failed its object-shape check. signalModelPolicyMismatch treats hadPriorRow=false identically to an unknown role verdict: skip, no signal.' },
];

const risks = [
  { risk: 'A role seat\'s very first SessionStart (before any role-registration step has run, hadPriorRow=false) never signals even if it is later found to be off-policy at that exact moment.', mitigation: 'Accepted as a one-time, self-healing edge case: the seat\'s SECOND SessionStart reads a real prior row (hadPriorRow=true) with the role already stamped by the intervening registration step, and classifies correctly from then on.', severity: 'low' },
  { risk: 'The feedback table (append-only, no cleanup) accumulates one row per genuine daily mismatch indefinitely.', mitigation: 'emitFeedback\'s built-in day-salted dedup already bounds this to at most one row per seat per day per mismatch.', severity: 'low' },
  { risk: 'require()-ing an ESM module (lib/governance/emit-feedback.js) from a CJS hook may throw ERR_REQUIRE_ESM on a Node version other than the one manually verified.', mitigation: 'The require() call is wrapped in the same fail-open try/catch as the rest of the signal logic; FR-3 requires an explicit CI-runtime confirmation.', severity: 'medium' },
  { risk: 'New tests silently never run in CI if placed in a *.test.cjs file, or if the wrong workflow (hooks-harness-tests.yml, which is path-filtered) is assumed to be authoritative for an FR-2-only change.', mitigation: 'FR-3 requires *.test.js naming, an explicit `npx vitest list` collection check, and names .github/workflows/unit-tier.yml (no path filter) as the authoritative CI gate to verify against.', severity: 'medium' },
  { risk: 'Modifying upsertSessionRow()\'s 6 return points to add a return value could be done inconsistently (e.g. missing one path), silently leaving hadPriorRow undefined on some code path and causing signalModelPolicyMismatch to skip or mis-signal unpredictably on that path.', mitigation: 'EXEC-TO-PLAN acceptance requires a test that exercises each distinct return path of upsertSessionRow (happy-path PATCH, INSERT-fallback, 409-race retry, 4xx bail, timeout, missing-credentials early-return) and asserts hadPriorRow is defined (true or false, never undefined) on every one.', severity: 'medium' },
];

const test_scenarios = [
  { id: 'TS-1', scenario: 'upsertSessionRow reports hadPriorRow=false: no prior row found (fresh session)', type: 'unit', expected: 'signalModelPolicyMismatch returns immediately, no signal, regardless of observed model -- the corrected, verified-firing version of the original false-positive fix' },
  { id: 'TS-1b', scenario: 'upsertSessionRow reports hadPriorRow=false because the metadata GET failed/timed out', type: 'unit', expected: 'Same as TS-1 -- no signal; GET failure is indistinguishable from no-row for signaling purposes' },
  { id: 'TS-2', scenario: 'hadPriorRow=true, existingMetadata has is_coordinator:true (no role string), observed running claude-fable-5-1', type: 'unit', expected: "Classified 'role' via verdictFromMetadata, no mismatch (Fable IS the role policy model) -- proves the coordinator false-positive is genuinely fixed, not just claimed" },
  { id: 'TS-3', scenario: 'hadPriorRow=true, worker existingMetadata (no role/is_coordinator/non_fleet), observed running claude-fable-5-1', type: 'unit', expected: 'Signals exactly once via injected emit spy; a second identical call the same day does not double-insert' },
  { id: 'TS-4', scenario: 'Injected emit throws inside signalModelPolicyMismatch', type: 'unit', expected: 'main() still completes and calls resolve(); no unhandled rejection' },
  { id: 'TS-5', scenario: 'LEO_MODEL_POLICY_SIGNAL=0 set, with hadPriorRow=true and a genuine mismatch present', type: 'unit', expected: 'emit spy never called, no supabase call made' },
  { id: 'TS-5b', scenario: 'LEO_HOOK_DRY_RUN=1 set, with hadPriorRow=true and a genuine mismatch present', type: 'unit', expected: 'emit spy never called -- proves the new function\'s OWN dry-run guard fires, since neither of the hook\'s existing dry-run early-returns reaches main() itself' },
  { id: 'TS-6', scenario: 'fleet-dashboard.cjs fixture: coordinator-shaped row + worker-on-Fable row + role-on-policy row', type: 'unit', expected: 'Off-policy count line reads exactly 1' },
  { id: 'TS-7', scenario: 'fleet-dashboard.cjs fixture with one malformed metadata row', type: 'unit', expected: "Off-policy line abstains (e.g. 'N/A'), never renders 0" },
  { id: 'TS-8', scenario: 'New test file collection check against the CORRECT CI workflow', type: 'integration', expected: '`npx vitest list` includes both new *.test.js files; reproducing .github/workflows/unit-tier.yml\'s exact vitest invocation locally (not hooks-harness-tests.yml) includes both files in its collected set' },
  { id: 'TS-9', scenario: 'Each of upsertSessionRow\'s distinct return paths (happy PATCH, INSERT-fallback, 409-race, 4xx bail, timeout, missing-credentials)', type: 'unit', expected: 'hadPriorRow is defined (true or false, never undefined) on every path' },
];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements, risks, test_scenarios })
    .eq('id', PRD_ID)
    .select('id');
  if (error) throw new Error(`PRD update failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`no PRD row matched id=${PRD_ID}`);

  // Mirror the correction into the SD's own mechanism_verifications for the new claims.
  const { data: sdRow, error: sdFetchErr } = await supabase
    .from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (sdFetchErr) throw new Error(`SD fetch failed: ${sdFetchErr.message}`);
  const verified_by = 'Alpha-2 (worker, direct file read, PLAN-TO-EXEC correction)';
  const newVerifications = [
    { claim: 'scripts/hooks/capture-session-id.cjs\'s upsertSessionRow() has 6 return points, all bare `return;` with no value, across a 3-attempt retry loop (PATCH/INSERT-fallback/409-race/4xx-bail/timeout/missing-credentials)', verified_by, verified_at: 'scripts/hooks/capture-session-id.cjs:398-560 (upsertSessionRow)' },
    { claim: 'existingMetadata is initialized to {} at declaration and is never null/undefined on any path', verified_by, verified_at: 'scripts/hooks/capture-session-id.cjs:423' },
    { claim: 'LEO_HOOK_DRY_RUN=1\'s early-returns inside upsertSessionRow() and the tick-spawn block do not return from main() itself', verified_by, verified_at: 'scripts/hooks/capture-session-id.cjs:409-417 (upsertSessionRow) and :770-776 (tick-spawn block)' },
  ];
  const mergedMetadata = {
    ...(sdRow.metadata || {}),
    mechanism_verifications: [...(sdRow.metadata?.mechanism_verifications || []), ...newVerifications],
    mechanism_verifications_plan_to_exec_correction_at: new Date().toISOString(),
  };
  const { error: sdUpdateErr } = await supabase
    .from('strategic_directives_v2').update({ metadata: mergedMetadata }).eq('sd_key', SD_KEY);
  if (sdUpdateErr) throw new Error(`SD metadata update failed: ${sdUpdateErr.message}`);

  console.log(`Corrected PRD ${PRD_ID}: ${functional_requirements.length} FRs, ${technical_requirements.length} TRs, ${risks.length} risks, ${test_scenarios.length} test scenarios.`);
  console.log(`Added ${newVerifications.length} mechanism_verifications to ${SD_KEY}.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
