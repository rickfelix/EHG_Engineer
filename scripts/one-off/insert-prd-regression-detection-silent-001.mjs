// PRD creation for SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001, per CLAUDE_PLAN.md's
// inline-mode contract: add-prd-to-database.js printed the generation prompt; this script
// authors and inserts the PRD JSON directly, incorporating the full LEAD-phase investigation
// (VALIDATION evidence 092fa8f6, TESTING evidence 5990427e, both independently re-verified
// against the live DB before being folded into scope).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';
const SD_ID = '4776c92d-417c-429b-a407-7fcd6b791812'; // strategic_directives_v2.id (canonical UUID, confirmed via SD-ID-NORMALIZER)
const PRD_ID = `PRD-${SD_KEY}`;

const executive_summary =
  "Fixes rca-runtime-triggers.js's monitorTestFailures(), silently dead since inception (3 independently-confirmed layers: nonexistent trigger table, nonexistent lookup table, unpublished realtime target, and RLS-denied write) — retargets onto live test_results/test_runs, no new tables.";

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: "Retarget monitorTestFailures()'s postgres_changes subscription from the nonexistent 'test_failures' table onto the live, populated 'test_results' table, filtered server-side to INSERT events with status=eq.failed.",
    description: "lib/rca-runtime-triggers.js:114-121 currently subscribes to a table confirmed absent from both pg_class and the PostgREST schema cache (PGRST205). Postgres/Supabase Realtime cannot emit postgres_changes events for a nonexistent table, so this callback has never executed even once, independent of and upstream from the downstream lookup defect. test_results is confirmed live (52 rows, actively written by lib/reporters/leo-playwright-reporter.js) with a status column (values: passed/failed/skipped) that supports server-side filtering, avoiding invoking the handler for the ~94% of rows that are not failures.",
    priority: 'CRITICAL',
    acceptance_criteria: [
      "The .on() call's config argument deep-equals {event:'INSERT', schema:'public', table:'test_results', filter:'status=eq.failed'} (asserted via captured mock args, TS-7).",
      'The realtime channel name is no longer the misleading literal "test_failures" from the old code (which would falsely satisfy a naive source-text pin even post-fix).',
    ],
  },
  {
    id: 'FR-2',
    requirement: 'Replace the playwright_test_scenarios lookup with a run-relative self-join lookback against test_results itself, keyed on test_full_title, comparing to the most recent PRIOR row from an earlier test_run_id.',
    description: "The original code's wall-clock 24h window and playwright_test_scenarios lookup are both non-functional: the table does not exist, and even retargeted onto test_results, a wall-clock 24h window would silently discard nearly every real regression (measured: real test_runs are 8-24 days apart, most recent row is 127+ days stale). Direct measurement also found 52/52 existing rows have a unique (test_file_path,test_name) pair, so a same-pair self-join over ALL history would never match -- the lookback MUST scope to the same test_full_title (confirmed the stable identity: test_file_path was found holding non-test source paths on 2 rows) and compare against the most recent row from a DIFFERENT, EARLIER test_run_id (not wall-clock time), ordered by (test_runs.started_at DESC, test_runs.id DESC) for determinism (two existing test_runs share an identical started_at).",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'A synthetic failing row whose most recent prior-run row (same test_full_title) has status=passed triggers an RCA attempt (TS-1).',
      'A synthetic failing row with NO prior row for that test_full_title does NOT trigger (TS-2).',
      "A synthetic failing row whose most recent prior-run row also has status=failed does NOT trigger (TS-3).",
      'A same-run retry (same test_run_id, same test_full_title) is excluded from the lookback -- only rows from an EARLIER test_run_id qualify (TS-6).',
    ],
  },
  {
    id: 'FR-3',
    requirement: 'Add an explicit NULL/empty guard on test_full_title before any lookback query runs, logging loudly and skipping the trigger attempt rather than misclassifying.',
    description: "4 of 52 existing test_results rows have test_full_title=NULL (all from tests/unit/eva/stage-08-uuid-validation.test.js in one run). Without a guard, a NULL-title failure would either be misclassified as 'first-ever failure' (silently never triggering, reproducing this SD's exact defect class on a different column) or, if queried via .is('test_full_title', null), would cross-match against ALL other NULL-title rows regardless of which test they belong to (false positives across unrelated tests).",
    priority: 'HIGH',
    acceptance_criteria: [
      'A synthetic failing row with test_full_title=null logs a loud warning and does not attempt any lookback query (TS-4).',
    ],
  },
  {
    id: 'FR-4',
    requirement: "Fix field-name mismatches in the triggerRCA(...) params built from the failing row: map error_stack (not stack_trace) and failure_screenshot_path (not screenshot_url) into evidence_refs, drop test_scenario_id entirely (no equivalent field, confirmed zero other references anywhere in the codebase), and derive sd_id via a join through test_runs (test_results.test_run_id -> test_runs.id -> test_runs.sd_id).",
    description: 'Without this, even a correctly-targeted, correctly-filtered query would silently populate the RCR with undefined fields for stack_trace/screenshot_url (breaking the confidence-score formula\'s evidence_refs.stack_trace check) and leave sd_id permanently null (test_results itself has no sd_id column; it is only reachable via test_runs). An unguarded null sd_id also collides failure_signature dedup keys across unrelated SDs (interpolates as "test_regression:<name>:undefined").',
    priority: 'HIGH',
    acceptance_criteria: [
      'evidence_refs.stack_trace is populated from the row\'s error_stack column when present.',
      'evidence_refs.screenshot_url is populated from the row\'s failure_screenshot_path column when present.',
      'sd_id passed to triggerRCA is derived via the test_runs join, not read directly off test_results (which has no such column).',
    ],
  },
  {
    id: 'FR-5',
    requirement: 'Change triggerRCA()/triggerRCAOrThrow()\'s Supabase client from createSupabaseClient() (anon key) to createSupabaseServiceClient() (both already exported from lib/supabase-client.js) -- a single shared-helper change, not a per-call-site parameter.',
    description: "Independently confirmed live: an anon-key INSERT into root_cause_reports returns 42501 (RLS policy violation); 0 rows with trigger_source='TEST_FAILURE' exist in the table's entire history. Even with FR-1 through FR-4 fully correct, the terminal write would be silently swallowed by the existing QF-20260726-175 fail-soft wrapper (same error code as the incident that motivated it) -- this SD would ship a fix for silent regression detection that is itself silent. lib/rca-runtime-triggers.js is server-only code (imported only by lib/rca-monitor-bootstrap.js, invoked from server/index.js at startup; never reachable from browser/client code), so anon-key usage here has no legitimate least-privilege rationale. This is a deliberate, evidence-based exception to the do-not-touch-the-other-3-monitors boundary: the exception is scoped to ONE shared helper's client choice, not a rewrite of any other monitor's subscription logic. The other 3 monitors remain non-functional for their OWN, independently-filed reasons (feedback ade11984: sub_agent_execution_results unpublished; feedback d9fcf973: retrospectives replica identity strips payload.old) regardless of this change.",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'A mocked RCR insert using the service-role client factory succeeds without a 42501-shaped error (TS-9).',
      'git diff shows monitorSubAgentFailures, monitorQualityGates, and monitorHandoffRejections function bodies are byte-identical to origin/main except for the shared triggerRCA client change.',
    ],
  },
  {
    id: 'FR-6',
    requirement: 'Author regression test coverage using the real .on() handler captured off a mocked channel (per in-repo precedent tests/unit/eva/venture-monitor.test.js), not an extracted, separately-tested helper function.',
    description: 'No callable seam exists today for the postgres_changes callback body (it is an inline anonymous arrow, the 3rd argument to .on()). Extracting one would convert this bug-fix SD into a refactor for no test-power gain, and an extracted function\'s test could go green while the function is never actually wired into .on() -- proving the ends, not the wire. Capture the handler via mockSupabase._mockChannel.on.mock.calls[0][2] and invoke it directly with a fake payload; combine with tests/unit/rca-trigger-failsoft.test.js\'s vi.mock hoisting-safe indirection pattern for the Supabase client mock.',
    priority: 'HIGH',
    acceptance_criteria: [
      'New test file(s) cover TS-1 through TS-7 and TS-9 (see test_scenarios), all passing.',
      'tests/unit/rca-runtime-triggers.test.js (which currently redeclares local copies of helper logic instead of importing the real module) is either updated to import and exercise the real monitorTestFailures, or the new coverage lives in a dedicated file and this fact is noted in the PR description -- either way, zero-coverage-of-the-real-function is closed.',
    ],
  },
  {
    id: 'FR-7',
    requirement: 'Stage (do not apply) a single-statement, idempotent migration: ALTER PUBLICATION supabase_realtime ADD TABLE test_results;',
    description: "Independently confirmed via a direct pg_publication_tables query (not REST): test_results/test_runs/test_failures are 0 of 21 currently-published tables. Without this, the retargeted subscription (FR-1) would still never receive events even with every other fix applied. This IS real DDL (system-catalog change, alters production data-broadcast posture) and gets the same staged-not-applied, chairman-ceremony treatment the SD originally specified for the now-superseded playwright_test_scenarios CREATE TABLE -- a single, much smaller/safer ALTER PUBLICATION statement instead of a new table with columns and RLS policies. Wrap in a DO block checking pg_publication_tables first (or catch 42710) so re-running the staged file is safe.",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'The migration file contains exactly one ALTER PUBLICATION statement, guarded for idempotency.',
      'The migration is NOT executed against the live database as part of this SD -- staged only, applied later at a chairman ceremony.',
      'metadata.apply_gate on the SD explicitly documents this as chairman-gated at apply time.',
    ],
  },
  {
    id: 'FR-8',
    requirement: 'Update docs/reference/root-cause-agent.md\'s Tier-2 trigger description (currently documents the old test_failures + playwright_test_scenarios mechanism) to describe the test_results-based mechanism.',
    description: 'Confirmed via codebase search: this is the one other file (besides the broken call site itself) that documents the mechanism this SD replaces. Leaving it unmodified would document a mechanism that no longer exists in code.',
    priority: 'MEDIUM',
    acceptance_criteria: [
      'docs/reference/root-cause-agent.md no longer references test_failures or playwright_test_scenarios in the Tier-2 trigger description.',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'test_full_title is the identity key for the regression lookback, not test_file_path + test_name.',
    rationale: 'Direct measurement found test_file_path holds non-test source paths on at least 2 live rows (different writers populate it with different semantics) — it is not a stable identity component. test_full_title is the field Playwright itself constructs as a unique per-test identifier.',
  },
  {
    id: 'TR-2',
    requirement: 'The triggerRCA client change (FR-5) is a single-line edit to the shared helper in this file only -- it must not be implemented as a new environment variable, feature flag, or per-call-site branching parameter.',
    rationale: 'The codebase already exports createSupabaseServiceClient() as the established pattern for legitimate backend service writes; introducing a new toggle mechanism for a straightforwardly-correct client choice would be unjustified complexity.',
  },
  {
    id: 'TR-3',
    requirement: 'The staged migration (FR-7) must be idempotent (safe to re-run) and must NOT be executed as part of this SD\'s EXEC or PLAN-TO-LEAD verification -- it is chairman-gated DDL, staged only.',
    rationale: 'Matches the SD\'s original decision framework and this repo\'s documented pattern (CLAUDE.md: "USE PROCESS SCRIPTS... --bypass-validation --bypass-reason on handoff.js... EMERGENCY_PUSH"; migrations are never applied inline by an autonomous worker).',
  },
  {
    id: 'TR-4',
    requirement: 'No handler-extraction refactor: the postgres_changes callback body stays inline as the 3rd argument to .on(); tests capture it directly off the mock.',
    rationale: "TESTING sub-agent's explicit prospective finding, with in-repo precedent (tests/unit/eva/venture-monitor.test.js) already demonstrating the pattern works and proves the actual wiring, not just isolated logic.",
  },
  {
    id: 'TR-5',
    requirement: 'The lookback query must use a deterministic ORDER BY (test_runs.started_at DESC, test_runs.id DESC), not started_at alone.',
    rationale: 'Confirmed live: two existing test_runs share an identical started_at timestamp, so ordering by started_at alone is non-deterministic and would produce flaky test/production behavior.',
  },
];

