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

**Lint enforcement** (SD-LEO-INFRA-SESSION-COORDINATION-LANE-001): a raw
`.from('session_coordination').insert(...)` outside `insertCoordinationRow` is a CI-blocking lint
violation (`eslint-rules/no-raw-session-coordination-insert.js`). A second rule,
`eslint-rules/no-echoed-session-coordination-target.js`, flags `target_session` sourced from an
echoed prior-row field (`row.target_session`, `msg.target_session`, `row.sender_session`) instead
of a fresh `getActiveAdamId`/`getActiveSolomonId`/`getActiveCoordinatorId` call -- both share
`scripts/lint/session-coordination-insert-classguard-lint.mjs` as their driver. `insertCoordinationRow`
itself does NOT enforce resolver-only targeting (it only validates the target exists), so a caller
can still pass a stale/echoed session id through the choke point; see `lib/coordinator/dispatch.cjs`'s
own comment block for the current, verified census of known gaps.

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

## Receipt contract — ALL directive kinds (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001, revised by SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001)

The two-stage ACK above is not advisory-specific. For **every** directive kind
(`coordinator_request`, `work_assignment`, `adam_action_required`, `coordinator_reminder`,
`coordinator_to_adam` — the canonical list is `DIRECTIVE_KINDS` in
`lib/fleet/worker-status.cjs`, **import it, never duplicate it**), in **both** directions,
receipt is now a **three-stage** contract:

| Marker | Meaning | Who stamps it |
|--------|---------|---------------|
| `delivered_at` | **TRANSPORT RECEIPT** — a render/poll merely saw the row exist | any poll/render (inbox hook, dashboard) |
| `read_at` | **SURFACED FOR ACTION** — the row was genuinely surfaced for action-required processing | worker check-in `ackMessage` on a real claim, Adam's action-required drill, `ack-chairman-directive.cjs`, etc. — never a plain poll/render |
| `acknowledged_at` / `payload.actioned_at` | **ACTIONED** — the agent genuinely processed it | ONLY the agent that actioned the row |

