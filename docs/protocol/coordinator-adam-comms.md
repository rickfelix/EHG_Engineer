---
category: documentation
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-06-09
tags: [documentation, protocol]
---

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
| **Drain inbox** (full-lane, durable) | `node scripts/adam-advisory.cjs inbox` | **The recurring inbox-monitor tick.** Drains BOTH the reply lane AND coordinator-directive kinds (the imported `DIRECTIVE_KINDS` allowlist) targeting this Adam session with `read_at IS NULL` — AND-only server filters + JS lane classification (no `payload->>kind` `.or()`/`.in()`). Stamps `read_at`=DELIVERED; directives keep `acknowledged_at` NULL (two-stage ACK — recoverable via `read-adam-directives.cjs` until actioned). |
| **Drain replies** (reply-lane only, back-compat) | `node scripts/adam-advisory.cjs replies` | Drains only `coordinator_reply` / `payload.reply_to` rows targeting this Adam session with `read_at IS NULL`. Subset of `inbox`. Consumes (stamps `read_at`). |

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
node scripts/adam-advisory.cjs inbox                                         # drains the full lane (replies + directives)
```

## Receipt contract — ALL directive kinds (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001)

The two-stage ACK above is not advisory-specific. For **every** directive kind
(`coordinator_request`, `work_assignment`, `adam_action_required`, `coordinator_reminder`,
`coordinator_to_adam` — the canonical list is `DIRECTIVE_KINDS` in
`lib/fleet/worker-status.cjs`, **import it, never duplicate it**), in **both** directions:

| Marker | Meaning | Who stamps it |
|--------|---------|---------------|
| `read_at` | **DELIVERED** — a render/poll surfaced the row to the target | any poll/render (inbox hook, dashboard) |
| `acknowledged_at` / `payload.actioned_at` | **ACTIONED** — the agent genuinely processed it | ONLY the agent that actioned the row |

No poll/drain path may ever stamp `acknowledged_at` on a directive kind (FR-3 —
the inbox hook's kind-allowlist enforces this; the sender-type allowlist that auto-acked
5 chairman directives unseen is dead, per QF-20260610-545).

**Sender-side receipts:** an outbound row unread (`read_at IS NULL`) at a **live** target
for 10+ minutes is UNDELIVERED — surfaced by `node scripts/fleet-dashboard.cjs inbox`
('UNDELIVERED OUTBOUND') and the hourly review. Pure selector:
`lib/coordinator/receipts.cjs findUndelivered`.

## Correlation echo — replies carry BOTH keys

Every reply writer echoes the request's correlation under **both** `payload.reply_to`
(canonical) **and** `payload.correlation_id`, and await matchers accept either key
(forgiving matcher, kind-filtered). Adam answers an inbound `coordinator_request` with
`node scripts/adam-advisory.cjs send "<answer>" --reply-to <correlation_or_row_id>` —
the echo overrides the advisory's fresh correlation. Live evidence behind this rule:
158/166 `coordinator_reply` rows in one week lacked `reply_to` (hand-rolled inserts),
so awaiting senders never matched them.

## Dead letters — never silently deleted

The stale-session sweep no longer hard-DELETEs unread rows targeting dead/gone sessions.
It stamps `payload.dead_letter=true` (+ `dead_letter_at`, `dead_letter_reason`,
`original_target`), stamps `read_at` (drain marker), and backfills `expires_at = now+7d`
when NULL so the audit trail is reaped after a week. Surfaced by the coordinator inbox
section 'DEAD-LETTERED (24h)' — re-send to the successor session if still relevant.

## Adaptive comms cadence — a SHARED protocol capability

`lib/coordinator/adaptive-comms-cadence.cjs` (SD-LEO-INFRA-ADAPTIVE-COMMS-CADENCE-SHARED-PROTOCOL-001)
is the single shared decision any session (Adam, coordinator, Solomon, or an opted-in worker)
calls to compute its own next self-scheduled check-in interval, instead of always waiting a
full fixed baseline tick even during a live back-and-forth:

- `computeAdaptiveCadence({ sentPendingReply, receivedUnactioned, lastActivityMs, threadOpenedAtMs, nowMs, opts })`
  — PURE, no I/O. Returns `{ intervalMs, reason, tight }`: **TIGHT** (default 2.5min) while a
  thread is genuinely open, **BASELINE** (default 15min) when quiet. A hard **CAP** (default
  30min) forces a fallback to baseline once a thread has been open longer than that, so a
  never-resolving thread can't pin a session in tight-poll forever (defeats cycle-down).
- `getCommsActivitySignals(supabase, sessionId, opts)` — the companion I/O helper. Detects: a
  sent `payload.reply_requested=true` row with no later row echoing `payload.reply_to` back to
  it (sentPendingReply); a received row with `acknowledged_at IS NULL` inside the recent window
  (receivedUnactioned); the most recent bidirectional activity timestamp. **Fail-open**: any
  query error resolves to signals that compute to baseline — never blocks the caller's tick,
  never accidentally pins a session tight on an error.

**Tightening is SELF-SCHEDULED RE-CHECK, not a retuned cron.** A `CronCreate`-armed cadence
can't be retuned mid-flight from Node, so each consumer reads the recommendation and re-arms
its own next wakeup on top of its existing baseline-armed tick — this is layered on, not a
replacement for, the documented `*/15` inbox-monitor cadence.

**Wired consumers:**
- `scripts/worker-checkin.cjs` (live, opt-in): the idle-path `recommended_wakeup_seconds` the
  `/checkin` skill reads for its `ScheduleWakeup` tightens when this worker's own session has an
  active reply-pending thread — e.g. awaiting a coordinator reply on a blocked-item question.
  **Additive only**: never loosens the existing belt/claim-driven recommendation, never touches
  claim acquisition or heartbeat cadence.
- Adam's / Solomon's inbox-monitor ticks and the coordinator's own comms loop are documented
  consumers of the same shared helper — each self-schedules a tighter re-check on top of its
  baseline-armed cron while a thread is open, using the identical `computeAdaptiveCadence` +
  `getCommsActivitySignals` pair (never a per-role reimplementation).

**Preserves silence-by-default**: the helper computes an interval only — it never itself sends
a message, so message volume/chattiness is completely unaffected; only receipt latency changes.