const system_architecture = {
  overview:
    'A targeted repair of one realtime-triggered diagnostic monitor inside the existing 4-monitor RCA auto-trigger family (lib/rca-runtime-triggers.js). No new services or tables are introduced; the fix retargets an existing Supabase Realtime subscription onto already-live tables (test_results/test_runs) and corrects the shared diagnostic-write client\'s privilege level.',
  components: [
    { name: 'monitorTestFailures() [modified]', responsibility: 'Realtime postgres_changes subscription + regression-lookback query + RCA trigger invocation', technology: 'Supabase Realtime JS client, Node.js' },
    { name: 'triggerRCA() / triggerRCAOrThrow() [modified: client only]', responsibility: 'Fail-soft diagnostic writer into root_cause_reports', technology: 'Supabase JS (service-role client)' },
    { name: 'test_results / test_runs [existing, schema unmodified]', responsibility: 'System of record for Playwright test outcomes and run metadata', technology: 'Postgres (Supabase)' },
    { name: 'supabase_realtime publication [staged DDL only]', responsibility: 'Controls which tables broadcast postgres_changes events', technology: 'Postgres logical replication (pg_publication)' },
    { name: 'root_cause_reports [existing, unmodified]', responsibility: 'Downstream table read by the existing RCA sub-agent pipeline', technology: 'Postgres (Supabase)' },
  ],
  data_flow:
    "Playwright test run -> lib/reporters/leo-playwright-reporter.js writes test_run + test_results rows -> (once test_results is added to the supabase_realtime publication via the staged migration) a postgres_changes INSERT event fires for status='failed' rows -> monitorTestFailures()'s handler runs a run-relative self-join lookback against test_results (joined through test_runs for run ordering and sd_id) -> if the most recent prior run's same-test_full_title row was 'passed', triggerRCA() is invoked with corrected field mappings -> the existing fail-soft wrapper writes to root_cause_reports via the (now service-role) client -> the existing, unmodified RCA sub-agent pipeline (lib/sub-agents/rca.js) consumes it exactly as it already does for the other 3 trigger sources.",
  integration_points: [
    'lib/reporters/leo-playwright-reporter.js (upstream writer, unmodified)',
    "server/index.js's bootstrapRCAMonitoring() (unmodified call site, existing wiring, live-wired unconditionally at startup)",
    'lib/sub-agents/rca.js (downstream consumer, unmodified — already keys only on the trigger_source string value)',
    'docs/reference/root-cause-agent.md (documentation, updated to match, FR-8)',
  ],
};

