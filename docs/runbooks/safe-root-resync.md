# Runbook: safe-root-resync

## Purpose

`scripts/safe-root-resync.mjs` is the canonical shared-root git-resync helper. It replaces ad-hoc `git clean -fdx` workflows that have caused **3 confirmed production incidents** by deleting gitignored runtime state (`node_modules`, `.claude/active-coordinator.json`).

## Absolute data-safety rule

> **NEVER run `git clean -fdx` or any variant that includes the `-x` flag.**
> The `-x` flag deletes gitignored files including `node_modules/` and `.claude/active-coordinator.json`.
> `-x` is not a supported flag in this helper — no code path constructs it.

## When to use

- After `git pull` / `git merge` pulls in new file changes that may have invalidated runtime state.
- On coordinator startup to confirm the shared root is current with `origin/main`.
- Any time a fleet worker signals that the shared root may be stale.

## How to run

### Standard (non-destructive, safe default)

```bash
npm run resync:safe
# or directly:
node scripts/safe-root-resync.mjs
```

This performs:
1. **Worktree guard** — aborts immediately if run from a worktree (`.git` is a file, not a directory). Only the shared root can be synced.
2. **Dirty-tree skip** — skips the merge if the tree has uncommitted tracked changes (protects in-progress work).
3. `git fetch origin main --quiet`
4. `git merge --ff-only origin/main --quiet` — fast-forward only; aborts on divergence, never clobbers.
5. **Restore tail** — restores the coordinator pointer (`.claude/active-coordinator.json`) if the current session is DB-confirmed as coordinator; probes and repairs `node_modules` if the `@supabase/supabase-js` import probe fails.

### With untracked-file cleanup (DOUBLE opt-in — genuinely destructive)

> ⚠️ **`git clean -fd` (no `-x`) still PERMANENTLY DELETES every untracked, non-gitignored file** — including uncommitted work-in-progress such as `.prd-payloads/*.json`, new scratch files, and anything you have not yet `git add`ed. It does NOT touch *gitignored* runtime state (`node_modules/`, `.env`, `.claude/active-coordinator.json`), but it WILL remove untracked files inside otherwise-tracked dirs. Treat it as a destructive operation.

Because of that, the **actual** clean requires **two** flags. `--clean-untracked` alone is preview-only:

```bash
# Step 1 — PREVIEW ONLY (deletes nothing): print the -fdn would-delete list and stop
npm run resync:safe -- --clean-untracked
# or: node scripts/safe-root-resync.mjs --clean-untracked

# Step 2 — after reviewing the preview, run the ACTUAL clean:
npm run resync:safe -- --clean-untracked --confirm-clean
# or: node scripts/safe-root-resync.mjs --clean-untracked --confirm-clean
```

Behavior:
1. All guards above run first.
2. `git clean -fdn` (dry-run) prints the would-delete list to stdout.
3. **Without `--confirm-clean`**: the helper stops here, returns `{cleanPreviewOnly: true, cleaned: false}`, and deletes nothing — review the list first.
4. **With `--confirm-clean`**: `git clean -fd` runs and permanently removes those untracked files. **The `-x` flag is never appended** — no code path constructs it, so gitignored runtime state is always preserved.

## Exit codes

| Exit | Meaning |
|------|---------|
| 0 | Sync succeeded (or was already current); any `node_modules` repair completed or was unnecessary. |
| 1 | Aborted (`worktree_cwd`, `not_a_git_repo`), conflicted, or the `node_modules` repair did not complete after the sync — `repair_failed`, `repair_aborted_wipe_risk` (npm-ci wipe risk detected), or `repair_deferred_lock_contended` (another session held the npm mutex, so a racing install was refused). The sync itself is never rolled back; re-run after contention clears or run `npm install` manually. |

## Worktree guard detail

