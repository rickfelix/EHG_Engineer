---
category: Protocol
status: Approved
version: 1.0.0
author: coordinator + Claude Code
last_updated: 2026-07-02
tags: [protocol, comms, crew, adam, solomon, coordinator, chairman]
---

# Crew-comms routing protocol (canonical)

> The ORGANIZING layer the tactical comms mechanisms plug into. Chairman-directed
> 2026-07-01: "a documented method that we adhere to that makes sense given the roles
> of each individual" so 3-party comms does not grow chaotically. Per
> SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001.

## Why this doc exists

Pairwise comms (Adam↔coordinator) stays a clean back-and-forth. Adding a third
role-session (Solomon) expands touch-points combinatorially — pairwise channels grow
O(N²) with the number of participants. The individual tactical mechanisms that bound
chatter already existed and were proven live on 2026-07-01 (cross-check protocol,
sender-stamped reply-class, sync-request rules, PID-cross-check, adaptive cadence,
presence-grounding), but lived scattered across sessions with **no single documented
method on top**. This doc is that method: 5 bounding rules, each cutting chatter at a
different point, with the existing tactical mechanisms as their concrete implementation.

## The unified 3-way crew topology

Three long-lived singleton role-sessions, plus the chairman:

| Role | Function |
|------|----------|
| **Chairman** | Drives priority via cron-pasted directives. Works **through Adam** — never double-surfaced to Solomon or the coordinator directly. |
| **Adam** | SD sourcing + the chairman's funnel. Silence-by-default; sources and diagnoses, never claims/builds. |
| **Solomon** | Deep-reasoning oracle. Silence-by-default; proactive Mode-B backlog sweeps on a cron. Consulted for hard analysis/verdicts. Proposes, never executes. |
| **Coordinator** | Fleet dispatch, ranking, monitoring, worker-signal routing, QA/sweeps. |

All inter-role comms go over the `session_coordination` table (async by default). The
coordinator and Adam are invocation-driven (see Rule 2 below); Solomon runs a mix of
scheduled sweeps and drain ticks. See `docs/protocol/coordinator-adam-comms.md` and
`docs/protocol/coordinator-solomon-comms.md` for the pairwise wire-level contracts this
doc organizes.

## The 5 bounding rules

### Rule 1 — Defined lanes, not full mesh

Canonical role-based channels, each with a stated purpose — no improvised any-to-any
paths:

- **Chairman ↔ Adam** — the single chairman interface/funnel.
- **Adam ↔ coordinator** — dispatch/mechanics/fleet.
- **Adam ↔ Solomon** — deep-reasoning consult/advisory.

A session that needs to reach a role outside its defined lane routes through the lane
owner rather than improvising a new path.

### Rule 2 — Hop-minimization (the direct Adam↔Solomon channel)

The single biggest lever: an Adam↔Solomon exchange relayed through the coordinator is 2
hops plus a confirm-on-relay — roughly 3× the messages of a direct exchange, and it
carries a relay-drop risk (an ack-without-relay bug observed live). The direct
Adam↔Solomon channel graduates this from spec-only to built (see
SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B). **The coordinator stays a relay
only for messages that genuinely concern it** — dispatch, fleet mechanics, ranking — not
as a default hop for every cross-role exchange.

### Rule 3 — Sender-stamped reply-class

Every message is stamped by its sender with one of:

| Class | Meaning | Blocking? |
|-------|---------|-----------|
| `fire-and-forget` | No reply expected or chased | No |
| `reply-needed` | A reply is expected within a window; unanswered past it triggers PING-ON-SILENCE | No (async) |
| `live-handshake` | A synchronous, bounded-timeout reply is needed NOW | Yes (see Sync-Request below) |

This bounds the back-and-forth at the **source** — most messages need no reply at all —
and drives PING-ON-SILENCE deterministically instead of an ad-hoc guess.