const test_scenarios = [
  { id: 'TS-1', scenario: 'Real regression: prior run passed, current run fails for the same test', test_type: 'unit', given: "test_results has a row for test_full_title X from an earlier test_run with status='passed', and no other constraints violate FR-3/FR-4", when: "a new test_results INSERT event fires for the same test_full_title X with status='failed' in a LATER test_run", then: "the captured .on() handler invokes triggerRCA with trigger_tier=2 and correctly-mapped evidence_refs/sd_id" },
  { id: 'TS-2', scenario: 'First-ever failure, no history', test_type: 'unit', given: 'test_full_title X has NO prior row in test_results at all', when: 'a failing row for X is inserted', then: 'no RCA trigger occurs — the lookback correctly returns no match and this is treated as non-regression, not an error' },
  { id: 'TS-3', scenario: 'Still failing, not a regression', test_type: 'unit', given: "the most recent prior-run row for test_full_title X also has status='failed'", when: 'a new failing row for X is inserted in a later run', then: 'no RCA trigger occurs — X was already broken, this is not a regression' },
  { id: 'TS-4', scenario: 'NULL test_full_title guard', test_type: 'unit', given: 'an inserted test_results row has test_full_title=null', when: 'the handler processes it', then: 'a loud warning is logged and no lookback query is attempted (no misclassification, no cross-match against other NULL-title rows)' },
  { id: 'TS-5', scenario: 'Deterministic ordering under a started_at tie', test_type: 'unit', given: 'two test_runs share an identical started_at timestamp, both containing a row for the same test_full_title', when: 'the lookback query executes', then: 'the (started_at DESC, id DESC) tiebreaker produces a stable, repeatable result across repeated invocations' },
  { id: 'TS-6', scenario: 'Same-run retry exclusion', test_type: 'unit', given: 'the SAME test_run_id contains two rows for the same test_full_title (a Playwright retry), the first passed and the second failed', when: 'the handler processes the second (failing) row', then: 'the lookback excludes the same-run sibling row entirely and only considers rows from an earlier test_run_id — correctly finding no qualifying prior row (or the true earlier-run result)' },
  { id: 'TS-7', scenario: 'Subscription wiring pin', test_type: 'unit', given: 'monitorTestFailures() is invoked and its .channel().on() call is captured via the mock', when: 'the config argument passed to .on() is inspected', then: "it deep-equals {event:'INSERT', schema:'public', table:'test_results', filter:'status=eq.failed'} — immune to the channel-name false-pin trap (the old channel name was also literally the string 'test_failures')" },
  { id: 'TS-8', scenario: 'End-to-end live-fire proof (post-migration-apply verification)', test_type: 'integration', given: 'the staged ALTER PUBLICATION migration has been applied by the chairman ceremony and the server has been restarted', when: 'a synthetic passed test_results row is inserted, followed by a synthetic failed row for the same test_full_title in a later test_run', then: 'a NEW root_cause_reports row with trigger_source=TEST_FAILURE appears — the count moves off its current value of 0 for the first time since this file was written; this scenario is EXECUTED AND DOCUMENTED at EXEC/verification time, not merely coded, since it depends on DDL that is chairman-gated and may not be applied yet at PR-merge time' },
  { id: 'TS-9', scenario: 'RCA write succeeds under the service-role client', test_type: 'unit', given: 'triggerRCA is invoked with a mocked Supabase client factory', when: 'the RCR insert executes', then: 'the mock asserts createSupabaseServiceClient (not createSupabaseClient/anon) is the factory used, and the insert completes without a 42501-shaped RLS error path being exercised' },
];