The script discriminates a shared root from a worktree by inspecting `.git`:
- **Directory** → shared root → resync permitted.
- **File** → worktree (contains `gitdir: ...` pointer) → **HARD ABORT**, returns `{ok:false, aborted:'worktree_cwd'}`. No git operation is run.

This prevents running clean from inside a worktree where the `.git` file points to the main repo's gitdir.

## Restore tail (FR-2)

After a successful sync, the helper runs a fail-open tail:

1. **Coordinator pointer restore** — calls `restoreCoordinatorPointer` from `scripts/hooks/post-checkout-role-restore.cjs`. If the current session is DB-confirmed (`metadata.is_coordinator=true` in `claude_sessions`), rewrites `.claude/active-coordinator.json`. No-ops for non-coordinator sessions. Errors are caught and logged — never abort the completed sync.

2. **node_modules health + repair** — calls `checkNodeModules()` from `lib/execute/execute-preflight.mjs` (dynamic `@supabase/supabase-js` import probe). If the probe fails:
   - Acquires the cross-session npm mutex (`lib/npm-install-lock.cjs`). **The install runs ONLY when THIS session owns the lock** (`acquired === true`). If another session holds it, the helper waits, re-checks (the holder may have repaired it), then tries once more to own it.
   - If the lock stays held by another session (or the claim errors), it bails `repair_deferred_lock_contended` and exits non-zero **without** running a racing double-install — never releasing a lock it does not own.
   - Gates on `npmCiWouldWipeSharedStore` — if wipe risk is detected, aborts (`repair_aborted_wipe_risk`) loudly without running the install.
   - Runs `npm install` (NOT `npm ci`) with a timeout **bounded strictly below the npm-mutex `LOCK_TTL_MS`** (`NPM_INSTALL_TIMEOUT_MS = LOCK_TTL_MS − 20s`). This guarantees the install cannot outlive the lock's exclusivity window — otherwise a second waiting session would auto-expire our still-held lock at the TTL and start a concurrent install on the shared `node_modules`. If a real install can't finish in that window it is killed → `repair_failed` (loud, non-zero) and the operator re-runs `npm install` manually, serialized, outside the race.
   - Releases the mutex in a `finally` block.
   - On persistent failure (`repair_failed`): logs LOUD to stderr and exits non-zero — never silent, never rolls back the completed sync.

## Dependency injection (for tests)

All I/O seams are injectable via `safeRootResync(opts)`:

| Seam | Default | Purpose |
|------|---------|---------|
| `opts.exec` | `execFileSync('git', args)` | Git runner |
| `opts.fs` | `node:fs` | Filesystem (for `.git` discriminator) |
| `opts.supabase` | loaded from `.env` | DB client |
| `opts.npmInstall` | `execFileSync('npm', ['install'])` | npm runner |
| `opts.cwd` | `process.cwd()` | Working directory (applies to the DEFAULT exec + fs/guard/restore; an injected `exec` owns its own cwd) |
| `opts.cleanUntracked` | `false` | Opt-in: run the `-fdn` dry-run preview |
| `opts.confirmClean` | `false` | Second opt-in (with `cleanUntracked`): run the ACTUAL `-fd` clean |
| `opts.writePointerFileFn` | `writePointerFile` (real) | Coordinator-pointer writer — tests inject a mock so the real `.claude/active-coordinator.json` is never touched |
| `opts.checkNodeModulesFn` | `checkNodeModules()` | Health probe |
| `opts.acquireLockFn` | `acquireLock(...)` | npm mutex |
| `opts.waitForLockFn` | `waitForLock(...)` | npm mutex wait |
| `opts.releaseLockFn` | `releaseLock(...)` | npm mutex release |
| `opts.sessionId` | `resolveOwnSessionId()` | Session override |

## What this replaces

Do NOT use:

```bash
# BANNED — deletes node_modules, .claude/active-coordinator.json, .env:
git clean -fdx

# BANNED — npm ci wipes node_modules and runs rm -rf first, bricking other sessions:
npm ci
```

Use `npm run resync:safe` instead.
