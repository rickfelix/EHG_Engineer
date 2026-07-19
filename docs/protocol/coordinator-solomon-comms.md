# Coordinator ↔ Solomon comms protocol

**Status:** Active (ships dormant until `SOLOMON_CONSULT_V1`) · **SD:** SD-LEO-INFRA-SOLOMON-CONSULT-001 (Phase E) · Modeled on `docs/protocol/coordinator-adam-comms.md` + `docs/architecture/solomon-oracle.md`.

> This lane is one of the canonical channels organized under
> `docs/protocol/crew-comms-routing-protocol.md` (the 5 bounding rules: defined lanes,
> hop-minimization — including the direct Adam↔Solomon channel this lane's traffic
> partially graduates to — sender-stamped reply-class, silence-by-default, escalation
> ladder). Read that doc first for the cross-role picture; this doc is the
> Solomon↔coordinator wire-level contract.

Solomon is the deep-reasoning **oracle** — the session the fleet escalates its hardest reasoning problems to. This doc defines how a `solomon_consult` reaches Solomon and how Solomon's answer reaches the asker. Solomon **proposes, never executes** (it never claims an SD or drives a build).

## Channels & kinds

| Direction | Kind | Lane | Notes |
|-----------|------|------|-------|
| asker → Solomon | `solomon_consult` | `session_coordination`, `target_session` = canonical Solomon | A deep-reasoning request. Carries `payload.correlation_id` (the reply key) + the question + an optional `sd_key`. |
| Solomon → asker/coordinator | `adam_advisory` + `payload.oracle=true` | the advisory inbox lane | The oracle answer. Echoes the consult correlation under `payload.reply_to` (= `correlation_id`) so the asker pairs it. Reuses the existing advisory plumbing; `oracle:true` distinguishes it from an Adam advisory. |
| coordinator → Solomon | the shared `DIRECTIVE_KINDS` | Solomon inbox | Coordinator directives drain through the same `solomon-advisory.cjs inbox` lane. |

The answer deliberately carries **no** `signal_type` / `intent_action`, so neither the friction signal-router nor the deconfliction sweep scoops it (same invariant as the Adam lane).

### `payload.framing_class` sub-discriminator (FW-3)

An oracle answer (`adam_advisory` + `oracle:true`) may optionally carry
`payload.framing_class` ∈ `{instrument, pick}` — a payload-shape sub-discriminator on this
SAME leg, not a new kind (SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B). `instrument` marks a
tactical finding; `pick` marks a CMV/portfolio-altitude framing that should fail-closed to
chairman-escalation rather than auto-sourcing. Stamped via `solomon-advisory.cjs send
"<analysis>" --framing-class instrument|pick`; consumed in `adam-advisory.cjs`'s
`drainInbox`, which tags the surfaced line (`framing:<class>`) and warns loudly on `pick`.
This SD wires visibility only — the fail-closed pick-vs-instrument **routing** decision
itself is a sibling FW-3 child SD's scope, not yet implemented.

## Who triggers a consult

The consult is routed by the Phase-B/D triage SSOT (`lib/coordinator/solomon-triage.cjs` `evaluateSolomonTriage`): a worker/coordinator escalates after a counter-gated threshold (e.g. RCA recurrence ≥ 2, gate-fail ≥ 3) wires a `solomon_consult` row. Solomon does not poll for new problems — it drains what is routed to it.

## Solomon's drain + answer cycle

1. **Drain** (recurring inbox-monitor tick, every 15 min): `node scripts/solomon-advisory.cjs inbox --quiet` surfaces unread `solomon_consult` + directives for the canonical Solomon session (resolved via `getActiveSolomonId`), two-stage ACK (`read_at` stamped; `acknowledged_at` withheld until genuinely answered).
2. **Budget gate (ENTRY)**: before any Read/Grep, the deep-sweep tick enforces the HARD per-sweep `task_budget` (count / wall-clock / token — `enforceSweepBudget`). Over budget → STOP.
3. **Dedup + quota**: skip a consult already answered (`alreadyAnswered`, durable); respect the per-SD + per-day quota (`checkConsultQuota`, fail-open).
4. **Answer**: `node scripts/solomon-advisory.cjs send "<analysis>" --reply-to <consult-correlation>` — the answer is an oracle advisory routed to the coordinator (or the asker), correlation echoed.