const acceptance_criteria = [
  "SELECT count(*) FROM root_cause_reports WHERE trigger_source='TEST_FAILURE' moves off 0 after a real or synthetic failing test_results INSERT with a prior passing run for the same test_full_title, verified post-chairman-ceremony (TS-8) — the current count is 0 across the table's entire history.",
  'All new/modified unit tests (TS-1 through TS-7, TS-9) pass with zero failures and are not in tests/quarantine-manifest.json.',
  'The PR diff contains at most one file under database/migrations/, containing exactly the single idempotent ALTER PUBLICATION statement (FR-7) — not applied by this SD.',
  'docs/reference/root-cause-agent.md no longer describes the test_failures/playwright_test_scenarios mechanism (FR-8).',
  'git diff shows monitorSubAgentFailures, monitorQualityGates, and monitorHandoffRejections function bodies unchanged except for the shared triggerRCA client edit (FR-5) — no scope creep into fixing those monitors\' own independent defects.',
  'No new environment variables, feature flags, or npm dependencies are introduced.',
];

const risks = [
  {
    risk: 'test_results may no longer be the live write target for new test runs (most recent row is dated 2026-04-11, ~4 months stale as of this SD, and the LEO Playwright reporter is overridden by explicit --reporter flags in .github/workflows/stories-ci.yml, so CI never invokes it).',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: 'Out of this SD\'s scope to fix a possibly-separate stale/CI-only ingestion pipeline. EXEC verifies via a synthetic INSERT (TS-8) whether the table and pipeline still function; the code fix itself is correct and independently unit-testable (TS-1 through TS-7, TS-9) regardless of real production inflow. File the CI reporter-override gap separately if not already tracked.',
    rollback_plan: 'No rollback needed for this risk specifically — it affects observed production impact, not code correctness. If the underlying pipeline is confirmed dead, that becomes its own feedback/harness-backlog item, not a reason to revert this fix.',
  },
  {
    risk: 'The FR-5 shared-client change touches code used by all 4 monitors in this file, which is a documented, evidence-based exception to the SD\'s original "do not touch the other 3 monitors" boundary.',
    probability: 'LOW',
    impact: 'LOW',
    mitigation: 'Scoped to exactly one line in one shared helper (the client factory call). The other 3 monitors remain non-functional for their own, separately-filed reasons (unpublished table; replica identity) regardless of this change, so no additional monitor becomes "fixed" as an unintended side effect that this SD would need to validate.',
    rollback_plan: 'git revert the single-line client change; triggerRCA reverts to the anon client and the pre-existing (already-broken) behavior for all 4 monitors resumes.',
  },
  {
    risk: 'A source-text pin checking for the literal string "test_failures" would still match after the fix, since the OLD realtime channel name (not just the table option) is also literally "test_failures".',
    probability: 'LOW',
    impact: 'LOW',
    mitigation: 'TS-7 asserts against the captured mock\'s config OBJECT via deep-equal, not a source-text search — an unfoolable, stronger check per TESTING sub-agent\'s explicit recommendation.',
    rollback_plan: 'N/A — this is a test-authoring risk, not a runtime risk; caught at PR review via the test itself failing to compile/pass if mis-anchored.',
  },
  {
    risk: 'The staged ALTER PUBLICATION migration (FR-7) is not applied at PR-merge time (chairman-gated DDL, applied later at a ceremony), so the code fix is correct but functionally inert until that ceremony occurs.',
    probability: 'HIGH',
    impact: 'MEDIUM',
    mitigation: "This is documented explicitly, not silently assumed away: TS-8 (the live-fire proof) is marked as an EXEC/verification-phase step executed and documented separately, not a PR-merge blocker. All other test scenarios (TS-1 through TS-7, TS-9) are fully unit-testable without the migration being applied and constitute this SD's PR-merge bar.",
    rollback_plan: 'ALTER PUBLICATION supabase_realtime DROP TABLE test_results reverses the DDL cleanly without touching application code, if the chairman later decides against it.',
  },
  {
    risk: 'The regression lookback introduces a new query pattern (self-join via test_runs) against test_results, which currently has indexes only on (id), (test_run_id), (status) — the lookback is a sequential scan.',
    probability: 'LOW',
    impact: 'LOW',
    mitigation: 'Bounded by current table volume (52 rows total, largest single run wrote 21 detail rows) — not a performance concern at present scale. If test_results grows substantially, a covering index on (test_full_title, test_run_id) would be a natural follow-up, tracked separately rather than adding index-creation DDL to this already-DDL-adjacent SD.',
    rollback_plan: 'N/A — a future performance-tuning SD would add an index without touching this SD\'s query logic.',
  },
];

