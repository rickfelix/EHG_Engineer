#!/usr/bin/env node
/**
 * TESTING (QA Engineering Director) EXEC-TO-PLAN RE-VERIFICATION verdict for
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F, after fix commit 12e6457dc81.
 *
 * Supersedes (does not replace) evidence row a15d0f5d-f190-4679-b17e-ee3f35ee9d0b,
 * which stands as the historical record of the original CRITICAL stdout/stderr finding.
 *
 * Canonical repo-evidence + storage pattern per CLAUDE.md prologue rule 11.
 * Gate-evidence provenance: the pass/fail counts below are read from a RUNNER-WRITTEN
 * results file (.artifacts/test-001f-reverify-results.json, vitest --reporter=json),
 * whose sha256 is recorded in metadata.results_file_sha256.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD_ID = 'e59034d1-0e8c-4bb8-8846-5de21c47abbf';
const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F';
const RESULTS_FILE = '.artifacts/test-001f-reverify-results.json';

const raw = fs.readFileSync(RESULTS_FILE);
const runner = JSON.parse(raw);
const resultsSha = crypto.createHash('sha256').update(raw).digest('hex');

const findings = [
  {
    id: 'T1-CLOSED-stderr-fix-independently-reproduced',
    severity: 'INFO',
    summary: 'T1 (the original CRITICAL, evidence a15d0f5d) is CLOSED, verified by my OWN reproduction against the SHIPPED code -- not by re-running the author\'s test. Built an independent throwaway repo (git init + git worktree add + rm the worktree .git link) and measured the streams SEPARATELY with spawnSync (no redirect, nothing assumed): stdout="" and stderr="Removing worktrees/broken-wt: gitdir file points to non-existent location\\n", exit 0 -- confirming the original finding was real and that git puts the finding on stderr ONLY. On that same fixture I then ran BOTH implementations: the PRE-FIX logic (execSync without 2>&1, stdout-only) returned [] and the SHIPPED detectPruneCandidates({repoRoot}) returned [{name:"broken-wt", reason:"gitdir file points to non-existent location"}]. The differential is the proof the fix is load-bearing, not cosmetic. Negative control (healthy repo) returned [], and the no-repoRoot guard returned [] without shelling out.',
  },
  {
    id: 'T1b-FR0-to-FR1-chain-live-end-to-end',
    severity: 'INFO',
    summary: 'Went one level ABOVE the leaf function, since a working detectPruneCandidates is not the same as a working feature. Called runOrphanSweep({repoRoot, worktreesDir, execute:false}) -- the exact entry point scripts/worktree-reaper.mjs:1275 calls -- against a real temp repo holding a real broken worktree registration at .worktrees/SD-BROKEN-E2E, with NO injected gitRunner. Result: sweep.ok=true, pruneCandidates=[{name:"SD-BROKEN-E2E",reason:"gitdir file points to non-existent location"}], and piping that through buildPruneCandidateRows produced exactly one row {event_type:"worktree_prune_candidate", entity_id:"SD-BROKEN-E2E", severity:"warning"}. The FR-0 -> FR-1 chain is live end-to-end against real git, which is what the original finding said was dead by construction.',
  },
  {
    id: 'T1c-production-caller-passes-a-real-repoRoot',
    severity: 'INFO',
    summary: 'Checked the OTHER way this feature could still be dead: the `if (!repoRoot) return []` guard. Traced the production path -- scripts/worktree-reaper.mjs:1442 sets repoRoot = assertCwdIsMainRepoRoot() (which throws rather than returning empty) and passes it to runOrphanSweep at line 1276, which forwards {repoRoot, gitRunner:undefined} to detectPruneCandidates at line 393. gitRunner is undefined in production, so production runs the execSync branch -- the branch that had ZERO coverage before this fix and is exactly the branch the new end-to-end test now exercises. Consumer side is wired too: worktree-reaper.mjs:1333-1337 gates on sweep.pruneCandidates?.length and writes the rows via writeRows. No dead link in the chain.',
  },
  {
    id: 'T2-CLOSED-both-vacuous-assertions-killed-by-mutation',
    severity: 'INFO',
    summary: 'T2 (the two vacuous assertions) is CLOSED, verified by MUTATION TESTING rather than by reading the new assertions -- a test that looks stronger is not a test that fails. Applied five mutations to the shipped source, ran the suite against each, restored, and confirmed a clean `git diff` afterward. (M1) reverting the cwd guard to `if (!repoRoot) repoRoot = process.cwd()` now FAILS with "expected vi.fn() to not be called at all, but actually been called 1 times" -- the old throw-then-catch spy would have passed this, so the recording-spy rewrite genuinely closes the gap. (M2) reverting the gitRunner branch to parsePruneCandidates(res.stdout) FAILS the new stderr fixture. (M3) removing the `2>&1` redirect FAILS the new real-subprocess end-to-end test. (M4) aliasing EVENT_TYPE_HUSK_SHIP_PATH to EVENT_TYPE\'s value FAILS with "expected \'worktree_reaper_classification\' not to be \'worktree_reaper_classification\'" -- this is the constant-collision bug that the newly added .not.toBe(EVENT_TYPE) uniquely catches, since the sibling toBe(EVENT_TYPE_HUSK_SHIP_PATH) assertion is tautological under that mutation. (M5) writing EVENT_TYPE at the husk write site also FAILS. Five mutations, five kills, zero survivors.',
  },
  {
    id: 'T3-no-regressions-and-no-new-vacuous-tests',
    severity: 'INFO',
    summary: 'No regressions and no newly introduced vacuous tests. Full suite: 420/420 passing across 32 files / 151 suites (up from 417, matching the +3 the fix commit claims), read from the runner-written JSON results file whose sha256 is in metadata. Ran the suite twice -- once before mutation testing and once after all restores -- with identical results, and confirmed `git status --short lib/ tests/ scripts/` is empty so nothing was left mutated. Blast radius is contained: grep shows NO test file outside tests/unit/worktree-reaper/ imports orphan-sweep or audit-sink. Reviewed the three new tests for vacuity: all three are mutation-killed above, so none is decorative. Noted but benign: the stderr fixture asserts on `args` INSIDE the gitRunner callback, where a throw would be swallowed by detectPruneCandidates\' own catch{} -- but the outer toEqual then fails on the [] result, so the test still fails correctly. Indirect, not vacuous.',
  },
  {
    id: 'T4-execSync-shell-redirect-is-cross-platform-safe',
    severity: 'INFO',
    summary: 'Checked the one new portability risk the fix introduces: `2>&1` requires a shell, and execSync uses cmd.exe on win32 and /bin/sh on POSIX. Both support `2>&1`, and I measured the win32 path working (this entire re-verification ran on Windows 11 and the shipped execSync branch correctly returned the candidate). The merge is also safe for parsing: parsePruneCandidates only matches /^Removing worktrees\\/(.+?):\\s*(.+)$/, so unrelated git stderr noise folded in by the redirect is ignored rather than mis-parsed. Reading both streams in the gitRunner branch (`${res.stdout||\'\'}\\n${res.stderr||\'\'}`) also keeps every existing stdout-mocking fixture green, so the fix is additive rather than a stream swap.',
  },
];

const warnings = [
  'The end-to-end test shells out to real git (git init + git worktree add) and took ~850ms locally. It is correctly isolated to an os.tmpdir() mkdtemp and cleaned up in afterEach, so it cannot touch the real repo, but it does add a hard dependency on git being on PATH in CI. Acceptable -- and it is the only test in the suite that covers the production code path -- but worth knowing if a container image ever ships without git.',
];

const recommendations = [
  'PASS -- the CRITICAL is genuinely closed and I confirmed it against the shipped code with my own fixture, not by trusting the author\'s test or the commit message. Both T2 vacuity gaps are closed and proven closed by mutation. No remaining blocking gap; clear to hand off to PLAN.',
  'No further test work requested. If PLAN wants one more assurance for the activation-invariant class, the FR-0->FR-1 chain check described in T1b is the test to promote, since it is the one that exercises schema-adjacent write path + real subprocess together.',
];

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    fallback: 'EHG_Engineer',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 96,
    findings,
    warnings,
    recommendations,
    summary: `PASS (re-verification after fix commit 12e6457dc81; supersedes but does not replace the original CRITICAL finding in row a15d0f5d). ${runner.numPassedTests}/${runner.numTotalTests} tests pass across 32 files, up from 417 -- the +3 the fix claims. T1 CLOSED and independently reproduced: on my own throwaway repo with a real broken worktree registration, spawnSync measured stdout="" / stderr="Removing worktrees/broken-wt: ..." (confirming the original finding), the PRE-FIX stdout-only logic returned [] and the SHIPPED code returned the candidate -- a differential that proves the fix is load-bearing. Went above the leaf function too: runOrphanSweep (the real production entry point, no injected gitRunner) detected a real broken registration and buildPruneCandidateRows turned it into one worktree_prune_candidate audit row, so the FR-0->FR-1 chain is live end-to-end. Also confirmed production passes a real repoRoot (assertCwdIsMainRepoRoot), closing the other way the guard could have kept the feature dead. T2 CLOSED by MUTATION TESTING rather than by reading the assertions: five mutations (cwd-guard revert, both stderr-fix reverts, husk constant collision, husk write-site swap) all FAIL the suite, five kills / zero survivors -- notably the constant-collision mutation is caught only by the newly added .not.toBe(EVENT_TYPE), proving that assertion is load-bearing and not redundant. No regressions, no new vacuous tests, no test file outside tests/unit/worktree-reaper/ touches these modules, and the working tree was verified clean after all mutations were restored. One non-blocking note: the new end-to-end test adds a hard dependency on git being on PATH in CI.`,
    metadata: {
      gate: 'EXEC-TO-PLAN — TESTING re-verification after CRITICAL fix',
      measured: true,
      test_execution: buildTestExecution({
        executed: runner.numTotalTests,
        passed: runner.numPassedTests,
        failed: runner.numFailedTests,
        skipped: (runner.numPendingTests || 0) + (runner.numTodoTests || 0),
        artifactSha: resultsSha,
        runner: 'vitest',
        artifactPath: RESULTS_FILE,
        source: 'fresh',
      }),
      supersedes_evidence_row: 'a15d0f5d-f190-4679-b17e-ee3f35ee9d0b',
      supersedes_note: 'Prior row stands as the historical record of the original stdout/stderr CRITICAL. This row is the post-fix re-verification, not an edit of it.',
      fix_commit: '12e6457dc819e2b6f83a0ddc086a30891338a9d7',
      pr: '8455',
      // Gate-evidence provenance: counts below come from a runner-written file, not from prose.
      results_file: RESULTS_FILE,
      results_file_sha256: resultsSha,
      results_producer: 'vitest --reporter=json',
      tests_total: runner.numTotalTests,
      tests_passed: runner.numPassedTests,
      tests_failed: runner.numFailedTests,
      test_suites: runner.numTotalTestSuites,
      runner_success: runner.success,
      test_command: 'npx vitest run tests/unit/worktree-reaper/',
      previous_test_count: 417,
      mutation_testing: {
        method: 'apply mutation to shipped source -> run suite -> confirm FAIL -> restore -> confirm empty git diff',
        mutants_applied: 5,
        mutants_killed: 5,
        survivors: 0,
        detail: [
          'M1 cwd guard: `if (!repoRoot) return []` -> `repoRoot = process.cwd()` => KILLED (vi.fn() not.toHaveBeenCalled)',
          'M2 gitRunner branch: both-streams -> res.stdout only => KILLED (new stderr fixture)',
          'M3 execSync branch: drop `2>&1` => KILLED (new real-subprocess e2e test)',
          'M4 constant collision: EVENT_TYPE_HUSK_SHIP_PATH aliases EVENT_TYPE => KILLED (only by the newly added .not.toBe(EVENT_TYPE))',
          'M5 husk write site emits EVENT_TYPE => KILLED',
        ],
      },
      independent_reproduction: {
        method: 'own throwaway repo: git init + git worktree add + rm worktree .git link; spawnSync split-stream measurement; pre-fix logic vs shipped code differential on the same fixture',
        measured_stdout: '""',
        measured_stderr: '"Removing worktrees/broken-wt: gitdir file points to non-existent location\\n"',
        pre_fix_result: '[]',
        shipped_result: '[{"name":"broken-wt","reason":"gitdir file points to non-existent location"}]',
        healthy_repo_control: '[]',
        no_repo_root_guard: '[] (no subprocess)',
        sweep_level_result: 'runOrphanSweep -> pruneCandidates=[{name:"SD-BROKEN-E2E",...}] -> 1 worktree_prune_candidate audit row',
      },
      files_examined: [
        'lib/worktree-reaper/orphan-sweep.js',
        'lib/worktree-reaper/audit-sink.js',
        'scripts/worktree-reaper.mjs',
        'tests/unit/worktree-reaper/orphan-sweep.test.js',
        'tests/unit/worktree-reaper/audit-sink.test.js',
      ],
      platform: 'win32 (Windows 11) — the `2>&1` redirect was exercised through cmd.exe',
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F',
      branch: 'feat/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F',
      blocking_findings: 0,
      advisory_findings: 1,
      original_critical_status: 'CLOSED (independently reproduced against shipped code)',
      original_vacuity_findings_status: 'CLOSED (mutation-verified, 5/5 killed)',
    },
    phase: 'EXEC-TO-PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  tests:', stored.metadata?.tests_passed + '/' + stored.metadata?.tests_total);
  console.log('  results_file_sha256:', stored.metadata?.results_file_sha256);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
