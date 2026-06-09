# Coordinator ↔ Adam comms lane (canonical)

> Source of truth for the Adam advisory channel. Both `/coordinator` and `/adam` startup
> print a summary of this lane (FR-7), so neither side has to reverse-engineer it.
> SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001.

## What this lane is

A **symmetric, resilient** advisory channel over `session_coordination` `INFO` rows, kept
**off** the worker-friction signal-router and the deconfliction sweep (every payload carries
`payload.kind` but **never** `payload.signal_type` or `payload.intent_action`).

| Direction | `payload.kind` | sender_type | target_session |
|-----------|----------------|-------------|----------------|
| Adam → coordinator (advisory) | `adam_advisory` | `adam` | active coordinator session_id, or `broadcast-coordinator` sentinel |
| coordinator → Adam (reply) | `coordinator_reply` | `coordinator` | the Adam session_id |

## Two-stage ACK — `actioned_at` is the only retirement

An advisory is **delivered** when `read_at` is stamped (a coordinator render saw it) and
**actioned** only when `payload.actioned_at` is stamped. The re-surface gate is
`payload.actioned_at IS NULL` — so a parked-cron inbox render can no longer silently retire
an unactioned advisory. This mirrors the action-required two-stage ACK in
`lib/coordinator/adam-action-ack.cjs` (`read_at` = DELIVERED, `actioned_at` = ACTIONED).

The canonical selector (coordinator side):

```
session_coordination
  WHERE payload->>kind = 'adam_advisory'
    AND payload->>actioned_at IS NULL
    AND target_session IN (<coordinatorId>, 'broadcast-coordinator')
```

Shared helper: `lib/coordinator/adam-advisory-store.cjs`
(`selectUnactionedAdvisories` / `fetchAdvisory` / `stampActioned`).

## Coordinator verbs

| Verb | Command | Effect |
|------|---------|--------|
| **Peek** (read-only) | `node scripts/read-adam-advisories.cjs` | Lists unactioned advisories. Stamps **nothing** — re-running shows the same rows. |
| **Inbox render** | `node scripts/fleet-dashboard.cjs inbox` | Lists unactioned advisories; stamps `read_at` (DELIVERED) but never `actioned_at`. |
| **Ack [+ reply]** | `node scripts/coordinator-ack-adam.cjs --advisory <id> [--reply "<body>"]` | Stamps `payload.actioned_at` (retires it). With `--reply`, also writes a `coordinator_reply` to Adam. |
| **Reply by advisory** | `node scripts/coordinator-reply.cjs --advisory <id> "<body>"` | Auto-resolves the Adam target + `correlation_id` from the advisory row; sends a `coordinator_reply`. |

The `--reply`/reply legs are gated behind `COORDINATOR_TWOWAY_V2=on`. The ack-stamp works
regardless of the flag.

## Adam verbs

| Verb | Command | Effect |
|------|---------|--------|
| **Send** (fire-and-forget, replyable) | `node scripts/adam-advisory.cjs send "<body>"` | Inserts an `adam_advisory` carrying `payload.correlation_id` (replyable) but **not** `expects_reply`. |
| **Request** (await a sync reply) | `node scripts/adam-advisory.cjs request "<question>" [--timeout <ms>]` | Same, plus `expects_reply=true`; synchronously awaits a `coordinator_reply`. |
| **Drain replies** (durable reader) | `node scripts/adam-advisory.cjs replies` | Drains `coordinator_reply` rows targeting this Adam session with `read_at IS NULL` — recovers replies that arrived after a sync await timed out. Consumes (stamps `read_at`). |

## Durable reply path (no lost replies)

`scripts/hooks/coordination-inbox.cjs` no longer universally skips `coordinator_reply` for an
**Adam** session (`&& !amAdam` on the skip), so a late reply surfaces with `read_at` left
NULL and is recovered by `adam-advisory.cjs replies`. **De-dup invariant:** every
`coordinator_reply` is consumed **exactly once** — both the durable reader and the inbox gate
on `read_at IS NULL`, and the request-mode `awaitCoordinatorReply` stamps `read_at` when it
consumes. Worker (non-Adam) sessions are unchanged — they still skip `coordinator_reply`
(their own `awaitCoordinatorReply` consumes it).

## Validated writer

The advisory insert routes through `lib/coordinator/dispatch.cjs` `insertCoordinationRow`, so a
stale/dead coordinator UUID is refused with `DISPATCH_TARGET_UNKNOWN` instead of dead-lettering.
The `broadcast-coordinator` sentinel (no live coordinator) is allowed and short-circuits validation.

## Quick demo

```bash
# Adam
node scripts/adam-advisory.cjs send "queue is shallow — consider sourcing"   # -> advisory_id

# Coordinator
node scripts/read-adam-advisories.cjs                                        # peek (stamps nothing)
node scripts/coordinator-ack-adam.cjs --advisory <id> --reply "sourcing now" # retire + reply

# Adam
node scripts/adam-advisory.cjs replies                                       # drains the reply
```
