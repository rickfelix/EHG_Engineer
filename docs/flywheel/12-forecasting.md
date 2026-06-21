---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, forecasting, eta, ewma, self-correcting]
---

# Link 12 — Forecasting (Build-Completion ETA)

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

The forecaster estimates the **date the BUILDABLE scope reaches 100%** — the chairman's "when will
the foundation be built?" answer. It is honest about the *sourcing-bound* case (if nothing is queued
and nothing is being sourced, it reports a **PLATEAU**, never a false date) and it **self-corrects**
its learned parameters against observed reality. Operational capabilities are excluded (they need
live ventures).

## Source of truth (verified — `lib/vision/build-completion-forecast.mjs`, 186 lines)

- **`computeForecast(i)`** — the pure forecast (all IO injected; `nowMs` required, deterministic).
- **`build_completion_forecast_log`** table — **APPLIED 2026-06-20** (chairman-authorized,
  `[MIGRATION_APPLY_PROD_PASS]`, additive-only) persistence. The forecast computes regardless of the
  table; with the table live and the first row persisted, the email ETA line now renders (the line
  fail-softs to omitted only if the table ever has no rows / errors).

## Inputs (what it consumes)

| Input | Meaning | Sourced from |
|-------|---------|--------------|
| `buildPct` | current VDR `build_pct` (0–100) | the build gauge (link 10) |
| `buildableRemaining` | count of buildable caps not yet built | the build gauge components |
| `velocityPerDay` | completed SDs/day (recent window) | shipped-SD history |
| `sourcingPerDay` | new claimable buildable SDs/day (recent window) | sourcing history |
| `queueDepth` | claimable buildable SDs available now (deps met) | the belt |
| `capsPerCompletion` | LEARNED: buildable caps advanced per completed SD (default 1) | EWMA self-correction |

## The calculation (traced)

1. **Early exits:** `buildPct ≥ 100` → ETA 0; `buildableRemaining === 0` → ETA 0 (gauge may lag).
2. **Throughput:** `velocityCapsPerDay = velocityPerDay × capsPerCompletion`.
3. **PLATEAU (honest):** if `queueDepth === 0` AND `sourcingPerDay < 0.05` (SOURCING_EPS) → **no
   date**, report a plateau at the current % until sourced.
4. **Velocity stalled but work exists:** `velocityCapsPerDay < 1e-6` → unknown ETA, `velocity`-bound.
5. **Two-phase ETA (the normal case):**
   - `capsCoveredByQueue = min(buildableRemaining, queueDepth × capsPerCompletion)`.
   - `capsNeedingSourcing = buildableRemaining − capsCoveredByQueue`.
   - **Phase 1** (burn the queue): `daysQueuePhase = capsCoveredByQueue / velocityCapsPerDay`.
   - **Phase 2** (source the rest): if sourcing ~0 → partial-then-plateau; else
     `daysSourcingPhase = capsNeedingSourcing / min(velocityCapsPerDay, sourcingCapsPerDay)` — the
     **slower** of "complete what's sourced" vs "source the rest" governs the tail.
   - `etaDays = daysQueuePhase + daysSourcingPhase`; `etaDateIso = nowMs + etaDays`.
   - **bindingConstraint** = `velocity` | `sourcing` | `plateau` | `none` (what's gating completion).

## Confidence model (two-factor)

`confidence = downgradeForHorizon( forecastConfidence(...), etaDays )`:

- **forecastConfidence** by constraint mix: `velocity ≤ 0` → low; sourcing-share > 0.5 → low
  (mostly gated by the volatile sourcing variable); > 0 → medium; fully queue-covered → high.
- **downgradeForHorizon** caps confidence by distance: `etaDays > 365` caps at low; `> 120` caps at
  medium. *A 168-day linear projection should never read "high" to the chairman, even if
  mathematically correct.*

## Self-correction (EWMA, clamped)

`adjustLearnedRate(prior, observed, alpha=0.3)` nudges `capsPerCompletion` toward observed reality
each run. **Critical safety (FR-3):** the EWMA nudge (×1.1/×0.9) has **no fixed point**, so an
un-clamped value drifts geometrically over many runs (→ hundreds or → 0), collapsing every ETA. It
is therefore **clamped to `[0.2, 5]`** (`CAPS_PER_COMPLETION_MIN/MAX`) on both read and adjust.
`scoreForecastError(prior, actual)` measures how far a prior forecast was off (signed/abs error days,
plateau_broke/plateau_held) to feed the trend.

> **General lesson encoded:** any multiplicative self-learning nudge needs a hard clamp.

## Output line (link 15)

`formatForecastLine(f, prevF)` renders the single exec-summary line, e.g.:
*"Estimated completion (infra-build scope): 2026-08-11 (~52d, sourcing-bound) (medium [Δ +4d vs last])"*
or, when plateaued, *"PLATEAU at 23% until sourced."* The Δ vs the prior run shows movement.

## First persisted live forecast (`build_completion_forecast_log` row `2f81e572`, 2026-06-20)

The first row written after the migration was applied:

| Field | Value |
|-------|-------|
| `build_pct` | 23 |
| `buildable_remaining` | 12 |
| `queue_depth` | 3 |
| `velocity_per_day` | 27.64 |
| `sourcing_per_day` | 0.36 |
| `binding_constraint` | `sourcing` |
| `eta_date` | 2026-07-16 |
| `confidence` | `low` |

Rendered exec-email line: `Estimated completion (infra-build scope): 2026-07-16 (~26d,
sourcing-bound) (low)`. This is the expected shape while V1 is sourcing-constrained — the binding
constraint being `sourcing` is itself a signal to activate the engine / distill the backlog
(links 6/7), and the `low` confidence is the horizon/constraint-mix cap doing its job.

> **[Two different `build_pct` numbers — not a contradiction]** The forecaster's `build_pct = 23` is a
> **conservative, narrower** metric: the active-rung (V1) **BUILDABLE** capabilities actually built
> (~3 of ~15). The **VDR gauge `overall_pct` ≈ 55%** ([10-vdr-build-gauge.md]) is a **blended** metric
> across **all** probed capabilities and layers (buildable + operational, all rungs probed). They
> measure **different scopes**, so 23 vs 55 is expected — not a discrepancy. The **ETA deliberately
> uses the conservative buildable measure**, so the completion date reflects only the foundation work
> the fleet can actually finish by shipping code.

## Fail-soft behavior

- `build_completion_forecast_log` with no rows / any read error → the email line is **omitted**,
  never blocks the email (link 15 wraps the read in try/catch). (The table is applied as of
  2026-06-20 and now holds rows, so the line renders; the omit-path remains the safety net.)
- `computeForecast` is pure and total; bad inputs are coerced (nonNeg/clampPct) rather than thrown.

## Existing documentation

- **Gap:** no prior doc covered the forecaster at all (it is recent — SD-LEO-INFRA-BUILD-COMPLETION-
  FORECAST-001). This doc + the source file are the documentation.

## Connects to

- **Up from:** the build gauge ([10-vdr-build-gauge.md]) + velocity/sourcing/queue from the fleet &
  sourcing layers ([08-belt-coordinator-fleet.md], [07-sourcing-engine.md]).
- **Reports up via:** the executive summary email ([15-executive-summary-email.md]).
- **Signals back:** a `sourcing`-bound forecast nudges activate/distill ([06-adam-sourcing.md]).
