<!-- Archived from: docs/plans/sd-leo-infra-sd-start-worktree-base-001-plan.md -->
<!-- SD Key: SD-LEO-INFRA-START-WORKTREE-BRANCH-001 -->
<!-- Archived at: 2026-04-28T15:50:11.758Z -->

# sd-start worktree branch creation forks off main repo HEAD instead of origin/main

## Type

infrastructure

## Priority

high

## Target Application

EHG_Engineer (worktree creation pipeline: `lib/worktree-manager.js`, `scripts/resolve-sd-workdir.js`, `lib/eva/proving/fix-agent.js`, `scripts/sd-start.js`)

## Summary

When `npm run sd:start <SD-KEY>` creates a worktree, the new feature branch is forked from the main repo's **currently-checked-out HEAD**, not from `origin/main`. If the operator's main repo happens to be on a docs branch, a stale feat branch from another SD, or an unmerged QF branch, the new SD's feature branch silently inherits all those upstream commits as baggage. The result: every PR opened from such a worktree against `main` either includes unrelated commits, or requires cherry-picking onto a clean branch off `origin/main` before push.

**Concrete evidence from this session (2026-04-28):**
- `SD-LEO-ENH-TREND-SCANNER-SCORING-001` was started while the main EHG_Engineer repo was on `docs/harness-backlog-2026-04-27` (HEAD `2e240b6ce4`, 6 commits ahead of `origin/main` from prior docs and QF work).
- The created worktree's `feat/SD-LEO-ENH-TREND-SCANNER-SCORING-001` branch was forked from that docs HEAD, not `origin/main`.
- After the SD's 4 commits landed cleanly, `git log origin/main..HEAD` showed **10 commits ahead** of main (4 mine + 6 unrelated docs/QF).
- `git rebase --onto origin/main` on the existing branch produced merge conflicts on shared files (e.g., `docs/harness-backlog.md`, `scripts/eva/evidence-checks/check-types.js`) belonging to prior session work — none of which my SD touched.
- Workaround required: `git checkout -b feat/<SD>-clean origin/main && git cherry-pick <my-commits>`. The harness-backlog commit failed to cherry-pick due to file conflict and had to be skipped.

**Compare to the existing shell tooling**, which already does it correctly:
```bash
# scripts/create-sd-worktree.sh:62
git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" origin/main
#                                                    ^^^^^^^^^^^ explicit base
```

The JS path in `lib/worktree-manager.js` does not pass an explicit base, so git defaults to current HEAD.

## Depends On

None. This SD can ship independently. No runtime coupling — worktree creation is its own function. Tests can run against an isolated test repo.

## Success Criteria

