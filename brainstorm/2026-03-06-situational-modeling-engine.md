# Brainstorm: Situational Modeling Engine — Unified Prediction & Calibration System

## Metadata
- **Date**: 2026-03-06
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives) — from prior naming brainstorm, carried forward
- **Related Ventures**: PortraitPro AI (active)
- **Related SDs**: SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001 (in_progress), SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-J (completed)
- **Builds On**: `brainstorm/2026-03-06-mental-models-vs-forecasting-naming.md`

---

## Problem Statement

The EHG venture lifecycle has a `modeling_requests` DB table designed as a unified horizontal prediction engine with 7 request types and calibration columns — but **zero code reads from or writes to it**. Meanwhile, 4 of the 7 prediction types are already fully implemented in scattered synthesis components that bypass the table entirely. The remaining 3 types are unimplemented or partial.

Additionally, the naming "modeling" collides with the new "Mental Models Repository" (cognitive decision frameworks). The user has chosen **"situational modeling"** as the new name, which captures the full scope: modeling the situation (financial, market, competitive, timing, portfolio, survival) that a venture exists in.

The key value proposition of consolidation is the **self-improving calibration loop**: predictions made at Stage 0 are progressively calibrated against actual outcomes at Stages 3, 4, 5, 16, 23-25, and Operations mode.

## Discovery Summary

### The 7 Request Types — Current State

| Type | Status | Where It Lives Today |
|------|--------|---------------------|
| `time_horizon` | Fully live | `synthesis/time-horizon.js` — Component 6 |
| `build_cost` | Fully live | `synthesis/build-cost-estimation.js` — Component 8 |
| `portfolio_synergy` | Fully live | `synthesis/portfolio-evaluation.js` — Component 2 |
| `nursery_reeval` | Fully live (scattered) | `venture-nursery.js` + `discovery-mode.js` + `VentureMonitor` |
| `kill_gate_prediction` | Partial (phantom table) | `stage-of-death-predictor.js` → writes to non-existent `stage_of_death_predictions` |
| `competitive_density` | Sub-field only | Computed inside `assessTimeHorizon()`, not standalone |
| `market_trend` | Not implemented | Stub in `opportunity-discovery-service.js` throws error |

### Key Finding: The Table Is Completely Unused
- Zero Supabase `.from('modeling_requests')` queries exist in the codebase
- The `modeling.js` file (`generateForecast()`) calls LLM directly — never touches the table
- The table has calibration columns (`actual_outcome`, `prediction_accuracy`) that no code populates

### Existing Calibration Infrastructure (Disconnected)

| System | What It Does | Table | Gap |
|--------|-------------|-------|-----|
| Assumption-Reality Tracker | Compares Stage 0 assumptions to Stage 17+ reality | `assumption_sets` | Doesn't know about `modeling_requests` |
| Cross-Venture Learning | Kill-stage frequency, failed assumption patterns | `chairman_decisions` | No connection to prediction accuracy |
| Filter Calibration | Calibrates DFE thresholds against Chairman decisions | `chairman_decisions` | Only calibrates filters, not predictions |
| Stage-of-Death Predictor | Predicts which stage a venture dies at | Phantom `stage_of_death_predictions` | Table doesn't exist, no feedback loop |

### Naming Decision
- **"Situational Modeling"** chosen over "forecasting", "environmental modeling", "predictions"
- Rationale: Captures full scope (financial + market + competitive + timing + portfolio + survival predictions)
- Clearly distinct from "Mental Models" (cognitive decision frameworks)

---

## The 25-Stage Venture Lifecycle — Calibration Checkpoints

### Phase 1: THE TRUTH (Stages 1-5)
| Stage | Title | Calibration Role |
|-------|-------|-----------------|
| 1 | Idea Capture | Where Stage 0 predictions land |
| 2 | Idea Analysis | Creates Assumption Set V1 |
| 3 | **Kill Gate** | **First actual outcome** — venture survives or dies (7 metrics) |
| 4 | Competitive Landscape | **Actual competitive density data** |
| 5 | **Kill Gate (Financial)** | **Actual unit economics** — CAC, LTV, ROI |

