#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent EXEC-TO-PLAN evidence for SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001.
 *
 * Persists the verdict from the testing-agent sub-agent run (agent testing-exec-plan-001)
 * that reviewed the SD's shipped diff: the bypass-stamp completion-integrity fix (FR-1..FR-7)
 * plus FR-8's --diff-range post-merge re-verify mode. Two of its four non-blocking findings
 * (dead isBypassResolved() consumer, leading-'-' argument injection in parseDiffRange) were
 * fixed in a follow-up commit (64149b905bc) before this evidence was written; both remaining
 * findings (SUBAGENT_VERDICT_MODE dead knob, wiring-level test gap) are documented as accepted
 * follow-up, not blockers.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD_KEY = 'SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001';

const findings = [
  {
    severity: 'low',
    type: 'dead_code_fixed',
    title: 'isBypassResolved() had zero production consumers (FIXED in 64149b905bc)',
    summary: 'learning-or-bypass-resolved-gate.js inlined !pattern_id && !followup_sd_key instead of importing isBypassResolved() from lib/handoff/bypass-stamp.js, even though the module docstring claimed it was shared. Fixed by importing and calling it directly; the 19 existing/adjacent tests still pass unchanged.',
    status: 'resolved',
  },
  {
    severity: 'low',
    type: 'argument_injection_fixed',
    title: 'parseDiffRange permitted a leading "-", letting git parse the range as an option (FIXED in 64149b905bc)',
    summary: 'SAFE_REV alone allowed a value like "--output=/tmp/x..--output=/tmp/y" through validation, which git would then parse as an option rather than a revision (argument injection, not shell injection -- no escape, no arbitrary execution). Fixed by rejecting from/to segments starting with "-"; 3 new regression tests added.',
    status: 'resolved',
  },
  {
    severity: 'low',
    type: 'stale_comment',
    title: 'SUBAGENT_VERDICT_MODE is now a dead knob in subagent-evidence-gate.js',
    summary: 'FR-6 made a rejecting sub-agent verdict block unconditionally regardless of mode. The mode variable survives only in a log/detail string; comments still describe it as governing a warn-vs-fail rollout. Accepted as documented follow-up -- not a defect in the fix, a stale comment.',
    status: 'accepted_followup',
  },
  {
    severity: 'low',
    type: 'test_coverage_gap',
    title: 'FR-7 regression test proves the pure-function seam, not the BaseExecutor/HandoffRecorder wiring itself',
    summary: 'bypass-stamp.test.js chains the real exported functions BaseExecutor.js and HandoffRecorder.js import, but does not invoke BaseExecutor.executeHandoff() or HandoffRecorder\'s recording methods directly. If a future edit dropped applyBypassToResult() from BaseExecutor\'s success return, or reverted a validation_passed assignment back to a hardcoded true, all 21 bypass-stamp tests would stay green. Wiring was manually verified this cycle (both BaseExecutor call sites, both HandoffRecorder write sites read against the diff). Recommended follow-up: a source-text wiring test matching the existing convention in tests/integration/cli-main-bypass-validation-audit-parity.test.js. Not a blocker -- the wiring is correct today, this is a regression-detection gap for the future.',
    status: 'accepted_followup',
  },
];

const recommendations = [
  'Add a source-text wiring test asserting BaseExecutor.js\'s success return passes through applyBypassToResult(...) and both HandoffRecorder.js sites call deriveBypassAwareRecordFields(...) -- closes the residual regression gap (finding #4).',
  'Remove or relabel SUBAGENT_VERDICT_MODE as observability-only in subagent-evidence-gate.js and correct its now-stale rollout comments.',
  'File separately (out of this SD\'s scope): tests/unit/handoff/handoff-orchestrator.test.js is 33-failed on origin/main itself (unmocked DB-dependent SD_NOT_FOUND preflight) -- confirmed pre-existing via a byte-identical detached baseline worktree at fc2bd1878b1, unrelated to any commit in this SD.',
];

