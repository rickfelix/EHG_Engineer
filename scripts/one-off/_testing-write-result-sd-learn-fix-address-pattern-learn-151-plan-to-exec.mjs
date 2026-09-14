#!/usr/bin/env node
/**
 * Persist TESTING evidence for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151's PLAN-TO-EXEC handoff.
 *
 * The verification itself was performed by the TESTING sub-agent (Task tool) in the worktree
 * .worktrees/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151: full read of the new regression test, a
 * trace of the registrant into the live validator registry, a live vitest run, an independent
 * mutation test of the guarded production line, and a no-regression run with the sibling suite.
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the counts written to
 * metadata.test_execution are NOT hand-typed here. They are read at write time out of the
 * vitest-written JSON report, and that file's sha256 is computed here and stored on the row,
 * so the verdict points at a runner-produced artifact rather than at a claim. Regenerate with:
 *
 *   npx vitest run \
 *     tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js \
 *     tests/unit/handoff/validators/sd-objectives-validator.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/pattern-learn-151-plan-to-exec.json
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';
const ARTIFACT_PATH = '.artifacts/testing/pattern-learn-151-plan-to-exec.json';

const DELIVERABLE = 'tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js';
const SIBLING = 'tests/unit/handoff/validators/sd-objectives-validator.test.js';

// Production file the new test guards; hashes recorded pre-mutation and post-restore.
const GUARDED_FILE = 'scripts/modules/handoff/validation/validator-registry/gates/gate-l-sd-creation.js';
const GUARDED_FILE_SHA256 = '21e43166564e13ee5aaeaeba23426fb74290eaab1f35258f474e2c52d9185b66';
const GUARDED_FILE_GIT_BLOB = '9c6e901a020d68c5c0364d9057e1e29052043f7c';

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

const summary = 'PASS -- the SD\'s sole code deliverable (' + DELIVERABLE + ') is a genuine, ' +
  'non-vacuous regression guard on the LIVE Gate L validator and is ready for EXEC. VERIFIED BY ' +
  'DIRECT EXECUTION, not by reading claims. ' +
  '(1) STRUCTURE: read the file in full (98 lines, 7 tests). It imports the REAL ValidatorRegistry ' +
  'from validator-registry/core.js and the REAL registerGateLValidators from ' +
  GUARDED_FILE + ', registers them into a real registry instance, and pulls the validator back ' +
  'out via registry.get(\'sdObjectivesDefined\') -- the same lookup path the production code uses. ' +
  'There is NO vi.mock anywhere in the file and NO reimplementation of the scoring logic: every ' +
  'expected score (0, 30, 35, 65, 70, 100) is the arithmetic of the real registrant\'s own ' +
  'branches, asserted against its actual return value. The helper throws if the validator is not ' +
  'registered, so a silent de-registration also fails rather than vacuously passing. ' +
  '(2) LIVE-WIRING TRACED: confirmed registerGateLValidators(registry) is called at ' +
  'validator-registry/index.js:38 inside createValidatorRegistry(), so the guarded registrant is ' +
  'the one the real handoff pipeline consumes -- not a dead copy. Also confirmed the SD\'s premise: ' +
  SIBLING + ' imports validateSDObjectives from scripts/modules/handoff/validators/' +
  'sd-objectives-validator.js, a genuinely DIFFERENT file that duplicates the same threshold by ' +
  'convention. Nothing previously exercised gate-l-sd-creation.js\'s own registrant, so the gap ' +
  'the SD closed was real. ' +
  '(3) GREEN RUN: 7/7 tests pass (vitest 4.1.4, ~309ms). ' +
  '(4) MUTATION TEST -- independent proof of non-vacuity: mutated the return at ' +
  GUARDED_FILE + ':47 from `passed: score >= 30` to `passed: issues.length === 0` (the exact ' +
  'pre-PAT-AUTO-b6e88bcc behaviour the guard exists to prevent reverting to). Re-ran the file -> ' +
  'the mutant was KILLED: EXACTLY 1 of 7 tests FAILED, and it was the boundary case ' +
  '("0 objectives + success_metrics present, score exactly 30") -- AssertionError: expected false ' +
  'to be true at line 96. The other 6 correctly stayed green: by inspection they are inputs where ' +
  'the two formulas AGREE (scores 35/65/70/100 all have an empty issues array; the two score-0 ' +
  'cases fail under both), so the boundary test is the only possible discriminator and the file ' +
  'contains it. This is the strongest available evidence that the guard detects the specific ' +
  'regression it claims to protect against. ' +
  '(5) CLEAN RESTORE VERIFIED BY HASH: reverted via `git checkout -- <file>`. Post-restore ' +
  '`git diff` on that path is empty, `git status --porcelain` on that path is empty, and the ' +
  'pre-mutation and post-restore hashes match exactly (git blob ' + GUARDED_FILE_GIT_BLOB + '; ' +
  'sha256 ' + GUARDED_FILE_SHA256 + '). Production code is byte-identical to its pre-test state; ' +
  'no mutation is left in the tree. ' +
  '(6) NO REGRESSION: a single combined runner pass over the deliverable and the sibling suite ' +
  'wrote ' + ARTIFACT_PATH + ' (numTotalTests=17, numPassedTests=17, numFailedTests=0, ' +
  'numPendingTests=0, success=true; 7 from the new file + 10 from the sibling); the counts on this ' +
  'row are read out of that file and its sha256 is recorded in metadata.test_execution.artifact_sha. ' +
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
        id: 'T1-guard-targets-real-production-code',
        severity: 'INFO',
        summary: `${DELIVERABLE}: 7/7 pass under vitest 4.1.4. It constructs the REAL ValidatorRegistry (core.js) and calls the REAL registerGateLValidators from ${GUARDED_FILE}, then retrieves the validator via registry.get('sdObjectivesDefined'). No vi.mock anywhere; no reimplementation of the scoring branches. Expected scores are the real registrant's own arithmetic, so assertions are non-tautological.`,
      },
      {
        id: 'T2-registrant-is-live-wired',
        severity: 'INFO',
        summary: 'Traced the guarded registrant into production: registerGateLValidators(registry) is invoked at scripts/modules/handoff/validation/validator-registry/index.js:38 inside createValidatorRegistry(). The test therefore guards the code path the live handoff pipeline actually executes, not a dead or shadow copy.',
      },
      {
        id: 'T3-sd-premise-confirmed-sibling-covers-a-different-file',
        severity: 'INFO',
        summary: `${SIBLING} imports validateSDObjectives from scripts/modules/handoff/validators/sd-objectives-validator.js -- a different production file that duplicates the score>=30 threshold by convention rather than by shared code. Confirms the SD's stated gap was genuine: nothing exercised gate-l-sd-creation.js's own registrant before this test.`,
      },
      {
        id: 'T4-mutation-test-kills-mutant-exactly-at-the-boundary',
        severity: 'INFO',
        summary: `Non-vacuity proven by mutation: reverted ${GUARDED_FILE}:47 from 'passed: score >= 30' to 'passed: issues.length === 0' (the exact pre-PAT-AUTO-b6e88bcc behaviour). EXACTLY 1 of 7 tests failed -- the boundary case '0 objectives + success_metrics present (score exactly 30)', AssertionError expected false to be true at line 96. The other 6 are inputs where both formulas agree by construction (empty issues at scores 35/65/70/100; both fail at score 0), so the boundary case is the only possible discriminator and the file contains it.`,
      },
      {
        id: 'T5-production-code-restored-byte-identical',
        severity: 'INFO',
        summary: `Mutation reverted via 'git checkout --'. git diff on that path is empty, git status --porcelain on that path is empty, and the pre-mutation and post-restore hashes match exactly (git blob ${GUARDED_FILE_GIT_BLOB}, sha256 ${GUARDED_FILE_SHA256}). No mutation left in the tree.`,
      },
      {
        id: 'T6-no-regression-with-sibling-suite',
        severity: 'INFO',
        summary: `Combined runner pass over the deliverable and the sibling suite: ${artifact.passed}/${artifact.executed} pass, 0 failed, 0 skipped (7 from the new file + 10 from the sibling). Artifact ${ARTIFACT_PATH}, sha256 ${artifact.sha}.`,
      },
      {
        id: 'T7-zero-production-blast-radius',
        severity: 'INFO',
        summary: 'The SD changes no production code. Its only deliverable is one new test file, so EXEC needs no feature flag, no migration and no rollback plan, and cannot regress runtime behaviour.',
      },
    ],
    warnings: [
      'Residual (pre-existing, out of scope for this SD): the score>=30 threshold still lives in TWO unconnected files -- gate-l-sd-creation.js and validators/sd-objectives-validator.js -- "kept in sync" by comment convention only. Both are now individually guarded, so a divergence would be caught, but the duplication itself remains as latent drift risk.',
    ],
    recommendations: [
      'Proceed to EXEC. The deliverable is test-only (one new file, no production code changed), so EXEC carries no rollback risk.',
      'Consider a follow-up to collapse the duplicated score>=30 threshold into one shared helper consumed by both gate-l-sd-creation.js and validators/sd-objectives-validator.js, replacing the "kept in sync by convention" comment with shared code. Out of scope here; both sites now have regression guards.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'PLAN_TO_EXEC_TESTING',
      review_method:
        'full read of the new test file, a trace of the registrant into the live validator registry (index.js:38), a live vitest run, an independently applied-and-reverted mutation of the guarded production line, and a no-regression run with the sibling suite; counts read from the vitest-written JSON report, not hand-entered',
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
        mappedCandidates: 2,
        foundFiles: 2,
      }),
      test_files_executed: [DELIVERABLE, SIBLING],
      files_reviewed: [
        DELIVERABLE,
        GUARDED_FILE,
        'scripts/modules/handoff/validation/validator-registry/index.js',
        'scripts/modules/handoff/validation/validator-registry/core.js',
        SIBLING,
      ],
      per_file_results: {
        [DELIVERABLE]: '7/7 pass (the SD deliverable)',
        [SIBLING]: '10/10 pass (pre-existing, no regression)',
      },
      live_wiring_trace: {
        registrant: 'registerGateLValidators',
        registrant_file: GUARDED_FILE,
        call_site: 'scripts/modules/handoff/validation/validator-registry/index.js:38',
        enclosing_function: 'createValidatorRegistry()',
        conclusion: 'the guarded validator is the one the real handoff pipeline consumes, not a dead copy',
      },
      mutation_test: {
        performed: true,
        target_file: GUARDED_FILE,
        target_line: 47,
        mutation: 'passed: score >= 30  ->  passed: issues.length === 0',
        mutation_rationale: 'restores the exact pre-PAT-AUTO-b6e88bcc zero-issues check the guard exists to prevent reverting to',
        mutant_killed: true,
        tests_failed_under_mutation: 1,
        tests_passed_under_mutation: 6,
        killers: [
          'PAT-AUTO-b6e88bcc boundary: 0 objectives + success_metrics present (score exactly 30) PASSES despite a non-empty issues array -- AssertionError: expected false to be true (gate-l-sd-creation.test.js:96)',
        ],
        surviving_tests_are_expected_controls: true,
        surviving_tests_reason: 'the other 6 cases are inputs where score>=30 and issues.length===0 agree by construction: scores 35/65/70/100 all leave issues empty (both formulas pass), and the two score-0 cases have non-empty issues (both formulas fail). The score-exactly-30-with-non-empty-issues boundary is the ONLY input shape that distinguishes the two formulas, and the test file contains it.',
        discriminating_test_present: true,
        restored_cleanly: true,
        pre_mutation_git_blob: GUARDED_FILE_GIT_BLOB,
        post_restore_git_blob: GUARDED_FILE_GIT_BLOB,
        pre_mutation_sha256: GUARDED_FILE_SHA256,
        post_restore_sha256: GUARDED_FILE_SHA256,
      },
      mocking_audit: {
        module_under_test_mocked: false,
        stubs: [],
        conclusion: 'zero vi.mock / vi.spyOn calls in the deliverable. The real ValidatorRegistry and the real registerGateLValidators both execute; the scoring logic under test is not re-implemented in the test. The getValidator() helper throws if sdObjectivesDefined is not registered, so a silent de-registration fails rather than vacuously passing.',
      },
      e2e_applicable: false,
      e2e_exemption_reason:
        'Test-only deliverable guarding a pure scoring function in a Node-side handoff validator registry. No UI surface, no route and no user-facing journey exist for this change, so E2E is not applicable per the sd-classification rule for infrastructure/test-only SDs.',
      model: 'Opus 5 (1M context)',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
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
