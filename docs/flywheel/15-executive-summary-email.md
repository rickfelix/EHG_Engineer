---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, executive-summary, chairman-email, adam, calculation]
---

# Link 15 — Executive Summary Email (the Chairman's primary recurring status surface)

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

This is the **chairman's primary recurring status surface** — the up-flow's headline report. It
reuses the build gauge (link 10) and the build-completion forecast (link 12) and surfaces the fleet
state and the pending decisions (link 14). It is deliberately **simple**: two headline numbers + an
action list. Crucially, it **reuses** the same calculation engines the rest of the flywheel uses — it
does not recompute anything its own way, so the email can never diverge from the gauge/forecast.

## Source of truth (verified — `scripts/adam-exec-summary.mjs`, 332 lines, "v3")

- **Sender:** Adam (`Adam — LEO Fleet Advisor`), via `lib/notifications/resend-adapter.js`.
- **Recipient:** `process.env.CLAUDE_NOTIFY_EMAIL`.
- **Cadence / trigger:** the GitHub-Actions cron **`adam-exec-email-cron.yml`** (the 30-min /
  hourly executive email). A once-per-hour **send guard** (`lib/fleet/exec-email-send-guard.js`
  `shouldSendNow` / `recordSent`) prevents duplicate sends; the send-gating decision is done in the
  workflow CLI. `--dry-run` / `ADAM_EMAIL_DRYRUN` previews without sending; `--force` overrides the
  quiescence gate.
- **Quiescence gate (QF-20260612-437):** when the fleet is fully OFF AND there are **no pending
  chairman actions**, the hourly send is skipped (fails *open* to ACTIVE on any query error so a real
  email is never dropped). Pending actions always surface regardless of fleet state.

## What it contains (the v3 layout)

The chairman directed (2026-06-14) **two headline numbers + their action list, nothing else**:

1. **WORKERS** — `N active[, M idle] (source label)`.
2. **EHG VISION BUILD-%** — the live VDR build gauge, with the per-rung/per-nature line, the rung
   rollup, the forecast line, operational proofs, the per-layer line, and the gauge note.
3. **DONE IN THE LAST HOUR** — a couple of plain-language sentences on what shipped since the
   previous email (non-technical chairman-readable).
4. **ACTIONS FOR YOU** — `chairman_pending_decisions` rendered as a single copy-paste block the
   chairman selects and pastes back into Claude Code; every line ends with the real
   `decision_type:id` reference so a pasted instruction resolves to the exact row.

> **Removed vs v2** (chairman directive): the north-star number, per-scope roll-up, value-delivered
> buckets, meta:product ratio, distance-to-quit prose, tri-party self-score, the canary, the embedded
> coordinator fleet card, and the vision trend sparkline. **No emojis anywhere.**

## HOW it calculates the estimates and forecasts (the part to read)

The email's headline numbers are **not** computed in this script — they are **reused** from the
canonical engines. This is the anti-divergence design.

### Number 1 — WORKERS (hourly average, honest under sparse data)

- A 15-min pulse job records active-vs-idle into `fleet_worker_pulse`. The email **averages the last
  hour** of pulses (`resolveWorkerCount`, `lib/fleet/worker-count-source.mjs`).
- **Sparse/missing-data honesty** (SD-LEO-INFRA-WORKER-COUNT-PULSE-RESILIENCE-001): if there are
  `< SPARSE_THRESHOLD` pulses in the 1h window, it **widens to a 3h window** or **prefers the live
  instantaneous count** (`computeLive` — the same genuine-worker predicate the fleet dashboard uses),
  labeled honestly. The wider-window + live queries fire **lazily** (only when sparse). A query error
  returns `null` so a failure never masquerades as a real "0 active". The `(hr avg)` subject tag only
  appears for a *confident* (non-sparse) hourly average.

### Number 2 — EHG VISION BUILD-% (reuses computeBuildGauge — link 10)

```js
const grep  = makeDefaultGrepSeam();                         // shared cross-repo grep seam
const gauge = await computeBuildGauge({ io:{ supabase: db, grep }, visionSource:true });
const fmt   = formatGaugeForSummary(gauge, { em: EM });      // SAME display mapping as the Chairman-UI tile
```

- `visionSource:true` → the denominator is the **active vision rung** (`vision_ladder_rungs WHERE
  is_active` → `vision_ladder_criteria`), so the gauge **auto-re-points** when the chairman activates
  the next rung — no code edit, no dependency on a missing `EHG-VISION.md` file.
- The grep seam (`makeDefaultGrepSeam`) lets the cross-repo `code_grep` probes resolve so all
  capabilities are measured, not just the DB/KR-backed ones (present⇒partial, absent checkout⇒
  unknown/excluded — never a guessed/inflated number).
- `formatGaugeForSummary` is the **single source** of display strings (shared with the Chairman-UI
  tile) → `buildLine` (leads with fleet-build %), `rungNatureLine` (V1 foundation NN% built / NN%
  operational / income tracked on V2), `rungLine` (V1 rung-completion over all criteria),
  `operationalLine`, `layerLine`, `visNote`.
- **The full calculation (denominator/numerator/scoring/buildable-vs-operational split) is in**
  [10-vdr-build-gauge.md] — the email simply renders it.