const implementation_approach = {
  phases: [
    { phase: 'Phase 1 — Code fix', description: 'Retarget the subscription, rewrite the lookback query, fix field mappings, switch the shared client, add the NULL guard and tiebreaker', deliverables: ['Modified lib/rca-runtime-triggers.js', 'Updated docs/reference/root-cause-agent.md'] },
    { phase: 'Phase 2 — Test coverage', description: 'Author TS-1 through TS-9 using the real-.on()-mock-capture pattern and the vi.mock hoisting-safe indirection precedent', deliverables: ['New/updated tests/unit/rca-runtime-triggers*.test.js coverage, all passing'] },
    { phase: 'Phase 3 — Staged migration', description: 'Author the single-statement, idempotent ALTER PUBLICATION migration file — staged only, not applied by this SD', deliverables: ['database/migrations/<timestamp>_add_test_results_to_realtime_publication.sql'] },
  ],
  technical_decisions: [
    'Retarget onto test_results/test_runs instead of creating playwright_test_scenarios: eliminates a full CREATE TABLE + RLS-policy-authoring DDL surface in favor of one ALTER PUBLICATION statement, and uses tables with confirmed live population instead of a catalog table nothing would write to.',
    'Run-relative (test_runs-ordered) lookback instead of a wall-clock 24h window: measured real run cadence is 8-24 days between runs, so a 24h window would silently never fire.',
    'Service-role client for triggerRCA, applied as a single shared-helper change rather than a per-call-site parameter: architecturally correct for server-only diagnostic code, avoids introducing branching complexity across 6 call sites for no legitimate reason.',
    'No handler extraction for testability: capturing the real .on() callback off the mock (existing in-repo precedent) proves the actual wiring, which an extracted-and-directly-tested function would not.',
  ],
};

