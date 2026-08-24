// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 — Explore sub-agent evidence writer (LEAD phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary:
    'Explored the LEAD-FINAL-APPROVAL PR_MERGE_VERIFICATION gate (scripts/modules/handoff/executors/lead-final-approval/gates.js, ' +
    'createPRMergeVerificationGate, lines 628-947). Confirmed the exact false-pass code path: Scan A (open PRs via `gh pr list ' +
    '--state open`, lines 693-724) and Scan B (unmerged remote branches via `git fetch --prune origin` + `git branch -r`, lines ' +
    '782-867) are both remote-only surfaces. A branch created locally but never pushed appears in neither -- both counts are 0 -- ' +
    'and execution falls through to lines 906-915\'s unconditional `passed:true, score:100, details:{openPRs:0,unmergedBranches:0}`. ' +
    'Found the canonical existing "does this SD type imply code" predicate: scripts/modules/sd-type-checker.js\'s isInfrastructureSDSync()/ ' +
    'SD_TYPE_CATEGORIES.NON_CODE, already reused by an analogous exemption in scripts/modules/handoff/executors/plan-to-lead/gates/' +
    'git-commit-enforcement.js (lines 20-54) for GATE5_GIT_COMMIT_ENFORCEMENT at PLAN-TO-LEAD -- a DIFFERENT, more lenient enforcement ' +
    'context (see findings below on why this same predicate is unsafe here). Found the closest existing "never pushed" detection ' +
    'precedent: scripts/verify-git-commit-status.js\'s checkAllCommitsPushed() (lines 313-365, `git rev-parse --abbrev-ref ' +
    '<branch>@{upstream}` -- no upstream means never pushed) and checkRemoteBranchExists() (lines 370-403, `git ls-remote --heads ' +
    'origin <branch>` -- empty means not on remote), both scoped to the CURRENTLY CHECKED OUT branch (via `git branch --show-current`), ' +
    'not to an SD\'s historical branches by name/ownership -- the primitive (git ls-remote) is directly reusable, the functions ' +
    'themselves are not (wrong subject, and each carries fail-open "assume OK if cannot check" branches unacceptable in a terminal ' +
    'gate). Found the existing unit test file to extend: scripts/modules/handoff/executors/lead-final-approval/gates/' +
    'pr-merge-verification.test.js (169 lines, execSync mocked, loadKeySet injected -- fully unit-level, no DB). Found the reusable ' +
    'census pattern for FR-3: scripts/one-off/scan-completed-sds-for-activation-gap.mjs (paginated strategic_directives_v2 scan, ' +
    '--dry-run default, idempotent feedback-table dedup by title-prefix) is the cleaner generic template versus scripts/' +
    'audit-phantom-completions.js\'s bespoke pre-classified-inventory + direct status-mutation pattern.',
  findings: [
    { id: 'false-pass-code-path-confirmed', severity: 'critical', note: 'gates.js lines 906-915: both Scan A (open PRs) and Scan B (remote branches, git branch -r) return 0 for a never-pushed local branch, falling through to an unconditional passed:true. Independently re-confirmed by validation-agent, who found this SD itself is currently a live specimen (its own branch is local-only at the time of this exploration).' },
    { id: 'no-existing-doc-only-exemption-in-this-gate', severity: 'warning', note: 'Grepped gates.js and the gates/ subdirectory for documentation / sd_type === / isNonCodeSD / NON_CODE / files_to_modify inside createPRMergeVerificationGate and all sibling gate functions -- zero matches. PR_MERGE_VERIFICATION currently has NO type-based exemption at all; any FR adding a never-pushed failure mode must add an exemption in the SAME change or it will start blocking legitimate no-code SDs.' },
    { id: 'never-pushed-primitive-precedent', severity: 'info', note: 'verify-git-commit-status.js already implements `git ls-remote --heads origin <branch>` (empty = not on remote) and `@{upstream}` absence checks -- reuse the PRIMITIVE, not the functions (which are scoped to git branch --show-current, the wrong subject for a gate checking an SD\'s named branches after the fact, and carry fail-open paths this terminal gate cannot inherit).' },
    { id: 'census-pattern-precedent', severity: 'info', note: 'scan-completed-sds-for-activation-gap.mjs (paginated scan, dry-run default, idempotent feedback dedup) is the right template for FR-3\'s retro census -- NOT audit-phantom-completions.js\'s bespoke hardcoded-inventory + direct DB-mutation pattern, which was built for a one-time cleanup, not a general repeatable census.' },
  ],
  metadata: {
    gate_file: 'scripts/modules/handoff/executors/lead-final-approval/gates.js',
    gate_function: 'createPRMergeVerificationGate',
    false_pass_lines: '906-915',
    scan_a_lines: '693-724',
    scan_b_lines: '782-867',
    existing_test_file: 'scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js',
    never_pushed_precedent_file: 'scripts/verify-git-commit-status.js',
    census_pattern_file: 'scripts/one-off/scan-completed-sds-for-activation-gap.mjs',
  },
  execution_time_ms: 600000,
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
