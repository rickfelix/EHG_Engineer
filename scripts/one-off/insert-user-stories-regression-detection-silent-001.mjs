import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';
const SD_ID = '4776c92d-417c-429b-a407-7fcd6b791812';
const PRD_ID = `PRD-${SD_KEY}`;

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    title: 'Retarget the realtime subscription onto test_results',
    user_role: 'Platform maintainer',
    user_want: 'the regression-detection realtime subscription to listen on the table that actually exists and receives writes (test_results), instead of the nonexistent test_failures table',
    user_benefit: 'the postgres_changes callback can receive real INSERT events at all, closing the upstream layer of the silent-no-op defect',
    story_points: 2,
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Subscription config pin', given: 'monitorTestFailures() is invoked with a mocked channel', when: 'the .on() config argument is inspected', then: "it deep-equals {event:'INSERT', schema:'public', table:'test_results', filter:'status=eq.failed'}" },
    ],
    implementation_context:
      "## Implementation Guidance\n\n**File**: lib/rca-runtime-triggers.js, monitorTestFailures() (~lines 111-172).\n\n**Change**: the `.channel('test_failures').on('postgres_changes', {event:'INSERT', schema:'public', table:'test_failures'}, ...)` call becomes `.channel('test_results_regression').on('postgres_changes', {event:'INSERT', schema:'public', table:'test_results', filter:'status=eq.failed'}, ...)`. Rename the channel too -- the old name is also literally the defunct table name and would falsely satisfy a naive string-search pin post-fix.\n\n**Test seam**: capture the handler via `mockSupabase._mockChannel.on.mock.calls[0]` -- args[1] is the config object (assert deep-equal), args[2] is the callback (invoke directly with a fake payload). Precedent: tests/unit/eva/venture-monitor.test.js.\n\n**Do NOT** extract a separate exported handler function -- keep it inline as the .on() callback (TR-4).",
  },
  {
    story_key: `${SD_KEY}:US-002`,
    title: 'Run-relative regression lookback keyed on test_full_title',
    user_role: 'Platform maintainer',
    user_want: 'the regression check to compare a failing test against its own most recent prior RUN (not a 24-hour wall-clock window), keyed on the stable test_full_title identity',
    user_benefit: 'real regressions are actually detected given the measured 8-24 day gap between test runs, instead of every regression being silently discarded by an unreachable time window',
    story_points: 5,
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Real regression fires', given: 'a prior EARLIER-run row for test_full_title X has status=passed', when: 'a new row for X with status=failed is inserted in a later run', then: 'triggerRCA is invoked with trigger_tier=2' },
      { scenario: 'First-ever failure does not fire', given: 'no prior row exists for test_full_title X', when: 'a failing row for X is inserted', then: 'no trigger occurs' },
      { scenario: 'Still-failing does not fire', given: 'the most recent prior row for X also has status=failed', when: 'a new failing row for X is inserted', then: 'no trigger occurs' },
      { scenario: 'Same-run retry excluded', given: 'the SAME test_run_id has two rows for X (a retry), first passed then failed', when: 'the second row is processed', then: 'the same-run sibling is excluded from the lookback; only an earlier test_run_id qualifies' },
      { scenario: 'Deterministic tiebreak', given: 'two test_runs share an identical started_at timestamp', when: 'the lookback orders candidates', then: 'ORDER BY (test_runs.started_at DESC, test_runs.id DESC) produces a stable result' },
    ],
    implementation_context:
      "## Implementation Guidance\n\n**Query shape** (replace the playwright_test_scenarios .select().eq().maybeSingle() block): query test_results joined to test_runs, filtered to test_full_title = failure.test_full_title AND test_runs.id != failure.test_run_id (excludes same-run retries), ordered by (test_runs.started_at DESC, test_runs.id DESC), limit 1.\n\n**Guard first** (US-003 dependency): if failure.test_full_title is null/empty, skip the query entirely and log a warning -- do not run this lookback at all in that case.\n\n**Existing hoursSincePass<=24 branch is REMOVED**, not kept as a secondary filter -- the run-relative comparison replaces it entirely per FR-2's measured evidence (52/52 unique pairs, 8-24 day real gaps).\n\n**Tests**: tests/helpers/supabase-chain-mock.js's createSupabaseChainMock() is the sanctioned chain-mock helper already used by tests/unit/rca-runtime-triggers.test.js -- use it instead of hand-rolling a chain stub (needs .eq/.neq/.order/.limit support for this query shape).",
  },
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Guard against NULL/empty test_full_title',
    user_role: 'Platform maintainer',
    user_want: 'a failing row with a missing test_full_title to be explicitly skipped and logged, not silently misclassified or cross-matched against unrelated NULL-title rows',
    user_benefit: 'the exact silent-failure defect class this SD exists to eliminate is not reintroduced on a different column',
    story_points: 2,
    priority: 'high',
    acceptance_criteria: [
      { scenario: 'NULL guard', given: 'an inserted row has test_full_title=null', when: 'the handler processes it', then: 'a warning is logged and no lookback query is attempted' },
    ],
    implementation_context:
      "## Implementation Guidance\n\nAt the top of the callback, before the lookback query: `if (!failure.test_full_title) { console.warn('[rca-runtime-triggers] skipping regression check -- missing test_full_title', {id: failure.id}); return; }`. Measured: 4 of 52 existing rows are affected (all from one run of tests/unit/eva/stage-08-uuid-validation.test.js). This must run BEFORE any query is issued, not as a downstream filter on query results.",
  },
  {
    story_key: `${SD_KEY}:US-004`,
    title: 'Fix RCA trigger field mappings and derive sd_id via test_runs',
    user_role: 'Platform maintainer',
    user_want: 'the RCA trigger payload to use the real column names on test_results and correctly derive sd_id through the test_runs join',
    user_benefit: 'the created root_cause_reports row has real evidence (stack trace, screenshot path) and a correct sd_id instead of undefined fields and colliding dedup keys',
    story_points: 3,
    priority: 'high',
    acceptance_criteria: [
      { scenario: 'Evidence fields mapped', given: 'a triggering failure row has error_stack and failure_screenshot_path populated', when: 'triggerRCA is called', then: 'evidence_refs.stack_trace and evidence_refs.screenshot_url carry those values' },
      { scenario: 'sd_id derived via join', given: 'the failure\'s test_run_id maps to a test_runs row with a non-null sd_id', when: 'triggerRCA is called', then: 'the sd_id param is that value, not undefined' },
    ],
    implementation_context:
      '## Implementation Guidance\n\nMapping table for the triggerRCA(...) call: `error_stack` (test_results) -> `evidence_refs.stack_trace`; `failure_screenshot_path` -> `evidence_refs.screenshot_url`; `test_scenario_id` -> DROP (no replacement, confirmed 0 other references anywhere in the codebase); `sd_id` -> read from the joined test_runs row, not test_results (which has no such column). Guard a null sd_id explicitly in the failure_signature template string so it does not literally interpolate as the string "undefined".',
  },
  {
    story_key: `${SD_KEY}:US-005`,
    title: 'Switch the shared RCA-write client to service-role',
    user_role: 'Platform maintainer',
    user_want: "triggerRCA's Supabase client to be the service-role client instead of the anon client",
    user_benefit: 'the diagnostic write into root_cause_reports actually succeeds instead of being silently RLS-denied (42501) and swallowed by the fail-soft wrapper',
    story_points: 1,
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Service-role write succeeds', given: 'triggerRCA is invoked with a mocked client factory', when: 'the RCR insert executes', then: 'createSupabaseServiceClient (not createSupabaseClient) is asserted as the factory used' },
      { scenario: 'Other monitors untouched', given: 'the shared client edit is applied', when: 'git diff is inspected', then: 'monitorSubAgentFailures/monitorQualityGates/monitorHandoffRejections function bodies are unchanged' },
    ],
    implementation_context:
      "## Implementation Guidance\n\nIn triggerRCAOrThrow() (and anywhere else in this file createSupabaseClient() is called for a write, e.g. the duplicate-check read at line 383 and the insert at line 408), swap the import/call to createSupabaseServiceClient() from lib/supabase-client.js (already exported, line 83). This is a single shared change affecting all 4 monitors' RCA-triggering path -- documented, evidence-based exception (FR-5). Verify: `anon.from('root_cause_reports').insert(...)` returns code 42501 today (confirmed live); a service-role insert of the identical shape succeeds.",
  },
  {
    story_key: `${SD_KEY}:US-006`,
    title: 'Stage the realtime-publication migration (not applied)',
    user_role: 'Chairman / platform maintainer',
    user_want: 'a staged, idempotent migration that registers test_results on the supabase_realtime publication, reviewed before being applied at a ceremony',
    user_benefit: 'the retargeted subscription can actually receive events once the chairman applies it, while DDL stays chairman-gated as this SD\'s original decision required',
    story_points: 1,
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Migration staged, not applied', given: 'the PR is opened', when: 'the diff is inspected', then: 'exactly one file under database/migrations/ contains a single idempotent ALTER PUBLICATION statement, and it has NOT been executed against the live database by this SD' },
    ],
    implementation_context:
      "## Implementation Guidance\n\nFile: database/migrations/<timestamp>_add_test_results_to_realtime_publication.sql. Content: a DO block checking `SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='test_results'` before running `ALTER PUBLICATION supabase_realtime ADD TABLE test_results;` (idempotency guard -- ALTER PUBLICATION ... ADD TABLE throws 42710 if already a member). Do NOT run this migration as part of EXEC verification -- confirmed live via pg_publication_tables that test_results/test_runs/test_failures are 0 of 21 currently-published tables; this SD stages the fix, a chairman ceremony applies it separately (metadata.apply_gate on the SD already documents this).",
  },
  {
    story_key: `${SD_KEY}:US-007`,
    title: 'Update root-cause-agent docs to match the new mechanism',
    user_role: 'Future maintainer reading the docs',
    user_want: "docs/reference/root-cause-agent.md's Tier-2 trigger description to describe the test_results-based mechanism, not the retired test_failures/playwright_test_scenarios one",
    user_benefit: 'the documentation matches the code instead of describing a mechanism that no longer exists',
    story_points: 1,
    priority: 'medium',
    acceptance_criteria: [
      { scenario: 'Docs updated', given: 'the code fix is complete', when: 'docs/reference/root-cause-agent.md is inspected', then: 'it no longer mentions test_failures or playwright_test_scenarios in the Tier-2 trigger row' },
    ],
    implementation_context:
      '## Implementation Guidance\n\nFile: docs/reference/root-cause-agent.md, line ~369 (Tier-2 trigger table row) and the generic references at ~424/~929. Update the mechanism description to: "test_results INSERT (status=failed) + run-relative self-join lookback on test_full_title via test_runs".',
  },
];

const rows = stories.map((s) => ({
  ...s,
  prd_id: PRD_ID,
  sd_id: SD_ID,
  status: 'ready',
  validation_status: 'validated',
  implementation_status: 'pending',
  e2e_test_status: 'not_created',
  created_by: 'PLAN (Golf-5, session 42d805b8-dd3a-443c-9dc9-fb3cb7de3b05)',
}));

const { data, error } = await supabase.from('user_stories').insert(rows).select('id, story_key');
if (error) {
  console.error('INSERT_ERROR', JSON.stringify(error, null, 2));
  process.exit(1);
}
console.log('Inserted', data.length, 'user stories:');
data.forEach((r) => console.log(' -', r.story_key));