const integration_operationalization = {
  consumers: [
    { name: 'RCA sub-agent pipeline (lib/sub-agents/rca.js)', interaction: "Reads root_cause_reports rows keyed by trigger_source; already consumes 'TEST_FAILURE' as a value today, unmodified by this SD", frequency: 'Real-time, triggered by new RCR rows' },
  ],
  dependencies: [
    { name: 'test_results / test_runs (Postgres tables)', type: 'upstream', contract: 'Existing schema, read-only for this SD (no ALTER TABLE)', failure_handling: 'If test_results is not currently receiving writes, the monitor simply never fires — fails soft, matching this file\'s existing philosophy' },
    { name: 'supabase_realtime publication', type: 'upstream', contract: 'test_results must be added via the staged ALTER PUBLICATION migration, applied at a chairman ceremony', failure_handling: 'Until applied, the code fix is correct but inert — no events will be received; documented explicitly (risk #4), not silently assumed' },
    { name: 'root_cause_reports (Postgres table)', type: 'downstream', contract: 'Existing schema and RLS policy, unmodified', failure_handling: 'Any insert failure is caught by the existing QF-20260726-175 fail-soft wrapper and logged loudly rather than crashing the process' },
  ],
  data_contracts: [
    { contract_name: 'test_results row shape', schema: 'id, test_run_id, test_file_path, test_name, test_full_title, status[passed|failed|skipped], duration_ms, error_message, error_stack, failure_screenshot_path, retry_count, annotations, attachments, created_at', validation: 'Existing table, no schema changes in this SD', versioning: 'N/A — read-only consumer' },
  ],
  runtime_config: {
    environment_variables: [],
    feature_flags: [],
    deployment_considerations: "Fix takes effect on next server restart (bootstrapRCAMonitoring() runs unconditionally at server/index.js:401 startup); the staged migration must be applied separately by chairman ceremony for events to actually flow.",
  },
  observability_rollout: {
    monitoring: ["SELECT count(*) FROM root_cause_reports WHERE trigger_source='TEST_FAILURE' (currently 0; should move off 0 after a real regression occurs post-migration-apply)"],
    alerts: ['None new — reuses the existing fail-soft console.error log line for write failures'],
    rollout_strategy: "Code ships in this SD's PR; the DDL half (ALTER PUBLICATION) is staged and applied separately at a chairman ceremony — the code fix is inert but harmless until then",
    rollback_trigger: 'Unexpected load or false-positive RCRs observed post-migration-apply',
    rollback_procedure: 'git revert the code change and/or ALTER PUBLICATION supabase_realtime DROP TABLE test_results to stop event delivery without touching application code',
  },
};