const summary = "TESTING sub-agent EXEC-TO-PLAN review of SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001's shipped diff (bypass-stamp completion-integrity fix FR-1..FR-7, plus FR-8's --diff-range post-merge re-verify mode). CONDITIONAL_PASS, 88% confidence. Real suites run (not assumed): the SD-authored 8-file test scope measured 164/164 passing; the full requested sweep across 126 files measured 1361 passed / 33 failed / 3 skipped, with the 33 failures independently confirmed pre-existing via a detached baseline worktree at origin/main (fc2bd1878b1) -- byte-identical 33-failed/62-passed in tests/unit/handoff/handoff-orchestrator.test.js, a file neither SD commit touches. tsc --noEmit was clean (exit 0); node --check passed on all 11 changed production files. The DB-tier-gated integration test file's 9 skipped tests were independently re-executed as plain assertions against the real file content -- all 7 true. Three non-triviality checks were explicitly verified: (a) the FR-7 regression test genuinely chains the real exported functions BaseExecutor.js and HandoffRecorder.js import, not a reimplementation; (b) subagent-evidence-gate.test.js's rewritten tests genuinely flipped their pass/fail assertions, not merely retitled; (c) diff-range.test.js's injection-rejection tests exercise real shell-metacharacter payloads against the actual SAFE_REV regex. Writer/consumer symmetry was confirmed (buildPersistedBypassMetadata's pattern_id/followup_sd_key keys match what the FR-4 gate reads) and the options-plumbing path traced end-to-end (cli-main -> HandoffOrchestrator -> BaseExecutor). FR-6's blast radius was measured directly from the database (26,862 evidence rows, paginated after an initial capped-query correction): 117 SDs carry a rejecting latest verdict, but only 2 are active (one being this SD itself) -- refuting an inherited '32/313, risks mass-failing in-flight SDs' concern that had conflated all-time SDs with in-flight ones. E2E is exempt (zero UI files touched across both SD commits, independently confirmed by extension scan). Four findings surfaced, all non-blocking: two (a dead isBypassResolved() consumer, and a leading-'-' argument-injection gap in parseDiffRange) were fixed in a same-session follow-up commit (64149b905bc) with regression tests added and verified green; the remaining two (a stale SUBAGENT_VERDICT_MODE comment, and a pure-function-vs-wiring test coverage gap) are accepted as documented follow-up, not blockers to this handoff.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 88,
    findings,
    warnings: [],
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC-TO-PLAN',
      mode: 'review of shipped diff (feat/SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 vs origin/main), execution-based not review-only',
      go_no_go: 'GO -- two of four findings fixed same-session, remaining two accepted as follow-up',
      commits_verified: ['2f54ed590a0', '11c518e79a3', '17eb2629dbe', '64149b905bc'],
      sd_authored_test_run: {
        command: "npx vitest run tests/unit/handoff/ tests/unit/subagent-evidence-gate.test.js tests/unit/reactivate-sd.test.js tests/unit/mark-completion-evidence-invalid.test.js tests/unit/sub-agents/testing/diff-range.test.js tests/unit/execute-subagent-diff-range-flag.test.js tests/unit/testing-subagent/zero-ui-by-diff-gate.test.js --config vitest.unit-spec.config.js",
        result: '164/164 passed, 8 files',
      },
      full_sweep_run: {
        command: 'npx vitest run tests/unit/handoff/ tests/unit/subagent-evidence-gate.test.js tests/unit/reactivate-sd.test.js tests/unit/mark-completion-evidence-invalid.test.js tests/unit/sub-agents/testing/diff-range.test.js tests/unit/execute-subagent-diff-range-flag.test.js tests/unit/testing-subagent/ --config vitest.unit-spec.config.js',
        result: '1530 passed / 33 failed / 3 skipped, 144 files',
        failures_pre_existing: true,
        baseline_comparison: 'detached worktree at origin/main@fc2bd1878b1: byte-identical 33 failed / 62 passed in tests/unit/handoff/handoff-orchestrator.test.js',
      },
      tsc_check: { command: 'npx tsc --noEmit', exit_code: 0 },
      node_check: { files_checked: 11, all_ok: true },
      integration_parity_file: {
        file: 'tests/integration/cli-main-bypass-validation-audit-parity.test.js',
        vitest_result: '9 skipped (db-tier gate)',
        independent_reexecution: '7 source-text assertions re-run via plain node -- all true',
      },
      e2e_status: 'EXEMPT -- zero .tsx/.jsx/.vue/.css/.html or src/client|components files across both SD commits',
      follow_up_fix_commit: '64149b905bc',
      follow_up_fix_verified: '19/19 tests passed for the two hardening fixes; full sweep re-run confirmed the same 33 pre-existing (unrelated) failures, zero new regressions',
      verification_method: 'Real vitest runs (SD-authored scope and full sweep), tsc --noEmit, node --check on every changed production file, a detached origin/main baseline worktree to isolate pre-existing failures, independent re-execution of DB-tier-skipped assertions, and direct database measurement of FR-6 blast radius (paginated after catching an initial capped query).',
    },
    phase: 'EXEC-TO-PLAN',
    metadata: {
      // SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001: storeSubAgentResults' write-time guard reads
      // metadata.test_execution directly (not nested under detailed_analysis).
      test_execution: buildTestExecution({
        executed: 1530 + 33 + 3,
        passed: 1530,
        failed: 33,
        skipped: 3,
        runner: 'vitest',
        source: 'fresh',
      }),
      measured: true,
    },
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'Enhanced QA Engineering Director v2.4.0' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id, '| verdict:', stored.verdict, '@', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path, '| resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
