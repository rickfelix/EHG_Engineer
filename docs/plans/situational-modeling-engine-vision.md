# Vision: Situational Modeling Engine — Unified Prediction & Calibration System

## Executive Summary

The EHG venture lifecycle generates predictions at Stage 0 — time horizon positioning, build cost estimates, kill gate survival probability, competitive density assessments, market trend analysis, portfolio synergy scores, and nursery re-evaluation triggers — but these predictions are never tracked, never compared to reality, and never used to improve future predictions. The `modeling_requests` database table was designed to be the unified prediction spine (7 request types, calibration columns for `actual_outcome` and `prediction_accuracy`), but zero code reads from or writes to it. Meanwhile, 4 of the 7 prediction types are fully implemented in scattered synthesis components that bypass the table entirely.

The Situational Modeling Engine consolidates all 7 prediction types into a single tracked system with a progressive calibration loop. Predictions made at Stage 0 are calibrated against actual outcomes at Stage 3 (first kill gate), Stage 4 (competitive reality), Stage 5 (financial reality), Stage 16 (refined financial projections), Stages 23-25 (launch reality data), and Operations mode (continuous AARRR metrics every 6 hours). Over time, the system learns which prediction categories are accurate, which are consistently optimistic or pessimistic, and adjusts confidence scores and weights accordingly — per archetype, per entry path, and across the full venture portfolio.

The name "Situational Modeling" was chosen to capture the full scope: modeling the *situation* (financial, market, competitive, timing, portfolio, survival) that a venture exists in. This is clearly distinct from "Mental Models" (cognitive decision frameworks), which guide *how* to think about a venture rather than predicting *what will happen*.

## Problem Statement

The EHG 25-Stage Venture Workflow makes hundreds of quantitative predictions per venture — from initial market sizing through build cost estimation to kill gate survival probability — but these predictions exist in a fire-and-forget state:

1. **Predictions are scattered across synthesis components** — `time-horizon.js` (Component 6), `build-cost-estimation.js` (Component 8), `portfolio-evaluation.js` (Component 2), and others each compute predictions independently and store results in `metadata.synthesis.*` on the venture brief. No central prediction registry exists in practice.

2. **The `modeling_requests` table is completely unused** — designed with 7 request types, confidence intervals, and calibration columns (`actual_outcome`, `prediction_accuracy`), but zero Supabase queries exist in the codebase. The table is a phantom.

3. **No feedback loop exists** — when a venture passes Stage 3's Kill Gate, no system records "kill_gate_prediction was correct." When Stage 5 reveals actual unit economics, no system compares them to Stage 0's financial forecast. The calibration columns sit empty.

4. **Four existing calibration systems are disconnected** — the Assumption-Reality Tracker (`assumption_sets` table), Cross-Venture Learning (`chairman_decisions` analysis), Filter Calibration (DFE threshold tuning), and Stage-of-Death Predictor (writes to a phantom table) each do partial calibration work in isolation, with no connection to the prediction source.

5. **Three prediction types are unimplemented or partial** — `kill_gate_prediction` writes to a non-existent `stage_of_death_predictions` table, `competitive_density` is computed as a sub-field inside `assessTimeHorizon()` rather than standalone, and `market_trend` has only a stub that throws an error.

The core user — Rick, as EHG Chairman — needs a self-improving prediction system that gets measurably better with each venture that passes through the lifecycle, enabling higher-confidence investment decisions and more accurate portfolio planning.

## Personas

### Rick (EHG Chairman / Primary Operator)
- **Goals**: Make higher-confidence venture investment decisions based on calibrated predictions; understand which prediction categories are reliable and which are weak; build institutional forecasting knowledge that compounds across ventures.
- **Mindset**: Data-driven, portfolio-oriented, efficiency-focused. Values predictions with calibrated confidence intervals over point estimates. Wants the system to learn from its own mistakes.
- **Key Activities**: Reviews Stage 0 venture briefs with prediction summaries, makes kill gate decisions at Stages 3/5/13, reviews financial projections at Stage 16, monitors portfolio health in Operations. Interacts with predictions as part of existing Chairman Review flows.

### The AI System (Stage 0 + Stage Templates + Operations Workers)
- **Goals**: Generate accurate predictions at Stage 0, record actual outcomes at calibration checkpoints, compute prediction accuracy, and adjust future predictions based on accumulated accuracy data.
- **Mindset**: Deterministic calibration (comparing structured prediction vs actual outcome), stochastic prediction (LLM-generated forecasts with confidence ranges). Fail-safe: never block existing pipeline for calibration failures.
- **Key Activities**: Inserts prediction records at Stage 0, captures actual outcomes at stages 3, 4, 5, 16, 23-25, writes continuous calibration data in Operations mode, computes cross-venture accuracy metrics.