### Phase 2: THE ENGINE (Stages 6-9)
| Stage | Title | Calibration Role |
|-------|-------|-----------------|
| 6 | Risk Assessment | Risk matrix (validates risk predictions) |
| 7 | Revenue Architecture | Pricing model (validates revenue assumptions) |
| 8 | Business Model Canvas | Full BMC (validates business model assumptions) |
| 9 | Exit Strategy | Exit planning, valuation targets |

### Phase 3: THE IDENTITY (Stages 10-12)
| Stage | Title | Calibration Role |
|-------|-------|-----------------|
| 10 | Customer & Brand Foundation | Persona validation |
| 11 | Naming & Visual Identity | Brand tournament results |
| 12 | GTM & Sales Strategy | Channel strategy validation |

### Phase 4: THE BLUEPRINT (Stages 13-16)
| Stage | Title | Calibration Role |
|-------|-------|-----------------|
| 13 | **Product Roadmap (Kill Gate)** | Roadmap completeness gate |
| 14 | Technical Architecture | Data model decisions |
| 15 | Risk Register | Story breakdown (validates build_cost scope) |
| 16 | **Financial Projections (Promotion Gate)** | **Detailed financial projections vs Stage 0 forecast** |

### Phase 5: THE BUILD LOOP (Stages 17-22)
| Stage | Title | Calibration Role |
|-------|-------|-----------------|
| 17 | Pre-Build Checklist | Build cost reality begins |
| 18 | Sprint Planning | Capacity vs estimates |
| 19 | Build Execution | Actual LOC, actual timeline |
| 20 | Quality Assurance | Security/performance reality |
| 21 | Build Review | QA pass rate |
| 22 | **Release Readiness (Promotion Gate)** | Phase 5→6 gate |

### Phase 6: THE LAUNCH (Stages 23-25)
| Stage | Title | Calibration Role |
|-------|-------|-----------------|
| 23 | Marketing Preparation | **Reality data collection begins** (Golden Nugget) |
| 24 | Launch Readiness | **DAU/MAU, NPS, feature adoption** — actual metrics |
| 25 | **Launch Execution** | **Generates Assumptions vs Reality Report**, sets `pipeline_mode = 'operations'` |

### Operations Mode (Post-Stage 25)
| Worker | Cadence | Calibration Role |
|--------|---------|-----------------|
| `ops_metrics_collect` | Every 6h | **AARRR metrics** — continuous calibration data |
| `ops_financial_sync` | Hourly | Financial contract validation |
| `ops_health_score` | Hourly | Venture health monitoring |
| VentureMonitor | Continuous | Portfolio health, nursery re-eval triggers |

---

## The Self-Improving Calibration Loop

### Progressive Calibration (Not Binary)

```
Stage 0: PREDICT (all 7 situational modeling types)
    |
Stage 3: EARLY CALIBRATE (kill gate survival - fastest feedback)
    |
Stage 4-5: PARTIAL CALIBRATE (competitive reality, financial reality)
    |
Stage 16: REFINED CALIBRATE (detailed financial projections vs forecast)
    |
Stage 23-24: REALITY COLLECTION (actual market data flows in)
    |
Stage 25: FORMAL CALIBRATION REPORT (assumptions vs reality)
    |
Operations: CONTINUOUS CALIBRATION (AARRR metrics every 6h)
    |
    --> Feed accuracy data back to Stage 0 for next venture
```

### Self-Improvement Mechanism

After enough ventures pass through:

```sql
SELECT request_type,
       AVG(prediction_accuracy) as avg_accuracy,
       COUNT(*) as sample_size
FROM situational_modeling_requests
WHERE actual_outcome IS NOT NULL
GROUP BY request_type
```

This enables:
1. **Confidence adjustment**: Weak prediction categories get lower confidence scores
2. **Weight adjustment**: Profile service downweights poorly-predicting components
3. **Archetype-specific calibration**: "For democratizers, build_cost is 85% accurate but for automators only 60%"
4. **Cross-venture learning**: Patterns across 5+ ventures feed back into next venture's predictions

