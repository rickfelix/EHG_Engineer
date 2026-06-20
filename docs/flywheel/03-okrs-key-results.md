---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, okr, key-results, measurement]
---

# Link 3 — OKRs / Key Results

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

Key Results are the **measurement instrument for the outcome rungs (V2/V3)** — and for several
operational-nature V1 capabilities. Where the build gauge (link 10) measures *buildable*
capabilities by probing code/tables, OKRs measure *outcomes* (live signals: breakage-caught
rate, governance cascade operational, income, distance-to-quit). They are how the system knows
whether an *operational* capability has actually flipped.

## Source of truth (verified 2026-06-20)

- **`key_results`** (43 rows). Key columns: `objective_id`, `code` (e.g. `KR-GOV-3.1`),
  `metric_type`, `baseline_value`, `current_value`, `target_value`, `direction`
  (increase/decrease), `status`, `is_active`, `vision_dimension_code`.
- **`sd_key_result_alignment`** (73 rows): links an SD to the key result(s) it contributes to
  (`sd_id`, `key_result_id`, `contribution_type`, `contribution_weight`). This is how shipped
  work is *credited* to an outcome — part of closing the loop (link 13).
- **`roadmap_waves.okr_objective_ids`** (uuid[]): a wave's linked objectives — how an *outcome*
  wave's progress is derived (see below).

## The progress formula (verified in code)

A single KR's progress %, mirroring the `v_okr_hierarchy` SQL view, is implemented purely in
`lib/vision/rung-progress-rollup.mjs` `krProgressPct(kr)`:

```
reject if baseline/current/target is null      (Number(null)===0 would fabricate a span)
b, cur, t = Number(baseline, current, target)
decrease  = direction === 'decrease'
denom     = decrease ? (b - t) : (t - b)
if denom === 0 → null                            (zero span = undefined, never 0%-by-fiat)
num       = decrease ? (b - cur) : (cur - b)
pct       = clamp(0..100, num / denom * 100)
```

- `aggregateKrProgress(krRows)` = the mean over *measurable* KRs (nulls skipped, never coerced to
  0). This is the **honesty doctrine**: an unmeasurable KR yields `null` + a reason, never a
  fabricated 0%.

## How KRs roll up into rung/wave progress

`computeWaveRollup` (same module) decides each wave's `progress_pct` **type-aware**:

- **Build rung** (the active rung, V1) → reuse `computeBuildGauge.build_pct` (link 10). Outcome
  KRs are *not* used for the build rung.
- **Outcome rung** (V2/V3) → mean of `aggregateKrProgress` over the KRs under the wave's
  `okr_objective_ids`. If the wave has no linked objectives or no measurable KRs → `null` + reason
  (honest, never 0%).

So OKRs are the *measurement substrate* for the future (outcome) rungs, while the build gauge is
the substrate for the present (foundation) rung. See [04-roadmap-waves.md] for how this writes
`roadmap_waves.progress_pct`, and [15-executive-summary-email.md] for how it reaches the chairman.

## Existing documentation

- `docs/reference/schema/engineer/tables/key_results.md`, `sd_key_result_alignment.md`,
  `okr_vision_alignment_records.md` — schema. **Coverage: good (schema).**
- `database/migrations/20260104_okr_strategic_hierarchy.sql` — the `v_okr_hierarchy` formula
  (the SQL the JS mirrors). **Coverage: good (code).**
- **Gap:** no doc explained that OKRs measure the *outcome* rungs while the gauge measures the
  *build* rung, nor traced the progress formula for a reader. This doc fills it.

## Connects to

- **Up from:** Vision ladder ([02-vision-ladder.md]) — KRs are the operational/outcome measure.
- **Down to:** Roadmap waves ([04-roadmap-waves.md]) — `okr_objective_ids` drives outcome-wave %.
- **Closes the loop:** `sd_key_result_alignment` credits shipped SDs to KRs ([13-feedback-learning.md]).
- **Governance:** the monthly OKR generator parks generations for chairman acceptance
  (`okr_generation_log`, surface 5 in `docs/governance/chairman-decision-surfaces.md`).
