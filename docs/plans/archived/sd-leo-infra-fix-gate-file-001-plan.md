<!-- Archived from: C:/Users/rickf/Projects/_EHG/EHG_Engineer/scratch/gate-file-reading-plan.md -->
<!-- SD Key: SD-LEO-INFRA-FIX-GATE-FILE-001 -->
<!-- Archived at: 2026-04-24T00:20:33.440Z -->

# Plan: Fix gate file-reading class bug in LEO handoff gates

## Goal
Fix 3+ gates that read files from `EHG_REPO_PATH` (the main EHG checkout, whose branch is controlled by other sessions) instead of reading from `origin/<branchName>` where the SD's actual work lives. This false-fails every cross-repo SD that touches EHG, forcing bypass-validation and masking real gate signal.

## Summary
The `UI_INTERACTIVITY_CHECK`, `HEAL_BEFORE_COMPLETE`, `ACCEPTANCE_CRITERIA_VALIDATION`, `GATE5_GIT_COMMIT_ENFORCEMENT`, and the `SUB_AGENT_ORCHESTRATION` DESIGN-in-git-diff path all use `fs.readFileSync(path.join(EHG_REPO_PATH, file))` against the main EHG checkout. When another session has that checkout on a different branch (normal parallel-session operation), the gates read the wrong content and falsely block. Evidence: SD-PROTOCOL-LINTER-DASHBOARD-001 required 3 of 3 bypass-validation uses to finish, all for this class of failure.

## Success Criteria
- [ ] All cross-repo gates read file contents via `git show origin/<branchName>:<file>` (or equivalent), not `fs.readFileSync(EHG_REPO_PATH/file)`
- [ ] A shared helper exists (e.g. `scripts/modules/handoff/lib/branch-file-reader.js`) so future gates inherit the fix
- [ ] Regression test: run each affected gate against a branch whose changes are NOT in the main checkout; gate must pass when the branch itself satisfies the check
- [ ] Identified false-positive rate drops to zero in next 5 cross-repo SD ships (tracked via sd_phase_handoffs.bypass_reason containing "gate-reads-wrong-checkout")

## Files Affected
| Path | Action |
| --- | --- |
| scripts/modules/handoff/executors/exec-to-plan/gates/ui-interactivity-check.js | UPDATE — switch from fs.readFileSync to git show origin/<branch>:<file> |
| scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js | UPDATE — /heal must score the branch's tree, not the main checkout |
| scripts/modules/handoff/executors/plan-to-lead/gates/acceptance-criteria-validation.js | UPDATE — same pattern |
| scripts/modules/handoff/executors/plan-to-lead/gates/git-commit-enforcement.js | UPDATE — read branch HEAD, not local checkout state |
| lib/sub-agents/design-agent-diff.js (or equivalent) | UPDATE — git-diff mode must read from origin/<branch>, not EHG_REPO_PATH |
| scripts/modules/handoff/lib/branch-file-reader.js | CREATE — shared helper: readFileFromBranch(branch, path) -> string |
| tests/unit/branch-file-reader.test.js | CREATE — unit coverage for the helper |
| tests/integration/gate-cross-repo-regression.test.js | CREATE — regression covering the 4-5 affected gates against a parallel-branch fixture |

## Risks
- /heal is expensive; switching it to branch-aware reads may slow the gate. Mitigation: cache per-branch file reads within a single gate run.
- `git show origin/<branch>:<file>` requires origin to be up-to-date; add a `git fetch origin <branch> --quiet --no-tags` preamble in the helper.
- Some gates may legitimately want to read the CURRENT checkout (e.g. for uncommitted-changes detection); don't blanket-swap. Keep `GATE5_GIT_COMMIT_ENFORCEMENT`'s uncommitted-changes check but scope it to the SD's worktree path, not the main checkout.

## Implementation Notes
- EHG_REPO_PATH is defined at module scope in each affected gate. Replace with a `resolveEhgRepoRoot()` + `readFileFromBranch(repoRoot, branch, file)` pair.
- The helper should use `git -C <repoRoot> show origin/<branch>:<file>` via `execSync` with a 3s timeout.
- For `HEAL_BEFORE_COMPLETE`, the /heal runner needs a new `--branch origin/<branch>` mode or a temp worktree checkout.
- Bypass-validation unblocks SDs today, but rate-limit (3/SD) means a parallel-session-heavy workflow will run out; fixing this is higher priority than it looks.

## Rollout
1. Land the helper + unit tests first (safe, no behavior change).
2. Migrate `UI_INTERACTIVITY_CHECK` (simplest) as the reference implementation.
3. Migrate the remaining 3-4 gates in order of bypass frequency.
4. Add the cross-repo integration test.
5. Verify by shipping the next cross-repo SD without bypass-validation.

## Source
Identified during SD-PROTOCOL-LINTER-DASHBOARD-001 EXEC→LEAD-FINAL, 2026-04-24. Three consecutive handoffs required bypass-validation for the same root-cause class. See bypass_reason fields on sd_phase_handoffs rows at 2026-04-24T00:08, 00:13, and 00:18 for detailed diagnostics.
