#!/usr/bin/env node
/**
 * Persist TESTING evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-013's PLAN-TO-EXEC handoff.
 *
 * The verification itself was performed by the TESTING sub-agent (Task tool) in the worktree
 * .worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-013: full read of the new regression test, a live
 * vitest run, an independent mutation test of the production code the test guards, and a
 * no-regression run of the 3 pre-existing related suites.
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the counts written to
 * metadata.test_execution are NOT hand-typed here. They are read at write time out of the
 * vitest-written JSON report, and that file's sha256 is computed here and stored on the row,
 * so the verdict points at a runner-produced artifact rather than at a claim. Regenerate with:
 *
 *   npx vitest run \
 *     tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js \
 *     tests/unit/retro-boilerplate-template-corpus.test.js \
 *     tests/unit/retrospective-enricher.test.js \
 *     tests/unit/handoff/executors/retro-whatwentwell-real-context.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/pat-les-013-plan-to-exec.json
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-013';
const ARTIFACT_PATH = '.artifacts/testing/pat-les-013-plan-to-exec.json';

// Production file the new test guards; hashes recorded pre-mutation and post-restore.
const GUARDED_FILE = 'scripts/modules/rubrics/retrospective-quality-rubric.js';
const GUARDED_FILE_SHA256 = '1bd692603e2daf369933cd0dfb4869f5ebb504743aeb49396ede8e72e3807998';
const GUARDED_FILE_GIT_BLOB = '2931dc683a30d120b53b20cdcee61cc5f734995c';

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

const summary = 'PASS -- the SD\'s sole code deliverable ' +
  '(tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js) is a genuine, ' +
  'non-vacuous regression guard and is ready for EXEC. VERIFIED BY DIRECT EXECUTION, not by ' +
  'reading claims. (1) STRUCTURE: read the file in full (124 lines, 3 tests). It imports and ' +
  'instantiates the REAL RetrospectiveQualityRubric from ' +
  'scripts/modules/rubrics/retrospective-quality-rubric.js -- there is NO vi.mock of the module ' +
  'under test, so the real static detectBoilerplate() (lines 183-228) and the real ' +
  'validateRetrospectiveQuality() penalty blend (lines 499-508) both execute. The only stubs are ' +
  'vi.spyOn(AIQualityEvaluator.prototype, "evaluate") (avoids an LLM/network call; restored in ' +
  'afterEach via mockRestore) and a vi.mock of lib/supabase-client.js (avoids a DB call). The ' +
  'logic under test is NOT re-implemented in the test: expected values are the stubbed AI ' +
  'weightedScore minus the penalty the REAL detectBoilerplate computes, so the assertions are ' +
  'not tautological. This closes the gap the SD identified -- the pre-existing ' +
  'sd-completion-readiness-passed-contract.test.js vi.mocks the entire RetrospectiveQualityRubric ' +
  'class away and therefore never reaches the blend. ' +
  '(2) GREEN RUN: 3/3 tests pass (vitest 4.1.4, ~508ms). ' +
  '(3) MUTATION TEST -- independent proof of non-vacuity: mutated the penalty gate at ' +
  'retrospective-quality-rubric.js:504 from `if (boilerplateResult.hasBoilerplate) {` to ' +
  '`if (false && boilerplateResult.hasBoilerplate) {`, disabling the penalty subtraction while ' +
  'leaving everything else intact. Re-ran the suite -> the mutant was KILLED: 2 of 3 tests ' +
  'FAILED (test 1 "FR-0 regression: template retro dragged below threshold" expected 43 got 68; ' +
  'test 3 "already-failing template retro stays failed" expected 15 got 40). Test 2 (genuine ' +
  'SD-specific content, zero penalty, AI verdict passes through unchanged) correctly stayed ' +
  'green -- it is the zero-penalty control and is unaffected by this mutation by design. The ' +
  'guard therefore detects removal of the exact production line it claims to protect. ' +
  '(4) CLEAN RESTORE VERIFIED BY HASH: reverted via `git checkout -- <file>`. Post-restore ' +
  '`git diff` on that path is empty, `git status --porcelain` no longer lists the file (only ' +
  'pre-existing untracked files remain), and the pre-mutation and post-restore hashes match ' +
  'exactly (git blob ' + GUARDED_FILE_GIT_BLOB + '; sha256 ' + GUARDED_FILE_SHA256 + '). ' +
  'Production code is byte-identical to its pre-test state; no mutation is left in the tree. ' +
  'Re-ran the suite post-restore -> 3/3 pass again. ' +
  '(5) NO REGRESSION: the 3 pre-existing related suites ' +
  '(retro-boilerplate-template-corpus, retrospective-enricher, ' +
  'retro-whatwentwell-real-context) pass 35/35. A single combined runner pass over all 4 files ' +
  'wrote ' + ARTIFACT_PATH + ' (numTotalTests=38, numPassedTests=38, numFailedTests=0, ' +
  'numPendingTests=0, success=true); the counts on this row are read out of that file and its ' +
  'sha256 is recorded in metadata.test_execution.artifact_sha. ' +
  'This SD modifies NO production code -- the deliverable is test-only, so the blast radius is ' +
  'zero and EXEC carries no rollback risk.';

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
        id: 'T1-new-guard-passes-against-real-production-code',
        severity: 'INFO',
        summary: 'tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js: 3/3 pass under vitest 4.1.4. Instantiates the real RetrospectiveQualityRubric (no vi.mock of the module under test); only the network-calling AIQualityEvaluator.evaluate() and lib/supabase-client.js are stubbed. Expected scores are derived from the real detectBoilerplate penalty, not re-implemented, so the assertions are non-tautological.',
      },
      {
        id: 'T2-mutation-test-kills-mutant',
        severity: 'INFO',
        summary: 'Non-vacuity proven by mutation: disabling the penalty gate at retrospective-quality-rubric.js:504 (`if (false && boilerplateResult.hasBoilerplate)`) made 2 of 3 tests FAIL (expected 43 got 68; expected 15 got 40). The zero-penalty control test correctly remained green. The guard genuinely detects regression of the boilerplate-penalty blend it was written to protect.',
      },
      {
        id: 'T3-production-code-restored-byte-identical',
        severity: 'INFO',
        summary: `Mutation reverted via 'git checkout --'. git diff empty; git status --porcelain shows no modification to ${GUARDED_FILE}; pre-mutation and post-restore hashes match exactly (git blob ${GUARDED_FILE_GIT_BLOB}, sha256 ${GUARDED_FILE_SHA256}). Post-restore re-run: 3/3 pass. No mutation left in the tree.`,
      },
      {
        id: 'T4-no-regression-in-related-suites',
        severity: 'INFO',
        summary: `The 3 pre-existing related suites pass 35/35. Combined runner pass over all 4 files: ${artifact.passed}/${artifact.executed} across ${artifact.suites} suites, 0 failed, 0 skipped (artifact ${ARTIFACT_PATH}, sha256 ${artifact.sha}).`,
      },
      {
        id: 'T5-zero-production-blast-radius',
        severity: 'INFO',
        summary: 'The SD changes no production code. Its only deliverable is one new test file, so EXEC needs no feature flag, no migration and no rollback plan, and cannot regress runtime behaviour.',
      },
    ],
    warnings: [],
    recommendations: [
      'Proceed to EXEC. The deliverable is test-only (one new file, no production code changed), so EXEC carries no rollback risk.',
      'Keep the AIQualityEvaluator.evaluate() spy bounded by afterEach mockRestore (already done) so the stub cannot leak into sibling suites when this file runs as part of a full `npm run test:unit` sweep.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'PLAN_TO_EXEC_TESTING',
      review_method:
        'full read of the new test file, a live vitest run, an independently applied-and-reverted mutation of the guarded production line, and a no-regression run of the 3 pre-existing related suites; counts read from the vitest-written JSON report, not hand-entered',
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
        'tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js',
        'tests/unit/retro-boilerplate-template-corpus.test.js',
        'tests/unit/retrospective-enricher.test.js',
        'tests/unit/handoff/executors/retro-whatwentwell-real-context.test.js',
      ],
      files_reviewed: [
        'tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js',
        GUARDED_FILE,
      ],
      per_file_results: {
        'tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js': '3/3 pass (the SD deliverable)',
        'tests/unit/retro-boilerplate-template-corpus.test.js + retrospective-enricher.test.js + retro-whatwentwell-real-context.test.js': '35/35 pass across 3 files (pre-existing, no regression)',
      },
      mutation_test: {
        performed: true,
        target_file: GUARDED_FILE,
        target_line: 504,
        mutation: 'if (boilerplateResult.hasBoilerplate) {  ->  if (false && boilerplateResult.hasBoilerplate) {',
        mutant_killed: true,
        tests_failed_under_mutation: 2,
        tests_passed_under_mutation: 1,
        killers: [
          'FR-0 regression: a template retro the AI judge alone would PASS is dragged below threshold by the deterministic penalty -- expected 43, received 68',
          'a template retro that already fails the AI judge stays failed -- expected 15, received 40',
        ],
        surviving_test_is_expected_control: true,
        surviving_test_reason: 'the zero-penalty case (genuine SD-specific content) has hasBoilerplate=false, so gating the penalty off cannot change its result -- it is the control, not an unguarded assertion',
        restored_cleanly: true,
        pre_mutation_git_blob: GUARDED_FILE_GIT_BLOB,
        post_restore_git_blob: GUARDED_FILE_GIT_BLOB,
        pre_mutation_sha256: GUARDED_FILE_SHA256,
        post_restore_sha256: GUARDED_FILE_SHA256,
      },
      mocking_audit: {
        module_under_test_mocked: false,
        stubs: [
          'vi.spyOn(AIQualityEvaluator.prototype, "evaluate") -- avoids an LLM/network call; restored in afterEach',
          'vi.mock("../../lib/supabase-client.js") -- avoids a DB call',
        ],
        conclusion: 'the real detectBoilerplate() and the real validateRetrospectiveQuality() blend both execute; the logic under test is not re-implemented in the test',
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
      branch: 'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-013',
      runner_artifact: { path: ARTIFACT_PATH, sha256: artifact.sha, success: artifact.success },
    },
    phase: 'PLAN_TO_EXEC',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director (TESTING)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_TO_EXEC' }
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
