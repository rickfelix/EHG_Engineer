#!/usr/bin/env node
/**
 * Persist TESTING evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-014's PLAN-TO-EXEC handoff.
 *
 * The verification itself was performed by the TESTING sub-agent (Task tool) in the worktree
 * .worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-014: a full read of the 3 new regression tests, a live
 * vitest run of the whole exec-to-plan executor test directory, three independently
 * applied-and-reverted mutations of the production lines the new tests claim to guard, a
 * consumer sweep for every other caller of createExecToPlanRetrospective(), and an independent
 * DB/git re-verification of the SD's own premise (that PAT-LES-2484eb3fe7bf is a stale re-mint
 * of an already-fixed Feb-2026 incident).
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the counts written to
 * metadata.test_execution are NOT hand-typed here. They are read at write time out of the
 * vitest-written JSON reports, and each file's sha256 is computed here and stored on the row,
 * so the verdict points at runner-produced artifacts rather than at a claim. Regenerate with:
 *
 *   npx vitest run tests/unit/handoff/executors/exec-to-plan/ \
 *     --reporter=json --outputFile=.artifacts/testing/pat-les-014-plan-to-exec.json
 *   npx vitest run tests/unit/handoff/executors/exec-to-plan/retrospective.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/pat-les-014-plan-to-exec-single.json
 *   npx vitest run tests/unit/retro-no-global-pattern-stamping.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/pat-les-014-neighbor-consumer.json
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-014';

// PRIMARY artifact: the whole exec-to-plan executor test directory (superset of the deliverable
// file). Its counts are what metadata.test_execution reports, so artifact_sha and the counters
// describe the same run.
const ARTIFACT_PATH = '.artifacts/testing/pat-les-014-plan-to-exec.json';
// Corroborating artifacts, hashed and recorded but not the counter source.
const ARTIFACT_SINGLE = '.artifacts/testing/pat-les-014-plan-to-exec-single.json';
const ARTIFACT_NEIGHBOR = '.artifacts/testing/pat-les-014-neighbor-consumer.json';

// Production file the 3 new tests guard; hashes recorded pre-mutation and post-restore.
const GUARDED_FILE = 'scripts/modules/handoff/executors/exec-to-plan/retrospective.js';
const GUARDED_FILE_SHA256 = 'a2dd8c3c6ed94167e2e0ead0332279d0c30eeffc3b9ff56a5961cc5498cce1b8';
const GUARDED_FILE_GIT_BLOB = 'd3e1c288c70174864f478563ef945374b4321026';

/** Read a vitest JSON report and derive both the counts and the artifact hash from it. */
function readRunnerArtifact(p) {
  const raw = readFileSync(p);
  const sha = createHash('sha256').update(raw).digest('hex');
  const report = JSON.parse(raw.toString('utf8'));
  return {
    path: p,
    sha,
    executed: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests ?? 0,
    files: report.testResults?.length ?? 0,
    success: report.success,
  };
}

