// LEAD-phase decision record for SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001.
// Replaces the auto-generated placeholder fields (key_changes/success_criteria/etc. from
// /leo create) with real content reflecting: (1) independent re-verification of the
// table-existence question using a discriminating probe (not the head-count trap the SD
// itself documents), (2) a new finding -- the upstream test_failures table is ALSO absent --
// that nobody in the prior investigation chain (Alpha, coordinator, Adam) checked, and
// (3) a revised technical direction that fulfills chairman decision 9d2c1ee9 (GO/build) via
// retargeting onto the real, live test_results/test_runs tables instead of creating a new
// chairman-gated migration.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const key_changes = [
  {
    change: "Retarget monitorTestFailures()'s realtime subscription (lib/rca-runtime-triggers.js:114-121) from the nonexistent 'test_failures' table onto the real, live 'test_results' table (INSERT event, filtered status=eq.failed).",
    impact: 'Closes the FIRST, previously-undiscovered defect layer: Postgres/Supabase Realtime cannot emit postgres_changes events for a table that does not exist, so this callback has never fired even once -- independent of and upstream from the playwright_test_scenarios gap the SD originally investigated.'
  },
  {
    change: "Replace the playwright_test_scenarios lookup (lines 127-131) with a self-join lookback against test_results itself: for the failing row's test identity (test_file_path + test_name, to avoid cross-file name collisions), fetch the most recent PRIOR row (created_at < failure.created_at, ordered DESC, limit 1) and check whether its status === 'passed'.",
    impact: "Closes the SECOND defect layer (the originally-scoped one) using data that already exists and is already live, instead of a new catalog table nothing would populate -- 0 other references to playwright_test_scenarios exist anywhere in the codebase (independently confirmed by worker Alpha), so even the originally-envisioned migration would likely have stayed silently broken via the guard's second conjunct."
  },
  {
    change: "Fix field-name mismatches in the triggerRCA(...) params built from the failure row: stack_trace -> error_stack, screenshot_url -> failure_screenshot_path, test_scenario_id -> dropped (no equivalent on test_results), sd_id -> derived via a join through test_runs (test_results.test_run_id -> test_runs.id -> test_runs.sd_id, confirmed test_runs carries sd_id).",
    impact: 'Without this, even a correctly-targeted query would silently populate the RCR with undefined fields, defeating the "loud, not silent" diagnostic-quality principle already established in this file (see the QF-20260726-175 comment block on triggerRCA).'
  },
  {
    change: 'Add regression test coverage: (a) synthetic pass-then-fail-within-24h for the same test identity correctly triggers an RCR with trigger_tier=2; (b) a first-ever failure (no prior row) does NOT trigger a false regression; (c) a failure >24h after the last pass does NOT trigger (existing hoursSincePass<=24 guard preserved); (d) static pin asserting the subscription channel targets table=test_results, not test_failures, so a future rename cannot silently reintroduce this exact defect class undetected.',
    impact: 'Closes the observability gap that let this run silently broken since the file was written -- the original defect was invisible specifically because nothing ever asserted the subscription actually fires.'
  },
  {
    change: 'NO new database migration or DDL required. Supersedes the originally-envisioned playwright_test_scenarios migration entirely -- this is a code-only fix against tables that already exist.',
    impact: 'Eliminates the chairman-gated-DDL-at-apply-time requirement that made this SD requires_human_action-adjacent in the first place; nothing in this revised plan needs a chairman ceremony to apply.'
  }
];

const success_criteria = [
  {
    criterion: 'A synthetic regression scenario (test passes, then fails <24h later, same test identity) creates a root_cause_reports row via triggerRCA.',
    measure: 'Unit/integration test asserting an RCR insert fires with trigger_tier=2 and the expected failure_signature shape when the synthetic scenario is exercised against the fixed callback logic.'
  },
  {
    criterion: 'The realtime subscription target and field names are correct against the live schema, not the previously-nonexistent tables.',
    measure: "Static/structural test asserting the channel's table option is 'test_results' (not 'test_failures') and the guard/query references live column names (error_stack, failure_screenshot_path, status) rather than the removed ones."
  },
  {
    criterion: 'No new chairman-gated migration is introduced by this fix.',
    measure: 'PR diff contains zero files under database/migrations/ -- the fix is code-only, confirmed at PR review time.'
  }
];

const success_metrics = [
  { metric: 'Regression-detection RCR creation on a synthetic trigger', target: '100% (was 0% -- silent no-op since the file was written)', actual: 'TBD' },
  { metric: 'New chairman-gated DDL introduced by this SD', target: '0 (previously envisioned as 1 migration + chairman ceremony)', actual: '0' },
  { metric: 'Realtime subscription actually receives events for its target table', target: 'Verified true (was silently false -- subscribed to a nonexistent table)', actual: 'TBD, verified in EXEC' }
];

const strategic_objectives = [
  'Make the regression-detection capability actually run, fulfilling chairman decision 9d2c1ee9 (GO/build) without requiring new chairman-gated DDL.',
  'Close a class of silent-failure risk (realtime subscription to a nonexistent table fails soft with no error) that could recur elsewhere in lib/rca-runtime-triggers.js\'s other 3 monitors if left undocumented.'
];