### The rung rollup line (reuses the SAME gauge — no recompute)

```js
const rollup = await runRollup({ supabase: db, computeGaugeFn: async () => gauge, apply:false });
rungRollupLine = formatRungRollupLine(rollup, { em: EM });
```

- `computeGaugeFn` returns the **already-computed** gauge (a thunk) → **no second compute, no
  divergence** (the email's rollup % equals the gauge % by construction).
- `apply:false` → the email **reads, never writes** `roadmap_waves.progress_pct` (it is a reporting
  surface, not a mutator). See [04-roadmap-waves.md].

### The forecast line (reads the persisted forecast — link 12)

```js
const { data: fc } = await db.from('build_completion_forecast_log')
   .select('plateau,build_pct,binding_constraint,eta_days,eta_date,confidence,note')
   .order('measured_at',{ascending:false}).limit(2);
forecastLine = formatForecastLine(toF(fc[0]), toF(fc[1]));   // current + delta-vs-prior
```

- The email reads the **latest two** persisted forecast rows and renders the current ETA + the **Δ
  vs the prior run** (`formatForecastLine`). The forecast itself (two-phase ETA, EWMA self-
  correction, plateau honesty, horizon-capped confidence) is documented in [12-forecasting.md].
- **[APPLIED — 2026-06-20]** The `build_completion_forecast_log` table migration
  (`database/migrations/20260620_build_completion_forecast_log.sql`) was **APPLIED 2026-06-20**
  (chairman-authorized, `[MIGRATION_APPLY_PROD_PASS]`, additive-only). The exec-email ETA line now
  **RENDERS**. First live value:
  > `Estimated completion (infra-build scope): 2026-07-16 (~26d, sourcing-bound) (low)`
- **Fail-soft (still the behavior):** if the table ever has no rows / is absent / any error → the
  forecast line is simply **omitted**, never blocking the email. So the email is safe both before
  and after the row exists.

### ACTIONS FOR YOU (pending decisions — link 14)

- Reads `chairman_pending_decisions` (limit 200), **first**, so the quiescence gate can see them.
- Drops stale approvals for **dead ventures** (terminal status or hard-deleted) and collapses
  auto-generated "Corrective:" gap findings, so the action count is real, not inflated
  (`prepareDecisions` / `renderDecisionLines`, `lib/chairman/decision-layman.mjs`).
- Renders a copy-paste block; each line ends with `decision_type:id`. Free-text flags shown **as
  received** (no LLM, chairman 2026-06-14).

## Fail-soft doctrine (every section)

The email is engineered so **no single section can block the send**:

- The live VDR gauge failing → `visPct=null`, `"(gauge unavailable)"` line, email still sends.
- The rung-rollup / forecast / done-in-last-hour / decisions-consumed / watchdog lines each wrapped
  in their own try/catch → degrade to an honest empty/"unavailable" line.
- A **missing-run watchdog** (`assessAdamSourceWatchdog`) catches a *dropped* gauge run (no row
  written at all) and renders a degraded line — but the watchdog itself never blocks the email.
- After a successful send, the **send marker** is recorded; a marker-write failure is logged **LOUD**
  (it re-opens the duplicate-send path) but does not throw.

## Durable adherence marker (feeds link 13)

When the gauge produces a number (and not in dry-run), the email writes a durable *"Adam read the
vision gauge"* marker (`recordVisionGaugeRead`) so the adam-adherence audit
(`adam_adherence_ledger`) can measure the vision-monitoring duty. See [13-feedback-learning.md].

## The overall process (sequence)

1. Cron fires `adam-exec-email-cron.yml` → runs `adam-exec-summary.mjs`.
2. Fetch pending decisions → evaluate the quiescence gate (skip if fleet OFF + no actions).
3. WORKERS: average pulses (widen/live-fallback if sparse).
4. VISION: `computeBuildGauge` → `formatGaugeForSummary` → reuse-gauge `runRollup` (dry-run) →
   read `build_completion_forecast_log` → `formatForecastLine`.
5. DONE-IN-LAST-HOUR: load completed work in the half-open window since the last send marker.
6. ACTIONS: render `chairman_pending_decisions` as a copy-paste block.
7. Compose subject `[Chairman] EHG NN% built · N active · K actions for you` + text + HTML.
8. Send via Resend → record the send marker (LOUD on failure) → write the adherence marker.

## Existing documentation

- `docs/governance/chairman-decision-surfaces.md` lists the email as the ≥1-live-consumer of the
  decision queue. **Coverage: partial (mentions, doesn't explain the calc).**
- **Gap (filled here):** no doc explained the email's cadence, contents, *and especially how it
  calculates/reuses the gauge + forecast* + its fail-soft doctrine. This doc fills it — it is the
  thorough treatment the chairman asked for.

## Connects to

- **Reuses:** the build gauge ([10-vdr-build-gauge.md]), the rung rollup ([04-roadmap-waves.md]), the
  forecast ([12-forecasting.md]).
- **Surfaces:** fleet state ([08-belt-coordinator-fleet.md]) + pending decisions ([14-governance.md]).
- **Feeds:** the adherence ledger ([13-feedback-learning.md]).
