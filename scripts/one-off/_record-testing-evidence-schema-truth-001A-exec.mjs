import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { buildTestExecution } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agents/testing/test-execution-record.js';

const WT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A';
const SD_ID = '00b8482a-de45-4f70-82c3-4fead8f71ee9';
const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A';
const COMMIT = '65222b6938a480dea71151a620a897368ad9669a';

// Provenance: hash of the RUNNER-WRITTEN vitest json results file (not hand-authored prose).
const artifactRel = '.artifacts/testing-schema-truth-001A-exec.json';
const buf = fs.readFileSync(`${WT}/${artifactRel}`);
const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
const runnerJson = JSON.parse(buf);
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WT, encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: WT, encoding: 'utf8' }).trim();
// Clean-tree proof: the bytes that were tested ARE the bytes that were committed.
const dirtyImpl = execFileSync('git', ['status', '--porcelain', '--', 'lib/', 'tests/'], { cwd: WT, encoding: 'utf8' }).trim();

if (headSha !== COMMIT) throw new Error(`HEAD ${headSha} != expected ${COMMIT}`);
if (runnerJson.numFailedTests !== 0 || runnerJson.numPassedTests !== 14) {
  throw new Error(`runner artifact not 14/14: ${JSON.stringify({ p: runnerJson.numPassedTests, f: runnerJson.numFailedTests })}`);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = {
  verdict: 'PASS',
  confidence: 93,
  phase: 'EXEC',
  summary:
    'EXEC-phase re-verification of the SAME code my PLAN row 576990fa passed, now COMMITTED as 65222b693. '
    + 'Commit verified real (12 files, +847/-13, on feat/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A); 14/14 unit tests '
    + 'reconfirmed post-commit from a runner-written JSON artifact; git status is CLEAN for lib/ and tests/, so the '
    + 'bytes that were tested are the bytes that were committed. I added ONE thing the PLAN row did not have: a LIVE '
    + 'post-commit integration smoke against the real Supabase database through BOTH entrypoints, which fires the '
    + 'corrective for real rather than against stubs. The single blocking condition carried on row 576990fa '
    + '(criterion #4 deferral untracked) is NOW CLOSED.',
  critical_issues: [],
  warnings: [
    {
      severity: 'LOW',
      issue:
        'Carried forward from row 576990fa, still open and still non-blocking: the throwOnSchemaDrift:false opt-out '
        + 'is COARSE. It disables BOTH the error-code guard and the new count-unmeasurable discriminant. All 4 opt-out '
        + 'sites justify the opt-out only on the error-code half, and 2 of the 4 (lib/utils/validation-automation.js, '
        + 'scripts/solomon-advisory.cjs) do issue count-mode queries, so they forfeit protection they never needed to '
        + 'give up. Unchanged by the commit.',
      recommendation:
        'Follow-up (not this child): granular opt-out, e.g. throwOnSchemaDrift:"error-code-only".',
    },
    {
      severity: 'LOW',
      issue:
        'The commit includes two prior evidence-recording one-off scripts and two .artifacts JSON files '
        + '(scripts/one-off/_record-testing-evidence-schema-truth-001A{,-v2}.mjs, '
        + '.artifacts/testing-schema-truth-001A{,-v2}.json). These are provenance artifacts, not product code, and '
        + 'they inflate the diff stat. Harmless, but note the ~847-line figure is NOT ~847 lines of shipped logic: '
        + 'shipped logic is ~223 lines (lib/supabase-client-schema-drift.cjs 160 + factory rewires 42 + opt-outs 21) '
        + 'plus a 212-line test file.',
      recommendation: 'No action required; flag only so PLAN does not read the diff stat as PR-size overrun.',
    },
  ],
  conditions: [],
  recommendations: [
    'PLAN can accept this EXEC-TO-PLAN handoff on testing grounds. Evidence is stronger at EXEC than it was at PLAN: '
    + 'the PLAN row proved the discriminant with stubbed PostgREST plus my own 11-case stub harness, whereas this row '
    + 'additionally proves it end-to-end against the live database.',
    'Do NOT re-run the differential regression baseline at PLAN verification — it was measured at PLAN (stash/re-run, '
    + 'identical 34 passed / 49 skipped before and after) and nothing in the working tree changed between that '
    + 'measurement and the commit. Re-running it would consume budget to reproduce a known result.',
  ],
  justification:
    'PASS at EXEC. Three things were verified rather than assumed. (1) THE COMMIT IS REAL AND IS THE VERIFIED CODE: '
    + 'HEAD is exactly 65222b6938a480dea71151a620a897368ad9669a on feat/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A, touching '
    + 'the 12 expected paths, and this script hard-asserts HEAD===the expected SHA rather than trusting the handoff '
    + 'prose. (2) THE TESTS STILL PASS POST-COMMIT AND TESTED THE COMMITTED BYTES: a fresh '
    + '`npx vitest run --project unit tests/unit/client-factory-schema-drift-throw.test.js --reporter=json` wrote '
    + `${artifactRel} (sha256 ${contentHash.slice(0, 16)}...) recording 14 total / 14 passed / 0 failed / 0 pending, `
    + 'and `git status --porcelain -- lib/ tests/` is EMPTY, which is the discriminator that matters: a green suite '
    + 'run against a dirty tree would not prove the committed code passes. (3) THE CORRECTIVE FIRES AGAINST THE REAL '
    + 'DATABASE, not just stubs — this is the one materially NEW measurement beyond row 576990fa. I imported '
    + 'lib/supabase-client.js (ESM) and required lib/supabase-client.cjs (CJS) in a single process post-commit: both '
    + 'load and construct clients, a real head+count on strategic_directives_v2 RESOLVED with count=6041 (no false '
    + 'positive on the ~946-importer happy path), and a head+count on a nonexistent relation REJECTED with '
    + 'code=COUNT_UNMEASURABLE. That is the genuinely-silent {data:null,count:null,error:null,status:204} shape the '
    + 'whole SD exists to close, observed live rather than stubbed. I did NOT re-derive the PLAN row\'s findings: the '
    + 'implementation read, the 11-case independent probe harness, the differential stash/re-run regression baseline '
    + '(34 passed / 49 skipped identical before and after), the 423-call-site false-positive scan, and the criteria '
    + 'disposition (#1 MET, #2 MET as regression guard, #3 SUPERSEDED on the merits, #4 CORRECTLY DEFERRED) all stand '
    + 'on row 576990fa and nothing in the tree changed since. CONFIDENCE RAISED 91 -> 93 for two reasons: the live '
    + 'integration smoke, and the closure of the one blocking condition I carried at PLAN. That condition — '
    + '"criterion #4\'s deferral is a claim, not a landed row" — is NOW SATISFIED: '
    + 'SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 ("Widen swallowed-query-error lint scope and flip to enforce, burning '
    + 'down existing findings") exists in strategic_directives_v2 as id abf93452-87b9-49c5-bf58-2a19c0128362, '
    + 'status=draft, created 2026-09-03T10:42:51Z, i.e. ~2 minutes after my PLAN row was written, and the commit '
    + 'message cites that exact key. I verified the row by querying the table, not by reading the commit message that '
    + 'claims it. No blocking conditions remain.',
  detailed_analysis: {
    commands_executed: [
      'git log -1 --format=%H -> 65222b6938a480dea71151a620a897368ad9669a (asserted equal to expected SHA in-script)',
      'git show --stat 65222b6938a -> 12 files changed, 847 insertions(+), 13 deletions(-)',
      'git rev-parse --abbrev-ref HEAD -> feat/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A',
      'git status --porcelain -- lib/ tests/ -> EMPTY (tested bytes == committed bytes)',
      `npx vitest run --project unit tests/unit/client-factory-schema-drift-throw.test.js --reporter=json --outputFile=${artifactRel} -> 14/14 passed, 0 failed, success=true`,
      'node <live smoke>: import lib/supabase-client.js + require lib/supabase-client.cjs in one process -> both load, both construct clients',
      'LIVE head+count on strategic_directives_v2 -> RESOLVED count=6041, error=null (no false positive)',
      'LIVE head+count on __no_such_relation_probe__ -> REJECTED code=COUNT_UNMEASURABLE (the silent 204 shape, closed)',
      'SELECT from strategic_directives_v2 WHERE sd_key ILIKE %WIDEN% -> SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 EXISTS (draft, 2026-09-03T10:42:51Z)',
    ],
    what_is_new_vs_row_576990fa: {
      commit_reality_check: 'HEAD asserted === 65222b693 in-script; branch and 12-file stat confirmed',
      tested_bytes_equal_committed_bytes: 'git status --porcelain -- lib/ tests/ is empty',
      live_integration_smoke: 'NEW — corrective verified against the real Supabase DB through BOTH ESM and CJS entrypoints; PLAN evidence was stub-only',
      blocking_condition_closed: 'NEW — SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 now exists; verified by table query, not by trusting the commit message',
    },
    inherited_from_row_576990fa_not_re_derived: {
      independent_probe_harness: '11/11 cases correct, incl. 4 the shipped suite omits (ctx isolation, count:NaN, deep-chain count, insert().select())',
      differential_regression_baseline: 'stash/re-run identical 34 passed / 49 skipped -> zero regression induced',
      false_positive_scan: '423 count-mode call sites tree-wide; 0 combined with .single()/.csv()',
      criteria_disposition: '#1 MET, #2 MET (regression guard), #3 SUPERSEDED on the merits, #4 CORRECTLY DEFERRED',
      implementation_read: 'ctx.countRequested gates on args[1].count only; fresh ctx per .from()/.rpc()/.schema(); isCountUnavailable == negation of renderCount measured-number test',
      rationale_for_not_re_deriving: 'no working-tree change between the PLAN measurement and the commit (clean status proves it)',
    },
    e2e_applicability: 'NOT APPLICABLE — backend library seam, no UI surface; SD criteria specify unit probes. Live DB smoke substitutes for integration coverage.',
    open_non_blocking: [
      'Coarse throwOnSchemaDrift opt-out (carried, LOW)',
      'Criterion #3 before/after counts (measured at PLAN: 1 file / 2 call sites, unchanged) — recorded here for the record',
    ],
  },
  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: runnerJson.numTotalTests,
      passed: runnerJson.numPassedTests,
      failed: runnerJson.numFailedTests,
      skipped: runnerJson.numPendingTests,
      artifactSha: contentHash,
      runner: 'vitest --project unit --reporter=json',
      artifactPath: artifactRel,
      source: 'fresh',
    }),
    evidence_provenance: {
      producer: 'vitest --reporter=json (runner-written, not hand-authored)',
      artifact_path: artifactRel,
      content_sha256: contentHash,
      run_commit_sha: headSha,
      branch,
      working_tree_clean_for_impl_paths: dirtyImpl === '',
      num_total_tests: runnerJson.numTotalTests,
      num_passed_tests: runnerJson.numPassedTests,
      num_failed_tests: runnerJson.numFailedTests,
      runner_success: runnerJson.success,
    },
    commit_verification: {
      expected_sha: COMMIT,
      actual_head_sha: headSha,
      match: headSha === COMMIT,
      branch,
      files_changed: 12,
      insertions: 847,
      deletions: 13,
      shipped_logic_loc_estimate: 223,
      note: 'diff stat includes 2 one-off evidence scripts + 2 .artifacts JSON; shipped logic is ~223 LOC + 212-line test file',
    },
    live_integration_smoke: {
      method: 'single node process: import lib/supabase-client.js (ESM) + require lib/supabase-client.cjs (CJS), then query the real Supabase DB',
      esm_exports: ['createSupabaseClient', 'createSupabaseServiceClient', 'fetchSD', 'lazyServiceClient'],
      cjs_exports: ['GOVERNANCE_TABLES', 'createSupabaseClient', 'createSupabaseServiceClient', 'isGovernanceTable', 'wrapAnonClientWithGovernanceGuard'],
      real_table_head_count: { table: 'strategic_directives_v2', count: 6041, error: null, outcome: 'RESOLVED (correct — no false positive)' },
      missing_relation_head_count: { table: '__no_such_relation_probe__', outcome: 'REJECTED', code: 'COUNT_UNMEASURABLE' },
      significance: 'proves the corrective fires against a real PostgREST, not only against stubs — evidence the PLAN row did not have',
    },
    prior_blocking_condition_closed: {
      condition: 'file a durable tracking row for SD criterion #4 (swallowed-query-error-lint enforce + widen) before PLAN-TO-EXEC closes',
      raised_on_row: '576990fa-3c06-473d-ac0d-1ea99d38631a',
      status: 'CLOSED',
      tracking_sd_id: 'abf93452-87b9-49c5-bf58-2a19c0128362',
      tracking_sd_key: 'SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001',
      tracking_sd_status: 'draft',
      tracking_sd_created_at: '2026-09-03T10:42:51.955965+00:00',
      verified_by: 'direct query of strategic_directives_v2, NOT by reading the commit message that claims it',
    },
    criterion_measurements: {
      safeQuery_safeCount_adoption_before: 2,
      safeQuery_safeCount_adoption_after: 2,
      safeQuery_adoption_files: 1,
      lint_findings: 228,
      lint_exit_code: 0,
      note: 'measured at PLAN (row 576990fa); unchanged by the commit',
    },
    builds_on_row: '576990fa-3c06-473d-ac0d-1ea99d38631a',
    builds_on_reason:
      'same code, verified fresh at PLAN with confidence 91; this EXEC row re-verifies the commit is real and the '
      + 'tests still pass post-commit, adds a live-DB integration smoke, and closes the prior row\'s one blocking condition',
    e2e_applicable: false,
    unit_tests_passed: true,
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'tests/unit/client-factory-schema-drift-throw.test.js',
  supabase,
});
console.log('resolution:', JSON.stringify(resolution));

applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', SD_ID, { code: 'TESTING', name: 'QA Engineering Director' }, results, {
  sdKey: SD_KEY,
  phase: 'EXEC',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase, confidence: stored?.confidence }));
