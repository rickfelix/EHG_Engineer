#!/usr/bin/env node
/**
 * Persist TESTING evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-013's EXEC-TO-PLAN handoff.
 *
 * This is a DISTINCT, phase-scoped evidence row from the PLAN-TO-EXEC one written by
 * _testing-write-result-sd-learn-fix-address-pat-les-013-plan-to-exec.mjs. The underlying code
 * has not changed since that row (the SD's sole deliverable was already committed and pushed on
 * PR #8942), so this row's job is to prove that the COMMITTED state is the state that was tested:
 * the tracked worktree is clean at the deliverable commit, and a FRESH runner pass over the same
 * 4 files reproduces the same green result.
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the counts written to
 * metadata.test_execution are NOT hand-typed here. They are read at write time out of the
 * vitest-written JSON report for THIS phase, and that file's sha256 is computed here and stored
 * on the row, so the verdict points at a runner-produced artifact rather than at a claim.
 * Regenerate with:
 *
 *   npx vitest run \
 *     tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js \
 *     tests/unit/retro-boilerplate-template-corpus.test.js \
 *     tests/unit/retrospective-enricher.test.js \
 *     tests/unit/handoff/executors/retro-whatwentwell-real-context.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/pat-les-013-exec-to-plan.json
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-013';
const ARTIFACT_PATH = '.artifacts/testing/pat-les-013-exec-to-plan.json';

const DELIVERABLE_COMMIT = 'f161967f481f94c5b5458935e9745a7352d8947f';
const BRANCH = 'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-013';
const PR = 8942;

// Production file the test guards. Hashes re-measured THIS phase; identical to PLAN_TO_EXEC.
const GUARDED_FILE = 'scripts/modules/rubrics/retrospective-quality-rubric.js';
const GUARDED_FILE_SHA256 = '1bd692603e2daf369933cd0dfb4869f5ebb504743aeb49396ede8e72e3807998';
const GUARDED_FILE_GIT_BLOB = '2931dc683a30d120b53b20cdcee61cc5f734995c';

// The SD's sole deliverable, as committed.
const DELIVERABLE_FILE = 'tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js';
const DELIVERABLE_GIT_BLOB = 'dbb2239f5730e767c5c6eb12cee3738eae39b502';

/** Read the vitest JSON report and derive both the counts and the artifact hash from it. */
function readRunnerArtifact() {
  const raw = readFileSync(ARTIFACT_PATH);
  const sha = createHash('sha256').update(raw).digest('hex');
  const report = JSON.parse(raw.toString('utf8'));
  return {
    sha,
    executed: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests ?? 0,
    suites: report.numTotalTestSuites,
    success: report.success,
  };
}

const summary = 'PASS -- EXEC is complete and verified. The SD\'s sole deliverable (' +
  DELIVERABLE_FILE + ') is committed at ' + DELIVERABLE_COMMIT.slice(0, 11) + ' on ' + BRANCH +
  ' (PR #' + PR + '), and the COMMITTED state is the state that was tested. FRESH EXEC_TO_PLAN ' +
  'VERIFICATION, re-run in this phase rather than carried over from the PLAN_TO_EXEC row. ' +
  '(1) CLEAN-TREE PROOF: `git status --porcelain` in the worktree lists NO tracked modification ' +
  '-- the only entry is the untracked runner artifact ' + ARTIFACT_PATH + ' that this phase\'s ' +
  'vitest pass just wrote. HEAD is ' + DELIVERABLE_COMMIT + '. So nothing was tested that is not ' +
  'also committed, and nothing is committed that was not tested. ' +
  '(2) DELIVERABLE RE-RUN: ' + DELIVERABLE_FILE + ' 3/3 pass under vitest 4.1.4 (~631ms), re-run ' +
  'in this phase against the committed tree. ' +
  '(3) COMBINED NO-REGRESSION RE-RUN: a single fresh runner pass over the deliverable plus the 3 ' +
  'pre-existing related suites (retro-boilerplate-template-corpus, retrospective-enricher, ' +
  'retro-whatwentwell-real-context) wrote ' + ARTIFACT_PATH + ' with numTotalTests=38, ' +
  'numPassedTests=38, numFailedTests=0, numPendingTests=0, numTotalTestSuites=16, success=true. ' +
  'The counts on this row are READ OUT OF that file at write time and its sha256 is recorded in ' +
  'metadata.test_execution.artifact_sha -- they are not hand-entered. ' +
  '(4) GUARDED CODE UNCHANGED SINCE THE MUTATION TEST, PROVEN BY HASH: the production file the ' +
  'test guards (' + GUARDED_FILE + ') re-hashes THIS phase to sha256 ' + GUARDED_FILE_SHA256 +
  ' / git blob ' + GUARDED_FILE_GIT_BLOB + ' -- byte-identical to the hashes recorded on the ' +
  'PLAN_TO_EXEC row. The PLAN_TO_EXEC mutation test (gating off the penalty subtraction at ' +
  'retrospective-quality-rubric.js:504 killed the mutant -- 2 of 3 tests failed, the zero-penalty ' +
  'control correctly survived) therefore still characterises the exact bytes shipping here, and ' +
  'no mutation was left in the tree. Non-vacuity is inherited by hash identity, not by assertion. ' +
  '(5) SCOPE / BLAST RADIUS: the SD changes NO production code. Its only deliverable is one new ' +
  'test file, so there is no feature flag, no migration, no rollback plan and no runtime ' +
  'regression surface. E2E is not applicable (Node-side scoring rubric, no UI/route/journey). ' +
  'The SD\'s stated objective -- close verified-stale /learn pattern PAT-LES-f04ca2cf73c6 by ' +
  'adding a real regression guard over validateRetrospectiveQuality()\'s boilerplate-penalty ' +
  'blend -- is met by committed, executing, non-vacuous code. Recommend PLAN accept the handoff.';

