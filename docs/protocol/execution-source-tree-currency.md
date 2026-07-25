# Execution-source tree currency — what reads from a tree, not how far behind it is

**Status:** Approved · **Version:** 1.0.0 · **Provenance:** SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001

> Companion to [`singleton-stale-tree-remediation-policy.md`](./singleton-stale-tree-remediation-policy.md).
> That policy governs a **singleton role-session** whose staleness means its own role contract
> has drifted, and it prefers supervised relaunch over in-place sync. Nothing here changes that.
> This document covers the case that policy does not: a tree from which **other processes load
> and execute code**.

## The discriminator

**Classify a tree by WHAT READS FROM IT, not by how far behind it is.**

| Tree kind | What reads from it | Staleness rule |
|---|---|---|
| **STANDBY** | Nothing executes from it. Its work is DB-driven and comms-hosted; the checkout is a vantage point, not a runtime. | **May drift.** Treat `origin/main` as code-truth, read it when you need to know what shipped, and do not fight the drift. Remediate by supervised relaunch, per the singleton policy — not by an in-place pull. |
| **EXECUTION-SOURCE** | Something **loads code out of it or spawns from it**: a `node scripts/…` invocation, a spawned session's start directory, a script resolved by path at runtime. | **Must be current, or the operation refuses.** Its HEAD *is* the code identity of whatever runs. |

A tree can be hundreds of commits behind and be perfectly fine, or three commits behind and
actively dangerous. The commit count is not the signal. The question is whether anything
*executes* from it.

## Why this is an invariant and not a gauge

> "NO CODE PATH THAT EXECUTES SHOULD DEPEND ON A HUMAN OR A LOOP REMEMBERING TO PULL. A gauge
> that detects staleness plus a loop that remediates it is still a system whose answer to
> *is-the-spawn-path-current* is *probably, if someone ticked recently*. That is a habit with
> monitoring, not an invariant."

A faster poll does not satisfy this. Any polling remedy leaves a window proportional to the
merge rate, and **the merge rate is highest exactly when the window matters most** — a busy
fleet is precisely when spawns happen. Measured 2026-07-25: 26 commits landed on `origin/main`
in two hours, 111 in a day.

Note also that a `post-merge` git hook **cannot** solve this here: `gh pr merge` merges
*remotely* on GitHub, so no local merge occurs and the root's HEAD does not move at merge time
at all. It moves only when something later pulls.

## What went wrong when this was not enforced

Both incidents on 2026-07-25 were **shipped, merged, ancestry-verified — and still inert**:

1. **The canary fix (PR 6464).** Merged while the root was 6 commits behind. Canaries spawned in
   that window still inherited the marker the PR removed, and died as ghosts.
2. **The worktree-reaper opt-out marker.** Believed load-bearing on merge. The reaper *also*
   executes from the root, which was behind and contained **zero occurrences** of the
   marker-handling code — so the protection was physically absent from the file being run. The
   reaper deleted a worktree that marker existed to protect.

One root cause: **execution reads the root; verification reads `origin/main`.**
**Verifying a fix at the merge is not verifying it at the consumer.**

## The rule, applied

- **Spawn** — assert currency of the resolved start directory before spawning. Fast-forward when
  that is safe (clean **and** on `main`); otherwise **refuse**. Never mutate a dirty or
  off-branch tree: the shared root is chronically dirty, and a pull there can clobber a peer
  worktree's in-flight state.
- **Reap** — assert currency, and **refuse without healing**. The reaper runs unattended against
  a shared root, so a mutation there could collide with a peer; skipping a reap costs nothing
  because the next tick retries. A deletion cannot be undone by a later error message, so
  failing loud *after* the fact is not available — refusing beforehand is the only safe
  direction. **Destructive subsystems refuse; they do not fix.**
- **Fail closed, always.** Git missing, remote unreachable, timeout, detached HEAD, unparseable
  output, not-a-repository — every one of them means NOT current. There is no branch that
  returns "current" on uncertainty. A fail-*open* check reports success precisely when it could
  not tell, which is the failure mode this whole document exists to remove.
- **An escape hatch must cost something.** `FLEET_TREE_CURRENCY_BYPASS_REASON` is keyed on a
  *reason*, not a boolean, so an operator cannot silence the invariant with `FLAG=1`. When it is
  used the answer is **unknown-and-declared**, never "current".

## Coverage boundary — what this does NOT cover

Stated explicitly, because an unstated boundary is how a partial fix gets reported as complete,
which is this document's own thesis.

**Enforced today:**
- The `spawn()` verb in `lib/fleet/spawn-control.js`.
- The worktree reaper tick (`scripts/fleet/worktree-reaper-tick.cjs`).

> **Correction (adversarial review, pre-merge).** An earlier draft of this section claimed
> `spawn()` is the seam "which every live spawn path routes through." **That was false**, and
> two independent reviewers caught it. `lib/fleet/reboot-respawn-runner.js` and
> `scripts/fleet/worker-spawn-executor.cjs` both call `buildSessionLaunch` /
> `buildLiveSpawnInvocation` **directly** and launch via their own spawner, never entering
> `spawn()`. They are live OS-spawn paths and they are **not** guarded. Reboot-respawn is the
> highest-value uncovered case — a post-reboot respawn runs from a root that has not pulled
> since the machine went down. Recorded here rather than quietly dropped, because a document
> whose thesis is *state the boundary* had reproduced the exact failure it names.

**NOT enforced — each is a known gap, not an oversight:**

| Gap | Why it is not covered |
|---|---|
| **`reboot-respawn-runner.js`** and **`worker-spawn-executor.cjs`** | They call the launch builder directly and spawn themselves, bypassing the `spawn()` verb where the guard lives. Highest-value remaining gap: a post-reboot respawn runs from a root that has not pulled since the machine went down. |
| Spawns issued from **inside** a `.worktrees/` tree | A per-SD worktree is legitimately off-main and behind by construction — that is what a feature branch is. Guarding it would refuse every worktree spawn while proving nothing about this defect; both measured incidents were the shared root. |
| ~25 coordinator `STANDARD_LOOPS` (`scripts/coordinator-startup-check.mjs`) | Their prompts run bare `node scripts/…` at whatever cwd the coordinator holds. Not routed through any seam this SD touches. |
| `scripts/cron/eva-watcher-task.cmd` and generated Task Scheduler entries | The root path is hardcoded into a Windows scheduled task. A spawn-time assertion **structurally cannot reach it** — the process starts outside anything we gate. |
| The ~36 `CLAUDE_PROJECT_DIR`-resolved hooks | Exactly one redirects to the canonical root. The rest resolve to whatever tree started the session. |

Each of these is recorded as a follow-on. None of them is closed by this change, and the
invariant should not be described as fleet-wide until they are.