### Golden Nugget Connection

The `stages_v2.yaml` "Assumptions vs Reality" golden nugget already defines:
- **Create** assumption set at Stage 2-3
- **Update** with financial inputs at Stage 5
- **Collect reality** at Stages 23-24
- **Generate calibration report** at Stage 25

The `situational_modeling_requests` table is the **prediction side** of this loop.
The assumption-reality tracker (`lib/eva/utils/assumption-reality-tracker.js`) is the **calibration side**.
They need to be connected.

---

## Clean Separation: Mental Models vs Situational Modeling

| Aspect | Mental Models | Situational Modeling |
|--------|--------------|---------------------|
| **Purpose** | Guide HOW to think about a venture | Predict WHAT will happen to a venture |
| **Nature** | Qualitative frameworks | Quantitative predictions with confidence intervals |
| **Output** | Advisory analysis, scored evaluations | Projections, forecasts, probabilities |
| **Calibration** | Effectiveness tracking (which models correlate with success) | Prediction accuracy (how close to reality) |
| **Tables** | `mental_models`, `mental_model_applications`, `mental_model_effectiveness` | `situational_modeling_requests` |
| **Self-improvement** | Rank/prioritize models by effectiveness | Adjust confidence/weights by accuracy |
| **Synthesis role** | Component 14 (advisory, not weighted) | Components 2, 6, 8 + post-synthesis forecast |

Mental models ask: "Are we thinking about this correctly?"
Situational modeling asks: "What will actually happen?"

---

## Analysis

### Arguments For Consolidation
1. **Single calibration spine** — one table to track all predictions and compare to reality
2. **Cross-type accuracy analysis** — "build_cost predictions are 30% too optimistic for democratizers"
3. **Progressive calibration** — start improving at Stage 3, not Stage 25
4. **Connects 4 existing disconnected systems** (assumption tracker, cross-venture learning, filter calibration, stage-of-death predictor)
5. **Golden Nugget alignment** — the assumption vs reality framework was designed for exactly this
6. **70% of pieces exist** — synthesis components, calibration infrastructure, operations workers

### Arguments Against Consolidation
1. **Synthesis components currently write to `metadata.synthesis.*`** — changing this breaks downstream consumers
2. **Dual-write needed initially** — synthesis results must still populate metadata AND the new table
3. **Calibration data is sparse** — few ventures have reached Operations, so feedback loop is cold-start
4. **Market trend and competitive density need new code** — not just wiring existing pieces
5. **Operations workers don't write calibration data today** — need new calibration hooks

### Implementation Priority

| Priority | Work Item | Effort |
|----------|-----------|--------|
| 1 | Rename table → `situational_modeling_requests` | Small |
| 2 | Wire synthesis components to INSERT prediction records at Stage 0 | Medium |
| 3 | Wire Stage 3 kill gate to write `actual_outcome` for `kill_gate_prediction` | Small |
| 4 | Wire Stage 5 financial gate to calibrate financial predictions | Small |
| 5 | Wire Stage 4 competitive analysis to calibrate `competitive_density` | Small |
| 6 | Connect assumption-reality tracker at Stage 23-25 | Medium |
| 7 | Wire operations `ops_metrics_collect` for continuous calibration | Medium |
| 8 | Build standalone `market_trend` analysis | Large |
| 9 | Elevate `competitive_density` to standalone component | Medium |
| 10 | Build confidence adjustment loop using cross-venture accuracy | Medium |

---

## Open Questions
1. Should synthesis components dual-write (metadata.synthesis + situational_modeling_requests) or migrate fully to the table?
2. How many ventures need to complete the full lifecycle before calibration data becomes statistically meaningful?
3. Should the financial forecast at Stage 5 (`stage-05-financial-model.js`) be formalized as a situational modeling request type, or is it a separate system?
4. Should nursery_reeval write a prediction at park time ("will become viable when X") for later calibration?

## Suggested Next Steps
1. Create Vision document for Situational Modeling Engine
2. Create Architecture Plan linking to vision
3. Register both in EVA for HEAL scoring
4. Create multi-SD orchestrator for phased implementation