## Singleton + handoff

Solomon is a singleton role-session (like the coordinator and Adam). `solomon-register.cjs` enforces single-Solomon (refuse-new-on-fresh-prior; retire only a STALE prior) and re-targets a retired prior's unread inbound to the new session (`drainSolomonOutbound`, idempotent). Identity is keyed on `metadata.role='solomon'` + `metadata.solomon_since` via the atomic `set_solomon_flag`/`clear_solomon_flag` RPCs.

For the fresh-checkout relaunch pipeline (stale-tree trigger → fresh worktree + handoff-memory restore → register-then-retire sequencing), see `docs/06_deployment/singleton-relaunch.md`.

## Presence + grounding signals

Solomon's `status` verb (`node scripts/solomon-advisory.cjs status [--working "<body>" [--eta <ms>]]`)
is wired to the SAME shared `lib/coordinator/presence-grounding-signals.cjs` helper Adam and the
coordinator use — see `docs/protocol/coordinator-adam-comms.md` § "Presence + grounding signals a
SHARED protocol capability" for the full contract (read-receipt echo, presence/expectation
indicator, ephemeral working-signal). No per-role reimplementation.

## Self-adherence

Every 12 h, `solomon-self-adherence-review.mjs` checks that each durable duty declared in `CLAUDE_SOLOMON.md` is present in `SOLOMON_LOOPS`; drift is surfaced as a propose-only remediation (Solomon never builds the fix). The same parity check (`renderContractParity`) prints at every `/solomon` startup.

## Cross-check protocol (SEE-SOMETHING / CONFIRM-ON-RELAY / PING-ON-SILENCE)

Exception-triggered mutual verification on this lane — not every message, only on these
triggers. Full rationale + live evidence: `docs/protocol/crew-comms-routing-protocol.md`
§ "Cross-check protocol".

- **SEE-SOMETHING** — if either side notices a claim from the other contradicts a stale
  read, a snapshot, or ground truth, flag it immediately rather than acting on it.
- **CONFIRM-ON-RELAY** — when the coordinator relays a message to/from Solomon on behalf
  of a third party, it confirms back to the origin that the relay landed.
- **PING-ON-SILENCE** — a `reply-needed` consult (see Reply-class below) left unanswered
  past its expected window is pinged, not silently assumed disagreed-with.

## Reply-class (sender-stamped)

Every message on this lane is sender-stamped with a reply-class: `fire-and-forget`
(no reply expected), `reply-needed` (async, PING-ON-SILENCE applies), or
`live-handshake` (sync-request eligible — see below). **Implemented**
(SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C) — Solomon opts a `send` into
`reply-needed` via `node scripts/solomon-advisory.cjs send "<body>" --reply-class
reply-needed [--reply-window-ms <ms>]`; `request` mode and a `solomon-consult` answer with
`--await` are always `live-handshake`; a consult without `--await` defaults to
`reply-needed`. See `docs/protocol/crew-comms-routing-protocol.md` § "Rule 3 —
Sender-stamped reply-class" for the full contract and `lib/coordinator/reply-class.cjs`
for the implementation.

## Sync-request (live-handshake only)

`node scripts/solomon-advisory.cjs request "<question>" --timeout <ms>` is this lane's
synchronous, bounded-timeout request mode — reserved for genuine `live-handshake`
exchanges, never for `reply-needed`/`fire-and-forget` traffic (those stay async via
`send`/`solomon_consult`). On timeout, fall back to async rather than re-blocking — Solomon
runs scheduled sweeps and drain ticks rather than a continuous listener, so a sync-request
against it can time out by construction between ticks; prefer async in that case. **Never**
issue a sync-request while already blocked on one (mutual sync-requests deadlock). Full
rules: `docs/protocol/crew-comms-routing-protocol.md` § "Sync-request semantics".

## PID-cross-check (liveness-dispute resolution)

When two sessions disagree on which session is the live canonical Solomon (a
`session_id` is a label, not ground truth — Solomon's own singleton-handoff guard above
exists for exactly this), resolve via OS process enumeration and on-disk session markers,
not another DB read. This settled a real Solomon session-identity dispute live on
2026-07-01. Full protocol: `docs/protocol/crew-comms-routing-protocol.md`
§ "PID-cross-check".
