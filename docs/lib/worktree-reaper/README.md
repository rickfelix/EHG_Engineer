# Worktree Reaper

**SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001**

Tiered cleanup of stale worktrees in the EHG_Engineer harness. Formalizes
what `cleanup-phantom-worktrees.js` reported read-only, plus four new
classifications the previous scripts did not cover.

## What it reaps

| Category | Signal | Stage |
|---|---|---|
| `nested` | Path contains `.worktrees/` more than once (worktree inside a worktree) | **1** auto-safe |
| `shipped-stale` | `git cherry -v origin/main` shows branch fully absorbed into main (typically squash-merged) | **1** auto-safe |
| `zombie-on-main` | Branch pinned to `main` + no active session claim | **2** reviewed |
| `orphan-sd` | `sdKey` does not resolve to any row in `strategic_directives_v2` or `quick_fixes` | **2** reviewed |
| `idle` | `max(last-commit, fs-mtime) > 7 days` + no claim + no unique unpushed commits | **2** reviewed |

## Invariants

1. **Dry-run by default.** Mutates nothing unless `--execute` is passed.
2. **CWD guard.** Must run from main repo root. Refuses to run from inside any
   worktree (defense-in-depth against PAT-WORKTREE-LIFECYCLE-001).
3. **Active-claim protection.** Any worktree whose path appears in
   `v_active_sessions` (heartbeat fresh within 2h) is ALWAYS skipped — even
   if it matches every other signal.
4. **Preserve-before-delete.** Untracked non-exempt files are copied to
   `scratch/preserved-from-<basename>/` before `git worktree remove` runs.
   Exempt patterns: `tmp-*`, `scratch-*`, `.claude/`, `.workflow-patterns`,
   `.worktree.json`, `.ehg-session.json`.
5. **Idempotent.** A second run on the same fleet state produces zero changes.

## Commands

```bash
# Audit (dry-run, default)
npm run worktree:reap

# Remove Stage 1 only (nested + shipped-stale)
npm run worktree:reap:execute

# Full cleanup (all categories)
npm run worktree:reap:full

# Legacy phantom-only mode (backward compatibility)
node scripts/worktree-reaper.mjs --phantom-only

# Custom idle threshold
node scripts/worktree-reaper.mjs --days 14
```

## Cadence integration (automated)

The reaper ticks on every 12th `stale-session-sweep` run (~1h at 5-min
intervals). Wired in `scripts/fleet/worktree-reaper-tick.cjs`, invoked from
`stale-session-sweep.cjs` right before `=== SWEEP COMPLETE ===`.

| Env var | Default | Effect |
|---|---|---|
| `WORKTREE_REAPER_ENABLED` | `true` | Master kill switch. Set `false`/`0`/`off` to disable sweep integration. |
| `WORKTREE_REAPER_EXECUTE` | _(unset)_ | `stage1` ⇒ auto-execute Stage 1; `stage2`/`all` ⇒ full cleanup. Default is dry-run even when the tick fires. |

Counter + last-run status persists at `.claude/worktree-reaper-state.json`.

## Output shape

- **stdout**: human-readable table with columns `Worktree | Branch |
  Categories | Dirty | Unpush | Age | Verdict | Keep`.
- **stderr**: JSON-lines — one record per worktree evaluated. Schema:
  ```json
  {
    "schema_version": "1.0",
    "timestamp": "ISO-8601",
    "worktree_path": "...",
    "branch": "...",
    "categories": ["nested", "shipped-stale", ...],
    "dirty_file_count": 0,
    "unpushed_commit_count": 0,
    "age_days": 30,
    "ship_status": "patch_equivalent_via_squash | absorbed_no_pr | not_on_main | cursor",
    "claim_status": "active | absent | n/a",
    "verdict": "keep | stage1_remove | stage2_remove",
    "reason": "...",
    "preserve_count": 0,
    "evidence": { ... }
  }
  ```

Combine with `2>>reaper.log` to archive records for retrospective mining.

## Architecture

```
stale-session-sweep.cjs (cron, every 5m)
  └─► scripts/fleet/worktree-reaper-tick.cjs (counter, every 12th)
        └─► scripts/worktree-reaper.mjs (enumerate → classify → protect → preserve → remove)
              ├─► lib/worktree-quota.js :: listActiveWorktrees
              └─► lib/worktree-reaper/detectors.js
                    ├─ isZombieOnMain     (AC1)
                    ├─ isNested           (AC2)
                    ├─ hasOrphanSD        (AC3)
                    ├─ isPatchEquivalentToMain (AC4)
                    └─ isIdle             (AC5)
```

## Not touched

- **Branches** — owned by `branch-cleanup-v2.js`. Reaper removes worktrees
  only; dangling branches flow to that pipeline.
- **`claude_sessions` rows** — owned by `stale-session-sweep.cjs`.
- **Git stashes** — persist per-repo, not per-worktree.
- **Cursor IDE worktrees** — `.cursor/worktrees/**` are always skipped.
- **`post-merge-worktree-cleanup.js`** — remains the per-SD post-`/ship`
  path. Reaper handles the long tail for everything else.

## Predecessor SDs

- `SD-LEO-INFRA-STALE-WORKTREE-LIFECYCLE-001` — 3 ad-hoc trigger points; reaper is the sweep-integrated reconciler.
- `SD-LEO-INFRA-UNIFIED-WORKTREE-LIFECYCLE-001` — provides `v_active_sessions` state; reaper consumes it.
- `SD-LEO-FIX-WORKTREE-QUOTA-COUNTER-001` — fixes counter drift; reaper removes the cause.
- `SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001` — creation-side atomicity; reaper complements with reclamation.
- `SD-LEO-INFRA-EXTEND-WORKTREE-ISOLATION-001` — worktree taxonomy reaper classifies.