const risks = [
  {
    risk: 'test_results itself may no longer be the live write target for new test runs -- the most recent row observed during LEAD investigation (2026-08-16) is dated 2026-04-11, roughly 4 months stale.',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'Out of this SD\'s scope to fix a possibly-separate stale ingestion pipeline. EXEC verifies via a live write probe (or a synthetic INSERT) whether test_results still receives real INSERTs; if the pipeline itself is dead, that is filed as its own feedback/harness-backlog row rather than silently declared fixed here. The code fix in this SD is correct and independently testable (via synthetic INSERTs) regardless of whether the upstream pipeline is currently live.'
  },
  {
    risk: 'The self-join lookback query could misidentify a regression if the same test identity string is reused across different test files or unrelated SDs.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Scope the lookback query to test_file_path + test_name (not bare test_name) to avoid cross-file collisions. PLAN confirms the exact uniqueness scoping during PRD design; EXEC adds a test proving two different files with the same test_name do not cross-contaminate the lookback.'
  }
];

const smoke_test_steps = [
  { step_number: 1, instruction: "Insert a synthetic 'passed' test_results row (test_name='SMOKE-REGRESSION-TEST', a fixed test_file_path), then insert a 'failed' row for the same identity within 24h.", expected_outcome: 'Both inserts succeed against the live test_results table.' },
  { step_number: 2, instruction: 'Observe root_cause_reports for a new row with failure_signature starting test_regression:SMOKE-REGRESSION-TEST and trigger_tier=2.', expected_outcome: 'A new RCR row appears -- proof the previously-silent callback now actually fires end to end.' },
  { step_number: 3, instruction: 'Confirm the shipped PR diff contains zero files under database/migrations/.', expected_outcome: 'No new chairman-gated DDL was introduced.' }
];

const lead_decision = {
  at: new Date(2026, 7, 16, 20, 55).toISOString(),
  by: 'LEAD (Golf-5, session 42d805b8-dd3a-443c-9dc9-fb3cb7de3b05)',
  table_existence_reverified: {
    method: 'discriminating probe (real .select(col).limit(1), not the head-count-only trap the SD documents)',
    result: "playwright_test_scenarios: ABSENT (PGRST205) -- confirms worker Alpha, refutes the 2026-08-04 coordinator note's 'table exists' finding, which was itself an instance of the exact head-count artifact this SD's own body warns about.",
  },
  new_finding_not_previously_checked: "The UPSTREAM subscribed table 'test_failures' (rca-runtime-triggers.js:121) is ALSO absent (PGRST205, hint: 'Perhaps you meant test_results'). bootstrapRCAMonitoring() IS live-wired (server/index.js:401, unconditional on every server startup) so the subscription itself is genuinely established -- it simply can never receive events, since Realtime cannot emit postgres_changes for a nonexistent table. This is upstream of and independent from the playwright_test_scenarios gap every prior investigator (Alpha, coordinator, Adam) focused on.",
  real_data_source_confirmed: "test_results (live, populated; status column values confirmed: passed/failed/skipped -- matches the guard's check verbatim) with sd_id reachable via test_runs.test_run_id join (test_runs confirmed to carry sd_id).",
  decision: "Chairman decision 9d2c1ee9 (GO -- build, do not retire) is FULFILLED via a leaner mechanism than originally envisioned: retarget onto test_results + self-join lookback, needing ZERO new chairman-gated DDL, rather than creating playwright_test_scenarios (which nothing would have populated anyway -- 0 other references anywhere in the codebase per Alpha's confirmed investigation). This does not re-litigate the (a)/(b) call the chairman already made; it changes only the implementation mechanism, which is LEAD/PLAN's job, not a re-opening of 'build vs retire.'",
  signaled: '5a3c36b2-8574-4904-973b-5e13f760b6ae (spec-conflict signal to coordinator 0d37100a, 2026-08-16T20:52Z) -- transparency on the revised mechanism given the existing chairman-gated framing, not a request for re-approval.',
  nine_question_gate: {
    q1_need_validation: 'Real: regression detection has silently never run since inception; a real capability gap, not a perceived one.',
    q2_solution_assessment: 'Aligned: makes an existing, already-bootstrapped monitoring capability actually functional using existing, already-populated tables.',
    q3_feasibility: 'High -- code-only fix, no new infra, no new DDL, no new dependencies.',
    q4_value_analysis: 'High value/low cost: closes a silent-failure class (RLS/relation errors that fail soft) that already caused one production incident in a sibling monitor in this same file (QF-20260726-175, the 1h45m outage) -- this SD hardens the pattern the QF fix already established.',
    q5_existing_tools: 'Reuses test_results/test_runs (already live, already populated) instead of building a new catalog table -- directly answers this question in favor of not building new infra.',
    q6_risk_assessment: 'See risks[] -- both low/medium, both mitigated with explicit EXEC-phase verification steps, neither blocking.',
    q7_ui_inspectability: 'PARTIAL->acceptable: RCR output reuses the EXISTING root_cause_reports surface/dashboard (established RCA infrastructure used throughout this session); no new dark data is introduced.',
    q8_scope_reduction: 'The chairman-gated migration + apply-ceremony line of work (the entire reason this SD carried requires_human_action framing) is eliminated -- 100% removal of the DDL/ceremony scope, while the core code-fix scope (make regression detection real) is unchanged from the original ask. scope_reduction_percentage recorded as 40 to reflect a conservative, defensible estimate against total original SD scope (not just the DDL sub-portion).',
    q9_human_verifiable_outcome: 'See smoke_test_steps[] -- synthetic pass-then-fail insert produces an observable RCR row within the same session, no chairman-gated apply step required to observe it.'
  }
};

const updatePayload = {
  key_changes,
  success_criteria,
  success_metrics,
  strategic_objectives,
  risks,
  smoke_test_steps,
  scope_reduction_percentage: 40,
  status: 'active',
  approved_by: 'LEAD (autonomous, AUTO-PROCEED)',
  approval_date: new Date(2026, 7, 16, 20, 55).toISOString(),
  metadata: {
    ...(existing?.metadata || {}),
    lead_decision,
  },
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update(updatePayload)
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('LEAD decision recorded for', SD_KEY);
