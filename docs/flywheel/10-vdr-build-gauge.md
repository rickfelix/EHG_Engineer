---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, vdr, build-gauge, measurement, computeBuildGauge]
---

# Link 10 — VDR Build Gauge

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

The Vision Denominator Registry (VDR) build gauge is the system's **"% built" instrument** for the
**active rung**. It is the steering signal: it tells the chairman how far V1 is, drives the
forecast (link 12), feeds prioritization's "needle-movers" (link 11), and leads the executive email
(link 15). Crucially it is **measured independently of any "done" declaration** — it probes live
signals, so completion can't be faked.

## Source of truth (verified — `lib/vision/vdr-registry.js`, 546 lines)

- **`computeBuildGauge({ io, visionSource })`** — the gauge function.
- **`VDR_REGISTRY`** — one entry per capability `{ capability, layer, probe, nature }`.
- **`vision_build_gauge`** table (85 rows) — the historized results. Latest read 2026-06-20:
  **`overall_pct = 55`, `available = true`.**
- **`vdr-probes.js`** — the typed probe runner (`row_predicate`, `kr_status`, `code_grep`,
  `db_count`, `count_ratio`).

## The calculation (traced)

**Denominator** = the active rung's REQUIRED capabilities, read from the DB via `dbVisionSource(io)`:
`vision_ladder_rungs WHERE is_active` → `vision_ladder_criteria` (ordered by `ordinal`). The gauge
re-points automatically when the chairman activates the next rung.

**Numerator** = one **typed probe per capability** run against **live signals** (no LLM in steady
state). Each probe returns a status scored by `STATUS_SCORE`:

```
built: 1   ·   partial: 0.5   ·   unbuilt: 0   ·   unknown: null  (EXCLUDED from the denominator)
```

**`overall_pct`** = `round(100 × Σ score / count(scored))` over capabilities whose status is **not**
`unknown`. Unknowns are excluded so the % is **never fabricated** — and if *zero* capabilities are
probeable (e.g. DB unreachable), the gauge returns `available:false` / `overall_pct:null`, NOT a
confident false 0%.

**Per-layer** breakdown over `LAYERS = [infrastructure, application, venture, process]`.

### Buildable vs operational split (the anti-conflation guard)

`computeBuildGauge` additionally computes (using each entry's `nature`):

- **`build_pct`** = % over **buildable** capabilities only — *the honest "fleet-build" number* the
  chairman cares about.
- **`operational_pct`** + `operational_status` = the operational set's honest band, shown
  **separately** (built/awaiting/unmeasured) so it is never silently dragged to 0 nor folded into
  the build number.

This is why the email can say *"V1 foundation: NN% built (buildable) — NN% operational — income/
north-star tracked separately on V2."* See [progression-gate.md] for why this split matters.

### Probe types in the registry (examples, verified)

| Capability (example) | Probe | Notes |
|----------------------|-------|-------|
| A queryable, structured north star | `row_predicate` on `north_star` (status chairman_ratified) | link 1 coupling |
| Solo-operator survivability | `kr_status` KR-2026-07-02 | operational |
| Capability Registry | `db_count` `sd_capabilities` min 50 | population proxy |
| The cockpit | `code_grep` repo `ehg` (7 shipped surfaces) | product-side; `present` capped at PARTIAL |
| Backlog distilled and dispositioned | `count_ratio` `sd_backlog_map` disposition not null | fail-soft to unknown if column absent |

> **Anti-inflation rule:** `code_grep` `present` is honestly capped at **partial (0.5)**, never
> `built` — code presence is *intent*, not a *live realization*. Promoting to `built` requires a
> live coverage/enforce probe.

## Coherence gating

If the parsed vision capabilities and `VDR_REGISTRY` have **drifted**
(`assertRegistryCoherence().ok === false`), the gauge **withholds** (returns `available:false`)
rather than measure a wrong denominator. Ladder/roadmap placement coherence
(`assertLadderRoadmapCoherence`) is computed every run but is **advisory-only** — it can never
suppress the live gauge.

## Display mapping (single source)

`formatGaugeForSummary(gauge)` is the **single** display mapping shared by the exec-summary email
(link 15) AND the Chairman-UI tile — so both render the same number the same way (no divergence). It
emits `buildLine`, `rungLine`, `operationalLine`, `rungNatureLine`, `layerLine`, `note`.

## Rung rollup reuse

`runRollup` (`rung-progress-rollup.mjs`) reuses **this exact gauge** (`computeGaugeFn` thunk → no
second compute, no divergence) to populate `roadmap_waves.progress_pct` for the build rung — see
[04-roadmap-waves.md].

## Existing documentation

- `docs/reference/schema/engineer/tables/vision_build_gauge.md` — schema. **Coverage: good (schema).**
- `docs/reference/vision/`, `docs/reference/vision-fidelity-gate.md` — adjacent vision-gate docs.
- `docs/vision/ladder-roadmap-coherence.md` — the per-rung/per-nature reporting. **Coverage: good.**
- **Gap (filled here):** no doc traced the gauge calculation (denominator/numerator/scoring/buildable
  split/coherence-gating) for a reader. This doc fills it.

## Connects to

- **Up from:** the active rung's criteria ([02-vision-ladder.md]); measures shipped work
  ([09-leo-execution.md]).
- **Feeds:** the forecast ([12-forecasting.md]), prioritization ([11-prioritization.md]), the
  rung rollup ([04-roadmap-waves.md]), and the exec email ([15-executive-summary-email.md]).
- **Steers sourcing:** the gauge-gap-miner mines this gauge for unbuilt caps ([07-sourcing-engine.md]).
