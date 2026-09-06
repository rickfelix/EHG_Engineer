import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A';
const WT = process.cwd();

// Provenance: hash of the RUNNER-WRITTEN vitest json results files (not hand-authored prose).
const targetedArtifactRelPath = '.artifacts/testing-record-truth-001A-exec.json';
const targetedArtifactPath = `${WT}/${targetedArtifactRelPath}`;
const targetedBuf = fs.readFileSync(targetedArtifactPath);
const targetedContentHash = crypto.createHash('sha256').update(targetedBuf).digest('hex');
const targetedJson = JSON.parse(targetedBuf);

const broaderArtifactRelPath = '.artifacts/testing-record-truth-001A-exec-broader.json';
const broaderArtifactPath = `${WT}/${broaderArtifactRelPath}`;
const broaderBuf = fs.readFileSync(broaderArtifactPath);
const broaderContentHash = crypto.createHash('sha256').update(broaderBuf).digest('hex');
const broaderJson = JSON.parse(broaderBuf);

const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WT, encoding: 'utf8' }).trim();

// Confirm no undisclosed drift between the fix commit and the tip of this EXEC-phase branch
// on the two files TESTING/SECURITY already reviewed at PLAN.
const diffOnReviewedFiles = execFileSync(
  'git',
  [
    'diff',
    'c396f00a81d..5c1b16b5f95',
    '--',
    'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql',
    'tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js',
  ],
  { cwd: WT, encoding: 'utf8' }
).trim();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 93,
  phase: 'EXEC',
  summary: 'EXEC-TO-PLAN TESTING analysis (second, phase-scoped pass; an earlier row already exists for phase=PLAN, id 143fd409-ee49-4244-916f-f8806846e6ed) for the claim_sd() RETURNING-ordering fix now committed on branch feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A (commits c396f00a81d fix + 5c1b16b5f95 SECURITY-evidence-only, PR #8119). Ran tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js via vitest --reporter=json against the current committed HEAD: 12/12 hermetic source-assertion tests pass, 0 failed, 0 skipped, runner success=true. Also ran the broader tests/unit/database/ suite (13 files) to check for regressions introduced by this EXEC-phase commit in sibling database tests: 139 passed, 0 failed, 47 skipped (skips are the pre-existing DB_TIER_BLOCKED guard rail firing because no non-production Supabase ref is designated in this environment -- an existing, unrelated environment gate, not a regression caused by this change). Verified via `git diff c396f00a81d..5c1b16b5f95 -- database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js` that the diff is EMPTY -- i.e. the two files TESTING and SECURITY already reviewed at the PLAN pass are byte-identical at the tip of the EXEC-phase branch; the only file added by the second commit (5c1b16b5f95) is the SECURITY sub-agent evidence-persistence script itself, which does not touch production code or the test file. This confirms no undisclosed changes crept in between the PLAN-phase review and the EXEC-phase commit/push/PR. Scope note: production APPLY of the migration is explicitly out of scope for this EXEC-phase testing verification per the task -- it is blocked by a permission classifier and tracked/escalated separately (TS-5, the post-deploy e2e smoke test, remains not-yet-executable pre-apply, consistent with the PLAN-phase pass\'s documented scope note). This pass validates the CODE implemented in EXEC (migration SQL text + its hermetic unit test), not the production deployment outcome.',
  critical_issues: [],
  warnings: [
    'Production apply of database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql has not yet occurred (blocked by a permission classifier, escalated separately) -- TS-5 (live post-deploy claim-switch smoke test) remains unexecuted pending apply. Out of scope for this EXEC-phase code-level pass per task instructions.',
  ],
  recommendations: [
    'Post-deploy: run the SD\'s documented smoke_test_steps to confirm a real claim-switch populates session_lifecycle_events with CLAIM_SWITCH_EVICTED_CLEARED (TS-5, not automatable pre-apply).',
  ],
  detailed_analysis: {
    targeted_test_run: {
      command: 'npx vitest run tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js --reporter=json --outputFile=.artifacts/testing-record-truth-001A-exec.json',
      result: `${targetedJson.numPassedTests} passed / ${targetedJson.numFailedTests} failed / ${targetedJson.numPendingTests} skipped (numTotalTests=${targetedJson.numTotalTests})`,
    },
    broader_regression_run: {
      command: 'npx vitest run tests/unit/database/ --reporter=json --outputFile=.artifacts/testing-record-truth-001A-exec-broader.json',
      result: `${broaderJson.numPassedTests} passed / ${broaderJson.numFailedTests} failed / ${broaderJson.numPendingTests} skipped (numTotalTests=${broaderJson.numTotalTests})`,
      skip_reason: 'DB_TIER_BLOCKED — no VITEST_DB_ALLOW_REF designated non-production Supabase target in this environment (pre-existing guard rail, unrelated to this change)',
    },
    exec_phase_diff_check: {
      command: 'git diff c396f00a81d..5c1b16b5f95 -- database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js',
      result: diffOnReviewedFiles === '' ? 'EMPTY — no drift on the reviewed files between the fix commit and the current branch tip' : diffOnReviewedFiles,
    },
    commits_reviewed: {
      c396f00a81d: 'fix: claim_sd() claim-switch RETURNING captured post-update NULL, not the evicted sd_key (migration + 12-test hermetic guard file)',
      '5c1b16b5f95': 'chore: persist SECURITY sub-agent evidence for claim_sd fix (adds only scripts/one-off/_store-security-evidence-record-truth-001-a.mjs — does not touch reviewed migration or test files)',
    },
    prior_phase_evidence: {
      plan_phase_testing_row_id: '143fd409-ee49-4244-916f-f8806846e6ed',
      note: 'This row is a fresh, phase=EXEC pass required by the EXEC-TO-PLAN gate; it does not replace or duplicate the PLAN-phase row.',
    },
  },
  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: targetedJson.numTotalTests,
      passed: targetedJson.numPassedTests,
      failed: targetedJson.numFailedTests,
      skipped: targetedJson.numPendingTests,
      artifactSha: targetedContentHash,
      runner: 'vitest@4.1.4 --reporter=json',
      artifactPath: targetedArtifactRelPath,
      source: 'fresh',
    }),
    evidence_provenance: {
      producer: 'vitest v4.1.4 --reporter=json (runner-written, not hand-authored)',
      targeted_artifact_path: targetedArtifactRelPath,
      targeted_content_sha256: targetedContentHash,
      broader_artifact_path: broaderArtifactRelPath,
      broader_content_sha256: broaderContentHash,
      run_commit_sha: headSha,
      num_total_tests_targeted: targetedJson.numTotalTests,
      num_passed_tests_targeted: targetedJson.numPassedTests,
      num_failed_tests_targeted: targetedJson.numFailedTests,
      num_total_tests_broader: broaderJson.numTotalTests,
      num_passed_tests_broader: broaderJson.numPassedTests,
      num_failed_tests_broader: broaderJson.numFailedTests,
      num_skipped_tests_broader: broaderJson.numPendingTests,
      runner_success_targeted: targetedJson.success,
      runner_success_broader: broaderJson.success,
    },
    test_file: 'tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js',
    migration_under_test: 'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql',
    pr_number: 8119,
    branch: 'feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A',
    commits: ['c396f00a81d', '5c1b16b5f95'],
    unit_tests_passed: true,
    e2e_applicable: false,
    production_apply_status: 'not_yet_applied_blocked_by_permission_classifier_escalated_separately',
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, {
  sdKey: SD_KEY,
  phase: 'EXEC',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
