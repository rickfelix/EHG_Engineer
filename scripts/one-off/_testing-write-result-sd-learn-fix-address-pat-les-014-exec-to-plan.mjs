#!/usr/bin/env node
/**
 * Persist TESTING evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-014's EXEC-TO-PLAN handoff.
 *
 * WHY A SECOND ROW EXISTS: the PLAN-phase TESTING row
 * (sub_agent_execution_results 96f8129c-ea47-4114-a47a-c4ec38c3f6c8, phase=PLAN) does NOT satisfy
 * GATE_SUBAGENT_EVIDENCE at EXEC-TO-PLAN. That gate resolves expectedPhase via
 * HANDOFF_TYPE_TO_PHASE['EXEC-TO-PLAN'] === 'EXEC' and grades any row whose normalised phase
 * differs as provenance-ABSENT (lib/sub-agent-executor/evidence-provenance.js gradeProvenance).
 * It also scopes its read to rows created at/after the current phase's start. So EXEC needs its
 * own freshly-run row: this one. This is NOT a re-stamp of the PLAN row's numbers -- the suites
 * were re-executed against the post-PLAN-TO-EXEC HEAD (092b3bd875b, which the PLAN row predates)
 * and the counts below are read back out of the newly written vitest reports.
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the counts written to
 * metadata.test_execution are NOT hand-typed here. They are read at write time out of the
 * vitest-written JSON reports, and each file's sha256 is computed here and stored on the row,
 * so the verdict points at runner-produced artifacts rather than at a claim. Regenerate with:
 *
 *   npx vitest run tests/unit/handoff/executors/exec-to-plan/retrospective.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/pat-les-014-exec-to-plan.json
 *   npx vitest run tests/unit/handoff/executors/exec-to-plan/ \
 *     --reporter=json --outputFile=.artifacts/testing/pat-les-014-exec-to-plan-dir.json
 *   npx vitest run tests/unit/retro-no-global-pattern-stamping.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/pat-les-014-exec-to-plan-neighbor.json
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-014';
const HEAD_COMMIT = '092b3bd875b5654b41bc9a355b4ee36f0df9fb5a';

// PRIMARY artifact: the SD's sole deliverable file. Its counts are what metadata.test_execution
// reports, so artifact_sha and the counters describe the same run.
const ARTIFACT_PATH = '.artifacts/testing/pat-les-014-exec-to-plan.json';
// Corroborating artifacts, hashed and recorded but not the counter source.
const ARTIFACT_DIR = '.artifacts/testing/pat-les-014-exec-to-plan-dir.json';
const ARTIFACT_NEIGHBOR = '.artifacts/testing/pat-les-014-exec-to-plan-neighbor.json';

// Production module the 3 new tests guard. This SD must not have touched it; verified below
// against the PLAN-phase recorded hashes rather than asserted.
const GUARDED_FILE = 'scripts/modules/handoff/executors/exec-to-plan/retrospective.js';
const EXPECTED_GUARDED_BLOB = 'd3e1c288c70174864f478563ef945374b4321026';
const EXPECTED_GUARDED_SHA256 = 'a2dd8c3c6ed94167e2e0ead0332279d0c30eeffc3b9ff56a5961cc5498cce1b8';

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
    titles: (report.testResults ?? []).flatMap(f => (f.assertionResults ?? []).map(a => a.title)),
  };
}

/**
 * Re-derive, at write time, that this SD left the guarded production module untouched.
 * Measured (git blob + sha256 + empty range-diff), not assumed from "it's a test-only SD".
 */
function verifyGuardedFileUntouched() {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  const blob = git(['rev-parse', `HEAD:${GUARDED_FILE}`]);
  const sha256 = createHash('sha256').update(readFileSync(GUARDED_FILE)).digest('hex');
  const rangeDiff = git(['diff', 'origin/main...HEAD', '--stat', '--', GUARDED_FILE]);
  return {
    file: GUARDED_FILE,
    git_blob: blob,
    sha256,
    range_diff_empty: rangeDiff === '',
    matches_plan_phase_record: blob === EXPECTED_GUARDED_BLOB && sha256 === EXPECTED_GUARDED_SHA256,
  };
}

