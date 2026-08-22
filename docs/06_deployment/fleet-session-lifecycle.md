---
category: deployment
status: approved
version: 1.1.1
author: EXEC (Alpha-2) — SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001; updated by SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001
last_updated: 2026-08-21
tags: [deployment, fleet, sessions, kill, restart, reconcile, operations, console-reaper]
---
# Fleet session lifecycle — kill, restart, reconcile

Before this SD, closing the terminal window was the only way an operator could end a fleet
session, and it **stranded the work**: the claim stayed held, the work item stayed advancing, and
uncommitted WIP in the seat's worktree was simply lost.

Chairman-directed design, 2026-07-26. The investigation that produced it refuted 24 claims before
synthesis — including "there is no kill primitive", which was wrong. **Three of the four
capabilities were substantially built already; the gap was exposure and wiring, not construction.**
That framing matters operationally: if something here looks missing, look for an unwired module
before building a second one.

## The verbs

| Need | Command | Default |
|---|---|---|
| End a session, preserving its work | `node scripts/fleet-kill.mjs <session-id> [--reason "…"] [--dry-run]` | **OFF** — `FLEET_GRACEFUL_KILL_ENABLED=on` |
| Replace a session, carrying its conversation | `restart()` / `relaunchUnderProfile()` / `drainAndRestart()` in `lib/fleet/spawn-control.js` | on |
| Reconcile seats against reality | FR-5 seat reconciliation | on |

`fleet-kill` is **operator-initiated only**. No watchdog, sweep or cron may reach it — a policy
ratified twice in `stale-session-sweep.cjs` and enforced by the fact that its only production
importer is the CLI itself. It has its own flag; `FLEET_CANARY_KILL_ENABLED` deliberately cannot
enable it, because that flag's canary-only assert is what keeps drills off production seats.

## The kill order IS the safety property

Not an implementation detail — the sequence is what makes the verb safe to run on a working seat:

**identify → sample → preserve → release → reset → kill → record**

- **identify** — if `claude_sessions.pid`, the SessionStart marker and the live `claude.exe` image
  set disagree, the kill **refuses and names the disagreement**. A disputed pid is never guessed at.
- **preserve** — `prepark-wip` commits and pushes the seat's WIP *before* anything is released or
  signalled. An **unrecoverable** tree HALTS the whole operation with nothing released and nothing
  terminated. The property that matters is *durability*, not pushability: work committed locally is
  preserved, so a dirty tree with no remote proceeds once committed.

  **A session with no `worktree_path` has nothing to preserve, and must not halt.** `wasDirty` is
  decided by its own check (`isWorktreeDirty`, `scripts/fleet-kill.mjs`) rather than an
  unconditional `false` — correct for a seat *with* a worktree, but that alone made every seat
  *without* one (9 of 11 live sessions, measured at the time) permanently unkillable: `prepark-wip`
  had nothing to run against, `pre.action` read `'noop'`, and a noop was read as non-durable
  regardless of cause. The fix is a `hasWorktree` short-circuit: no `worktree_path` → `wasDirty`
  is `false` by construction and the noop is durable *because there was nothing to lose*, not
  because a check ran and happened to pass. A `noop` for any other reason (a protected branch, an
  unrecoverable push) still reports non-durable and still halts.
- **release → reset** — the claim is released before the work item is handed back, and the hand-back
  is skipped entirely if the release was not proven.
- **record** — a `fleet_verb_stop` event is the durable record that the kill happened.

A test pins this order, so an order regression fails CI rather than reaching a seat.

## Two things that will surprise you

### "Graceful" was a name before it was a behaviour

The kill originally went through `killProcess` → tree-kill, which on Windows is
`taskkill /pid N /T /F`. Two consequences that contradicted the docs:

- **`/T` killed every descendant** of the seat — dev server, leo-stack, background shells.
- **The signal argument is ignored on win32**, so the documented "SIGTERM, then escalate to
  SIGKILL" was two identical *forced* kills. The agent never got a chance to flush.

Use **`killProcessOnly`** (`lib/utils/process-utils.js`) for anything session-shaped. It targets one
process, and `taskkill /PID n` *without* `/F` is the genuine Windows analogue of SIGTERM, with `/F`
reserved for the escalation — so the distinction a caller writes is the one that happens.
`killProcess` still exists for callers that genuinely want a process tree.

### A restart used to leave the predecessor running

Restart retired the old **row** — the singleton mutex, or a `status='released'` update — and never
touched the old **process**. Two claude processes then held one seat while only one had a live row,
and the survivor kept heartbeating its claim, kept its worktree, and was **invisible to every gauge
that reads the registry rather than the process table**.

`retirePredecessorProcess` now runs at the end of both restart paths. It is deliberately
conservative:

- It runs **only after** the replacement is confirmed live *and* succession actually completed. A
  `hold_old` verdict leaves the predecessor running on purpose. Terminating first would, on a dry
  run or a failed spawn, kill the incumbent and leave the seat empty — worse than the defect.
- It is **fail-closed on identity**. A pid is signalled only when the process table positively says
  it is still claude. `NO_MATCH` means it already exited. **`PROBE_FAILED` refuses** — pids are
  recycled, and killing one we cannot identify takes out an unrelated process.