function buildSummary(a, single, neighbor) {
  return 'PASS -- the SD\'s sole code deliverable (3 new regression tests appended to the ' +
    'EXISTING tests/unit/handoff/executors/exec-to-plan/retrospective.test.js) is genuine, ' +
    'non-vacuous and ready for EXEC. VERIFIED BY DIRECT EXECUTION AND MUTATION, not by reading ' +
    'claims. ' +
    '(1) GREEN RUN: the deliverable file passes ' + single.passed + '/' + single.executed + ' ' +
    '(5 pre-existing control-flow tests + the 3 new content-specificity guards), and the whole ' +
    'tests/unit/handoff/executors/exec-to-plan/ directory passes ' + a.passed + '/' + a.executed + ' ' +
    'across ' + a.files + ' files, 0 failed, 0 skipped. Counts on this row are read out of the ' +
    'vitest-written JSON reports; their sha256 values are recorded here. ' +
    '(2) NON-VACUITY PROVEN BY 3 MUTATIONS, each killed by exactly its intended test, each ' +
    'applied to the real production module and reverted: (a) verification default nulled at ' +
    'retrospective.js:342 -> killed by "every action_item carries a non-empty owner, deadline, ' +
    'and verification field" (7 pass / 1 fail); (b) SD-title achievement at :156 and the ' +
    '"Primary objective addressed" learning at :213 both genericized to gate-only prose (the ' +
    'exact origin complaint) -> killed by "references the actual SD title and description, not ' +
    'generic gate-only content" (7/1); (c) git-derived key_learning gate at :199 disabled with ' +
    'an `if (false && ...)` short-circuit -> killed by "git-derived key_learnings appear when ' +
    'git context IS available" (7/1). Each of the 3 new tests guards a distinct production line ' +
    'that the 5 pre-existing LEARN-153 tests do not cover. ' +
    '(3) CLEAN RESTORE VERIFIED BY HASH: after every mutation the file was reverted via ' +
    'git checkout; post-restore git blob (' + GUARDED_FILE_GIT_BLOB + ') and sha256 (' +
    GUARDED_FILE_SHA256 + ') match the pre-mutation values exactly, git diff on that path is ' +
    'empty, and git status --porcelain --untracked-files=no is empty. No mutation is left in ' +
    'the tree. A fourth mutation attempt initially targeted the wrong line number and was a ' +
    'no-op; it was detected via git diff (empty diff = mutant never applied) and re-run ' +
    'correctly rather than being misreported as a surviving mutant. ' +
    '(4) CONSUMER SWEEP (contradicts the handoff brief): a git grep for ' +
    'createExecToPlanRetrospective across all tracked files found a SECOND test file that ' +
    'depends on this function\'s output shape -- tests/unit/retro-no-global-pattern-stamping.test.js ' +
    '(not in the exec-to-plan directory, so the directory-scoped run above would have missed ' +
    'it). Run separately: ' + neighbor.passed + '/' + neighbor.executed + ' pass, no regression. ' +
    'Production callers: scripts/modules/handoff/executors/exec-to-plan/index.js:442 (and a ' +
    're-export at :649) -- unchanged by this SD. ' +
    '(5) PREMISE RE-VERIFIED INDEPENDENTLY, and it holds: issue_patterns.PAT-LES-2484eb3fe7bf ' +
    'was created 2026-09-12 with occurrence_count=1 and first_seen_sd_id === last_seen_sd_id === ' +
    'SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001, an SD created AND completed 2026-02-19 -- a ' +
    'single 7-month-old occurrence, not a live recurrence. The companion ' +
    'PAT-AUTO-2ffdd791 is status=resolved, last updated 2026-02-27. All three claimed fix ' +
    'commits exist and touch this exact file: 6448b82f (2026-02-19, "ensure action items always ' +
    'include verification field"), 12c19da2 and 31156113 (both 2026-02-20, enricher wiring). ' +
    '(6) BLAST RADIUS: the SD commit c821ab2906c touches 3 files -- the test file plus two ' +
    'scripts/one-off/ evidence scripts. Zero production modules changed, so EXEC carries no ' +
    'rollback risk.';
}

