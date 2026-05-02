<!-- Archived from: docs/plans/worktree-reaper-plan.md -->
<!-- SD Key: SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001 -->
<!-- Archived at: 2026-04-24T19:09:17.531Z -->

# Formalized worktree reaper: tiered remediation of zombie, nested, and orphan worktrees

## Summary

No existing process cleans up stale worktree directories in EHG_Engineer. `/ship` Step 6.7 handles only the current SD's worktree post-merge. `/coordinator sweep` handles session state (claims, heartbeats, lock contention) with zero worktree-directory operations. `scripts/cleanup-phantom-worktrees.js` exists but is **read-only by design** (header: "NEVER deletes anything") AND unwired — no invocations anywhere in `scripts/`, `.claude/`, `package.json`, or `.github/`. The result is silent accumulation of zombie worktrees that pin stale commits, confuse `sd:next` / `branch-cleanup-v2`, and occasionally hide real orphan work (untracked migrations, tools) behind non-obvious paths.

Witnessed live 2026-04-24 during a `/ship` cautious-inspection sweep of the worktree roster: **5 actionable categories** were present simultaneously across 16 worktree entries — including a zombie worktree pinned to `main` (149 commits behind, 724 dirty files, a `git reset --hard` in its reflog) and a nested worktree (worktree inside a worktree) holding 3 orphan DB migrations that would have been lost on a naive `git worktree remove`. Manual cleanup required ~45 minutes of cross-checking against `git cherry -v`, `gh pr list --search`, and `strategic_directives_v2` before any deletion was safe.

## Type

infrastructure

## Priority

high

## Target Application

EHG_Engineer (LEO harness)

## Success Criteria