### Future Venture Managers / Portfolio Analysts
- **Goals**: Access calibrated prediction accuracy data without understanding the underlying prediction mechanics. Know which prediction types are trustworthy for a given archetype.
- **Mindset**: Results-oriented. Interested in "how accurate is our build cost estimation for marketplace ventures?" not "how does the LLM prompt work."
- **Key Activities**: View prediction accuracy dashboards (future UI), filter by archetype/path/category, use calibration data in investment committee discussions.

## Information Architecture

### Views and Routes (No New UI in Phase 1-3)

The Situational Modeling Engine operates entirely within existing backend flows in early phases:

| Existing Flow | Situational Modeling Integration |
|--------------|----------------------------------|
| Stage 0 Synthesis Pipeline | INSERT prediction records for each applicable request type after synthesis components complete |
| Venture Brief (post-Stage 0) | `metadata.synthesis.*` preserved (dual-write); new `situational_modeling_requests` rows added |
| Stage 3 Kill Gate | Write `actual_outcome` for `kill_gate_prediction` — first calibration checkpoint |
| Stage 4 Competitive Landscape | Write `actual_outcome` for `competitive_density` — actual competitive data |
| Stage 5 Financial Kill Gate | Write `actual_outcome` for `build_cost` and financial predictions — actual unit economics |
| Stage 16 Financial Projections | Refined calibration — compare Stage 16 detailed projections to Stage 0 forecast |
| Stage 25 Launch Execution | Formal Assumptions vs Reality report (connects to existing Golden Nugget) |
| Operations (`ops_metrics_collect`) | Continuous calibration with AARRR metrics every 6 hours |
| Cross-Venture Learning | Accuracy patterns across 5+ ventures feed into next venture's predictions |

### Data Sources

| Source | Purpose |
|--------|---------|
| `situational_modeling_requests` (renamed from `modeling_requests`) | Central prediction + calibration spine |
| `venture_briefs.metadata.synthesis.*` | Existing prediction data (preserved via dual-write) |
| `assumption_sets` | Assumption-Reality Tracker integration (calibration side) |
| `chairman_decisions` | Kill gate outcomes (actual vs predicted) |
| `venture_artifacts` | Stage completion data and actual outcomes |
| `operations_metrics` | AARRR metrics from Operations workers |

## Key Decision Points

1. **Dual-Write vs Full Migration**: Synthesis components must continue writing to `metadata.synthesis.*` for backward compatibility with existing consumers (Chairman UI, venture brief display, profile scoring). The `situational_modeling_requests` table receives parallel writes. Full migration occurs only after all consumers are updated (Phase 4+).

2. **Progressive vs Binary Calibration**: Calibration is progressive — a prediction's accuracy improves through multiple checkpoints (Stage 3 → 5 → 16 → 25 → Operations), not a single pass/fail at the end. Each checkpoint writes a partial `actual_outcome` and recomputes `prediction_accuracy`.

3. **Cold-Start Problem**: Few ventures have completed the full lifecycle. Calibration data is sparse initially. The system must degrade gracefully — showing "insufficient data" confidence caveats rather than false precision.

4. **Stage-of-Death Predictor Integration**: Currently writes to a phantom `stage_of_death_predictions` table. Must be redirected to `situational_modeling_requests` with `request_type = 'kill_gate_prediction'`.

5. **Standalone vs Sub-field Predictions**: `competitive_density` is currently computed inside `assessTimeHorizon()` as a sub-field. Elevating it to a standalone prediction type requires extracting the logic without breaking the time horizon component.

6. **Market Trend Implementation**: Currently a stub that throws an error. Requires new implementation — the only prediction type that needs significant new code rather than wiring existing components.

## Integration Patterns

### Pattern 1: Synthesis → Prediction Record (Stage 0)
After each synthesis component completes, a prediction record is inserted into `situational_modeling_requests` with the component's output as `projections`, the component's confidence score as `confidence_interval`, and the venture's archetype and entry path as `input_parameters`.

### Pattern 2: Stage Gate → Calibration Write (Stages 3, 5, 13, 16)
When a stage gate decision is made (pass/revise/kill), the gate handler writes `actual_outcome` to the matching prediction record and recomputes `prediction_accuracy` as the delta between predicted and actual values.

### Pattern 3: Assumption-Reality Connection (Stages 23-25)
The existing `assumption-reality-tracker.js` produces a calibration report at Stage 25. This report is cross-referenced with prediction records to populate `actual_outcome` for any predictions that weren't already calibrated at earlier stages.

### Pattern 4: Continuous Calibration (Operations)
The `ops_metrics_collect` worker (runs every 6h) writes AARRR metrics. New calibration hooks compare these metrics against Stage 0 predictions for growth trajectory, market sizing, and revenue projections.