Prior to SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001, a plain poll/render stamped
`read_at` directly (skipping the middle stage) — that let a directive row read as "delivered"
to any consumer gating on `read_at IS NULL`, even though nothing had genuinely surfaced it for
action yet. This is exactly the gap that caused a chairman burn-now directive stack to sit
unactioned for 25+ minutes on 2026-07-09: `scripts/coordinator-quiet-tick.mjs`'s hard-wake
check (see [fleet-hibernation-quiet-tick.md](fleet-hibernation-quiet-tick.md#directive-hard-wake-override-sd-leo-infra-coordinator-wake-on-directive-001))
gates on `read_at IS NULL`, so a row already poll-stamped to `read_at` looked "handled" and
never triggered the hard-wake. `scripts/hooks/coordination-inbox.cjs`'s `classifyInboxMessage`
now stamps `delivered_at` on first poll instead, leaving `read_at` NULL (and the hard-wake
live) until real action occurs.

No poll/drain path may ever stamp `acknowledged_at` on a directive kind (FR-3 —
the inbox hook's kind-allowlist enforces this; the sender-type allowlist that auto-acked
5 chairman directives unseen is dead, per QF-20260610-545).

**Sender-side receipts:** an outbound row unread (`read_at IS NULL`) at a **live** target
for 10+ minutes is UNDELIVERED — surfaced by `node scripts/fleet-dashboard.cjs inbox`
('UNDELIVERED OUTBOUND') and the hourly review. Pure selector:
`lib/coordinator/receipts.cjs findUndelivered`.

**Adam-side outbound-silence watchdog (SD-LEO-FIX-ADAM-OUTBOUND-SILENCE-001):** a
dashboard surface is only useful if someone acts on it. Chairman-caught gap 2026-07-04:
a backlog of Adam->coordinator messages sat unprocessed despite both UNDELIVERED OUTBOUND
and the ADAM ADVISORY INBOX unactioned-count already flagging it. `lib/adam/outbound-
silence-watchdog.js`, wired into `scripts/adam-quiet-tick.mjs`, closes the loop by having
Adam actively watch its own reply-expected outbound (`payload.kind` in `coordinator_request`
/ `solomon_consult`, or `payload.expects_reply=true`) at a live target: unread >=30m or
read-but-unacknowledged >=60m is a breach. First breach -> one alternate-kind channel-health
probe (`payload.kind='adam_channel_health_probe'`, `reply_class='fire-and-forget'` so it
never becomes a `task-rehydrate` board node). A target still breaching after a prior probe
(second consecutive breach) -> a chairman-visible `feedback` row (`category=harness_backlog`).
Deduped 2h/target, plus an absolute per-tick cap (`MAX_PROBES_PER_TICK=5`) as an independent
second storm guard.

## Consumption-semantics census (SD-LEO-INFRA-SESSION-COORDINATION-LANE-002, 2026-07-11)

Clause (e) of the chairman-ratified Solomon MODE-B advisory (`session_coordination` row
`09189ed9`), deferred through SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 and
SD-LEO-INFRA-SESSION-COORDINATION-LANE-001, asked for ONE unified consumption semantics
across every role inbox (Adam/coordinator/Solomon/worker), with every write site to
`read_at`/`acknowledged_at` classified and any drift migrated onto the shared three-stage
predicate above. **Closing this clause**: a full grep census of `scripts/` and
`lib/coordinator/` (excluding `scripts/archive/`) found **zero needs-migration sites** —
every write site already conforms, each traceable to a specific prior fix. No code changed
as part of this SD; this section is the auditable record so a future session does not need
to re-run the census.

### Write sites (12) — already-correct or exempt, each cited

| Site | Classification | Citation |
|---|---|---|
| `scripts/adam-advisory.cjs` `stampSurfaced`/`ackRows` | already-correct (three-stage) | SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 |
| `scripts/adam-advisory.cjs` `awaitCoordinatorReply` consumption | exempt | atomic reply-consumption — a synchronously-awaited reply is definitionally both seen and actioned in one step |
| `scripts/solomon-advisory.cjs` `stampSurfaced`/`ackRows` (mirrors adam-advisory) | already-correct | QF-20260710-593 |
| `scripts/coordinator-ack-signal.cjs` | already-correct | explicit CLI ack command, genuine action |
| `scripts/fleet-dashboard.cjs` (signal-inbox + advisory-inbox render) | already-correct | `read_at`-only, defers ack to explicit ack commands; advisory path additionally documents the `payload.actioned_at` dual-marker (see receipt-contract table above) |
| `scripts/worker-checkin.cjs` `ackMessage`/`surfaceCoordinatorMessages` | exempt (deliberate bounded consumption for advisory-class; directives always wait for genuine action) | SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001, SD-LEO-INFRA-WORKER-INBOX-PUSH-DELIVERY-001, QF-20260610-545 |
| `scripts/worker-signal.cjs` `awaitCoordinatorReply` consumption (x2) | exempt | atomic reply-consumption (same as adam-advisory.cjs) |
| `scripts/fleet-coaching.cjs` | already-correct | acks the original signal it replies to — genuine action |
| `scripts/stale-session-sweep.cjs` WORK_ASSIGNMENT terminal-drain | already-correct | `read_at`-only; a moot-target directive is a genuine surfacing event, never bare-acked |
| `scripts/stale-session-sweep.cjs` STUCK-signal auto-drain | exempt (narrow, ratified) | SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-OVERFIRE-001(c) — scoped to dead-sender or >1h-stale `stuck` signals only |
| `scripts/hooks/coordination-inbox.cjs` `classifyInboxMessage`-driven stamp | already-correct — the canonical reference implementation | see receipt-contract table above |
| `lib/coordinator/relay-queue.cjs` `drainOne` claim-lease | exempt | repurposes `acknowledged_at` as an atomic claim/lease mutex for its own row-kind (relay requests) — adversarially reviewed; not a violation since this queue has no meaningful "seen" stage |
| `lib/coordinator/signal-router.cjs` `stampRouted` | already-correct | acks on genuine promotion-to-`feedback` action (fingerprint aggregation) |

### Read-only consumers — exempt, never mutate

`scripts/read-adam-directives.cjs`, `scripts/read-adam-advisories.cjs`,
`scripts/adam-register.cjs`, `scripts/adam-self-assessment-writer.cjs`,
`scripts/solomon-register.cjs`, `lib/coordinator/detectors.cjs`,
`lib/coordinator/presence-grounding-signals.cjs`, `lib/coordinator/receipts.cjs`,
`lib/coordinator/adam-action-ack.cjs` — each read `read_at`/`acknowledged_at` for
display, scoring, or detection only; none write the columns.

**Reproducing the census**: `grep -rn "\.update({[^}]*\(read_at\|acknowledged_at\)" scripts/*.cjs lib/coordinator/*.cjs scripts/hooks/*.cjs` (excludes `scripts/archive/`, which holds only dead/superseded copies).

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
- **Handoff memory** — a sibling pattern to `working_context`, but scoped to a singleton
  *relaunching* onto a fresh checkout rather than an active session's rolling state:
  `lib/coordinator/handoff-memory.cjs` normalizes items (`consult`/`directive`/`reply_owed`/
  `reasoning_context`); `lib/coordinator/handoff-memory-store.cjs` persists them via the same
  atomic-merge RPC shape (`set_session_handoff_memory`, `metadata || jsonb_build_object(...)`),
  never a JS read-modify-write. The successor session reads the predecessor's row via
  `scripts/singleton-relaunch-restore.cjs`. See `docs/06_deployment/singleton-relaunch.md`.

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
`live-handshake` (sync-request eligible — see below). **Implemented**
(SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C) — Adam opts a `send` into
`reply-needed` via `node scripts/adam-advisory.cjs send "<body>" --reply-class reply-needed
[--reply-window-ms <ms>]`; `request` mode is always `live-handshake`. See
`docs/protocol/crew-comms-routing-protocol.md` § "Rule 3 — Sender-stamped reply-class"
for the full contract and `lib/coordinator/reply-class.cjs` for the implementation.

## Sync-request (live-handshake only)

`node scripts/adam-advisory.cjs request "<question>" --timeout <ms>` is this lane's
synchronous, bounded-timeout request mode — reserved for genuine `live-handshake`
exchanges, never for `reply-needed`/`fire-and-forget` traffic (those stay async via
`send`). On timeout, fall back to async rather than re-blocking — a sync-request against
a dormant/invocation-driven peer will time out by construction, since that peer cannot
answer until its next tick. **Never** issue a sync-request while already blocked on one
(mutual sync-requests deadlock). Full rules:
`docs/protocol/crew-comms-routing-protocol.md` § "Sync-request semantics".

## Periodic Solomon-lane stale-identity reconciliation (SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001)

Solomon's own MODE-B advisory (`session_coordination` row `09189ed9`) found that role-mail
retargeting for a stale Solomon identity was **event-driven only** (a new Solomon registration),
so a resolution fault or a gap between a Solomon's death and its successor's registration could
strand rows at a stale target for hours. `coordinator-hourly-review.cjs` now runs
`reconcileStaleSolomonInbound(sb)` on the **same hourly tick** as the existing Solomon
responsibilities reminder — it resolves the live Solomon (`getActiveSolomonId`), lists every
OTHER `role=solomon` session (`fetchAllSolomons`, unfiltered by freshness), and retargets each
stale one's still-unread rows via the already-exported `retargetStaleSolomonInbound` primitive
in `lib/coordinator/solomon-identity.cjs`. Additive-only: no exported-signature changes to that
module (12+ importers), Solomon-lane only (no Adam-lane extension), preserves the deliberate
fail-open on `resolveSolomonReplyTarget` and the unread/unsettled-only invariant (an
already-`acknowledged_at`-settled row is never re-targeted or resurfaced). Fail-open / non-fatal,
mirroring the sibling reminder leg it sits next to.

## Optional, validated typed `--kind` at send (SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001)

`buildAdvisoryPayload` in both `scripts/adam-advisory.cjs` and `scripts/solomon-advisory.cjs`
already unconditionally hardcodes `payload.kind` (`adam_advisory`) on every send — no row from
either CLI has ever been literally untyped. Both `send`/`request` now accept an **optional**
`--kind <recognized_kind>` flag: omitting it is byte-identical to prior behavior; an
explicitly-supplied value is validated against `KNOWN_SEND_KINDS` (built from the SAME shared
`PAYLOAD_KINDS` + `DIRECTIVE_KINDS` constants in `lib/fleet/worker-status.cjs` every drain
already filters on — never a second hand-maintained list) and an unrecognized value is
**rejected at send time**, before any `session_coordination` insert. On the Solomon lane, an
answer to a consult (`--reply-to` set) is exempt from `--kind` — it always reuses the advisory
lane's kind regardless of what (if anything) is passed, since an answer is terminal, not a new
typed interaction.

```bash
# Both accept the identical optional flag:
node scripts/adam-advisory.cjs send "<body>" --kind coordinator_request
node scripts/solomon-advisory.cjs send "<body>" --kind solomon_consult
```

Deferred (per Solomon's own stated counterfactual — the blast radius for a lane-wide contract
refactor was empirically 92 raw `session_coordination` insert call sites, not the ~5 he
estimated, and no existing periodic reconciliation pass covered the gap this SD closed):
resolver-only role-addressing enforcement (raw session-id targeting for role mail becoming a
lint error) and a full cross-lane unified read/ack consumption-semantics census. Tracked by
`SD-LEO-INFRA-SESSION-COORDINATION-LANE-001`.

## PID-cross-check (liveness-dispute resolution)

When the coordinator and Adam disagree on which session legitimately holds a role (a
`session_id` is a label, not ground truth), resolve via OS process enumeration and
on-disk session markers, not another DB read. Full protocol:
`docs/protocol/crew-comms-routing-protocol.md` § "PID-cross-check".

## Lane delivery contract module + observability gauge (SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001)

Nine first-hand defect instances across two sessions (untyped rows silently skipped, dual
body-read locations, a courtesy-ACK blocking a canonical oracle answer, a `coordinator_request`
body-drop, subject-only STUB rows rendered as authored requests, an INBOX_CAP overflow starved
by mechanical noise, an unvalidated re-target on a relay-confirm insert, and a resurface-dedup
drift class) motivated a single architectural SD rather than five spot-fixes (Solomon Mode-B
finding, ledger `bcac6f3c`). New `lib/coordination/lane-contract.cjs` — one module for SEND
validation and canonical DRAIN reads that every future writer/reader imports:

- **`validateOnSend(row, {mode})`** — typed `payload.kind` enforcement staged
  **off/observe/enforce**, reusing `lib/claim/gates/dispatch-authorization.cjs`'s two-flag-ladder
  shape verbatim. Ships **OFF by default**: a universally-required validator would break the live
  fleet today (payload-less rows are deliberate in places; ~34 raw insert sites bypass the
  existing partial choke point at `dispatch.cjs:587`). ENFORCE only after an observe-window
  confirms near-zero unexpected violations on the named seams — no seam has been migrated to call
  this yet in v1.
- **`readCanonicalBody(row)`** — dual-read, `payload.body` primary with a `body`-column fallback
  (no historical backfill). Migrated `scripts/adam-advisory.cjs`'s window-sweep print path, which
  previously never checked the body column at all.

Four other fixes shipped alongside the module:

- `lib/coordinator/relay-queue.cjs`'s `drainOne` now validates the relay-confirm's echoed
  `target_session` via `assertValidConfirmTargetSafe` (wraps `dispatch.cjs`'s
  `assertValidTarget`) before insert — an invalid/stale asker skips only the confirm (the relay
  itself already succeeded), closing the gap the file's own
  `no-echoed-session-coordination-target` eslint-disable had deferred to this SD.
- `lib/coordinator/reply-correlation.cjs`'s `hasCorrelatedReply` gained an optional
  `opts.excludeKinds` — a courtesy-ACK (`kind=ack`/`coordinator_ack`) echoing a consult
  correlation can no longer suppress the eventual genuine reply/verdict at
  `adam-quiet-tick.mjs`'s `surfaceInboxItems`. Narrowly scoped to that one call site, not a
  lane-wide dedup rewrite — 4 disjoint dedup schemes coexist deliberately.
- A reserved `payload.kind='cross_party_ping'` (in `ADAM_EXCLUDED_KINDS`) marks the quiet-tick
  cross-party ping mechanical, and `surfaceInboxItems`'s raw fetch was widened to 400 rows
  (filtered BEFORE the 50-row display cap, not after) — a burst of mechanical rows can no longer
  starve authored content out of Adam's inbox window (the INBOX_CAP-overflow-all-day class).
- New read-only `lib/coordination/lane-lint-gauge.cjs` (CLI: `scripts/coordinator-lane-lint-gauge.cjs`)
  reports independent counts for `untyped_row`, `bodyless_row`, `empty_sender_row`, and
  `resurface_dedup_drift` (>1 concurrently-unacknowledged `solomon_ledger_pending_resurface` rows
  for the same ledger item — the daily `payload->>dedup_key` only blocks a same-day repeat).

Deferred / not fully closed by this SD (documented at PLAN_VERIFICATION, not silently dropped):
`validateOnSend` is not yet wired into any live send seam (capability, not enforced behavior);
`signal-router.cjs` and `adam-quiet-tick.mjs`'s own body-read sites are not yet migrated to
`readCanonicalBody`; the gauge covers 4 of the 9 evidence classes directly (untyped/bodyless/
empty-sender/resurface-drift) — a stale-target flood (instance 1, distinct from instance 6's
empty-sender pattern) and the dual-body-*divergence* shape specifically (instance 7, as opposed
to body absence) have no dedicated counter yet.
