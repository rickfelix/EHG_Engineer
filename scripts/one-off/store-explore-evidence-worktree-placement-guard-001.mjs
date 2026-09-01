// SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001 — Explore sub-agent evidence writer (LEAD phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'Verified all mechanism claims in the SD spine against the actual codebase before build. CONFIRMED: ' +
    'lib/worktree-manager.js:41 (WORKTREES_DIR=".worktrees") and lib/worktree-manager.js:889 (createWorkTypeWorktree) ' +
    'place new worktrees under the typed layout .worktrees/{sd,qf,adhoc}/<key> (lines 903-904, 926-927), with a legacy-flat ' +
    'fallback only for pre-existing SD worktrees (930-946). scripts/resolve-sd-workdir.js:136-148 (validateWorktreePath, line ' +
    'drift of 1 from the claimed :137-149) refuses any path not under <repoRoot>/.worktrees/, invoked at line 783. ' +
    'scripts/create-quick-fix.js:661 (createWorkTypeWorktree call, drift of 1 from claimed :662) only fires behind a held ' +
    'DB claim (638-646); an unclaimed QF gets no worktree, per the explicit docblock at 591-593. lib/fleet/qf-auto-start.cjs ' +
    'has zero worktree references (grep-confirmed) -- the self-claim predicate genuinely names no path, which is the root ' +
    'cause the SD is built to close. scripts/hooks/pre-tool-enforce.cjs has exactly one worktree-related hit (line 782, a ' +
    'comment inside ENFORCEMENT 12d, which guards `git worktree remove`/rm -rf only) and NO enforcement anywhere in the ' +
    '1667-line file inspects a `git worktree add` Bash call -- confirms the guard genuinely does not exist yet, the SD\'s ' +
    'primary build target. lib/worktree-reaper/detectors.js has zero "sibling"-named detectors; its existing exports ' +
    '(keyFromBranch:40, isZombieOnMain:56, isNested:85, hasOrphanSD:111, isIdle:359, isSourceTreeBasename:517) follow a ' +
    'consistent {matched, reason, evidence} pure-detector pattern a new isOutsideWorktreesDir detector should mirror. ' +
    '.claude/commands/quick-fix.md has zero worktree mentions; worker.md mentions worktree twice (40-41, 49) as a generic ' +
    '"do not run from a stale worktree" warning, never naming the .worktrees/qf/<id> convention.',
  findings: [
    { id: 'guard-genuinely-absent', severity: 'info', note: 'pre-tool-enforce.cjs has no git-worktree-add enforcement block today (only a removal guard at line 782/ENFORCEMENT 12d) -- confirms FR1 (GUARD AT THE BIRTHPLACE) is real, unbuilt scope, not already-done.' },
    { id: 'qf-self-claim-names-no-path', severity: 'info', note: 'lib/fleet/qf-auto-start.cjs has zero worktree references (grep-confirmed) -- confirms the root cause: the self-claim dispatch path that a worker follows after checkin genuinely never prints or creates a .worktrees/qf/<id> path, matching the SD spine\'s claim exactly.' },
    { id: 'reaper-detector-pattern-to-follow', severity: 'info', note: 'lib/worktree-reaper/detectors.js exports 6 pure detectors (keyFromBranch:40, isZombieOnMain:56, isNested:85, hasOrphanSD:111, isIdle:359, isSourceTreeBasename:517) all returning {matched, reason, evidence} -- a new isOutsideWorktreesDir detector should follow this exact shape and be added alongside them, then wired into orphan-sweep.js/removal-decision.js.' },
    { id: 'line-number-drift', severity: 'info', note: 'Two claims cited line numbers off by exactly 1 (validateWorktreePath 137-149 vs actual 136-148; create-quick-fix.js:662 vs actual 661) -- cosmetic drift, not a correctness issue; the described mechanisms are real.' },
  ],
  metadata: {
    worktree_manager_worktrees_dir: 'lib/worktree-manager.js:41',
    worktree_manager_create_work_type: 'lib/worktree-manager.js:889',
    validate_worktree_path: 'scripts/resolve-sd-workdir.js:136-148',
    create_quick_fix_worktree_call: 'scripts/create-quick-fix.js:661',
    qf_auto_start_worktree_refs: 0,
    pre_tool_enforce_worktree_add_guard_exists: false,
    reaper_detectors_existing: ['keyFromBranch:40', 'isZombieOnMain:56', 'isNested:85', 'hasOrphanSD:111', 'isIdle:359', 'isSourceTreeBasename:517'],
    reaper_sibling_detector_exists: false,
  },
  execution_time_ms: 120000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
