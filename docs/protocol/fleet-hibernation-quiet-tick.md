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
backlog-rank, audit) are **skipped**; the safety cores (stale-session-sweep, inbox) always
run.

## FR-6: the 15-minute responsiveness cap and the bounded-latency tradeoff

A `ScheduleWakeup` park does **not** auto-wake on an inbound event. So the park interval
**is** the worst-case latency for any non-harness-tracked event (a chairman paste, a
`/signal`, a venture-1 decision becoming ready). The quiescent park is therefore **capped at
900s (15 min)** — that cap is the deliberate floor of responsiveness during hibernation.
When workers/signals are present the tick runs ACTIVE (180–270s), so latency is 3–4.5 min
whenever anything is actually moving. Phasing (`partyOffsetS`: coordinator 0, Adam 420)
keeps the two parties from co-firing and tapping each other awake.

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
