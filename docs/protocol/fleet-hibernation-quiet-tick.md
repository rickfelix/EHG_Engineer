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
| `decideCadence({quiescent, partyOffsetS, loadedAndQuiet})` | FR-5/FR-6 (FR-2 for the `loadedAndQuiet` band, SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002) | quiescent park ≤ 900s; active 180–270s; loaded-and-quiet 540–660s; **never exactly 300s** (prompt-cache TTL) |
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

**drive-report-consume is not quiescent-skipped either**
(SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C): the coordinator-lane consumer
([`scripts/coordinator-drive-report-consume.mjs`](../../scripts/coordinator-drive-report-consume.mjs))
writes a receipt row to `drive_report_receipts` recording that the coordinator lane saw the newest
`drive_reports` row. Skipping it while quiescent would make the instrument silent in exactly the
window it exists to measure — a lane that has stopped consuming and a fleet that is merely idle
would then look identical. `quiescentSkip: false` is asserted by a unit test and by mutant M8 in
`scripts/analysis/mutate-drive-report-consume.mjs`, because a flag flipped in the registry is
invisible at every other layer.

**Reading its status in the tick summary.** `runCoresFailSoft` records `key:status` and **drops
`detail`**, so the status string is the whole message an operator gets:

| Status | Means | Action |
|--------|-------|--------|
| `ok` | receipt written, or already present for this report | none |
| `nothing_to_consume` | the table exists and holds no report | none |
| `pending_migration` | `drive_reports` / `drive_report_receipts` **do not exist yet** — sibling SD -B's migration has not landed | none until -B ships; **not an incident** |
| `skipped` | this seat is not the coordinator | none |
| `failed` | a real error — permission, constraint, timeout, malformed query | investigate; a breadcrumb is written to `.artifacts/drive-report-consume-last-failure.json` |

`pending_migration` exists because the first version of this core returned `failed` for the absent
tables, which is the guaranteed state of the world between C's merge and -B's. An alarm that fires
continuously from the day it is installed trains everyone to ignore it, and then it cannot report
the real failure later. It is deliberately **not** folded into `ok` or `nothing_to_consume`: a
consumer that never runs must not read as a consumer with nothing to do.

Known limit: after -B lands, a table dropped by accident produces the same `PGRST205`/`42P01` and
would report `pending_migration` indefinitely. It stays visible as not-`ok`, but the label would be
wrong; distinguishing "never existed" from "existed and vanished" needs state this core does not
carry.

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

## LOADED_AND_QUIET wake band (SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001/-002)

A **fourth** `decideCadence` branch, distinct from the ACTIVE/QUIESCENT pair above, for the
specific state where the fleet is fully claimed and the belt is empty but the tick is not
truly quiescent (workers are present, just with nothing to do). Precedence:
**hard-wake > quiescent > loaded-and-quiet > active**.

| Helper | FR | Guarantee |
|--------|----|-----------|
| `computeLoadedAndQuiet(s)` | FR-7 (-001) | pure, fail-**closed** predicate: `idleNow===0 && rawUnclaimed===0 && openQfCount===0 && claimableWithVerifyQfCount===0 && !unactionedDirective && !undeliveredEscalation` — an omitted/unknown count is treated as unresolved, never as "clear" |
| `decideCadence({..., loadedAndQuiet})` | FR-2 (-002) | when `loadedAndQuiet` is true (and neither hard-wake nor quiescent applies), yields `[540,660]`s instead of the `[180,270]`s ACTIVE band; omitted/false is byte-identical to prior behavior |

**Why a fourth band, not a wider ACTIVE band.** The existing `desiredActiveS` lever
(QF-20260830-071) only widens the ACTIVE ceiling with a span tied to a caller-supplied
maximum. LOADED_AND_QUIET needs an independent 120s span anchored at a **fixed** 540s floor —
strictly above `ACTIVE_MAX_S` (270) and strictly below `MAX_QUIESCENT_PARK_S` (900) — so it
can never collapse into either existing band, and structurally cannot land on
`PROMPT_CACHE_TTL_S` (300).

**Wiring (-002 FR-3).** `computeLoadedAndQuiet()` shipped in -001 with **zero production
callers** — an inert, unit-tested-only function, by design (see the shipping-order note
below). -002 gives it its first call site: `scripts/coordinator-quiet-tick.mjs` exports
`resolveLoadedAndQuiet(sb, {unactionedDirective, undeliveredEscalation})`, called with a
**fresh** `gatherCapacityInputs()` read immediately before `decideCadence()` — never reused
from the tick-start `assessFleetActivity()` read, which would be stale by the time
`decideCadence()` runs. A capacity-read error fails **closed** (returns `false`, never
widens the band). The call-site ordering is pinned by a static guard
(`tests/static-guards/lane-drain-wiring-pinned.test.js`) because -001's own FR-7 shipped with
the same unwired shape and stayed green across all 50 predicate unit tests the whole time —
a unit test of the pure predicate cannot see whether its caller ever invokes it.

**Registry durability (-002 FR-1).** `periodic_process_registry.standard_loop:inbox`'s
`expected_interval_seconds` is machine-derived every seed run from the `inbox` entry's cron
string in `STANDARD_LOOPS` (`scripts/coordinator-startup-check.mjs`) — a **DB-only** edit to
the registry row reverts on the next `scripts/seed-periodic-process-registry.mjs` run. The
cron was widened `*/2` → `*/4` (120s → 240s) so `expected_interval_seconds × grace_multiplier`
(240×3=720s) durably clears the new band's 660s ceiling; a re-seed read-back, not a raw DB
write, is the only way to verify this fix actually took.

**Scope boundary: no preemption for a parked coordinator seat.** Widening the coordinator's
own wake band does not change how directives reach it: `ScheduleWakeup` has no preemption
path — a parked seat runs no tools, so no `PostToolUse` hook (`scripts/hooks/coordination-inbox.cjs`)
observes a `session_coordination` INSERT until the park naturally expires. The hard-wake
branch above still takes precedence at *decision* time, but cannot interrupt a park already
armed. -001's PLAN phase found this and, correctly, shipped FR-7 alone (the inert predicate)
while deferring the actual band widening — see -001's completed PRD FR-6 for the full finding
and its predicted-and-confirmed-FAIL live measurement. -002 does **not** build the
preemption mechanism; the resulting up-to-660s undelivered-directive-latency exposure **on
the coordinator's own seat** was explicitly accepted by the coordinator rather than gated
behind that build (`session_coordination` row `2dd84a5a-94db-401f-834c-f85d738dadb0`,
`strategic_directives_v2.metadata.risk_acceptance_b` on SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002).
A future SD may still build the preemption path; nothing here forecloses it.

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