const exploration_summary = {
  files_read: [
    'lib/rca-runtime-triggers.js', 'lib/rca-monitor-bootstrap.js', 'server/index.js',
    'lib/reporters/leo-playwright-reporter.js', 'lib/supabase-client.js',
    'tests/unit/rca-runtime-triggers.test.js', 'tests/unit/rca-trigger-failsoft.test.js',
    'tests/unit/eva/venture-monitor.test.js', 'docs/reference/root-cause-agent.md',
    'database/migrations/20251210_unified_test_evidence.sql', 'database/migrations/20251211_unified_test_evidence_fixed.sql',
  ],
  patterns_identified: [
    'Fail-soft diagnostic-write wrapper pattern (triggerRCA/triggerRCAOrThrow), established by QF-20260726-175',
    'Real-.on()-mock-capture test pattern for postgres_changes callbacks (tests/unit/eva/venture-monitor.test.js)',
    'vi.mock hoisting-safe indirection pattern for the Supabase client (tests/unit/rca-trigger-failsoft.test.js)',
    'ALTER PUBLICATION as the repo convention for enabling realtime on a table (8 other precedent migrations)',
  ],
  key_decisions: [
    'Retarget onto test_results/test_runs instead of creating a new catalog table',
    'Service-role client for the shared triggerRCA helper',
    'Run-relative lookback instead of a wall-clock window',
    'No handler extraction; capture off the real mock instead',
  ],
  exploration_date: '2026-08-16',
};

const prd = {
  id: PRD_ID,
  directive_id: SD_KEY,
  sd_id: SD_ID,
  title: 'Regression Detection Real-Fire Fix: test_results Retarget + Service-Role Write + Realtime Publication',
  version: '1.0',
  status: 'approved',
  category: 'technical',
  priority: 'high',
  document_type: 'prd',
  phase: 'PLAN_PRD',
  executive_summary,
  functional_requirements,
  technical_requirements,
  system_architecture,
  test_scenarios,
  acceptance_criteria,
  risks,
  implementation_approach,
  integration_operationalization,
  exploration_summary,
  goal_summary: executive_summary.slice(0, 300),
  approved_by: 'LEAD/PLAN (autonomous, AUTO-PROCEED)',
  approval_date: new Date(2026, 7, 16, 21, 40).toISOString(),
  created_by: 'PLAN (Golf-5, session 42d805b8-dd3a-443c-9dc9-fb3cb7de3b05)',
  metadata: {
    lead_validation_evidence_id: '092fa8f6-b74a-4b11-842e-7b242f222fd8',
    lead_testing_evidence_id: '5990427e-005c-44e8-bd40-5ed27fbcf347',
    lead_explore_evidence_id: '32a7210a-4061-4ecd-90f5-a8bc372d5dc7',
  },
};

console.log('executive_summary length:', executive_summary.length, '(must be 100-300)');

const { data, error } = await supabase.from('product_requirements_v2').insert(prd).select('id');
if (error) {
  console.error('INSERT_ERROR', JSON.stringify(error, null, 2));
  process.exit(1);
}
console.log('PRD inserted:', JSON.stringify(data));
