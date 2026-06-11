<!-- Archived from: .claude/_reaper-enhancement-plan.md -->
<!-- SD Key: SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001 -->
<!-- Archived at: 2026-06-08T01:19:29.655Z -->

# Worktree Reaper: quick_fixes.status-aware reaping + junction-safe node_modules unlink

## Problem / Evidence (2026-06-07 fleet incident)

Two distinct reaper gaps surfaced during a live worktree-pool-pressure incident (pool at 19/20, near the cap that stalls sd-start fleet-wide):

1. Pool-clog: the reaper won't reap finished QF worktrees. 9 stale qf/QF-* worktrees clogged the pool. The reaper classified all of them no_match because each had unpushed-looking commits + dirty files, so it "won't risk unpushed work" and kept them. But cross-referencing quick_fixes.status showed 7 were completed and 1 was cancelled (work done or intentionally dropped), and 8 of 9 branches were already on origin (commits recoverable). The reaper had no visibility into QF lifecycle status, so finished worktrees accumulated until the pool nearly hard-stopped the fleet.

2. Junction landmine: git worktree remove wiped the MAIN checkout's node_modules. When pruning the 8 finished QF worktrees, git worktree remove followed a Windows directory junction (the worktree's node_modules is a junction pointing at the main checkout's node_modules, a per-worktree disk optimization) and deleted the junction target -- emptying the MAIN checkout's node_modules. This broke all node tooling running from the main checkout (LEO CLIs, hooks, coordinator/Adam comms) until a recovery npm install repopulated it. High blast radius (fleet-tooling halt), recovered but recurs on every prune.

## Scope (one SD, two FRs)

### FR-1 -- quick_fixes.status-aware reaping
A qf/QF-* worktree is eligible for reaping when its quick_fixes.status IN (completed, cancelled) AND its branch exists on origin (commits recoverable), even if the local worktree has unpushed-looking commits or dirty/untracked files. Conversely a QF with status=open, or a branch NOT on origin, is NOT auto-reaped -- for a non-origin branch, archive-push (git push origin <branch>) before reap, or skip.

### FR-2 -- junction-safe node_modules unlink before remove
Before git worktree remove, detect whether the worktree's node_modules (or any nested dir) is a junction/symlink and unlink the junction (remove the link, not the target) first -- so git worktree remove / --force cannot follow it and delete the main checkout's node_modules. Apply on Windows (directory junctions) and POSIX (symlinks).

## Acceptance Criteria
1. A qf/QF-* worktree whose quick_fixes.status is completed or cancelled AND whose branch is on origin is reaped, with a log line naming the QF + status.
2. A worktree whose QF is open, or whose branch is NOT on origin, is NOT silently reaped (archived-first or skipped, logged).
3. Regression guard: pruning a worktree whose node_modules is a junction leaves the MAIN checkout's node_modules fully intact (zero packages lost from main).
4. No behavior change for worktrees with genuinely unpushed work on an active (non-completed/cancelled) SD/QF.

## Notes
Reaper already exists (SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001, completed) -- this is a non-duplicate ENHANCEMENT (status-awareness + junction-safety), verified via verify-before-source. Origin: Adam chairman-lens diagnosis during the 2026-06-07 post-build-lifecycle reconcile; requested by the active coordinator (a315e7e7).
