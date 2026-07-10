# Fleet hibernation — the quiet-tick mechanism

**SD:** SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001 (the un-shipped ~80% of
SD-LEO-INFRA-FLEET-HIBERNATION-001 / #5171, which wired quiescence *awareness* but not the
idle-token *reduction*).

## What it is

Two thin aggregators —
[`scripts/coordinator-quiet-tick.mjs`](../../scripts/coordinator-quiet-tick.mjs) and
[`scripts/adam-quiet-tick.mjs`](../../scripts/adam-quiet-tick.mjs) — that compose the
**existing** modular coordinator/Adam cores into **one fail-soft tick** that emits **one
summary line** and **self-paces its own next wake** via `ScheduleWakeup`. Shared mechanics
live in [`lib/coordinator/quiet-tick.cjs`](../../lib/coordinator/quiet-tick.cjs):

| Helper | FR | Guarantee |
|--------|----|-----------|
| `decideCadence({quiescent, partyOffsetS})` | FR-5/FR-6 | quiescent park ≤ 900s; active 180–270s; **never exactly 300s** (prompt-cache TTL) |
| `detectSalientDelta(prev, cur)` | FR-4 | a "still idle" status emits **no** cross-party ping; only a real belt 0↔non-zero / new signal / venture-1 change does |
| `runCoresFailSoft(cores)` | FR-1 | one core throwing is logged and the tick **continues** the others |

Mode (QUIESCENT vs ACTIVE) is sourced from the canonical gate
`assessFleetActivity`/`decideQuiescence` in `lib/coordinator/fleet-quiescence.cjs` — it is
not re-derived. In QUIESCENT mode the expensive cores (charter-audit, capacity-forecast,
audit) are **skipped**; the safety cores (stale-session-sweep, inbox) and **backlog-rank**
always run.

**backlog-rank is not quiescent-skipped** (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-A):
unlike the other expensive cores, ranking the claimable belt (`coordinator-backlog-rank.mjs`,
persists `metadata.dispatch_rank`) is cheap and highest-value exactly when the fleet is quiet
— a fresh draft SD needs a rank before the next worker wakes and self-claims. The mechanism's
only other trigger, a harness `CronCreate` loop armed by a live coordinator session, is
deleted by the coordinator's own teardown-discipline rule on sustained idle; a durable,
coordinator-session-independent net for this gap now also runs at
[`.github/workflows/backlog-rank-cron.yml`](../../.github/workflows/backlog-rank-cron.yml)
(~15min GHA cron, mirrors `fleet-down-alert-cron.yml`).

## FR-6: the 15-minute responsiveness cap and the bounded-latency tradeoff

A `ScheduleWakeup` park does **not** auto-wake on an inbound event. So the park interval
**is** the worst-case latency for any non-harness-tracked event (a chairman paste, a
`/signal`, a venture-1 decision becoming ready). The quiescent park is therefore **capped at
900s (15 min)** — that cap is the deliberate floor of responsiveness during hibernation.
When workers/signals are present the tick runs ACTIVE (180–270s), so latency is 3–4.5 min
whenever anything is actually moving. Phasing (`partyOffsetS`: coordinator 0, Adam 420)
keeps the two parties from co-firing and tapping each other awake.

## Directive hard-wake override (SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001)

The 900s quiescent park above assumed no pending work needed the coordinator's attention.
That assumption broke on 2026-07-09: a chairman burn-now directive stack sat unactioned for
25+ minutes because `decideCadence` had no awareness of pending directive-class inbox rows
and could self-schedule a full 900s park immediately after a directive landed.

`decideCadence` now takes an optional `hasUnactionedDirective` flag that, when true,
overrides **both** the quiescent park and the normal active band with a short
`DIRECTIVE_WAKE_MIN_S`–`DIRECTIVE_WAKE_MAX_S` (15–45s) hard-wake delay — checked *before* the
quiescent branch. Omitting the flag is byte-identical to prior behavior.

`scripts/coordinator-quiet-tick.mjs` computes the flag from **two independent, `Promise.all`
branches** (each with its own error boundary, so one failing never suppresses the other):

| Check | Covers | Mechanism |
|-------|--------|-----------|
| `hasUnactionedDirective(sb, coordinatorId)` | Session-targeted `DIRECTIVE_KINDS` rows (`target_session = <real session id>`) | `read_at IS NULL` |
| `hasOutstandingChairmanDirective(sb)` | `chairman_directive` rows — issued with `target_session='broadcast'` (a literal sentinel, never a real session id, per `scripts/issue-chairman-directive.cjs`) | reuses `lib/coordinator/chairman-directive-gauge.cjs` `loadRoleDirectiveStatus('coordinator')`, since broadcast directives track compliance via a separate `chairman_directive_ack` mechanism, not `read_at` |

The two-check split exists because a plain `target_session=coordinatorId` query structurally
cannot see broadcast-lane `chairman_directive` rows — the exact flagship incident scenario —
so a single check would have missed it.

### `read_at` vs `delivered_at`

`session_coordination.delivered_at` (additive migration, no backfill) now separates two
meanings that used to be conflated under `read_at`:

- **`delivered_at`** — a consumer's process merely *saw* this row (poll/list/render).
- **`read_at`** — the row was genuinely surfaced for action-required processing (worker
  check-in `ackMessage` on a real claim, Adam's action-required drill,
  `ack-chairman-directive.cjs`, etc.).

`scripts/hooks/coordination-inbox.cjs`'s `classifyInboxMessage` previously stamped `read_at`
on a `DIRECTIVE_KINDS` row on its *first poll* — a stand-in "delivered" marker that hid the
row from any consumer gating on `read_at IS NULL` (including `hasUnactionedDirective` above)
before it was ever genuinely actioned. It now stamps `delivered_at` instead, leaving
`read_at` NULL until real action occurs.

## Smoke test (safe — no side effects)

```bash
node scripts/coordinator-quiet-tick.mjs --dry-run
node scripts/adam-quiet-tick.mjs --dry-run
```

`--dry-run` composes and lists the cores **without** executing the side-effectful scripts
(no claim-reaping, no dispatch), and prints the resolved mode + `nextWakeSeconds`.

## Operator cutover (the cron-frequency reduction)

The mechanism ships **additive and inert** — it does not change the live coordinator/Adam
cron schedule on its own. The token reduction (~37–45/hr → ≤6/hr during genuine quiescence)
lands when the operator cuts the folded separate crons over to the quiet-tick:

1. Confirm the tick composes the intended loops:
   `npx vitest run tests/unit/coordinator/quiet-tick-loop-parity.test.js`.
2. In `scripts/coordinator-startup-check.mjs` `STANDARD_LOOPS`, replace the folded loops
   (`charter-audit`, `capacity-forecast`, `backlog-rank`, `audit`, `inbox`) with a single
   `coordinator-quiet-tick` loop (keep `sweep` independent for fast claim-reaping if
   desired), and mirror the entry into the teardown registry
   (`lib/coordinator/teardown-coordinator.cjs` `COORDINATOR_CRONS` + `COORD_SCRIPT_MARKERS`).
   Do the equivalent for `ADAM_LOOPS` (fold `inbox-monitor` + `belt-countdown` + `offer-help`).
3. Restart the coordinator/Adam so the new schedule arms.

The loop-parity test is the guard: it fails if a folded core is dropped without being either
composed by a quiet-tick or explicitly delta-gated — so the cutover cannot silently lose a
monitoring loop.

## Out of scope

FR-2/FR-3 (shipped in #5171); `/context-compact` (a per-session operator lever).