### Pattern 5: Cross-Venture Learning Loop
After N ventures (threshold: 5) have completed the same request type with actual outcomes, the system computes aggregate accuracy by archetype and request type. This feeds back into Stage 0 as confidence adjustments: weak categories get lower confidence scores, strong categories get higher ones.

## Evolution Plan

### Phase 1: Foundation (1-2 SDs)
- Rename `modeling_requests` → `situational_modeling_requests` (table + indexes + RLS)
- Wire 4 existing synthesis components (time_horizon, build_cost, portfolio_synergy, nursery_reeval) to INSERT prediction records at Stage 0
- Wire Stage 3 kill gate to write `actual_outcome` for `kill_gate_prediction`

### Phase 2: Calibration Wiring (2-3 SDs)
- Wire Stage 5 financial gate to calibrate build_cost and financial predictions
- Wire Stage 4 competitive analysis to calibrate `competitive_density`
- Connect assumption-reality tracker at Stages 23-25
- Redirect stage-of-death predictor to use `situational_modeling_requests`

### Phase 3: Missing Predictions (1-2 SDs)
- Elevate `competitive_density` to standalone prediction component
- Build standalone `market_trend` analysis
- Wire Operations `ops_metrics_collect` for continuous calibration

### Phase 4: Self-Improvement Loop (1-2 SDs)
- Build cross-venture accuracy analysis (per request_type, per archetype)
- Implement confidence adjustment loop using accumulated accuracy data
- Connect to profile service for weight adjustment based on prediction quality
- Operations dashboard widget showing prediction accuracy trends

## Out of Scope

- **No new UI elements in Phases 1-3** — all integration is backend-only. UI visualization of prediction accuracy is Phase 4+.
- **No changes to Stage 0 orchestrator control flow** — synthesis components continue to run via existing `runSynthesis()` pipeline. Prediction recording is additive.
- **No migration of existing `metadata.synthesis.*` data** — dual-write preserves backward compatibility. Existing venture briefs are not retroactively migrated.
- **Mental Models Repository** — a separate system (SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001) that guides *how* to think, not *what will happen*. Completely separate tables, code, and SDs.
- **External data feeds** — market_trend analysis uses LLM-generated predictions, not live market data feeds (e.g., stock prices, industry reports). External data integration is a future enhancement beyond this vision.
- **Real-time prediction updates** — predictions are made once at Stage 0 and calibrated at checkpoints. No live recalculation during stage progression.

## UI/UX Wireframes

N/A — no UI component in Phases 1-3. The Situational Modeling Engine operates entirely within existing backend flows. Prediction data is stored in the database and visible through existing venture brief metadata.

Future Phase 4 UI concept (Operations dashboard widget):
```
┌─────────────────────────────────────────────────┐
│  Prediction Accuracy by Category                │
│                                                 │
│  time_horizon     ████████░░  82%  (n=12)       │
│  build_cost       ██████░░░░  63%  (n=14)       │
│  portfolio_synergy████████░░  78%  (n=9)        │
│  kill_gate_pred   █████████░  91%  (n=18)       │
│  competitive_dens ████░░░░░░  42%  (n=6)        │
│  nursery_reeval   ███████░░░  71%  (n=4)        │
│  market_trend     ░░░░░░░░░░  --   (n=0)        │
│                                                 │
│  Overall: 72% avg accuracy  |  63 predictions   │
│  ⚠ competitive_density needs attention (<50%)   │
└─────────────────────────────────────────────────┘
```

## Success Criteria

1. **Prediction Recording Coverage**: ≥4 of 7 request types have working INSERT-at-Stage-0 logic within Phase 1.
2. **First Calibration Checkpoint**: Stage 3 kill gate writes `actual_outcome` for at least `kill_gate_prediction` within Phase 1.
3. **Calibration Pipeline Depth**: ≥3 calibration checkpoints (stages 3, 5, and 25) are wired within Phase 2.
4. **Zero Regression on Synthesis Pipeline**: All existing `metadata.synthesis.*` consumers continue to work unchanged. All existing tests pass.
5. **Prediction Accuracy Queryable**: After 5+ ventures complete Stage 3, an SQL query can compute average prediction accuracy per request type.
6. **Full Request Type Coverage**: All 7 request types have working prediction + calibration logic within Phase 3.
7. **Self-Improvement Signal**: After 10+ ventures, the system produces archetype-specific accuracy data (e.g., "for democratizers, build_cost is 85% accurate but for automators only 60%") within Phase 4.
8. **Assumption-Reality Connection**: Stage 25 calibration report incorporates prediction accuracy data from `situational_modeling_requests` within Phase 2.
9. **Operations Continuous Calibration**: `ops_metrics_collect` writes calibration data to prediction records for revenue and growth trajectory within Phase 3.
10. **Clean Naming Separation**: Zero naming collisions between "situational modeling" code/tables and "mental models" code/tables — verified by grep.
