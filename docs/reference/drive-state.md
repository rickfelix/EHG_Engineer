# Drive-State Subsystem — Operator Reference

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-DRIVE-STATE-FORCING-001 (EXEC)
**Last Updated**: 2026-08-10
**Tags**: drive-state, forcing-function, owed-action, governance, fleet

## What it is

The six-axis drive-state system answers "is anything actually moving?" across the fleet. It has three layers, delivered by three SDs:

| Layer | Delivered by | Lives in |
|-------|--------------|----------|
| Measurement (six axis probes + verdict) | SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001 | `lib/governance/drive-state/` |
| Persistence (hourly history) | SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001 | `drive_state_verdicts` table, `scripts/lib/drive-state-verdict-store.cjs` |
| Prevention (forcing-function) | SD-LEO-INFRA-DRIVE-STATE-FORCING-001 | `lib/governance/drive-state/owed-actions.cjs`, `scripts/lib/drive-state-owed-emitter.cjs` |

The six axes are frozen: `chairman_decisions`, `coordinator_performance`, `roadmap_motion`, `venture_stage_motion`, `fleet_health`, `learning_conversion`. Each reports `CLEAR`, `STALLED`, or `UNMEASURABLE` with a mandatory citation. `roadmap_motion` and `learning_conversion` are currently pinned `UNMEASURABLE` (their classifiers are constants), so only four axes can stall today.

## Where you see it

- `npm run adam:board` (`scripts/adam-pm-board.mjs`) — on-demand, render-only.
- `scripts/coordinator-hourly-review.cjs` — cron `17 * * * *`; the ONLY writer of history and the ONLY emitter of owed-actions.

## Reading the report

A healthy section ends with the summary tail:

```
  axes=6  clear=4  stalled=0  unmeasurable=2
```

When an axis is STALLED, the forcing-function **withholds that tail** and prints owed-action hard lines instead:

```
  ── FORCING-FUNCTION: SUMMARY WITHHELD — a stalled axis owes an action ──
  !! OWED-ACTION fleet_health            recover_stuck_seat            since 2026-08-10T01:25:46.532Z  runs=3
```

| Line | Meaning | What clears it |
|------|---------|----------------|
| `!! OWED-ACTION <axis> <act> since <t> runs=N` | The axis has been STALLED for N consecutive hourly runs; the named act is owed | The axis genuinely moving again (next derivation finds it non-STALLED). **Never** an acknowledgement — clearance is ground-truth motion only |
| `runs>=N` | The stall span reached the history fetch window; N is a floor, not a count | Same as above |
| `!! STALE-BASIS — newest persisted run is X h old` | The hourly persist has a gap > 2h; the history basis is unverifiable over it | The next successful hourly persist |
| `DRIVE-STATE FORCING-FUNCTION — MISS OR EMISSION FAILURE` | The meta-control caught a tick that computed a stalled verdict but could not read back an emitted owed-action (`DRIVE_STATE_FORCING_MISS`) | Investigate immediately — the forcing-function itself missed its firing |
| `FULL-SPECTRUM DRIVE STATE — REFUSED, VERDICT INCOMPLETE` | The probe could not produce a checkable verdict (pre-existing refusal channel) | Fix the probe/adapter failure it names |

## The owed-action lane

Owed-actions are emitted as `session_coordination` rows with `payload.kind=adam_action_required`, `payload.action_kind=drive_state_owed_action` — an existing DIRECTIVE-class kind, so they re-print on every coordinator/Adam tick until acknowledged. Emission is idempotent **per axis**: at most one unactioned row per axis exists at any time (lane bounded at six rows). Acknowledging the row silences the nag; it does **not** clear the report block — only the axis moving does.

## Design rules that bind future changes

- **No `allClear()` boolean, no `DONE` action** — ratified in `lib/governance/drive-state/contract.cjs`. Clearance may never require work to emit a row just so a counter can see it (drain-descriptor prohibition).
- **Single writer** — only the hourly review persists verdicts and emits owed-actions; `adam-pm-board` must not reference the verdict store (test-enforced in `tests/unit/governance/drive-state-verdict-store.test.js`).
- **History before persist** — the hourly review reads spans + prior-newest `recorded_at` BEFORE persisting its own tick, or the stale-basis guard can never fire.
- **Owed-actions travel as return values** — both consumer catch blocks stringify errors, so structured payloads on throws are lost; a throw's message string is its only channel.
- **Extend by two-sided test** — every forcing clause has a positive and negative control in `tests/unit/governance/drive-state-owed-actions.test.js`; the executed wiring lives in `drive-state-persist-wiring.test.js`.

## Known limits

- Zero-tick blindness: if the hourly cron dies, neither the forcing-function nor its meta-control runs. The stale-basis guard reports the gap loudly on the next successful tick, but liveness of the cadence itself is separate (unowned as of 2026-08-10 — flagged to coordinator).
- Only the four unpinned axes can produce owed-actions until `roadmap_motion` / `learning_conversion` are unpinned (separate work).