**Implemented** (SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C). The taxonomy is a
frozen SSOT (`REPLY_CLASSES`) in `lib/coordinator/reply-class.cjs`, imported by every
payload builder that sends an inter-role message: `buildRequestPayload` /
`buildSolomonConsultPayload` / `buildIntentPayload` (`scripts/worker-signal.cjs`),
`buildAdvisoryPayload` (`scripts/adam-advisory.cjs`, `scripts/solomon-advisory.cjs`), and
`buildReplyPayload` (`scripts/coordinator-reply.cjs`). Each stamps `payload.reply_class`
from its existing mode/flag semantics (e.g. a synchronous `request`/`--await` call is
always `live-handshake`; a reply is always `fire-and-forget`; a coordinator-relay
broadcast is always `fire-and-forget`). Senders opt into `reply-needed` explicitly via
`adam-advisory.cjs send "<body>" --reply-class reply-needed [--reply-window-ms <ms>]`
(same flag on `solomon-advisory.cjs`; default window 2h, `DEFAULT_REPLY_WINDOW_MS`).
PING-ON-SILENCE is a single-fire sweep (`findOverdueReplyNeeded` +
`checkAndPingOverdueReplies`, same module) wired into the existing `adam-advisory.cjs
inbox` / `solomon-advisory.cjs inbox` recurring ticks: each tick checks the sender's own
outbound `reply-needed` rows for ones past `reply_expected_by` with no answering row yet,
sends exactly one threaded ping (`payload.kind=ping_on_silence`, itself
`fire-and-forget`), and stamps `payload.ping_sent_at` on the original row so it is never
re-pinged. No schema migration — all fields ride the existing
`session_coordination.payload` JSONB column; a legacy row with no `reply_class` reads as
`fire-and-forget` (never retroactively chased).

### Rule 4 — Silence-by-default + one-advisory-per-tick

Already encoded in each role's contract (CLAUDE_ADAM.md, CLAUDE_SOLOMON.md,
CLAUDE_COORDINATOR.md): a role-session only speaks when it has something that clears its
rationale bar, and surfaces at most one advisory per tick. This bounds volume
independently of the other 4 rules.

### Rule 5 — Escalation ladder

Adam → Solomon → Chairman. The three role-sessions absorb the mesh; the chairman
receives only the funnel (through Adam), never the raw N² chatter between the other
roles.

## Tactical layer (mechanisms this protocol organizes)

These already exist and implement one or more of the 5 rules above:

- **Cross-check protocol** (SEE-SOMETHING / CONFIRM-ON-RELAY / PING-ON-SILENCE) —
  implements Rule 3 (PING-ON-SILENCE keys off reply-class) and is a safety net across
  every lane in Rule 1.
- **Sync-request semantics** — implements the `live-handshake` reply-class in Rule 3.
- **PID-cross-check** — a reliability discipline supporting Rule 1 (settles which
  session legitimately holds a lane when two async reads disagree).
- **Adaptive comms cadence** (`lib/coordinator/adaptive-comms-cadence.cjs`) — bounds
  volume/latency under Rule 4 without violating silence-by-default.
- **Presence + grounding signals** (`lib/coordinator/presence-grounding-signals.cjs`) —
  resolves the disruption of ambiguous silence under Rule 4.

### Cross-check protocol (SEE-SOMETHING / CONFIRM-ON-RELAY / PING-ON-SILENCE)

Exception-triggered mutual verification between peers — not every message, only on
these triggers:

- **SEE-SOMETHING** — when you notice a peer's claim contradicts a stale read, a
  snapshot, or ground truth, flag it immediately rather than acting on it. (Caught live:
  a peer describing an active venture as "abandoned" off a stale vision timestamp; a
  "stuck/redundant" worker that had actually completed and added value.)
