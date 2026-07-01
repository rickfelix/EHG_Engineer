# Coordinator ↔ Solomon comms protocol

**Status:** Active (ships dormant until `SOLOMON_CONSULT_V1`) · **SD:** SD-LEO-INFRA-SOLOMON-CONSULT-001 (Phase E) · Modeled on `docs/protocol/coordinator-adam-comms.md` + `docs/architecture/solomon-oracle.md`.

Solomon is the deep-reasoning **oracle** — the session the fleet escalates its hardest reasoning problems to. This doc defines how a `solomon_consult` reaches Solomon and how Solomon's answer reaches the asker. Solomon **proposes, never executes** (it never claims an SD or drives a build).

## Channels & kinds

| Direction | Kind | Lane | Notes |
|-----------|------|------|-------|
| asker → Solomon | `solomon_consult` | `session_coordination`, `target_session` = canonical Solomon | A deep-reasoning request. Carries `payload.correlation_id` (the reply key) + the question + an optional `sd_key`. |
| Solomon → asker/coordinator | `adam_advisory` + `payload.oracle=true` | the advisory inbox lane | The oracle answer. Echoes the consult correlation under `payload.reply_to` (= `correlation_id`) so the asker pairs it. Reuses the existing advisory plumbing; `oracle:true` distinguishes it from an Adam advisory. |
| coordinator → Solomon | the shared `DIRECTIVE_KINDS` | Solomon inbox | Coordinator directives drain through the same `solomon-advisory.cjs inbox` lane. |

The answer deliberately carries **no** `signal_type` / `intent_action`, so neither the friction signal-router nor the deconfliction sweep scoops it (same invariant as the Adam lane).

## Who triggers a consult

The consult is routed by the Phase-B/D triage SSOT (`lib/coordinator/solomon-triage.cjs` `evaluateSolomonTriage`): a worker/coordinator escalates after a counter-gated threshold (e.g. RCA recurrence ≥ 2, gate-fail ≥ 3) wires a `solomon_consult` row. Solomon does not poll for new problems — it drains what is routed to it.

## Solomon's drain + answer cycle

1. **Drain** (recurring inbox-monitor tick, every 15 min): `node scripts/solomon-advisory.cjs inbox --quiet` surfaces unread `solomon_consult` + directives for the canonical Solomon session (resolved via `getActiveSolomonId`), two-stage ACK (`read_at` stamped; `acknowledged_at` withheld until genuinely answered).
2. **Budget gate (ENTRY)**: before any Read/Grep, the deep-sweep tick enforces the HARD per-sweep `task_budget` (count / wall-clock / token — `enforceSweepBudget`). Over budget → STOP.
3. **Dedup + quota**: skip a consult already answered (`alreadyAnswered`, durable); respect the per-SD + per-day quota (`checkConsultQuota`, fail-open).
4. **Answer**: `node scripts/solomon-advisory.cjs send "<analysis>" --reply-to <consult-correlation>` — the answer is an oracle advisory routed to the coordinator (or the asker), correlation echoed.

## Singleton + handoff

Solomon is a singleton role-session (like the coordinator and Adam). `solomon-register.cjs` enforces single-Solomon (refuse-new-on-fresh-prior; retire only a STALE prior) and re-targets a retired prior's unread inbound to the new session (`drainSolomonOutbound`, idempotent). Identity is keyed on `metadata.role='solomon'` + `metadata.solomon_since` via the atomic `set_solomon_flag`/`clear_solomon_flag` RPCs.

## Presence + grounding signals

Solomon's `status` verb (`node scripts/solomon-advisory.cjs status [--working "<body>" [--eta <ms>]]`)
is wired to the SAME shared `lib/coordinator/presence-grounding-signals.cjs` helper Adam and the
coordinator use — see `docs/protocol/coordinator-adam-comms.md` § "Presence + grounding signals a
SHARED protocol capability" for the full contract (read-receipt echo, presence/expectation
indicator, ephemeral working-signal). No per-role reimplementation.

## Self-adherence

Every 12 h, `solomon-self-adherence-review.mjs` checks that each durable duty declared in `CLAUDE_SOLOMON.md` is present in `SOLOMON_LOOPS`; drift is surfaced as a propose-only remediation (Solomon never builds the fix). The same parity check (`renderContractParity`) prints at every `/solomon` startup.
