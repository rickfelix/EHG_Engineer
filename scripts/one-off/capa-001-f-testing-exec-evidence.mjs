#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F — EXEC-phase TESTING sub-agent evidence.
 *
 * Post-implementation VERIFICATION of the shipped code on commit 57a30a445c1 (PR #8906),
 * not a strategy review. Counts are READ from a runner-produced vitest JSON artifact and
 * its sha256 is carried on the row (CLAUDE.md gate-evidence provenance rule: TESTING reads
 * only a runner-written results file with its hash in the verdict row).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ARTIFACT_PATH = '.artifacts/capa-001-f-exec-regression.json';
const rawArtifact = readFileSync(ARTIFACT_PATH);
const artifactSha = createHash('sha256').update(rawArtifact).digest('hex');
const report = JSON.parse(rawArtifact.toString('utf8'));

// Integration-tier attempt artifact — read ONLY to report its honest extent (every test
// skipped), never folded into the measured counts.
const INTEG_PATH = '.artifacts/capa-001-f-exec-integration.json';
const rawInteg = readFileSync(INTEG_PATH);
const integSha = createHash('sha256').update(rawInteg).digest('hex');
const integ = JSON.parse(rawInteg.toString('utf8'));
const integSkipped = (integ.testResults || []).flatMap((t) => t.assertionResults).filter((a) => a.status === 'skipped').length;

const testExecution = buildTestExecution({
  executed: report.numTotalTests,
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  skipped: report.numPendingTests,
  artifactSha,
  artifactPath: ARTIFACT_PATH,
  runner: 'npx vitest run --project unit <16 regression-scope suites> --reporter=json',
  source: 'fresh',
  foundFiles: (report.testResults || []).length,
});

const perFile = (report.testResults || []).map((t) => ({
  file: t.name.split(/[\\/]/).slice(-2).join('/'),
  passed: t.assertionResults.filter((a) => a.status === 'passed').length,
  failed: t.assertionResults.filter((a) => a.status === 'failed').length,
}));

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 93,
  phase: 'EXEC',
  execution_time_ms: 0,
  summary: [
    `EXEC-phase VERIFICATION of the shipped implementation on commit 57a30a445c1 (PR #8906). MEASURED: ${report.numPassedTests}/${report.numTotalTests} unit tests pass across ${(report.testResults || []).length} suites (${report.numPassedTestSuites}/${report.numTotalTestSuites} describe-blocks), 0 failed, 0 skipped. Artifact ${ARTIFACT_PATH} sha256=${artifactSha}.`,
    'ZERO REGRESSIONS: every PLAN-baseline suite retained its exact baseline count and is still green (fr1-4-6 16, fr7-category-coverage 8, telemetry-analytics 4, growth-categories 7, stage-17-build-brief 5, stage-17-analysis-step-wiring 7 = the 47 unchanged baseline tests; venture-uptime-probe grew 14->22 by design via the 8 new getLatestProbeStatus tests).',
    'I EXPANDED the regression scope beyond the PRD and beyond the PLAN-phase list: FOUR additional unit suites import the changed modules and were missed by both (tests/unit/cron/venture-ops-actuals-sweep.test.js 34, tests/unit/cron/venture-ops-actuals-wiring.test.js 4, tests/unit/marketing/crack-gate-evaluator.test.js 28, tests/unit/periodic-liveness/owner-target-resolver.test.js 8 = 74 further tests). All 74 pass. This is the SECOND consecutive undercount of this SD\'s regression scope (PLAN GAP-3 caught the first).',
    'FR-2 CI PREDICATE PROVEN NOT ZERO-YIELD -- the single most important check, since a permanently-passing predicate is the exact defect class this CAPA exists to eliminate. I ran findSelfApprovalWrites against the REAL pre-fix source (git show origin/main:lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js): it returns 1 match at line 511, capturing the genuine multi-line chain ".from(\'chairman_decisions\')" / ".update({ status: \'approved\', decision: \'approve\', resolved_at: ... })". Against the post-fix branch source: 0. Against stage-22-distribution-setup.js (legitimate SELECT/pending-create): 0. PLAN GAP-1 (line-oriented blindness) is CLOSED with a real true-positive anchor, not a synthetic simplification.',
    'scripts/ci/no-self-approval-chairman-decisions.mjs run directly: status=PASS, exit 0, zero offenders, 51 .js files scanned in lib/eva/stage-templates/analysis-steps/ (0 subdirectories, so the non-recursive readdir is complete today).',
    'LIVE-DB READ-ONLY VERIFICATION (FR-3 AC3): venture_stages.stage_number=24 is_high_consequence reads FALSE post-ship -- the chairman-gated SQL was authored and NOT applied by this worker, exactly as required. Siblings confirmed: stage 3 kill/true, 19 promotion/true, 25 promotion/true, 24 kill/FALSE (the inconsistency the staged migration documents).',
    'I INDEPENDENTLY RE-VERIFIED FR-1\'s load-bearing premise rather than trusting the PRD: chairman_decisions.resolved_at returns PostgREST 42703 "column does not exist", and the live column list (37 columns: ...decided_by, updated_at, consumed_at, undone_at...) contains no resolved_at. The removed UPDATE therefore always failed atomically -- removing it is behaviour-preserving in fact, and the old "auto-approved" log line was a false claim about a write that never landed.',
    'LINT: 8 touched files linted. Exactly ONE error, the known pre-existing no-unused-vars at stage-17-blueprint-review.js:255 (\'totalQuality\'). I confirmed it is byte-identical on origin/main via `git show origin/main:<path> | npx eslint --stdin` -- same rule, same line 255:5. ZERO new lint issues introduced by this SD across all 8 files.',
    'PRD COVERAGE: all 5 FRs have real assertions, not just test files. The 22 new/extended test titles were read from the runner JSON (not the source), so the assertions verified are the ones that actually executed.',
    'PLAN-phase gaps closed: GAP-1 (multiline predicate) CLOSED and independently anchored; GAP-3 (four-suite undercount) CLOSED in the PRD AC and in fact; GAP-4 (no stage-17 harness) CLOSED by a new 4-test analyzeStage17 harness; GAP-5 (metadata.probe absent, null last_checked_at) CLOSED by three named tests; GAP-6 (@approved-by placeholder) CLOSED -- the header carries codestreetlabs@gmail.com, matching git config user.email; GAP-7 (.test.js extension) CLOSED, all new files collected and executed.',
    'PASS not CONDITIONAL_PASS: every acceptance criterion is satisfied by an executed assertion or an independently re-measured fact, there are no failing tests, and no new lint. The three warnings below are residual-durability observations about how the coverage could rot later -- none of them means a criterion is currently unmet.',
  ].join(' '),
  critical_issues: [],
  warnings: [
    'RESIDUAL GAP-2 (MEDIUM, FR-4) -- resolved differently from the PLAN recommendation, and the difference matters. PLAN asked that each of the FOUR legacy stage-23 fixtures gain an explicit venture_deployments branch so the degraded path is chosen deliberately. NONE of the four has one (grep: zero venture_deployments references in fr1-4-6, fr7-category-coverage, telemetry-analytics, growth-categories). They stay green because checkVentureUptimeWired\'s try/catch swallows the fixtures\' strict-throw and returns null. CONSEQUENCE: those four suites are NOT monitoring-regression detectors -- a completely broken getLatestProbeStatus would leave all four green. The mitigation is real but concentrated: the new stage-23-launch-readiness-monitoring.test.js carries all 8 monitoring assertions INCLUDING an explicit "degrades to the generic advisory message (never throws) when venture_deployments is entirely unmocked (legacy fixture parity)" test that names this exact condition. That is arguably better than duplicating branches four times -- but it means monitoring coverage has a single point of failure: if that one file is ever deleted, skipped or quarantined, the monitoring wiring becomes untested and no other suite notices.',
    'FR-2 AC3 NUANCE (LOW-MEDIUM) -- "invoked from CI, not a standalone script nobody calls" is satisfied in substance but not by the script itself. scripts/ci/no-self-approval-chairman-decisions.mjs is referenced by NO workflow, NO package.json script and NO husky hook (grep-verified). Enforcement comes entirely from tests/unit/ci/no-self-approval-chairman-decisions.test.js:88, which calls scanDirectoryForSelfApproval against the REAL lib/eva/stage-templates/analysis-steps/ directory and runs under .github/workflows/unit-tier.yml (on: pull_request + push to main, `npx vitest run --project unit`). So the predicate IS CI-enforced on every PR and the AC intent is met. The residual: the .mjs main() itself is dead in CI, so a later cleanup that removes or weakens that one test silently converts the file into the "standalone script nobody calls" the AC was written to prevent. Worth a one-line reference in the workflow or an npm script to make the binding explicit.',
    'EXTENT BOUNDARY (MEDIUM, honesty-of-instrument) -- the two integration suites in regression scope were ATTEMPTED, not skipped by choice, and the attempt produced a green-but-dead reading I am explicitly refusing to count. `npx vitest run --project db tests/integration/eva/analysis-steps.test.js tests/integration/legal-doc-producer-activation.test.js` exits 0 and the JSON reports success:true with 2/2 suites "passed" -- but 56/56 assertions are status=skipped and ZERO executed, because the db tier refuses all network without a designated non-production ref (DB_TIER_BLOCKED, reason=no_designated_target, ref dedlbzhpgkmetvhbkyzq). Artifact .artifacts/capa-001-f-exec-integration.json sha256=' + integSha + '. These 56 are NOT in my measured counts. The 178 measured tests are unit-tier only; the integration tier is unverified for this change, and anyone reading that artifact\'s success:true field alone would be misled.',
    'PROSE IMPRECISION (LOW, FR-3 AC4) -- the UP SQL says "sibling kill/high-consequence stages 3, 19, and 25 are all is_high_consequence=true". Live-verified: only stage 3 is gate_type=\'kill\'; stages 19 and 25 are gate_type=\'promotion\'. The sentence is true read as "kill-or-high-consequence siblings" and it matches the PRD AC\'s own wording verbatim, so it is not a deviation from spec -- but a future reader could take it as "all three are kill gates" and mis-reason about the invariant. Cosmetic; no action required for this SD.',
    'FUTURE-PROOFING (LOW, FR-2) -- scanDirectoryForSelfApproval uses a non-recursive readdirSync on direct .js children only. Today that is complete (51 files, 0 subdirectories). If a subdirectory is ever added under lib/eva/stage-templates/analysis-steps/, the predicate silently skips it with no signal. Also, the PASS output prints files_scanned_with_chairman_decisions_touch: "see offenders (none)" -- a placeholder string rather than a real scanned-file count, so the PASS line does not itself evidence that anything was scanned. (A wrong TARGET_DIR would throw on readdirSync, so it is not fully blind -- but the printed PASS carries no count.)',
  ],
  recommendations: [
    'Add a scanned-file count to the predicate\'s PASS output (replace the "see offenders (none)" placeholder with files_scanned: N) so the printed PASS is self-evidencing, and make the readdir recursive (or assert zero subdirectories) so a future subdirectory cannot silently escape the scan.',
    'Bind the CI enforcement explicitly: either add `node scripts/ci/no-self-approval-chairman-decisions.mjs` as a step in .github/workflows/unit-tier.yml, or add an npm script referencing it, so the predicate does not depend solely on one unit test remaining un-quarantined.',
    'Consider adding an explicit venture_deployments branch to at least ONE of the four legacy stage-23 fixtures, so monitoring coverage is not concentrated entirely in stage-23-launch-readiness-monitoring.test.js.',
    'For the SD\'s follow-on record: the integration tier cannot verify this change on this machine (no designated non-production ref). If integration-level verification of the monitoring wiring is wanted, it needs VITEST_DB_ALLOW_REF set to a non-production project ref -- that is an environment provisioning item, not a code gap.',
    'Flag for the parent programme: this SD\'s regression scope was undercounted twice (PRD said 3 stage-23 suites, PLAN corrected to 4, EXEC found 4 more importers outside the stage-23 naming convention). A mechanical importer-graph scope derivation would have caught all three at once -- relevant to root-cause class B (producer/reader split with no wiring gate).',
  ],
  detailed_analysis: {
    review_type: 'EXEC-phase post-implementation verification (shipped code executed, not reviewed on paper)',
    prd_id: 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F',
    commit_under_test: '57a30a445c1',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F',
    pr: 'https://github.com/rickfelix/EHG_Engineer/pull/8906',
    measured_counts: {
      unit_tests_total: report.numTotalTests,
      unit_tests_passed: report.numPassedTests,
      unit_tests_failed: report.numFailedTests,
      unit_tests_skipped: report.numPendingTests,
      suite_files: (report.testResults || []).length,
      describe_blocks_passed: `${report.numPassedTestSuites}/${report.numTotalTestSuites}`,
      per_file: perFile,
    },
    integration_attempt: {
      attempted: true,
      runner: 'npx vitest run --project db tests/integration/eva/analysis-steps.test.js tests/integration/legal-doc-producer-activation.test.js',
      reported_success: integ.success,
      assertions_skipped: integSkipped,
      assertions_executed: 0,
      artifact_path: INTEG_PATH,
      artifact_sha: integSha,
      reason: 'DB_TIER_BLOCKED / no_designated_target (ref dedlbzhpgkmetvhbkyzq). Green-but-dead: success=true with zero executed. Deliberately EXCLUDED from measured counts.',
    },
    ci_predicate_verification: {
      direct_run: 'node scripts/ci/no-self-approval-chairman-decisions.mjs -> {"status":"PASS"}, exit 0, zero offenders',
      files_scanned: 51,
      subdirectories_skipped: 0,
      true_positive_anchor: 'findSelfApprovalWrites(origin/main stage-17-blueprint-review.js) => 1 match at line 511, real multi-line chain. PROVES the predicate is not zero-yield.',
      post_fix_branch: '0 matches',
      true_negative_stage22: '0 matches',
      ci_binding: 'tests/unit/ci/no-self-approval-chairman-decisions.test.js:88 scans the real directory; runs under .github/workflows/unit-tier.yml (on: pull_request, push:main). The .mjs main() itself is not invoked by CI.',
    },
    live_db_readonly_checks: {
      'venture_stages stage 24 is_high_consequence': 'FALSE -- FR-3 AC3 satisfied, chairman-gated SQL NOT applied by this worker',
      'venture_stages siblings': 'stage 3 kill/true, 19 promotion/true, 23 none/false, 24 kill/FALSE, 25 promotion/true',
      'chairman_decisions.resolved_at': 'PostgREST 42703 column does not exist -- FR-1 premise independently re-confirmed; the removed UPDATE could never have landed',
    },
    ac_coverage_matrix: {
      'FR-1 (remove stage-17 self-approval)': 'PASS -- diff removes the UPDATE entirely; PASS branch now logs the identical honest "chairman decision pending" line as every other recommendation. 4 executed assertions: never writes on PASS, never writes on FAIL, identical pending log on PASS (no "auto-approved"), createOrReusePendingDecision still called. AC4 (existing tests unmodified) holds: stage-17-build-brief 5/5 and stage-17-analysis-step-wiring 7/7 at baseline counts.',
      'FR-2 (CI predicate)': 'PASS -- 10 executed assertions covering true-positives (multi-line shape, status-only, decision-only), true-negatives (SELECT, unrelated-field UPDATE, comment mention, empty file), the real directory scan, the real stage-22 file, and DI-injected synthetic offender. Independently anchored against origin/main. AC3 met in substance (see warning).',
      'FR-3 (chairman-gated SQL authored not applied)': 'PASS -- UP and DOWN both exist, each a single scoped UPDATE with an idempotent WHERE. Header carries @chairman-gated and @approved-by: codestreetlabs@gmail.com (== git config user.email, NOT a placeholder). BUG/FIX prose cites stage 24 kill-gate vs siblings 3/19/25. Live DB confirms unapplied.',
      'FR-4 (monitoring producer wired)': 'PASS -- explicit `case \'monitoring\':` present; ADVISORY_CATEGORIES unchanged so verdict logic is untouched; checkVentureUptimeWired has the load-bearing try/catch (lines 206-214). 8 executed assertions: reachable detail cites status_code/last_checked_at, unreachable reflected honestly, no-data honest fallback, verdict unaffected, analytics not regressed, read-error degrades, unmocked-table parity, null supabase/ventureId.',
      'FR-5 (unit coverage)': 'PASS -- all four additions/extensions execute under the existing unit tier, follow the buildMockSupabase convention, and no test in any touched file regressed.',
    },
    plan_gap_disposition: {
      'GAP-1 multiline predicate (HIGH)': 'CLOSED -- verified by executing the predicate against real pre-fix source, not by reading it.',
      'GAP-2 fixture strict-throw (HIGH)': 'RESOLVED DIFFERENTLY -- see warning. Coverage exists but is concentrated in one file.',
      'GAP-3 test-file undercount (HIGH)': 'CLOSED in PRD and in fact -- and EXEC found four MORE importers both prior phases missed.',
      'GAP-4 no stage-17 harness (MEDIUM)': 'CLOSED -- new 4-test analyzeStage17 harness exists and executes.',
      'GAP-5 probe edge cases (MEDIUM)': 'CLOSED -- "no metadata.probe yet", "null/malformed last_checked_at", "last_checked_at absent on every row" all executed.',
      'GAP-6 @approved-by placeholder (MEDIUM)': 'CLOSED -- real ceremony-valid email matching git config user.email.',
      'GAP-7 .test.js extension (LOW)': 'CLOSED -- all new files collected and executed by the unit project.',
      'GAP-8 stage numbering drift (LOW)': 'ACKNOWLEDGED -- module filename stage-23-launch-readiness.js implements venture_stages stage_number=24 "Launch Readiness"; both the SQL and the tests name which numbering they mean.',
    },
    lint_verification: {
      files_linted: 8,
      new_issues: 0,
      preexisting_issues: 1,
      detail: "stage-17-blueprint-review.js:255:5 no-unused-vars 'totalQuality' — confirmed byte-identical on origin/main via `git show origin/main:<path> | npx eslint --stdin --stdin-filename <path>` (same rule, same 255:5). NOT a regression from this SD.",
    },
    verdict_rationale: 'PASS: 178/178 executed unit tests green with zero regressions against the PLAN baseline; the FR-2 predicate is proven non-zero-yield against genuine pre-fix source; the FR-1 premise and the FR-3 not-applied state were independently re-measured against the live DB rather than taken from the PRD; and lint introduces nothing new. The warnings are durability observations (coverage concentration, CI binding by test rather than by script, and an integration tier that cannot run here) — none leaves an acceptance criterion unmet today.',
  },
  metadata: {
    test_execution: testExecution,
    measured: true,
    activation_invariant_verified: false,
    activation_invariant_note: 'Not applicable at EXEC phase; this is the implementation-verification row, not a LEAD-FINAL-APPROVAL chain assertion. FR-3 is deliberately an authored-not-applied schema change, so no schema->worker->UI activation chain ships in this SD.',
    implementation_under_test_exists: true,
    extent: 'Unit tier only (vitest --project unit), 16 suites / 178 tests, all executed. Integration tier attempted and structurally unavailable (DB_TIER_BLOCKED) — 56 assertions skipped, zero executed, excluded from counts. No E2E tier: this SD ships no UI surface.',
    regression_scope_expanded_beyond_plan: [
      'tests/unit/cron/venture-ops-actuals-sweep.test.js (34)',
      'tests/unit/cron/venture-ops-actuals-wiring.test.js (4)',
      'tests/unit/marketing/crack-gate-evaluator.test.js (28)',
      'tests/unit/periodic-liveness/owner-target-resolver.test.js (8)',
    ],
    integration_artifact_sha: integSha,
    integration_artifact_path: INTEG_PATH,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'scripts/ci/no-self-approval-chairman-decisions.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'QA Engineering Director' }, results, {
  sdKey: SD_KEY,
  phase: 'EXEC',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }, null, 2));
