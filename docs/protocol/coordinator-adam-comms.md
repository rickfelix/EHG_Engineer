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

> This lane is one of the canonical channels organized under
> `docs/protocol/crew-comms-routing-protocol.md` (the 5 bounding rules: defined lanes,
> hop-minimization, sender-stamped reply-class, silence-by-default, escalation ladder).
> Read that doc first for the cross-role picture; this doc is the Adam↔coordinator
> wire-level contract.

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

## Presence + grounding signals — a SHARED protocol capability

`lib/coordinator/presence-grounding-signals.cjs` (SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001)
is the single shared module any role-session (Adam, coordinator, Solomon) calls for three
complementary grounding signals — resolving the DISRUPTION of ambiguous silence (not latency: a
slow responder feels fine if the sender can SEE they are present + working; Clark & Brennan
grounding-in-communication). Complements the adaptive-comms-cadence helper above, which fixed
RECEIPT LATENCY; this fixes PRESENCE/ACKNOWLEDGMENT/BACKCHANNEL.

- **Read-receipt echo** — `getReadReceipts(supabase, sessionId, opts)` surfaces
  `session_coordination.read_at` back to the SENDER of a message (rows this session sent that
  have since been read). Builds ON the existing two-stage-ACK contract above rather than adding a
  parallel receipt mechanism.
- **Presence / expectation indicator** — `derivePresence(session, opts)` (PURE) +
  `getFleetPresence(supabase, sessionIds, opts)` (I/O). Derives `active_now` / `parked` (+ the
  expectation window, e.g. "next self-check ~8min") / `away` by reusing `isSessionAlive` +
  `hasExpectedSilence` from `lib/fleet/session-liveness.cjs` — **never a new liveness derivation**.
  `getFleetPresence` follows the SAME fetch-then-pure-filter shape every existing
  `claude_sessions` liveness call site already uses (ordered + capped fetch, pure predicate in JS)
  — never an unfiltered select, never a bespoke server-side filter chain.
- **Ephemeral working/thinking backchannel** — `getWorkingSignal(session, opts)` (PURE read) +
  `lib/coordinator/working-signal-store.cjs` (write). The signal (e.g. "investigating your S17
  handoff, ETA ~5min") lives on `claude_sessions.metadata.working_signal`, deliberately **OFF**
  the durable `session_coordination` log — fire-and-forget, self-expiring (embeds `expires_at`,
  ~30min), never a chat message. **Writes go EXCLUSIVELY through the atomic
  `set_session_working_signal` RPC** (`jsonb_build_object` merge) — never a JS read-modify-write
  of the whole `metadata` object, which would clobber concurrent writers of sibling keys
  (`working_context`, role-handoff flags, `current_tool` — the same lost-update race the
  `working_context` RPC already fixed once for this table). Fail-soft: if the chairman-gated
  migration is unapplied, the writer reports `rpc_absent` and does nothing — never an unsafe RMW
  fallback.

**Wired consumers:** `scripts/adam-advisory.cjs status` and `scripts/solomon-advisory.cjs status`
(identical subcommand, same shared helper — no per-role reimplementation) print the target's
presence + the caller's own read-receipts + working-signal, and accept
`status --working "<body>" [--eta <ms>]` to stamp a new working-signal. `fleet-dashboard.cjs`'s
`ADAM ADVISORY INBOX` and `PENDING SOLOMON CONSULTS` renders add a `Presence` column sourced from
ONE batched `getFleetPresence()` call per render (not a per-row query).

**Preserves silence-by-default**: none of the three signals send a new `session_coordination`
message — they augment existing renders/queries only. Presence/working signals are ambient/
on-demand, not new chat spam.

## Cross-check protocol (SEE-SOMETHING / CONFIRM-ON-RELAY / PING-ON-SILENCE)

Exception-triggered mutual verification on this lane — not every message, only on these
triggers. Full rationale + live evidence: `docs/protocol/crew-comms-routing-protocol.md`
§ "Cross-check protocol".

- **SEE-SOMETHING** — if either side notices a claim from the other contradicts a stale
  read, a snapshot, or ground truth, flag it immediately rather than acting on it.
- **CONFIRM-ON-RELAY** — when the coordinator relays a message to/from Adam on behalf of a
  third party, it confirms back to the origin that the relay landed.
- **PING-ON-SILENCE** — a `reply-needed` message (see Reply-class below) left unanswered
  past its expected window is pinged, not silently assumed disagreed-with.

## Reply-class (sender-stamped)

Every message on this lane is sender-stamped with a reply-class: `fire-and-forget`
(no reply expected), `reply-needed` (async, PING-ON-SILENCE applies), or
`live-handshake` (sync-request eligible — see below). See
`docs/protocol/crew-comms-routing-protocol.md` § "Rule 3 — Sender-stamped reply-class"
for the full contract.

## Sync-request (live-handshake only)

`node scripts/adam-advisory.cjs request "<question>" --timeout <ms>` is this lane's
synchronous, bounded-timeout request mode — reserved for genuine `live-handshake`
exchanges, never for `reply-needed`/`fire-and-forget` traffic (those stay async via
`send`). On timeout, fall back to async rather than re-blocking — a sync-request against
a dormant/invocation-driven peer will time out by construction, since that peer cannot
answer until its next tick. **Never** issue a sync-request while already blocked on one
(mutual sync-requests deadlock). Full rules:
`docs/protocol/crew-comms-routing-protocol.md` § "Sync-request semantics".

## PID-cross-check (liveness-dispute resolution)

When the coordinator and Adam disagree on which session legitimately holds a role (a
`session_id` is a label, not ground truth), resolve via OS process enumeration and
on-disk session markers, not another DB read. Full protocol:
`docs/protocol/crew-comms-routing-protocol.md` § "PID-cross-check".