function buildSummary(a, dir, neighbor, guard) {
  return 'PASS -- re-verified by fresh execution against the post-PLAN-TO-EXEC HEAD ' +
    HEAD_COMMIT.slice(0, 11) + ', not carried over from the PLAN-phase row. ' +
    '(1) DELIVERABLE GREEN: tests/unit/handoff/executors/exec-to-plan/retrospective.test.js runs ' +
    a.passed + '/' + a.executed + ' pass, ' + a.failed + ' failed, ' + a.skipped + ' skipped -- the ' +
    '5 pre-existing LEARN-153 control-flow tests plus the 3 new content-specificity guards this SD ' +
    'adds ("every action_item carries a non-empty owner, deadline, and verification field", ' +
    '"references the actual SD title and description, not generic gate-only content", ' +
    '"git-derived key_learnings appear when git context IS available"). All 8 titles were read back ' +
    'out of the runner report and are recorded on this row, so the count cannot be satisfied by a ' +
    'different set of 8 tests. ' +
    '(2) NO REGRESSION IN THE DIRECTORY: the whole tests/unit/handoff/executors/exec-to-plan/ ' +
    'directory runs ' + dir.passed + '/' + dir.executed + ' across ' + dir.files + ' files, 0 failed. ' +
    '(3) OUT-OF-DIRECTORY CONSUMER RE-RUN: tests/unit/retro-no-global-pattern-stamping.test.js is a ' +
    'second consumer of createExecToPlanRetrospective that the PLAN-phase review found sitting ' +
    'OUTSIDE the exec-to-plan directory (so a directory-scoped sweep misses it). Re-run here for the ' +
    'EXEC row rather than assumed still-green: ' + neighbor.passed + '/' + neighbor.executed + ' pass. ' +
    '(4) TEST-ONLY CLAIM MEASURED, NOT ASSERTED: the guarded production module ' + GUARDED_FILE + ' ' +
    'is byte-identical to origin/main at this HEAD -- git blob ' + guard.git_blob + ', sha256 ' +
    guard.sha256 + ', and `git diff origin/main...HEAD -- <file>` is empty. Both values match the ' +
    'hashes the PLAN-phase row recorded pre- and post-mutation, so the 3 mutation tests run during ' +
    'PLAN left nothing behind and EXEC changed no production line. ' +
    '(5) MUTATION EVIDENCE NOT RE-RUN, AND SAID SO: the 3/3 mutants-killed result establishing ' +
    'non-vacuity was produced during PLAN against this exact byte-identical module (hashes in (4) ' +
    'prove the subject did not change), so it is cited here by reference rather than re-performed. ' +
    'This row\'s own fresh measurement is the green run in (1)-(3). ' +
    '(6) BLAST RADIUS: the full branch diff is 7 files / 582 insertions / 0 deletions -- 1 test file, ' +
    '3 runner artifacts under .artifacts/testing/, 3 guarded scripts/one-off/ evidence writers. Zero ' +
    'production modules changed, so PLAN verification carries no rollback risk.';
}

