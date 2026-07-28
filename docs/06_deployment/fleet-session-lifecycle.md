---
category: deployment
status: approved
version: 1.0.0
author: EXEC (Alpha-2) — SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001
last_updated: 2026-07-28
tags: [deployment, fleet, sessions, kill, restart, reconcile, operations]
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
test enforces that nothing reads it.

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

## Operating notes

- Rehearse with `--dry-run` first; it exercises identify/sample/preserve without signalling.
- If a session reports `unauthorized` rather than dying, check the profile's token `expiresAt` —
  `claude auth status` reports identity happily while every API call 401s.
- A refusal is a **result**, not a failure of the tool. `refused` with a named reason is the design
  working: it means the system declined to act on something it could not verify.
