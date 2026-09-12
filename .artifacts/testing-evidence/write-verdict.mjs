import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import fs from 'fs';
import crypto from 'crypto';

const SD_ID = 'dfdad20c-bf37-47ef-8588-0ebd82cfb874';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const base = '.artifacts/testing-evidence';
const A = rd(`${base}/runA-results.json`), B = rd(`${base}/runB-results.json`), C = rd(`${base}/runC-results.json`);
const mk = (id, file, cons, scope, r) => ({
  run_id: id, scope,
  results_file: `${base}/${file}`, results_sha256: sha(`${base}/${file}`),
  console_log: `${base}/${cons}`, console_sha256: sha(`${base}/${cons}`),
  command: r.cmd,
  test_files: (r.j.testResults || []).length,
  tests_total: r.j.numTotalTests, tests_passed: r.j.numPassedTests, tests_failed: r.j.numFailedTests,
  failed_assertions: (r.j.testResults || []).reduce((n, t) => n + (t.assertionResults || []).filter(a => a.status === 'failed').length, 0),
  vitest_success: r.j.success,
});

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  summary: 'EXEC-TO-PLAN testing verification for Child E (pick_reason provenance on every claim). Independently re-ran 3 runner-produced test slices including the FULL unit project (3928 files / 48230 tests): ZERO failed assertions, zero regressions. All 13 acceptance criteria substantively met and independently verified, including a LIVE smoke against the unapplied schema proving AC-13 fail-soft (real Postgres 42703 -> {merged:false,reason:column_absent}, stampClaim returns null without throwing) and a LIVE check of the 3 chairman-gated QF rows proving AC-9 non-interference. node --check passes on all 4 touched source files + 3 test files. CONDITIONAL on one narrow coverage gap: TS-7 (declared test_type=unit) has ZERO automated coverage, and AC-7 stamp-after-claim placement at both new call sites is verified only by code inspection - no test would catch a future refactor that silently drops either stampClaim call.',
  critical_issues: [],
  warnings: [
    'COVERAGE GAP (TS-7, AC-7): No test asserts stampClaim is called at lib/sd-creation/source-adapters/qf.js:269 (born-claim) or scripts/qf-start.js:152. TS-7 is declared test_type=unit in the PRD but no unit test was written. Both call sites verified correct by code inspection only. A future refactor deleting either line would be caught by zero tests - the dead-by-construction risk this repo explicitly guards against. Cheap fix: add a source-order assertion (stampClaimIdx > rpcIdx) to the two EXISTING source-order suites that already read these files (tests/unit/worktree-reaper/qf-quota-relocation.test.js, tests/unit/claim-liveness-fence-qf-surfaces-order.test.js), both of which currently contain 0 references to stampClaim.',
    'RUNTIME BEHAVIOR CHANGE (not a defect, worth tracking): while the migration is unapplied, EVERY QF claim through worker-checkin.cjs tryClaim (:394) and qf-start.js (:152) now opens a real pg connection via createDatabaseClient, issues an UPDATE that fails with 42703, and closes it. Previously a QF-shaped ref fell through readSd() -> null with no extra connection. Fail-soft and correct, but adds one DB round trip + connection churn per QF claim until the chairman applies the column.',
    'OBSERVABILITY GAP: qf-metadata-merge.mjs carefully distinguishes column_absent / cas_lost / connect_failed / error (FR-2 TR-3 requirement, correctly implemented at lib/fleet/qf-metadata-merge.mjs:60-68), but its only production caller collapses all four to a bare null at lib/fleet/claim-stamp.cjs:137 with no logging. The distinguishability the PRD required exists in the module but is currently unobservable in production - nothing can tell a lost CAS race from a missing column at runtime.',
    'DOCUMENTED DEVIATION from FR-5 literal text: FR-5 said author database/migrations/<date>_add_quick_fixes_metadata.sql; the file shipped as database/chairman-gated/20260906_add_quick_fixes_metadata_column.sql. Rationale is documented in-file and in the directory README: database/migrations is auto-scanned by BaseExecutor._checkAndExecutePendingMigrations (autoExecute default true), so the literal path would have APPLIED the column on the next pipeline run - directly violating FR-5 own constraint that applying it is OUT OF SCOPE. The deviation better honors the FR intent; AC-12 (exists, additive-only, naming/header convention) is met either way. Accepted, not a defect.',
    'TS-12 (FIFO cap 20 with the larger pick_reason payload) has no dedicated test, but is substantively covered by the pre-existing passing test tests/unit/same-turn-next-claim.test.js:116 FIFO-caps claim_history at CLAIM_HISTORY_CAP, which now exercises the enlarged entry and passes.',
    'pick_reason.score is ALWAYS the literal string UNSCORED in production today because lib/priority/comparator.cjs (Child B) is not yet merged to main. Verified absent. This is the documented, intended degradation (AC-2), but means the numeric-score branch has test-only coverage until Child B lands.',
  ],
  recommendations: [
    'Before or shortly after merge, add two source-order assertions closing the TS-7/AC-7 gap (approx 8 LOC total, no new files): in tests/unit/worktree-reaper/qf-quota-relocation.test.js assert the stampClaim call index exceeds the claim_sd rpc index; add an equivalent guard for the lib/sd-creation/source-adapters/qf.js born-claim branch.',
    'Consider a single console.warn (or debug-level log) at lib/fleet/claim-stamp.cjs:137 surfacing result.reason when merged is false, so column_absent vs cas_lost is diagnosable in production without a code change.',
    'Track the per-QF-claim pg connection cost as a follow-up if QF claim volume is high; it disappears the moment the chairman applies the metadata column.',
  ],
  conditions: [
    'TS-7 / AC-7 coverage gap: add an automated assertion that stampClaim is invoked after the claim_sd success branch at BOTH new call sites (lib/sd-creation/source-adapters/qf.js:269 and scripts/qf-start.js:152). Approx 8 LOC, no new files - extend the two existing source-order suites (tests/unit/worktree-reaper/qf-quota-relocation.test.js and tests/unit/claim-liveness-fence-qf-surfaces-order.test.js), which today contain zero references to stampClaim. Until then both call sites are correct-by-inspection but unprotected against silent deletion by a future refactor.',
  ],
  metadata: {
    phase: 'EXEC',
    sd_validation_mode: 'actual',
    session_id: process.env.CLAUDE_SESSION_ID || 'ac47c674-36f9-4477-af37-29ef83f003b5',
    evaluated_commit_sha: '5252b1a2e00',
    branch: 'feat/SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E',
    pr: 8344,
    sub_agent_version: 'testing-agent v2.4.0 (Opus 5 1M)',
    evidence_provenance: 'All test_execution entries are vitest-runner-produced JSON report files (--reporter=json --outputFile), hashed with sha256 by the verifying agent. No hand-typed counts. SHA256SUMS.txt written alongside.',
    test_execution: {
      runs: [
        mk('runA', 'runA-results.json', 'runA-console.log', 'Targeted dependents of the 4 changed modules: every test importing claim-stamp.cjs, qf-metadata-merge.mjs, source-adapters/qf.js, qf-start.js, plus claim_history reader suites (claim-burn-gauge, stall-alert, leg2-uptake, work-boundary-gauges).', { j: A, cmd: 'npx vitest run --project unit --reporter=json <37 targeted files>' }),
        mk('runB', 'runB-results.json', 'runB-console.log', 'Full tests/unit/fleet/ directory sweep (home of claim-stamp.cjs, qf-metadata-merge.mjs, qf-gated-hold.cjs).', { j: B, cmd: 'npx vitest run --project unit --reporter=json tests/unit/fleet/' }),
        mk('runC', 'runC-results.json', 'runC-console.log', 'FULL unit project - entire repo unit tier, the run the EXEC author could not complete.', { j: C, cmd: 'npx vitest run --project unit --reporter=json' }),
      ],
      full_suite_completed: true,
      full_suite_failed_assertions: 0,
      known_flake: {
        file: 'tests/unit/fleet/source-tree-identity-realgit.test.js',
        failure: 'Hook timed out in 10000ms (beforeAll)',
        verdict: 'UNRELATED ENVIRONMENT FLAKE, not a regression',
        proof: 'Same file PASSED with 17/17 assertions in runB (209-file fleet slice, sha 33bc868f...). Its beforeAll performs real git I/O (git init + config + commit in an os.tmpdir sandbox) and timed out only under full-suite 3928-file parallel load on Windows. File is NOT touched by this diff and imports NONE of the 4 changed modules (grep-verified).',
      },
      node_check: { files: ['lib/fleet/claim-stamp.cjs', 'lib/fleet/qf-metadata-merge.mjs', 'lib/sd-creation/source-adapters/qf.js', 'scripts/qf-start.js', 'tests/unit/fleet/claim-stamp-pick-reason.test.js', 'tests/unit/fleet/qf-metadata-merge.test.js', 'tests/unit/fleet/qf-gated-hold.test.js'], result: 'ALL PASS (7/7)' },
      live_smoke: {
        script: `${base}/live-smoke.mjs`,
        purpose: 'AC-13 / TS-9 - prove fail-soft against the REAL unapplied schema, not a mock',
        mergeQfMetadataKeys_live: '{merged:false, reason:"column_absent"} - genuine Postgres 42703 from the live DB',
        stampClaim_qf_live_default: 'returned null, threw nothing (default non-injected dynamic-import path)',
        ac9_live_check: `${base}/ac9-live.cjs - all 3 live chairman-gated rows (QF-20260713-970 owner=CHAIRMAN, QF-20260905-631, QF-20260905-884 owner=chairman) gate true both WITH and WITHOUT pick_reason provenance, IDENTICAL=true; live row confirms metadata column ABSENT`,
      },
      quarantine_note: 'tests/unit/claim-validity-gate.test.js was requested in runA but is PRE-QUARANTINED (reason_class=assertion-drift, tests/quarantine-manifest.json:403) - a baseline exclusion predating this SD, not a regression. Consistent with the AC-6 note that worker-checkin-critical-qf-priority-jump.test.js is likewise quarantined.',
    },
    acceptance_criteria_coverage: {
      'AC-1': 'MET - pick_reason built at claim-stamp.cjs:145 (SD path) and :134 (QF path); numeric branch covered via injected computePriorityScoreFn (claim-stamp-pick-reason.test.js:95-103). All 6 prod call sites funnel through stampClaim (grep-verified).',
      'AC-2': 'MET - UNSCORED_PICK_REASON frozen sentinel; Number.isFinite guards both score and each component (claim-stamp.cjs:79-95) so NaN cannot pass typeof===number. Thrown scoreFn caught. stampClaim still returns the entry. Tests at claim-stamp-pick-reason.test.js:65-82.',
      'AC-3': 'MET - all 3 pre-existing claim_history suites pass UNMODIFIED (claim-identity, same-turn-next-claim, claim-stamp-concurrent-metadata-race); diff shows no edits to them.',
      'AC-4': 'MET - independently verified LIVE against the unapplied schema (real 42703 -> column_absent, stampClaim null, no throw).',
      'AC-5': 'MET - qf-metadata-merge.test.js asserts the exact SQL (jsonb_set + COALESCE || append, additive) and the claiming_session_id = $2 CAS predicate, with params byte-checked.',
      'AC-6': 'MET - worker-checkin.cjs tryClaim:394 already calls stampClaim; QF_ID_RE auto-detect routes qf.id there. selfClaimQuickFix:765 funnels through tryClaim (source-verified). Evidence collected from NON-quarantined files.',
      'AC-7': 'MET IN CODE, UNTESTED - qf.js:269 inside the born-claim success else-branch; qf-start.js:152 strictly after the claim_sd success guard. Pre-check order unchanged (verified by reading both files). NO automated test asserts this - see warning 1.',
      'AC-8': 'MET - pre-existing source-order guards PASS and would fail on any reordering: qf-quota-relocation.test.js:25 asserts enforceWorktreeQuota precedes claim_sd; claim-liveness-fence-qf-surfaces-order.test.js:34 asserts the liveness fence precedes claim_sd. Gated-hold refusal untouched.',
      'AC-9': 'MET - verified against the 3 LIVE DB rows (not only the hardcoded fixtures): identical true verdicts with and without provenance.',
      'AC-10': 'MET - qf-gated-hold.test.js AC-10 case; non-gated QF stays false with provenance present.',
      'AC-11': 'MET - qf-gated-hold.cjs exports exactly [GATED_HOLD_COLUMNS, isChairmanGatedQF]; diff adds no script (scripts/ diff is qf-start.js +8 only). review_by/review_at appear solely in comments and fixture strings.',
      'AC-12': 'MET - ADD COLUMN IF NOT EXISTS metadata JSONB, nullable, no DEFAULT, no NOT NULL, no backfill; DOWN companion present; naming YYYYMMDD_name.sql + _DOWN.sql matches the directory convention; @approved-by PENDING header per ceremony. See deviation warning re: directory.',
      'AC-13': 'MET - verified by LIVE smoke against the unapplied schema (strongest available evidence; not a mocked rejection).',
    },
  },
};

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'TESTING', supabase });
applySubAgentRepoVerdict(results, resolution);

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  phase: 'EXEC',
  verdict: results.verdict,
  confidence: results.confidence,
  summary: results.summary,
  critical_issues: results.critical_issues,
  warnings: results.warnings,
  recommendations: results.recommendations,
  metadata: results.metadata,
  conditions: results.conditions,
  justification: "CONDITIONAL_PASS rather than PASS: the implementation is functionally correct and regression-free (full unit project re-run by this agent - 3928 files, 48230 tests, ZERO failed assertions; all 13 ACs independently verified including live-schema smokes for AC-13 and live-row checks for AC-9). The single reservation is test COVERAGE, not correctness: PRD scenario TS-7 is declared test_type=unit but no unit test was written, and AC-7 (stampClaim invoked immediately after the claim_sd success branch at lib/sd-creation/source-adapters/qf.js:269 and scripts/qf-start.js:152) is verified only by this agent code inspection. Zero automated assertions reference stampClaim at either new call site, so a future refactor that silently deletes either line would pass every test in the repo - the dead-by-construction failure mode this codebase explicitly guards against. Remediation is approximately 8 LOC across two EXISTING source-order suites and requires no new files. Not raised to FAIL because no defect was found and no regression was introduced.",
  executed_from_cwd: process.cwd(),
  source: 'testing-agent',
};

const { data, error } = await supabase.from('sub_agent_execution_results').insert(row).select('id, verdict, phase, created_at').single();
if (error) { console.error('INSERT FAILED:', error.message); process.exit(1); }
console.log('EVIDENCE ROW WRITTEN:', JSON.stringify(data, null, 2));
console.log('metadata.repo_path         =', results.metadata.repo_path);
console.log('metadata.executed_from_cwd =', results.metadata.executed_from_cwd);
console.log('metadata.repo_resolved     =', results.metadata.repo_resolved);