async function main() {
  const artifact = readRunnerArtifact(ARTIFACT_PATH);
  const single = readRunnerArtifact(ARTIFACT_SINGLE);
  const neighbor = readRunnerArtifact(ARTIFACT_NEIGHBOR);

  for (const a of [artifact, single, neighbor]) {
    if (!a.success || a.failed > 0 || a.executed <= 0) {
      console.error(
        `REFUSING to write PASS: runner artifact ${a.path} reports success=${a.success}, ` +
        `executed=${a.executed}, failed=${a.failed}.`
      );
      process.exit(1);
    }
  }

  const summary = buildSummary(artifact, single, neighbor);
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
        id: 'T1-deliverable-green',
        severity: 'INFO',
        summary: `tests/unit/handoff/executors/exec-to-plan/retrospective.test.js: ${single.passed}/${single.executed} pass (5 pre-existing LEARN-153 control-flow tests + 3 new content-specificity guards). Directory-wide run: ${artifact.passed}/${artifact.executed} across ${artifact.files} files, 0 failed, 0 skipped (artifact ${ARTIFACT_PATH}, sha256 ${artifact.sha}).`,
      },
      {
        id: 'T2-three-mutants-killed',
        severity: 'INFO',
        summary: 'Non-vacuity proven by 3 independent mutations of the real production module, each killed by exactly its intended new test (7 pass / 1 fail each): verification default nulled at :342; SD-title + "Primary objective addressed" genericized at :156/:213; git-derived key_learning gate disabled at :199. Each new test guards a distinct production line the 5 pre-existing tests never assert on.',
      },
      {
        id: 'T3-production-restored-byte-identical',
        severity: 'INFO',
        summary: `All mutations reverted via git checkout. Post-restore git blob ${GUARDED_FILE_GIT_BLOB} and sha256 ${GUARDED_FILE_SHA256} match pre-mutation exactly; git diff on ${GUARDED_FILE} empty; git status --porcelain --untracked-files=no empty. Post-restore re-run green.`,
      },
      {
        id: 'T4-second-consumer-found-outside-brief',
        severity: 'LOW',
        summary: `CONTRADICTS THE HANDOFF BRIEF (which implied the exec-to-plan directory was the only dependent surface): git grep found tests/unit/retro-no-global-pattern-stamping.test.js also imports createExecToPlanRetrospective and asserts on its output shape. It sits OUTSIDE tests/unit/handoff/executors/exec-to-plan/, so the directory-scoped run does not cover it. Run separately: ${neighbor.passed}/${neighbor.executed} pass (artifact ${ARTIFACT_NEIGHBOR}, sha256 ${neighbor.sha}). No regression -- but a future directory-scoped regression sweep on this module would have a blind spot.`,
      },
      {
        id: 'T5-premise-independently-confirmed',
        severity: 'INFO',
        summary: 'PAT-LES-2484eb3fe7bf: created_at 2026-09-12, occurrence_count=1, first_seen_sd_id === last_seen_sd_id === SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001 (created AND completed 2026-02-19). Companion PAT-AUTO-2ffdd791 is status=resolved (updated 2026-02-27). Fix commits 6448b82f/12c19da2/31156113 all exist, all dated 2026-02-19/20, all touch exec-to-plan/retrospective.js. The "stale re-mint of an already-fixed incident" premise holds under independent DB + git check.',
      },
      {
        id: 'T6-zero-production-blast-radius',
        severity: 'INFO',
        summary: 'Commit c821ab2906c touches 3 files: the test file plus scripts/one-off/add-mechanism-verifications-pat-les-014.mjs and scripts/one-off/les014-lead-to-plan-evidence.mjs. No production module changed -- EXEC needs no feature flag, no migration and no rollback plan.',
      },
    ],
    warnings: [
      'The 46/100 retrospective row the pattern text cites is no longer present in the retrospectives table for SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001 -- the 3 surviving rows there are all generated_by=MANUAL scoring 70/70/100. The pattern quoted score is therefore unverifiable from current DB state; it was corroborated instead via the git history of the fix commits.',
    ],
    recommendations: [
      'Proceed to EXEC. The deliverable is test-only (3 tests appended to an existing file, no production code changed), so EXEC carries no rollback risk.',
      'When regression-sweeping this module in future, do NOT scope to tests/unit/handoff/executors/exec-to-plan/ alone -- tests/unit/retro-no-global-pattern-stamping.test.js is a second consumer of createExecToPlanRetrospective living outside that directory.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'PLAN_TO_EXEC_TESTING',
      review_method:
        'full read of the 3 new tests and the guarded production module, a live vitest run of the deliverable file and of the whole exec-to-plan executor directory, 3 independently applied-and-reverted production mutations, a git-grep consumer sweep plus a separate run of the out-of-directory consumer suite, and an independent DB+git re-verification of the SD premise; counts read from the vitest-written JSON reports, not hand-entered',
      measured: true,
      test_execution: buildTestExecution({
        executed: artifact.executed,
        passed: artifact.passed,
        failed: artifact.failed,
        skipped: artifact.skipped,
        artifactSha: artifact.sha,
        runner: 'vitest (npx vitest run, JSON reporter)',
        artifactPath: ARTIFACT_PATH,
        source: 'fresh',
        mappedCandidates: 4,
        foundFiles: artifact.files,
      }),
      runner_artifacts: [
        { path: artifact.path, sha256: artifact.sha, scope: 'tests/unit/handoff/executors/exec-to-plan/ (PRIMARY -- counter source)', executed: artifact.executed, passed: artifact.passed, failed: artifact.failed },
        { path: single.path, sha256: single.sha, scope: 'the deliverable file alone', executed: single.executed, passed: single.passed, failed: single.failed },
        { path: neighbor.path, sha256: neighbor.sha, scope: 'tests/unit/retro-no-global-pattern-stamping.test.js (out-of-directory consumer)', executed: neighbor.executed, passed: neighbor.passed, failed: neighbor.failed },
      ],
      test_files_executed: [
        'tests/unit/handoff/executors/exec-to-plan/retrospective.test.js',
        'tests/unit/handoff/executors/exec-to-plan/atomic-transitions-provenance-stamp.test.js',
        'tests/unit/handoff/executors/exec-to-plan/state-transitions.test.js',
        'tests/unit/handoff/executors/exec-to-plan/ui-interactivity-check-repo-path.test.js',
        'tests/unit/retro-no-global-pattern-stamping.test.js',
      ],
      files_reviewed: [
        'tests/unit/handoff/executors/exec-to-plan/retrospective.test.js',
        GUARDED_FILE,
        'tests/unit/retro-no-global-pattern-stamping.test.js',
      ],
      per_file_results: {
        'tests/unit/handoff/executors/exec-to-plan/retrospective.test.js': `${single.passed}/${single.executed} pass (the SD deliverable: 5 pre-existing + 3 new)`,
        'tests/unit/handoff/executors/exec-to-plan/ (3 sibling files)': `${artifact.passed - single.passed}/${artifact.executed - single.executed} pass (pre-existing, no regression)`,
        'tests/unit/retro-no-global-pattern-stamping.test.js': `${neighbor.passed}/${neighbor.executed} pass (out-of-directory consumer of the same function, no regression)`,
      },
      mutation_test: {
        performed: true,
        target_file: GUARDED_FILE,
        mutants_applied: 3,
        mutants_killed: 3,
        mutants_survived: 0,
        mutations: [
          {
            line: 342,
            mutation: 'verification default expression replaced with `undefined`',
            killed_by: 'every action_item carries a non-empty owner, deadline, and verification field',
            run: '7 passed / 1 failed',
          },
          {
            line: '156 + 213',
            mutation: 'whatWentWell SD-title achievement genericized to "Gate quality score acceptable"; keyLearnings "Primary objective addressed: ..." genericized to "Quality metrics recorded" (reproduces the exact origin complaint: gate-only content)',
            killed_by: 'references the actual SD title and description, not generic gate-only content',
            run: '7 passed / 1 failed',
          },
          {
            line: 199,
            mutation: 'git-derived key_learning guard short-circuited with `if (false && ...)`',
            killed_by: 'git-derived key_learnings appear when git context IS available (happy-path complement to the error-path test above)',
            run: '7 passed / 1 failed',
          },
        ],
        no_op_attempt_disclosed: {
          note: 'A first attempt at mutation 3 used sed line 200 instead of 199 and therefore applied nothing. The empty git diff exposed it as a NO-OP (mutant never applied), NOT a surviving mutant; it was re-run against the correct line. Disclosed so the 3/3 kill rate is not read as a first-try result.',
        },
        restored_cleanly: true,
        pre_mutation_git_blob: GUARDED_FILE_GIT_BLOB,
        post_restore_git_blob: GUARDED_FILE_GIT_BLOB,
        pre_mutation_sha256: GUARDED_FILE_SHA256,
        post_restore_sha256: GUARDED_FILE_SHA256,
      },
      mocking_audit: {
        module_under_test_mocked: false,
        stubs: [
          'vi.mock of scripts/modules/handoff/lib/retro-clobber-guard.js -- so the mock Supabase client need not satisfy the guard own SELECT chain',
          'vi.mock of child_process -- execSync is the seam driving getGitContext; mocked so tests do not depend on real repo state and the error path is forceable',
          'vi.mock of scripts/modules/handoff/shared-git-context.js -- getMainRef stubbed to a fixed ref',
        ],
        conclusion: 'The real createExecToPlanRetrospective and the real buildSDSpecificKeyLearnings/buildSDSpecificActionItems enricher path both execute. The assertions read the payload actually handed to supabase.insert(), so they are not tautological -- confirmed by the 3 mutants.',
      },
      consumer_sweep: {
        method: 'git grep -n createExecToPlanRetrospective over all tracked .js/.mjs/.ts files',
        production_callers: [
          'scripts/modules/handoff/executors/exec-to-plan/index.js:442 (call site)',
          'scripts/modules/handoff/executors/exec-to-plan/index.js:649 (re-export)',
        ],
        test_consumers: [
          'tests/unit/handoff/executors/exec-to-plan/retrospective.test.js (the deliverable)',
          'tests/unit/retro-no-global-pattern-stamping.test.js (NOT covered by the directory-scoped run; executed separately, green)',
        ],
        shape_break_risk: 'none -- the 3 new tests are read-only assertions on the insert payload and change no production code, so no consumer contract can shift.',
      },
      premise_verification: {
        pattern_id: 'PAT-LES-2484eb3fe7bf',
        pattern_created_at: '2026-09-12T23:52:12.751698+00:00',
        pattern_occurrence_count: 1,
        pattern_status: 'assigned',
        pattern_source: 'retrospective',
        first_seen_sd_id: 'SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001',
        last_seen_sd_id: 'SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001',
        origin_sd_created_at: '2026-02-19T01:40:09.293+00:00',
        origin_sd_completion_date: '2026-02-19T03:01:54.673+00:00',
        companion_pattern: { pattern_id: 'PAT-AUTO-2ffdd791', status: 'resolved', occurrence_count: 7, updated_at: '2026-02-27T17:40:29.065033+00:00' },
        fix_commits_confirmed: [
          '6448b82f 2026-02-19 fix(retro): ensure action items always include verification field (PAT-AUTO-2ffdd791) -- touches exec-to-plan/retrospective.js',
          '12c19da2 2026-02-20 fix: wire enricher key_learnings and action_items into exec-to-plan retrospective',
          '31156113 2026-02-20 fix: wire all handoff retrospective modules to use enricher consistently',
        ],
        conclusion: 'Premise HOLDS: a single 7-month-old occurrence re-minted 2026-09-12, not a live recurrence. Test-only closure is the correct disposition.',
        caveat: 'The 46/100 score quoted in the pattern text could not be re-confirmed from the retrospectives table (3 surviving rows for that SD are MANUAL, scoring 70/70/100).',
      },
      e2e_applicable: false,
      e2e_exemption_reason:
        'Test-only deliverable guarding a Node-side handoff retrospective builder. No UI surface, no route and no user-facing journey exist for this change, so E2E is not applicable per the sd-classification rule for infrastructure/test-only SDs.',
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-014',
      branch: 'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-014',
      head_commit: 'c821ab2906cd6887a717e7a00ec463e1152c5f65',
      runner_artifacts: [
        { path: artifact.path, sha256: artifact.sha, success: artifact.success },
        { path: single.path, sha256: single.sha, success: single.success },
        { path: neighbor.path, sha256: neighbor.sha, success: neighbor.success },
      ],
    },
    phase: 'PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director (TESTING)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
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