- **CONFIRM-ON-RELAY** — when you relay A→B on behalf of a peer, confirm back to the
  origin that the relay landed (closes the loop; the historical gap here was the
  ack-without-relay bug Rule 2's direct channel also removes for the Adam↔Solomon pair).
- **PING-ON-SILENCE** — if a `reply-needed` message goes unanswered past its expected
  window, ping. The async lane plus inbox-drain lag mean silence is not disagreement.

This protocol caught three real errors before they reached the chairman on 2026-07-01: a
shared-tree data-loss risk, a flapping-REST false-positive, and a jumped-the-gun
take-upstream false-positive.

### Sync-request semantics (live-handshake only; disengage-to-async against a dormant peer)

A blocking synchronous request (`request "<question>" --timeout`) is a **shared tool**
all three role-sessions may use — powerful but costly, since it blocks the sender
awaiting a reply.

- **When to use** — only for a genuine `live-handshake` (time-sensitive, need-a-reply-now
  coordination where blocking is worth it). Never for `reply-needed` /
  `fire-and-forget` — those stay async.
- **How** — always a bounded timeout; the sender is blocked meanwhile, so keep timeouts
  tight and purposeful; one open sync-request at a time per session.
- **When to disengage** — on timeout, fall back to async (post the message, drain the
  reply later). Do not re-block or retry-spin. A sync-request against an
  invocation-driven / dormant peer (one with no live listener between ticks — it only
  wakes on a chairman cron-paste or its own `ScheduleWakeup`) **will** time out, because
  such a session cannot answer until its next tick — prefer async to it. Proven
  2026-07-01: repeated 90s sync-requests from Adam to the coordinator timed out until the
  exchange moved to async with a tightened drain cadence.
- **Deadlock guard (critical)** — a session already blocked in a sync-wait cannot service
  an inbound sync-request (it is blocked). Never issue mutual sync-requests: do not open
  a sync-request while you are the target of one, or while already blocked on one. If
  both sides sync-request each other, they deadlock.

Mapping to Rule 3: `live-handshake` ⇒ sync-request-eligible; `reply-needed` /
`fire-and-forget` ⇒ async only.

### PID-cross-check (two-session liveness-dispute resolution)

A `session_id` is a **label**; the running PID plus an on-disk marker are **ground
truth**. When two sessions get different DB answers for "which session is live",
resolve via OS/disk, not the DB:

1. A filtered role query (`metadata->>role`, ordered by heartbeat desc) plus an explicit
   ID lookup.
2. OS process enumeration (e.g. `Get-Process claude`) — is the candidate's `cc_pid`
   actually running?
3. On-disk markers (`.claude/session-identity/<id>.json`, `.claude/pids/tick-<id>.json`).

No obtainable live PID, no on-disk marker, and no process started near the row's alleged
birth ⇒ a **dead phantom row**. This settled a real Solomon session-identity dispute live
on 2026-07-01 (one candidate was a phantom; the other, with a running PID, was the real
live Solomon).

### Reliability disciplines (verify the authoritative signal)

- **Schema/existence checks use the SQL layer** — `information_schema` / `to_regclass`,
  never a PostgREST REST head-count (`.select(count, head)`). The REST head-count
  false-positives on a missing table and flaps under PostgREST schema-cache lag /
  read-replica divergence. (Bit the coordinator live: a "table exists" REST read that
  flipped to `PGRST205` seconds later; the SQL layer showed it genuinely absent.)
- **Per-connection read-divergence is real** — the same query has returned different
  single rows to two different sessions (read-replica / pooler-snapshot / row-cap paging
  per connection). Do not stake a load-bearing decision on a single REST read.
- **OS/on-disk marker is the authoritative tiebreaker** whenever DB liveness/existence is
  ambiguous. A `heartbeat_at` timestamp in a row is not proof of a live process.

## Provenance

The 5 bounding rules were designed to organize protocols and reliability disciplines
battle-tested live on 2026-07-01 during the Solomon Mode-B activation, a gate-bug sweep,
and S19 vision triage — this document describes AS-IS current practice, not an
aspirational target.