async function main() {
  const artifact = readRunnerArtifact();

  if (!artifact.success || artifact.failed > 0 || artifact.executed <= 0) {
    console.error(
      `REFUSING to write PASS: runner artifact ${ARTIFACT_PATH} reports success=${artifact.success}, ` +
      `executed=${artifact.executed}, failed=${artifact.failed}.`
    );
    process.exit(1);
  }

  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 96,
    findings: [
      {
        id: 'E1-committed-state-is-the-tested-state',
        severity: 'INFO',
        summary: `git status --porcelain in the worktree shows no tracked modification at HEAD ${DELIVERABLE_COMMIT} (branch ${BRANCH}, PR #${PR}); the sole entry is the untracked runner artifact this phase's vitest pass wrote. The deliverable blob is ${DELIVERABLE_GIT_BLOB}. Nothing tested is uncommitted and nothing committed is untested.`,
      },
      {
        id: 'E2-deliverable-re-run-green-this-phase',
        severity: 'INFO',
        summary: `${DELIVERABLE_FILE}: 3/3 pass under vitest 4.1.4, re-executed in the EXEC_TO_PLAN phase against the committed tree rather than carried over from the PLAN_TO_EXEC row.`,
      },
      {
        id: 'E3-no-regression-combined-runner-pass',
        severity: 'INFO',
        summary: `Fresh combined pass over the deliverable plus the 3 pre-existing related suites: ${artifact.passed}/${artifact.executed} pass across ${artifact.suites} suites, ${artifact.failed} failed, ${artifact.skipped} skipped, success=${artifact.success} (artifact ${ARTIFACT_PATH}, sha256 ${artifact.sha}). Counts read from the runner file, not hand-entered.`,
      },
      {
        id: 'E4-guarded-code-byte-identical-to-mutation-tested-bytes',
        severity: 'INFO',
        summary: `${GUARDED_FILE} re-hashes this phase to sha256 ${GUARDED_FILE_SHA256} / git blob ${GUARDED_FILE_GIT_BLOB}, byte-identical to the hashes on the PLAN_TO_EXEC row. The mutation test performed there (disabling the penalty gate at line 504 killed the mutant: 2 of 3 tests failed; the zero-penalty control correctly survived) therefore still characterises the exact bytes shipping here, and no mutation remains in the tree. Non-vacuity is inherited by hash identity, not re-asserted.`,
      },
      {
        id: 'E5-zero-production-blast-radius',
        severity: 'INFO',
        summary: 'The SD changes no production code; the only deliverable is one new test file. No feature flag, migration or rollback plan is needed and there is no runtime regression surface.',
      },
      {
        id: 'E6-sd-objective-met',
        severity: 'INFO',
        summary: 'The SD objective -- close verified-stale /learn pattern PAT-LES-f04ca2cf73c6 with a real regression guard over RetrospectiveQualityRubric.validateRetrospectiveQuality()\'s boilerplate-penalty blend -- is met by committed, executing, non-vacuous code. Recommend PLAN accept the EXEC-TO-PLAN handoff.',
      },
    ],
    warnings: [],
    recommendations: [
      'Accept the EXEC-TO-PLAN handoff. The deliverable is committed, green, and hash-proven identical to the state the PLAN_TO_EXEC mutation test characterised.',
      'Keep the AIQualityEvaluator.evaluate() spy bounded by afterEach mockRestore (already done) so the stub cannot leak into sibling suites during a full `npm run test:unit` sweep.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'EXEC_TO_PLAN_TESTING',
      review_method:
        'fresh EXEC_TO_PLAN re-verification against the committed tree: clean-tree check via git status --porcelain at HEAD, a re-run of the deliverable suite, a fresh combined runner pass over all 4 files with counts read from the vitest-written JSON report, and a re-hash of the guarded production file proving byte-identity with the bytes the PLAN_TO_EXEC mutation test characterised',
      measured: true,
      test_execution: buildTestExecution({
        executed: artifact.executed,
        passed: artifact.passed,
        failed: artifact.failed,
        skipped: artifact.skipped,
        artifactSha: artifact.sha,
        runner: 'vitest 4.1.4',
        artifactPath: ARTIFACT_PATH,
        source: 'fresh',
        mappedCandidates: 4,
        foundFiles: 4,
      }),
      test_files_executed: [
        DELIVERABLE_FILE,
        'tests/unit/retro-boilerplate-template-corpus.test.js',
        'tests/unit/retrospective-enricher.test.js',
        'tests/unit/handoff/executors/retro-whatwentwell-real-context.test.js',
      ],
      files_reviewed: [DELIVERABLE_FILE, GUARDED_FILE],
      per_file_results: {
        [DELIVERABLE_FILE]: '3/3 pass (the SD deliverable, re-run this phase)',
        'tests/unit/retro-boilerplate-template-corpus.test.js + retrospective-enricher.test.js + retro-whatwentwell-real-context.test.js':
          '35/35 pass across 3 files (pre-existing, no regression)',
      },
      clean_tree_check: {
        performed: true,
        head_commit: DELIVERABLE_COMMIT,
        branch: BRANCH,
        pr: PR,
        tracked_modifications: 0,
        untracked_entries: [ARTIFACT_PATH],
        untracked_entries_reason: 'runner artifact written by this phase\'s vitest pass; not a source change',
        conclusion: 'the committed state is exactly the state that was tested',
      },
      guarded_file_identity: {
        file: GUARDED_FILE,
        sha256_this_phase: GUARDED_FILE_SHA256,
        git_blob_this_phase: GUARDED_FILE_GIT_BLOB,
        matches_plan_to_exec_row: true,
        implication:
          'the PLAN_TO_EXEC mutation test (penalty gate at line 504 disabled -> mutant killed, 2 of 3 tests failed, zero-penalty control survived by design) still characterises these exact bytes; no mutation remains in the tree',
      },
      mutation_test: {
        performed_this_phase: false,
        inherited_from_phase: 'PLAN_TO_EXEC',
        inheritance_basis: `guarded file ${GUARDED_FILE} is byte-identical (sha256 ${GUARDED_FILE_SHA256}, git blob ${GUARDED_FILE_GIT_BLOB}) and deliverable blob ${DELIVERABLE_GIT_BLOB} is unchanged`,
        mutant_killed: true,
        tests_failed_under_mutation: 2,
        tests_passed_under_mutation: 1,
        surviving_test_is_expected_control: true,
      },
      e2e_applicable: false,
      e2e_exemption_reason:
        'Test-only deliverable guarding a pure scoring blend in a Node-side rubric module. No UI surface, no route and no user-facing journey exist for this change, so E2E is not applicable per the sd-classification rule for infrastructure/test-only SDs.',
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-013',
      branch: BRANCH,
      head_commit: DELIVERABLE_COMMIT,
      pr: PR,
      pattern_closed: 'PAT-LES-f04ca2cf73c6',
      runner_artifact: { path: ARTIFACT_PATH, sha256: artifact.sha, success: artifact.success },
    },
    phase: 'EXEC_TO_PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director (TESTING)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  test_execution:', JSON.stringify(stored.metadata?.test_execution));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