- An unverifiable outcome reports `unverified` rather than attesting a clean succession. The
  outcome appears on the restart's verb event and return value; **silence here would be the defect**.

This is not the FR-2 graceful kill and does not call it. That entrypoint stays operator-only; this
is restart completing its own contract on a process it has already replaced.

## Restart carries the conversation

`claude_sessions.session_id` **is** Claude Code's resume token — not `metadata.resume_uuid`, which
is populated on 1 of 13,025 rows and would silently cold-start anything that read it. A repo-wide
test enforces that nothing reads it — widened to catch **aliased** reads too, since a destructure
or a renamed local variable reading `resume_uuid` cold-starts identically while being invisible to
a literal-property-access detector. One legitimate read is allowlisted with its rationale recorded
alongside it: `lib/fleet/session-registry-adapter.js`'s `resume_uuid: meta.resume_uuid || null`
forwards the field for storage — it never treats it as the resume token. The detector is not
exhaustive against every aliasing shape (destructuring, `this.meta`, optional chaining); see the
"KNOWN RESIDUAL LIMITATION" comment in `lib/fleet/resume-context.test.js` for what remains
unguarded and why it is believed latent, not live.

- The transcript's existence is proven by a **real `stat`**, never inferred from the id.
- A restart with a token emits `--fork-session` with a **fresh** `--session-id`; re-registering
  under the old id would let a health check pass against the old row's warm heartbeat.
- The transcript slug derives from the **main worktree root**, never `.worktrees/<id>` — a worktree
  path resolves to a directory that never exists, which silently cold-started every worktree seat.
- A missing transcript cold-starts **and says so** (`fleet.restart.resume_plan`, logged
  unconditionally). A silent cold start is a defect, not a fallback.

Resolution lives in `spawnReplacement`, the single choke point, so `restart`,
`relaunchUnderProfile`, `canaryRestart` and `drainAndRestart` all inherit it. Placing it in
`restart()` covered only three of the four — **coverage by call-routing is not coverage of the
invariant**.

## Console reaping (adjacent, separate mechanism)

Not part of the kill order above — a **different** problem (an orphaned, empty Windows console
with no session attached to it at all, vs. a live seat's own graceful exit). `reapEmptyConsoles`
(`lib/fleet/console-reaper.mjs`) declares a console dead only on the AND of two independent legs
(absent from the `claude.exe` image set, AND `last_tool_at` unmoved across a ≥10-minute sampling
window) and re-checks each candidate immediately before killing, so a stale scan cannot destroy
live work — reaping is asymmetric-safe by construction, since "contains no process" means a false
positive has nothing to lose.

Gated by `FLEET_CONSOLE_REAPER_ENABLED` (default off, checked inside the function that actually
kills — not only in its caller, so a future second caller cannot bypass it). Scheduled via
`node scripts/setup-console-reaper-task.mjs [--interval-minutes 30]` under a session-0 principal
(`SYSTEM`); `--status` / `--remove` roll it back. Registering it under a plain named-user account
is refused by construction (`lib/fleet/console-parentage.mjs`'s `validateScheduledTaskPrincipal`)
— that principal type is the exact leak mechanism this reaper exists to stop, so there is no
non-elevated fallback route; registering the task requires an Administrator prompt.

Capturing a console's parentage *at creation time* (rather than reaping it later) is a separate
mechanism with its own live-drill doc: `docs/protocol/console-creation-watcher-drill.md`
(`SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001`).

## Operating notes

- **Never replay a dead window's shell history to restart a killed session.** After a
  non-graceful kill (e.g. `Stop-Process`), the window's last command still carries
  `--session-id <uuid>` for an identity that already has a transcript on disk — the CLI
  refuses to reuse it **by design**, and there is nothing to safely clear (deleting the
  transcript or its `session-env`/`file-history` companions destroys history, not just a
  lock). Close the dead window (`Ctrl+D` / `exit`) and open a **genuinely new** one, or drive
  the restart through `restart()` / `fleet-kill.mjs` above — both mint a fresh `--session-id`
  on every (re)start instead of pinning a stored one (QF-20260822-494).
- Rehearse with `--dry-run` first; it exercises identify/sample/preserve without signalling.
- If a session reports `unauthorized` rather than dying, check the profile's token `expiresAt` —
  `claude auth status` reports identity happily while every API call 401s.
- A refusal is a **result**, not a failure of the tool. `refused` with a named reason is the design
  working: it means the system declined to act on something it could not verify.
- The Fleet Panel's "Add session" button surfaces *why* a singleton request was allowed or refused
  via the `add-session` response body's `uiLabel` field — e.g. a "stale-but-present holder" label
  when the existing Adam/Solomon row's heartbeat is old enough to permit a second spawn. The label
  is server-decided and rendered verbatim; the panel never re-derives the role/singleton decision
  client-side. Two corrections found by mutation-tested peer review after this doc first shipped:
  the label renders in the same grey status-line color as every other message
  (`.fp-status-line` uses `--sv-muted`, not the `--sv-warn` amber token this doc previously implied)
  and only appears AFTER the add-session POST has already succeeded — post-hoc confirmation, not a
  pre-click warning. `uiEnabled`/`holderIsFresh` ride along in the same response body but have no
  reader anywhere in `fleet-panel.js` — by construction they cannot: they arrive in the response to
  the action already taken, so no moment exists at which either field could gate the button first.
