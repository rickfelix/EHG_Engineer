---
category: reference
status: approved
version: 1.0.0
author: session Bravo
last_updated: 2026-07-02
tags: [claim-lifecycle, rca, fleet]
---

# RCA: claim-steal despite 5 shipped claimant-side heartbeat fixes

**SD:** `SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001`

## Symptom

A live, actively-working session's claim on a Strategic Directive lapses past the 900s
(15min) TTL and gets stolen by a peer session's `/checkin` self-claim — even though the
original session was never dead. This has now recurred at least 3 times (the ADKAR-001-B
/ PR #5340 collision that sourced this SD, plus a fresh occurrence during this SD's own
sourcing session), despite 5 completed claimant-side TTL-heartbeat fixes
(`SD-LEO-INFRA-CLAIM-TTL-EXEC-HEARTBEAT-001`, `CLAIM-TTL-LONG-SUBAGENT-TICK-001`, and
others).

## Root cause 1 — PostToolUse heartbeat cannot fire mid-tool-call

`scripts/hooks/claim-heartbeat-on-tool.cjs` is a `PostToolUse` hook, throttled by
`lib/claim/heartbeat-throttle.cjs` to at most once per 120s. The throttle's own design
comment states this is "comfortably inside the 900s TTL even across slow tool gaps" — an
assumption that holds for ordinary tool calls (Bash, Edit, Read) but **not** for a single
Agent/Task-tool call to a sub-agent. From the primary session's perspective, an Agent
call to VALIDATION, REGRESSION, or retro-agent is *one* tool call — the `PostToolUse`
hook cannot fire until that call *returns*. A sub-agent chain that runs 10+ minutes
(observed directly: a REGRESSION sub-agent invocation that hit an API 529-Overloaded
retry storm) provides **zero intermediate heartbeat-refresh opportunity**, even though
the primary session is fully alive and actively orchestrating the whole time.

This is a distinct gap from the one `CLAIM-TTL-EXEC-HEARTBEAT-001` closed (no sub-agent
DB *write* in the window) — it is a **tool-call-boundary** gap, not a DB-write-boundary
gap.

## Root cause 2 — the raw `is_alive` flag is frequently stale between short CLI runs

`heartbeat-manager.mjs`'s `startHeartbeat()`/`stopHeartbeat()` are called by every
short-lived CLI invocation (`sd-start.js`, `handoff.js`, etc.) — each one starts the
30s-interval heartbeat at the beginning of the process and **explicitly flips
`is_alive` to `false`** when that process exits (`stopHeartbeat()`'s own log line:
"Stopped automatic heartbeat"). A worker session that drives many small CLI
invocations in sequence (the normal LEO-protocol pattern: `sd-start.js`, several
`handoff.js` calls, sub-agent orchestration in between) therefore has `is_alive=false`
in the DB for large stretches of its lifetime, *between* those CLI calls — even though
the session itself (and its underlying OS process) never stopped.

`scripts/worker-checkin.cjs`'s steal tiers (`adoptOrphanInProgress`, `isSdInFlight`)
queried this raw, frequently-stale `v_active_sessions.is_alive` flag directly to decide
whether a prior claimant was "live." Combined with root cause 1, this made the steal
succeed even against a fully-alive, actively-orchestrating session.

## Fix

Two-sided, this SD:

1. **Stealer-side guard** (`scripts/worker-checkin.cjs`): replaced the raw `is_alive`
   read with `isSessionAlive()` (`lib/fleet/session-liveness.cjs`), the existing
   read-time liveness SSOT — it additionally checks the live OS process via the
   session's `terminal_id`-derived PID, which stays accurate across both gaps above.
   Belt-and-suspenders: even a session `isSessionAlive()` correctly reports as dead
   must not be stolen from while it has real WIP — see `lib/claim/wip-detector.js`.
2. **foreign_claim reconciliation** (`lib/claim-validity-gate.js`): if a steal already
   happened, the next handoff attempt from the real WIP-holder self-heals the claim
   back automatically, rather than hard-failing.

## What this does NOT fix

The two root causes above remain latent — a single very-long sub-agent call between
short CLI invocations can still let `is_alive`/`heartbeat_at` go stale. This SD's fix
is the stealer-side backstop (belt-and-suspenders), not a claimant-side heartbeat
redesign (out of scope, per this SD's own scope text). A future SD could close the
remaining hole directly: a lightweight, tool-call-boundary-independent heartbeat (e.g.
a detached background timer process, or extending the claim TTL specifically for
`PLAN_VERIFICATION`-phase SDs where the sub-agent chain is structurally longer).