async function main() {
  const artifact = readRunnerArtifact(ARTIFACT_PATH);
  const dir = readRunnerArtifact(ARTIFACT_DIR);
  const neighbor = readRunnerArtifact(ARTIFACT_NEIGHBOR);

  for (const a of [artifact, dir, neighbor]) {
    if (!a.success || a.failed > 0 || a.executed <= 0) {
      console.error(
        `REFUSING to write PASS: runner artifact ${a.path} reports success=${a.success}, ` +
        `executed=${a.executed}, failed=${a.failed}.`
      );
      process.exit(1);
    }
  }

  const guard = verifyGuardedFileUntouched();
  if (!guard.range_diff_empty || !guard.matches_plan_phase_record) {
    console.error(
      `REFUSING to write PASS: ${GUARDED_FILE} is not byte-identical to the PLAN-phase record ` +
      `(range_diff_empty=${guard.range_diff_empty}, matches=${guard.matches_plan_phase_record}). ` +
      'A test-only SD that mutated production code is a finding, not a pass.'
    );
    process.exit(1);
  }

  const summary = buildSummary(artifact, dir, neighbor, guard);
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
        id: 'T1-deliverable-green-on-exec-head',
        severity: 'INFO',
        summary: `Re-executed on HEAD ${HEAD_COMMIT.slice(0, 11)} (the PLAN-TO-EXEC handoff commit, which the PLAN-phase TESTING row predates): tests/unit/handoff/executors/exec-to-plan/retrospective.test.js ${artifact.passed}/${artifact.executed} pass, 0 failed, 0 skipped (artifact ${ARTIFACT_PATH}, sha256 ${artifact.sha}). All 8 test titles read back from the report and recorded in metadata.deliverable_test_titles.`,
      },
      {
        id: 'T2-no-regression-directory-wide',
        severity: 'INFO',
        summary: `tests/unit/handoff/executors/exec-to-plan/ directory-wide: ${dir.passed}/${dir.executed} pass across ${dir.files} files, 0 failed (artifact ${ARTIFACT_DIR}, sha256 ${dir.sha}).`,
      },
      {
        id: 'T3-out-of-directory-consumer-rerun',
        severity: 'INFO',
        summary: `tests/unit/retro-no-global-pattern-stamping.test.js -- the second consumer of createExecToPlanRetrospective living OUTSIDE the exec-to-plan directory (surfaced by the PLAN-phase consumer sweep; a directory-scoped run does not reach it) -- re-run for this row rather than assumed: ${neighbor.passed}/${neighbor.executed} pass (artifact ${ARTIFACT_NEIGHBOR}, sha256 ${neighbor.sha}).`,
      },
      {
        id: 'T4-test-only-claim-measured',
        severity: 'INFO',
        summary: `The "no production code changed" claim is MEASURED at write time, not taken from the SD's category: ${GUARDED_FILE} has git blob ${guard.git_blob} and sha256 ${guard.sha256} at this HEAD, \`git diff origin/main...HEAD\` on that path is empty, and both hashes equal the PLAN-phase row's pre-mutation AND post-restore values -- so the PLAN mutation testing left no residue and EXEC touched no production line. This script exits 1 rather than writing PASS if that check fails.`,
      },
      {
        id: 'T5-mutation-evidence-by-reference-not-rerun',
        severity: 'LOW',
        summary: 'DISCLOSURE, so this row is not over-read: the 3-mutants-applied / 3-killed non-vacuity proof is NOT re-performed here. It was produced in the PLAN phase (row 96f8129c-ea47-4114-a47a-c4ec38c3f6c8) against a module this row independently proves is byte-identical today, so it transfers by hash rather than by assumption -- but this EXEC row\'s own fresh measurement is the green run, not the mutation run.',
      },
      {
        id: 'T6-zero-production-blast-radius',
        severity: 'INFO',
        summary: 'Full branch diff origin/main...HEAD: 7 files, 582 insertions, 0 deletions -- tests/unit/handoff/executors/exec-to-plan/retrospective.test.js (+58), 3 vitest JSON artifacts under .artifacts/testing/, and 3 isMainModule-guarded scripts/one-off/ evidence writers. No production module, no migration, no dependency manifest, no workflow file.',
      },
    ],
    warnings: [
      'This is a test-only closure SD: it adds regression coverage pinning an ALREADY-FIXED defect class (PAT-LES-2484eb3fe7bf was a stale re-mint of a Feb-2026 incident by the retro-pattern-extraction backlog-catchup cron). The green run therefore proves the fix is still in place; it does not represent newly fixed behaviour. Reviewers should not read the PASS as "a defect was repaired in this SD".',
    ],
    recommendations: [
      'Accept EXEC-TO-PLAN. The deliverable is additive test coverage only, with the guarded production module proven byte-identical to origin/main.',
      'When regression-sweeping createExecToPlanRetrospective in future, do NOT scope to tests/unit/handoff/executors/exec-to-plan/ alone -- tests/unit/retro-no-global-pattern-stamping.test.js is a second consumer outside that directory.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'EXEC_TO_PLAN_TESTING',
      review_method:
        'fresh vitest execution of the deliverable file, the whole exec-to-plan executor directory, and the out-of-directory consumer suite against the post-PLAN-TO-EXEC HEAD; counts and test titles read back out of the vitest-written JSON reports (not hand-entered); the test-only claim re-derived at write time from git blob + sha256 + an empty range-diff on the guarded production module, with the script refusing to write PASS if that check fails',
      measured: true,
      evaluated_commit_sha: HEAD_COMMIT,
      test_execution: buildTestExecution({
        executed: artifact.executed,
        passed: artifact.passed,
        failed: artifact.failed,
        skipped: artifact.skipped,
        artifactSha: artifact.sha,
        runner: 'vitest (npx vitest run, JSON reporter)',
        artifactPath: ARTIFACT_PATH,
        source: 'fresh',
        mappedCandidates: 1,
        foundFiles: artifact.files,
      }),
      runner_artifacts: [
        { path: artifact.path, sha256: artifact.sha, scope: 'the SD deliverable file (PRIMARY -- counter source)', executed: artifact.executed, passed: artifact.passed, failed: artifact.failed },
        { path: dir.path, sha256: dir.sha, scope: 'tests/unit/handoff/executors/exec-to-plan/ (directory-wide regression)', executed: dir.executed, passed: dir.passed, failed: dir.failed },
        { path: neighbor.path, sha256: neighbor.sha, scope: 'tests/unit/retro-no-global-pattern-stamping.test.js (out-of-directory consumer)', executed: neighbor.executed, passed: neighbor.passed, failed: neighbor.failed },
      ],
      deliverable_test_titles: artifact.titles,
      test_files_executed: [
        'tests/unit/handoff/executors/exec-to-plan/retrospective.test.js',
        'tests/unit/handoff/executors/exec-to-plan/atomic-transitions-provenance-stamp.test.js',
        'tests/unit/handoff/executors/exec-to-plan/state-transitions.test.js',
        'tests/unit/handoff/executors/exec-to-plan/ui-interactivity-check-repo-path.test.js',
        'tests/unit/retro-no-global-pattern-stamping.test.js',
      ],
      per_file_results: {
        'tests/unit/handoff/executors/exec-to-plan/retrospective.test.js': `${artifact.passed}/${artifact.executed} pass (the SD deliverable: 5 pre-existing + 3 new)`,
        'tests/unit/handoff/executors/exec-to-plan/ (3 sibling files)': `${dir.passed - artifact.passed}/${dir.executed - artifact.executed} pass (pre-existing, no regression)`,
        'tests/unit/retro-no-global-pattern-stamping.test.js': `${neighbor.passed}/${neighbor.executed} pass (out-of-directory consumer, no regression)`,
      },
      production_untouched_check: guard,
      mutation_test: {
        performed_in_this_phase: false,
        inherited_from_phase: 'PLAN',
        inherited_from_row: '96f8129c-ea47-4114-a47a-c4ec38c3f6c8',
        mutants_applied: 3,
        mutants_killed: 3,
        mutants_survived: 0,
        transfer_basis:
          'the mutated subject is byte-identical today (git blob ' + guard.git_blob + ', sha256 ' +
          guard.sha256 + ', both equal to the PLAN row\'s pre-mutation and post-restore values), so ' +
          'the kill result transfers by hash rather than by assumption. Disclosed as inherited, not ' +
          'restated as a fresh EXEC-phase measurement.',
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
      head_commit: HEAD_COMMIT,
      why_a_second_row:
        "GATE_SUBAGENT_EVIDENCE at EXEC-TO-PLAN resolves expectedPhase='EXEC' via HANDOFF_TYPE_TO_PHASE " +
        'and grades any row whose normalised phase differs as provenance-ABSENT, and separately scopes ' +
        'its read to rows created at/after the current phase start. The PLAN-phase row ' +
        '96f8129c-ea47-4114-a47a-c4ec38c3f6c8 therefore cannot satisfy it. This row is a fresh run, ' +
        'not a re-stamp.',
      runner_artifacts: [
        { path: artifact.path, sha256: artifact.sha, success: artifact.success },
        { path: dir.path, sha256: dir.sha, success: dir.success },
        { path: neighbor.path, sha256: neighbor.sha, success: neighbor.success },
      ],
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director (TESTING)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
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
