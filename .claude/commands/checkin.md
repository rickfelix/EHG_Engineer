<!-- reasoning_effort: low -->

---
description: "Check in with the active coordinator: one deterministic handshake that resolves to claim / self-claim / idle. Use when a worker session starts, finishes an SD, or is told to 'check in'. Per SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001."
---

# /checkin — Deterministic worker check-in handshake

The worker-PULL counterpart to coordinator-PUSH. One verb that ALWAYS resolves to a single action and **never** waits on a human. Use it when:
- a worker session starts and needs work,
- a worker finishes an SD and needs the next one,
- the operator says "check in with the coordinator".

## Run it

```bash
node scripts/worker-checkin.cjs
```

(Equivalent: `npm run checkin`. No `--env-file` needed — the CLI self-loads `.env` via `lib/fleet/worker-status.cjs`. `CLAUDE_SESSION_ID` comes from the SessionStart hook.)

The CLI prints **one JSON object** describing the resolved action. It does the whole handshake itself: resolve the active coordinator (`lib/coordinator/resolve.cjs`), confirm callsign, register availability with an idempotent `payload.kind=roll_call` row (off the friction channel), then resolve work.

## Act on the result (NEVER stop to ask the human)

| `action` | What the CLI did | What you do next |
|----------|------------------|------------------|
| `resume` | You already claim `sd` | Run `node scripts/sd-start.js <sd>` to (re)attach the worktree, then continue that SD. |
| `claimed_assignment` | Claimed the coordinator's assigned `sd` via `claim_sd` | Run `node scripts/sd-start.js <sd>`, load phase context, build it. |
| `self_claimed` | No assignment, so claimed the top of `sd:next` (`sd`) | Run `node scripts/sd-start.js <sd>`, load phase context, build it. |
| `idle` | Nothing claimable right now | Call `ScheduleWakeup(delaySeconds=recommended_wakeup_seconds)` and proceed — do **not** wait on a human. On the next wake, run `/checkin` again. |
| `error` | `CLAUDE_SESSION_ID` missing or DB unavailable | Report the `error` field; do not loop blindly. |

This is an autonomous-fleet contract: a `/loop` worker must keep moving. Decide from the JSON, act, and proceed. Never end a check-in by asking the operator what to do (no human watches the loop window).

## Two-way (optional)

When `COORDINATOR_TWOWAY_V2=on` (set in `.claude/settings.json` env), you can also ask the coordinator a question and await a reply:

```bash
node scripts/worker-signal.cjs request "<question>" --timeout 30000
```

## What it writes

A single `session_coordination` row, `message_type=INFO`, `payload.kind=roll_call` (deliberately **no** `payload.signal_type` / `intent_action`, so the friction signal-router and the deconfliction sweep never scoop it). Re-running within 5 minutes is a no-op (idempotent).

## Implementation

Thin wrapper around the worker-checkin CLI:

```bash
node scripts/worker-checkin.cjs
```