- **AC1**: Given a worktree whose branch is pinned to `main` AND has no active session claim for ≥ 24h, the reaper flags it as zombie. With `--execute`, it preserves untracked non-`scratch-*` files and removes the worktree.
- **AC2**: Given a worktree whose directory path contains `.worktrees/` more than once (nested spawn), the reaper flags it. With `--execute`, it removes the nested worktree first, then its parent if the parent also qualifies.
- **AC3**: Given a worktree whose `sdKey` (from `.worktree.json` or inferred from branch) does not resolve to any row in `strategic_directives_v2` OR `quick_fixes`, the reaper flags it as orphan-SD. Default action: preserve untracked files, remove worktree.
- **AC4**: Given a worktree whose branch's commits are patch-equivalent to `origin/main` (squash-merged via `git cherry` + merged-PR cross-check), the reaper flags it as shipped-stale. Default action: remove worktree (content already on main).
- **AC5**: Given a worktree idle > 7 days (most recent commit + most recent filesystem mtime) AND no active claim AND no unpushed unique commits, the reaper flags it as idle. Default action: preserve untracked files, remove worktree.
- **AC6**: Preserve-before-delete is mandatory: any untracked file not matching `^(tmp-|scratch-|\.claude/|\.workflow-patterns|\.worktree\.json$)` is copied to `scratch/preserved-from-<worktree-name>/` with directory structure preserved before worktree removal.
- **AC7**: Two-stage output (mirrors `branch-cleanup-v2`): Stage 1 = auto-safe (AC2 nested, AC4 shipped-stale); Stage 2 = analyzed-and-tabled (AC1, AC3, AC5) with per-category reasoning shown. `--execute` deletes Stage 1 only; `--execute --stage2` includes Stage 2.
- **AC8**: Active-claim protection: any worktree whose branch matches a row in `v_active_sessions` with a heartbeat < 2h old is skipped regardless of other signals. (Mirrors `branch-cleanup-v2`'s `sessionProtected` map.)
- **AC9**: Dry-run is default. `--execute` required to mutate anything. `--yes` required to skip interactive confirmation when Stage 2 removals would happen.
- **AC10**: Structured log output (JSON-lines to stderr, human-readable table to stdout). Each worktree evaluation emits a record with `path`, `branch`, `categories` (array of AC1-AC5 hits), `dirty_file_count`, `unpushed_commit_count`, `ship_status` (`on_main` / `not_on_main` / `patch_equivalent_via_squash`), `claim_status`, `verdict` (`keep` / `stage1_remove` / `stage2_remove`), and `reason`.
- **AC11**: Idempotent. Running the reaper twice on the same fleet state produces no additional changes on the second run.

## Scope

### FR1 — Convert `cleanup-phantom-worktrees.js` to tiered remediation

Rename or replace `scripts/cleanup-phantom-worktrees.js` with `scripts/worktree-reaper.mjs` (or extend in place) to:

- Enumerate registered worktrees via `git worktree list --porcelain`.
- For each, compute the 5 detection signals (AC1 zombie, AC2 nested, AC3 orphan-SD, AC4 shipped-stale, AC5 idle) using Supabase + `gh` + git plumbing.
- Apply active-claim protection (AC8).
- Apply preserve-before-delete (AC6): `fs.cpSync` with `recursive: true`, destination `scratch/preserved-from-<basename>/`.
- Call `git worktree remove --force <path>` from the main repo CWD (enforced — will hard-fail if CWD is inside any worktree, per PAT-WORKTREE-LIFECYCLE-001).

### FR2 — Detection primitives

Extract pure functions into `lib/worktree-reaper/detectors.js`:
- `isZombieOnMain(wt, claimMap)` — branch is `main` AND no fresh claim
- `isNested(wt)` — regex on path: `/\.worktrees\/.*\.worktrees\//`
- `hasOrphanSD(wt, sdMap, qfMap)` — parse `.worktree.json` sdKey, cross-reference DB
- `isPatchEquivalentToMain(wt)` — `git cherry -v origin/main HEAD` returns only `-` rows OR PR cross-check confirms squash-merge
- `isIdle(wt, thresholdDays)` — max(last-commit-ctime, filesystem-mtime) > threshold

Each detector returns `{ matched: boolean, reason: string, evidence: {...} }`.

### FR3 — Two-stage output + execute flags

Mirror `branch-cleanup-v2.js`'s CLI:
- `--discover` / `--repo <name>` / `--all` for multi-repo
- `--execute` deletes Stage 1 (nested, shipped-stale)
- `--execute --stage2` includes Stage 2 (zombie, orphan-SD, idle)
- `--yes` skips confirmation
- `--days <n>` overrides idle threshold (default 7)
- `--preserve-root <path>` overrides `scratch/preserved-from-*`

Output Stage 2 as a table with columns: `Worktree`, `Categories`, `Dirty`, `Unpushed`, `Age`, `Verdict`, `Preserve`.

### FR4 — Wiring

- Add `npm run worktree:reap` (dry-run default) and `npm run worktree:reap:execute` scripts to `package.json`.
- Integrate into `/coordinator sweep` on a slower cadence: run on every 12th sweep (≈ once per hour with the 5-min cron) via a counter stashed in `.claude/worktree-reaper-state.json`. Keep the 5-min session-sweep fast.
- Document the reaper in `CLAUDE.md` under Session Prologue (or a new "Fleet Hygiene" section) so operators know it exists.

### FR5 — Test coverage

- Unit tests per detector in `tests/unit/worktree-reaper/*.test.js`. Each AC1-AC5 gets positive + negative cases.
- Integration test that creates a temp git repo + 5 worktrees (one per category), runs the reaper with `--execute --stage2`, and asserts correct removals + preserve-file layout.
- Active-claim protection test: seed a fresh `claude_sessions` row, verify reaper skips that worktree.
- Idempotency test: run reaper twice, assert second run reports zero changes.

## Non-Goals

- NOT deleting branches (owned by `branch-cleanup-v2`). Reaper removes worktrees; leftover branches flow to the existing branch-cleanup pipeline.
- NOT reconciling `claude_sessions` rows (owned by `stale-session-sweep.cjs`).
- NOT merging PRs, pushing branches, or modifying git history.
- NOT inspecting git stashes (they persist per-repo, not per-worktree; orthogonal lifecycle).
- NOT replacing `post-merge-worktree-cleanup.js` — that remains the per-SD post-ship path. The reaper handles the long tail.

## Key Technical Decisions

**Detection in code vs query**: Each of the 5 categories needs distinct evidence (git refs, gh PR state, Supabase). Keep detectors modular and pure so individual rules can be tested + evolved independently. A single monolithic SQL query or git command would not cover all categories cleanly.

**Preserve-before-delete as invariant**: Today's session witnessed nested-worktree removal that would have lost 3 orphan DB migrations. Making preserve mandatory (not optional) removes a footgun; the cost is extra disk + `scratch/` clutter, which is low-impact since `scratch/` is gitignored (added 2026-04-24, commit `fc8262a325`).

**Run cadence**: The 5-min session-sweep must stay fast. Worktree enumeration + DB + gh calls take seconds, not milliseconds. A 1-hour cadence (every 12th sweep) keeps total cost near-zero while still reconciling within one business day of a stale spawn.

**`cherry -v` for shipped-stale**: Squash-merged PRs have different commit hashes from their source commits. `merge-base --is-ancestor` fails. `git cherry -v origin/main HEAD` computes patch-ids and correctly detects patch-equivalence across squash merges. Combined with `gh pr list --search "head:<branch>" --state merged` for confirmation.

**Windows-safe path handling**: `git worktree remove` from inside the worktree corrupts the Windows shell (PAT-WORKTREE-LIFECYCLE-001). Reaper enforces CWD == main repo root before any removal; hard-fails otherwise.

## Supporting Evidence

- **Primary incident**: 2026-04-24 manual cleanup session. 5 of 5 detection categories present across 16 worktrees. Full investigation + cleanup recorded in conversation (parent-rollup-session, SD-S17-WORKER-STRATEGY with nested ORCHESTRATOR-GATE-FIXES spawn, 3 orphan DB migrations preserved to `scratch/preserved-orphan-migrations/`).
- **Dormant script**: `scripts/cleanup-phantom-worktrees.js` — exists, read-only by design, unwired. Grep across entire repo returns zero invocations.
- **Absent handling in `/coordinator sweep`**: `grep -E "(worktree remove|git worktree|rmdir|rmSync|\.worktrees/)" scripts/stale-session-sweep.cjs` returns empty.
- **Pattern precedent**: `branch-cleanup-v2.js` already implements the two-stage tiered pattern for branches. Reaper mirrors that shape for worktrees.
- **Related memory**: `feedback_worktree_wiped_during_exec.md`, `feedback_sd_start_worktree_false_success.md`, `feedback_worktree_limit_no_graceful_path.md`, `feedback_edit_tool_worktree_path_anchoring.md` — all document worktree lifecycle gaps that a reaper would reduce frequency of.