- **AC1**: Given the main EHG_Engineer repo is checked out on a non-main branch (e.g., `docs/harness-backlog-2026-04-27`), `npm run sd:start SD-X` creates a worktree whose feature branch's `git merge-base` with `origin/main` equals `origin/main` HEAD — the branch carries zero unrelated commits.
- **AC2**: `git log origin/main..feat/SD-X` from inside the new worktree shows zero commits before any product work begins. (Currently shows N≥1 commits drawn from the main repo's HEAD lineage when HEAD ≠ origin/main.)
- **AC3**: `lib/worktree-manager.js::createWorktree` and `lib/worktree-manager.js::createWorkTypeWorktree` both fetch `origin/main` (or a configurable base ref) **before** issuing `git worktree add`, and the resulting `git worktree add -b <branch> <path> <BASE_REF>` command always names a base ref explicitly when the branch does not yet exist locally or remotely.
- **AC4**: When a remote branch with the requested name **already exists** (legitimate sd-start re-claim of an existing SD), the new code path uses the remote branch as the base — `git worktree add <path> <branch>` (no `-b`, no base override). No regression on the re-claim flow.
- **AC5**: `scripts/resolve-sd-workdir.js:308-312` (which has its own `git worktree add` call) and `lib/eva/proving/fix-agent.js:63` are audited for the same defect and either patched or proven to use the correct base via different code paths.
- **AC6**: A configurable base ref via env var `LEO_WORKTREE_BASE_REF` (default `origin/main`) so test environments and feature-branch-experimentation flows can override without editing code. Falls back to `origin/main` when unset; refuses to use a base that doesn't exist remotely (fail-closed).
- **AC7**: Vitest test file `tests/unit/lib/worktree-manager.test.js` covers: (a) branch-doesn't-exist case → asserts `git worktree add -b <branch> <path> origin/main` is the exact command issued (mock execSync); (b) branch-exists-remotely case → asserts no `-b` flag, no base override; (c) `LEO_WORKTREE_BASE_REF=origin/release-2026-q2` honored; (d) fetch-failure surfaces as a typed error, not silent fall-through to current-HEAD.
- **AC8**: A regression integration test using a temporary git repo (init bare + clone) verifies AC1 end-to-end: switch the temp repo to a non-main branch with extra commits, run the worktree-create function, assert the new worktree's branch contains zero of the non-main commits.

## Scope

### FR1 — Explicit base ref in `lib/worktree-manager.js::createWorktree`

In `lib/worktree-manager.js:253-261`:
- Resolve `baseRef` once at the top of `createWorktree` from `process.env.LEO_WORKTREE_BASE_REF || 'origin/main'`.
- Before the existence check, call `git fetch origin <baseRefName>` (where `baseRefName` is `baseRef` with the `origin/` prefix stripped). Wrap in try/catch — emit a typed `FetchFailedError` if it fails, do NOT fall through silently.
- When `branchExists === false`, change the command to `git worktree add -b "${branch}" "${worktreePath}" "${baseRef}"`.
- When `branchExists === true`, leave the existing `git worktree add "${worktreePath}" "${branch}"` unchanged (the branch carries its own ref already).
- Log the chosen base ref in the worktree-event telemetry payload (`worktreeEvent.create` already exists; add `baseRef` field).

### FR2 — Same fix in `createWorkTypeWorktree`

In `lib/worktree-manager.js:393-400`:
- Apply the identical pattern: resolve `baseRef`, fetch, conditionally include base in the `git worktree add` command.

### FR3 — Audit and patch `scripts/resolve-sd-workdir.js`

In `scripts/resolve-sd-workdir.js:303-313`:
- This file has its own `git worktree add` calls. Audit whether they hit the same defect; if so, refactor to delegate to `lib/worktree-manager.js` rather than duplicating the logic. (Single source of truth; reduces drift surface.)

### FR4 — Audit and patch `lib/eva/proving/fix-agent.js`

In `lib/eva/proving/fix-agent.js:63`:
- Same pattern: `git worktree add "${worktreePath}" -b "${branch}"` — needs base ref. The proving flow may have a different lifetime (ephemeral worktree for fix-agent runs) so the base ref selection may differ; document the choice.

### FR5 — Configurable base ref + fail-closed fetch

- Document `LEO_WORKTREE_BASE_REF` env var in `CLAUDE.md` (or wherever environment variables are catalogued).
- Define `class WorktreeBaseFetchFailedError extends Error` in `lib/worktree-manager.js`. Throw with `{ baseRef, gitOutput, exitCode }` payload when the fetch fails. Caller (`sd-start.js`) translates to a deterministic refusal banner — same shape as the existing claim-validity-gate refusals.

### FR6 — Test suite

- New file `tests/unit/lib/worktree-manager.test.js`: mock execSync, branchExistsLocally, branchExistsRemotely. 4-6 cases per AC7.
- Optional integration test `tests/integration/lib/worktree-base-ref.test.js` using a temp repo (use the `tmp` package or equivalent already in the repo's deps): fork a temp repo, switch to a non-main branch with extra commits, assert the new feat branch has zero of those commits. Skip on CI if the test infra doesn't support tmp git repos.

### FR7 — Backfill audit (advisory, separate SD if scope grows)

- Query `claude_sessions` and `strategic_directives_v2` for any active or recent claims whose `worktree_path` exists and whose feat branch's `git merge-base origin/main` ≠ `origin/main` HEAD.
- For each, log to `harness-backlog.md` so future ship-time cherry-picks are not surprises.
- Backfill is advisory only — do NOT auto-rebase live worktrees in this SD.

## Non-Goals

- Changing the `--bypass-validation` behavior for handoffs (separate concern).
- Auto-rebasing existing worktrees that were created with the bug (operators handle individually with cherry-pick).
- Adding pre-`sd:start` linting that refuses to start when the main repo is dirty (separate concern; would be a sibling SD).

## Key Technical Decisions

- **Why explicit `origin/main` rather than `main`**: a local `main` branch can drift from `origin/main` if the operator hasn't pulled. `origin/main` is always the upstream source of truth for new branches. Cost: one extra `git fetch` per worktree create (~200ms). Benefit: deterministic, parallel-safe.
- **Why env-var configurable rather than hard-coded**: future scenarios (release branches, fork experiments) need to fork from a non-main base. Env var lets them override without editing code; default keeps everyone safe.
- **Why fail-closed on fetch failure**: silent fall-through to current HEAD is exactly the bug we're fixing. Operators offline or behind a proxy should see an explicit error and decide, not silently inherit corrupted state.
- **Why not auto-fix existing worktrees**: rebasing live worktrees with in-progress work risks data loss. Operators must opt in per worktree.

## Supporting Evidence

- 2026-04-28 session evidence in `docs/harness-backlog.md` (entry for SD-LEO-ENH-TREND-SCANNER-SCORING-001).
- Bug location: `lib/worktree-manager.js:258-261` and `:396-400` (both `git worktree add -b "${branch}" "${path}"` without explicit base).
- Correct example: `scripts/create-sd-worktree.sh:62` (`git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" origin/main`).
- Cross-repo build check correctly uses `origin/<branch>`: `lib/gates/cross-repo-build-check.js:39`.

## Risks

- **High blast radius**: every new worktree depends on this. A bug in the fix would break sd-start across the board. Mitigation: comprehensive vitest cases (FR6) before landing; ship behind `LEO_WORKTREE_BASE_REF` so it's configurable; integration test against a tmp repo.
- **Fetch latency**: adds ~200ms per worktree create. Acceptable given the bug it fixes.
- **Existing in-progress worktrees**: not touched by this fix. Operators must individually rebase or cherry-pick; document in PR description.

## Estimated Scope

- Source: ~30-50 LOC across 3-4 files (lib/worktree-manager.js × 2 sites, scripts/resolve-sd-workdir.js × 1 site, lib/eva/proving/fix-agent.js × 1 site).
- Tests: ~80-150 LOC (vitest unit + optional integration).
- Total: ~150-200 LOC. Tier 3 SD per CLAUDE.md routing (framework-surface work).
