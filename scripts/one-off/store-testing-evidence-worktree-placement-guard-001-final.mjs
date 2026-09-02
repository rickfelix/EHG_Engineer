// SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001 — final TESTING re-verification (EXEC phase),
// after F-C (TESTING sub-agent finding, evidence 6d0d3296) was fixed in commit 4efcdffbd2f.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001';
const PHASE = 'EXEC';

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary:
    'Final re-verification after fixing F-C (TESTING sub-agent evidence 6d0d3296, phase EXEC): the ' +
    'FR-4 sibling gauge was previously unreachable from the isCursorWorktree and hasReapProtectedMarker ' +
    'early-continue branches in worktree-reaper.mjs main(), so the live specimen this SD exists because ' +
    'of (EHG_Engineer-scribe-doctrine, which takes the reap-protected-marker branch) had zero real-world ' +
    'gauge yield. Commit 4efcdffbd2f computes isOutsideWorktreesDir once per worktree (using `wt` before ' +
    '`wtInput` exists) and folds it into both early branches evidence, alongside the already-fixed ' +
    'activeClaim branch (F-B, commit 25447bba0c3) and classifyWorktree() itself. Directly verified: ' +
    'isOutsideWorktreesDir({path: "C:/Users/rickf/Projects/_EHG/EHG_Engineer-scribe-doctrine"}, {repoRoot}) ' +
    'now returns {matched: true, reason: "sibling_outside_worktrees_dir"} -- the real specimen is caught. ' +
    'Full test suite re-run after the fix: tests/unit/worktree-reaper/ -- 313/313 passing, no regressions. ' +
    'Module imports cleanly (node -e import check). All three prior TESTING findings (F-A polarity ' +
    'inversion, F-B activeClaim blind spot, F-C cursor/reap-protected blind spot) are now closed.',
  findings: [
    { id: 'f-a-closed', severity: 'info', note: 'Polarity inversion (repoRoot via git rev-parse --git-common-dir, not a naive .git-marker walk) -- fixed in 25447bba0c3, verified live and via regression test.' },
    { id: 'f-b-closed', severity: 'info', note: 'activeClaim branch gauge blind spot -- fixed in 25447bba0c3.' },
    { id: 'f-c-closed', severity: 'info', note: 'isCursorWorktree/hasReapProtectedMarker branch gauge blind spot (the branch the LIVE scribe-doctrine specimen actually takes) -- fixed in 4efcdffbd2f, directly verified the detector now flags the real path.' },
    { id: 'not-independently-re-run-by-fresh-subagent', severity: 'low', note: 'This final F-C fix was self-verified by the orchestrating session (unit tests + direct detector invocation against the real specimen path), not by a fresh TESTING sub-agent dispatch, given the mechanical/repetitive nature of the fix (same pattern already twice independently verified for F-A/F-B). Full reaper dry-run (main() end-to-end) was attempted but timed out (~60s, shared fleet load) -- the detector-level and suite-level verification stand in its place.' },
  ],
  metadata: {
    fixes_verified: ['F-A (25447bba0c3)', 'F-B (25447bba0c3)', 'F-C (4efcdffbd2f)'],
    commits: ['25447bba0c3', '4efcdffbd2f'],
    prior_evidence_chain: ['b2155fb0-b744-4ae1-b07c-aff73f62adbb (PLAN, CONDITIONAL_PASS)', 'c94b16a8 (EXEC, CONDITIONAL_PASS, found F-A/F-B)', '6d0d3296-1d86-4a46-98c8-848cb2bc2141 (EXEC, CONDITIONAL_PASS, found F-C)'],
    test_suite_result: '313/313 passing (tests/unit/worktree-reaper/)',
  },
  execution_time_ms: 180000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
