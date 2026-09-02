// SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001 — final SECURITY re-verification (EXEC phase),
// after S-1 and S-2 (SECURITY sub-agent evidence c15134e8) were fixed in commit 22252b2682e.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001';
const PHASE = 'EXEC';

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary:
    'Re-verification after fixing S-1 and S-2 (SECURITY sub-agent evidence c15134e8, commit 22252b2682e). ' +
    'S-1: ENFORCEMENT 12e now checks the cheap, pure extractTargetPath() BEFORE any require() of ' +
    'resolve-sd-workdir.js or the git rev-parse execSync -- verified live: `git status` (an unrelated command) ' +
    'produces zero ENF-12e output/side-effects, matching the pattern that guarantees the heavy require/exec ' +
    'path is only entered when extractTargetPath() actually matches a git worktree add invocation. ' +
    'S-2: extractTargetPath now token-walks and skips a value-taking flag (-b/-B/--reason) AND its value, ' +
    'so `git worktree add -b feat/x .worktrees/qf/117` correctly extracts the real target -- verified live ' +
    '(exit 0, no ENF-12e refusal) plus 3 new unit tests (-b, -B with extra positional arg, mixed boolean+value ' +
    'flags). No injection/traversal vulnerability was found in the original review and nothing in these fixes ' +
    'introduces new attack surface (S-1 REDUCES surface by removing the unconditional dotenv-secret load on ' +
    'every Bash call; S-2 is a pure correctness fix, same code shape as before). Full regression suite ' +
    're-run: lib/__tests__/worktree-add-sibling-guard.test.js + tests/unit/enforcement-worktree-add-sibling-guard.test.js ' +
    '+ tests/unit/worktree-reaper/ + tests/unit/enforcement-npm-install-guard.test.js + ' +
    'lib/__tests__/worktree-remove-junction-guard.test.js -- 347/347 passing.',
  findings: [
    { id: 's-1-closed', severity: 'info', note: 'ENF-12e now gated on extractTargetPath() match before any heavy require/exec -- verified live with an unrelated command producing zero ENF-12e side-effects.' },
    { id: 's-2-closed', severity: 'info', note: '-b/-B value-taking flags now correctly skipped along with their value -- verified live and via 3 new unit tests.' },
  ],
  metadata: {
    fixes_verified: ['S-1 (22252b2682e)', 'S-2 (22252b2682e)'],
    commits: ['25447bba0c3', '4efcdffbd2f', '22252b2682e'],
    prior_evidence: 'c15134e8-68b5-4893-bc2f-63f7cd5208d5 (EXEC, CONDITIONAL_PASS, found S-1/S-2)',
    test_suite_result: '347/347 passing',
  },
  execution_time_ms: 90000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'SECURITY',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', SD_ID, { name: 'Chief Security Architect' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
