# Architecture Plan: Situational Modeling Engine — Unified Prediction & Calibration System

## Stack & Repository Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Repository** | `EHG_Engineer` (backend) | All Stage 0 orchestration, synthesis components, stage templates, and operations workers live here |
| **Frontend repo** | `ehg` (no changes in Phases 1-3) | No new UI; Phase 4 dashboard widget |
| **Database** | Supabase (existing) | Rename existing `modeling_requests` table; follow UUID PK + timestamptz patterns |
| **LLM provider** | Gemini (existing) | `market_trend` analysis uses same provider as synthesis components |
| **Module system** | ESM (existing) | All new files use `import/export`, matching `lib/eva/` conventions |
| **Test framework** | Vitest (existing) | Unit tests for prediction recording, calibration writes, accuracy computation |

### File Organization

```
lib/eva/
  situational-modeling/
    index.js                              # Public API: recordPrediction, writeCalibratio, getAccuracy
    prediction-recorder.js                # INSERT prediction records at Stage 0 from synthesis results
    calibration-writer.js                 # Write actual_outcome at calibration checkpoints
    accuracy-calculator.js                # Compute prediction_accuracy from predicted vs actual
    cross-venture-accuracy.js             # Aggregate accuracy across ventures by type + archetype
    market-trend-analyzer.js              # New: standalone market_trend prediction (LLM-powered)
    competitive-density-analyzer.js       # New: standalone competitive_density extraction
  stage-zero/
    modeling.js                           # RENAMED → situational-modeling.js (file rename)
    synthesis/
      index.js                            # Modified: +15 lines to call prediction-recorder after synthesis
      time-horizon.js                     # Unchanged (source of time_horizon predictions)
      build-cost-estimation.js            # Unchanged (source of build_cost predictions)
      portfolio-evaluation.js             # Unchanged (source of portfolio_synergy predictions)
  stage-templates/
    stage-03.js                           # Modified: +10 lines calibration write in kill gate handler
    analysis-steps/
      stage-05-financial-model.js         # Modified: +10 lines calibration write after financial analysis
      stage-04-competitive-landscape.js   # Modified: +10 lines calibration write for competitive_density
  utils/
    assumption-reality-tracker.js         # Modified: +20 lines to cross-reference prediction records
  operations/
    domain-handler.js                     # Modified: +15 lines calibration hooks in ops_metrics_collect
  stage-zero/
    stage-of-death-predictor.js           # Modified: redirect output to situational_modeling_requests
database/
  migrations/
    YYYYMMDD_rename_modeling_to_situational_modeling.sql   # Table rename + index rename + RLS rename
    YYYYMMDD_situational_modeling_calibration_views.sql    # Accuracy views for cross-venture analysis
tests/
  unit/
    modeling.test.js                      # RENAMED → situational-modeling.test.js
    situational-modeling/
      prediction-recorder.test.js         # New
      calibration-writer.test.js          # New
      accuracy-calculator.test.js         # New
```

## Legacy Deprecation Plan

This is primarily a **rename + consolidation**, not a replacement. Existing systems are preserved with additive wiring:

| Existing Component | Impact |
|-------------------|--------|
| `modeling.js` → `generateForecast()` | **Renamed file** → `situational-modeling.js`; function name preserved |
| `modeling.js` → `calculateVentureScore()` | **Renamed file**; function name preserved |
| `modeling_requests` table | **Renamed** → `situational_modeling_requests` (atomic DB migration) |
| Synthesis `metadata.synthesis.*` | **Preserved** — dual-write ensures backward compatibility |
| `stage-of-death-predictor.js` | **Modified** — redirect output from phantom table to `situational_modeling_requests` |
| `assumption-reality-tracker.js` | **Modified** — add cross-reference to prediction records at calibration report time |
| `cross-venture-learning.js` | **Modified** — consume prediction accuracy data for pattern analysis |
| 13 synthesis components | **Unchanged** — prediction recording wraps around them, doesn't modify them |
| `runSynthesis()` | **Modified** — adds prediction recording step after all components complete |
| Stage templates (1-25) | **Modified at gates only** — stages 3, 4, 5, 16 get calibration write hooks |
| Operations workers | **Modified** — `ops_metrics_collect` gets calibration write hook |

### Import Path Migration

These files reference `./modeling.js` or `../modeling.js` and need import path updates:

| File | Change |
|------|--------|
| `lib/eva/stage-zero/index.js` | `./modeling.js` → `./situational-modeling.js` |
| `lib/eva/stage-zero/stage-zero-orchestrator.js` | Import path update |
| `lib/eva/services/index.js` | Import path update |
| `scripts/eva-services-status.js` | Import path update |
| `tests/unit/eva/shared-services-new.test.js` | Import path update |
| `tests/unit/eva/stage-zero/stage-zero-orchestrator.test.js` | Import path update |

## Route & Component Structure

### Backend Module Architecture

```
                     ┌───────────────────────────────┐
                     │    Stage 0 Orchestrator         │
                     │   (executeStageZero — minimal)  │
                     └──────────┬────────────────────┘
                                │
            ┌───────────────────┼───────────────────────┐
            │                   │                        │
    ┌───────┴────────┐  ┌──────┴──────────┐   ┌────────┴──────────┐
    │  Entry Paths   │  │  runSynthesis()  │   │  Forecast Engine  │
    │  (3 paths)     │  │  (14 components) │   │  generateForecast │
    └────────────────┘  └──────┬──────────┘   └────────┬──────────┘
                               │                        │
                    ┌──────────┴────────────────────────┘
                    │
            ┌───────┴──────────────┐
            │  Prediction Recorder │  ← NEW: records predictions from
            │  (additive wrapper)  │     synthesis results + forecast
            └───────┬──────────────┘
                    │
                    ▼
     ┌─────────────────────────────────┐
     │  situational_modeling_requests  │  ← Renamed table
     │  (7 request types)             │     Dual-write: metadata.synthesis
     └──────────┬──────────────────────┘     + table rows
                │
    ┌───────────┼───────────────────────────────┐
    │           │               │               │
┌───┴───┐  ┌───┴───┐     ┌────┴────┐    ┌─────┴──────┐
│Stage 3│  │Stage 5│     │Stage 25 │    │ Operations │
│Kill   │  │Fin.   │     │Launch   │    │ Workers    │
│Gate   │  │Gate   │     │Report   │    │ (6h cycle) │
└───┬───┘  └───┬───┘     └────┬────┘    └─────┬──────┘
    │          │              │               │
    └──────────┴──────┬───────┴───────────────┘
                      │
              ┌───────┴───────────┐
              │ Calibration Writer│  ← NEW: writes actual_outcome +
              │ (stage hooks)     │     recomputes prediction_accuracy
              └───────┬───────────┘
                      │
                      ▼
              ┌───────────────────┐
              │ Cross-Venture     │  ← MODIFIED: consumes accuracy
              │ Accuracy Analysis │     data for confidence adjustment
              └───────────────────┘
```

### Prediction Recording Flow (Stage 0)

After `runSynthesis()` completes, the prediction recorder maps synthesis results to prediction records:

| Synthesis Component | Request Type | Source Field |
|-------------------|-------------|-------------|
| Component 6: `time-horizon.js` | `time_horizon` | `timeHorizon.position`, `timeHorizon.confidence` |
| Component 8: `build-cost-estimation.js` | `build_cost` | `buildCost.complexity`, `buildCost.timeline_weeks`, `buildCost.cost_range` |
| Component 2: `portfolio-evaluation.js` | `portfolio_synergy` | `portfolio.composite_score`, `portfolio.dimensions` |
| `stage-of-death-predictor.js` | `kill_gate_prediction` | `death_stage`, `probability`, `mortality_curve` |
| Extracted from `assessTimeHorizon()` | `competitive_density` | `timeHorizon.competitive_density` sub-field (Phase 3: standalone) |
| `generateForecast()` | `market_trend` (partial) | Revenue projections, TAM/SAM/SOM (Phase 3: standalone analyzer) |
| Venture Nursery | `nursery_reeval` | `nursery.reeval_score`, `nursery.trigger_conditions` |

### Calibration Checkpoint Map

| Checkpoint | Stage | Request Types Calibrated | Actual Outcome Source |
|-----------|-------|------------------------|---------------------|
| Kill Gate | 3 | `kill_gate_prediction` | `chairman_decisions` (pass/revise/kill + 7 metrics) |
| Competitive Analysis | 4 | `competitive_density` | Stage 4 competitive landscape data |
| Financial Gate | 5 | `build_cost`, financial predictions | Stage 5 unit economics (CAC, LTV, ROI, payback) |
| Financial Projections | 16 | All financial predictions | Detailed 3-year financial model |
| Launch Reality | 23-25 | All types | Golden Nugget "Assumptions vs Reality" report |
| Operations | Post-25 | Growth, revenue, market | AARRR metrics (every 6h via `ops_metrics_collect`) |

## Data Layer

### Table Rename Migration

```sql
-- Atomic rename: table + indexes + RLS + comment
ALTER TABLE modeling_requests RENAME TO situational_modeling_requests;
ALTER INDEX idx_modeling_requests_status RENAME TO idx_situational_modeling_requests_status;
ALTER INDEX idx_modeling_requests_venture RENAME TO idx_situational_modeling_requests_venture;
ALTER INDEX idx_modeling_requests_type RENAME TO idx_situational_modeling_requests_type;

-- Update RLS policy
ALTER POLICY modeling_requests_service_all
  ON situational_modeling_requests
  RENAME TO situational_modeling_requests_service_all;

-- Update table comment
COMMENT ON TABLE situational_modeling_requests IS
  'Situational Modeling Engine: unified prediction spine with progressive calibration across 25-stage venture lifecycle';

-- Add calibration metadata columns
ALTER TABLE situational_modeling_requests
  ADD COLUMN IF NOT EXISTS calibration_stage INTEGER,
  ADD COLUMN IF NOT EXISTS calibration_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS archetype TEXT,
  ADD COLUMN IF NOT EXISTS entry_path TEXT;
```

### New Views

```sql
-- Prediction accuracy by request type and archetype
CREATE VIEW v_prediction_accuracy AS
SELECT
  request_type,
  archetype,
  AVG(prediction_accuracy) as avg_accuracy,
  STDDEV(prediction_accuracy) as accuracy_stddev,
  COUNT(*) as sample_size,
  COUNT(*) FILTER (WHERE actual_outcome IS NOT NULL) as calibrated_count
FROM situational_modeling_requests
GROUP BY request_type, archetype;

-- Calibration timeline for a single venture
CREATE VIEW v_venture_calibration_timeline AS
SELECT
  venture_id,
  request_type,
  projections,
  actual_outcome,
  prediction_accuracy,
  calibration_stage,
  calibration_date,
  created_at as prediction_date
FROM situational_modeling_requests
WHERE venture_id IS NOT NULL
ORDER BY venture_id, calibration_stage;
```

### Queries

| Operation | Query Pattern |
|-----------|--------------|
| Record prediction | `INSERT INTO situational_modeling_requests (subject, request_type, projections, confidence_interval, venture_id, brief_id, archetype, entry_path, status)` |
| Write calibration | `UPDATE situational_modeling_requests SET actual_outcome = $1, prediction_accuracy = $2, calibration_stage = $3, calibration_date = NOW(), calibration_source = $4, status = 'completed' WHERE venture_id = $5 AND request_type = $6` |
| Get accuracy by type | `SELECT * FROM v_prediction_accuracy WHERE sample_size >= 5` |
| Get venture timeline | `SELECT * FROM v_venture_calibration_timeline WHERE venture_id = $1` |

### RLS Requirements

The existing `modeling_requests_service_all` policy (service role = full access) is sufficient. The rename preserves this. No user-facing RLS is needed since this is a backend-only system in Phases 1-3.

## API Surface

No new REST endpoints or RPC functions are needed in Phases 1-3. All operations use direct Supabase client queries from backend services.

### Internal Module API

```javascript
// lib/eva/situational-modeling/index.js

// Record a prediction from synthesis output
export async function recordPrediction({
  requestType,     // one of 7 request types
  subject,         // venture name or description
  projections,     // JSONB prediction data
  confidenceInterval, // { lower, upper, confidence_level }
  ventureId,
  briefId,
  archetype,
  entryPath,
}, deps);

// Write calibration data at a checkpoint
export async function writeCalibration({
  ventureId,
  requestType,
  actualOutcome,   // JSONB actual data
  calibrationStage, // stage number (3, 4, 5, 16, 25)
  calibrationSource, // 'kill_gate', 'financial_gate', etc.
}, deps);

// Get accuracy for a request type (optionally filtered by archetype)
export async function getAccuracy({
  requestType,
  archetype,       // optional
  minSampleSize,   // default 5
}, deps);

// Get full calibration timeline for a venture
export async function getVentureCalibrationTimeline(ventureId, deps);
```

### Future RPC Functions (Phase 4)

```sql
-- Confidence adjustment based on accumulated accuracy
CREATE FUNCTION compute_confidence_adjustment(p_request_type TEXT, p_archetype TEXT)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'avg_accuracy', AVG(prediction_accuracy),
    'sample_size', COUNT(*),
    'confidence_multiplier', CASE
      WHEN AVG(prediction_accuracy) >= 0.8 THEN 1.0
      WHEN AVG(prediction_accuracy) >= 0.6 THEN 0.8
      WHEN AVG(prediction_accuracy) >= 0.4 THEN 0.6
      ELSE 0.4
    END
  )
  FROM situational_modeling_requests
  WHERE request_type = p_request_type
    AND archetype = p_archetype
    AND actual_outcome IS NOT NULL;
$$ LANGUAGE sql STABLE;
```

## Implementation Phases

### Phase 1: Foundation (2-3 SDs, ~200-300 LOC)

| SD | Scope | Estimated LOC |
|----|-------|---------------|
| SD-1: Table Rename | Rename `modeling_requests` → `situational_modeling_requests`, rename `modeling.js` → `situational-modeling.js`, update all import paths, rename test file | ~80 (mostly file renames + migration SQL) |
| SD-2: Prediction Recorder | Create `prediction-recorder.js`, wire to `runSynthesis()` for 4 existing types (time_horizon, build_cost, portfolio_synergy, kill_gate_prediction) | ~120 |
| SD-3: First Calibration | Wire Stage 3 kill gate to write `actual_outcome` for kill_gate_prediction | ~60 |

### Phase 2: Calibration Wiring (3 SDs, ~250-350 LOC)

| SD | Scope | Estimated LOC |
|----|-------|---------------|
| SD-4: Financial Calibration | Wire Stage 5 financial gate to calibrate build_cost + financial predictions | ~80 |
| SD-5: Competitive Calibration | Wire Stage 4 competitive analysis to calibrate competitive_density | ~60 |
| SD-6: Assumption-Reality Connection | Connect assumption-reality tracker at Stage 25 to cross-reference prediction records; redirect stage-of-death predictor | ~120 |

### Phase 3: Missing Predictions (2-3 SDs, ~300-400 LOC)

| SD | Scope | Estimated LOC |
|----|-------|---------------|
| SD-7: Standalone Competitive Density | Extract from `assessTimeHorizon()` into standalone component; nursery_reeval prediction recording | ~120 |
| SD-8: Market Trend Analyzer | New LLM-powered market trend analysis; replace error stub in opportunity-discovery-service | ~150 |
| SD-9: Operations Calibration | Wire `ops_metrics_collect` for continuous AARRR calibration writes | ~80 |

### Phase 4: Self-Improvement (2 SDs, ~200-300 LOC)

| SD | Scope | Estimated LOC |
|----|-------|---------------|
| SD-10: Cross-Venture Accuracy | Build accuracy analysis views, connect to profile service for weight adjustment | ~120 |
| SD-11: Dashboard Widget | Operations dashboard prediction accuracy visualization | ~150 (frontend) |

### Total Estimated Scope
- **Phases 1-3** (backend core): ~750-1050 LOC across 8-9 SDs
- **Phase 4** (self-improvement + UI): ~270-450 LOC across 2 SDs
- **Overall**: ~1020-1500 LOC across 10-11 SDs

## Testing Strategy

### Unit Tests (per module)

| Module | Test Focus |
|--------|-----------|
| `prediction-recorder.js` | Maps synthesis results to correct request types; handles missing components gracefully; validates JSONB structure |
| `calibration-writer.js` | Writes actual_outcome with correct calibration_stage; computes prediction_accuracy correctly; handles no-matching-prediction case |
| `accuracy-calculator.js` | Accuracy formula correctness; handles edge cases (0/1 bounds, null fields); archetype filtering |
| `cross-venture-accuracy.js` | Requires N ventures threshold; groups by archetype correctly; produces confidence multipliers |
| `market-trend-analyzer.js` | LLM response parsing; error handling; confidence interval generation |
| `competitive-density-analyzer.js` | Extraction from time-horizon data; standalone computation |

### Integration Tests

| Scenario | What It Tests |
|----------|--------------|
| Stage 0 → prediction recording | Full synthesis run produces expected prediction rows in `situational_modeling_requests` |
| Stage 3 kill gate → calibration | Kill gate decision triggers `actual_outcome` write for matching prediction |
| Stage 5 financial gate → calibration | Financial model output calibrates build_cost prediction |
| Dual-write consistency | `metadata.synthesis.*` and `situational_modeling_requests` contain equivalent data |

### Regression Tests

| Check | Purpose |
|-------|---------|
| All existing synthesis tests pass | Prediction recording doesn't break synthesis pipeline |
| Venture brief metadata unchanged | Dual-write preserves existing consumers |
| Profile scoring unchanged | Weighted score calculation unaffected |
| Chairman UI unchanged | No frontend regression |

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Dual-write inconsistency** — `metadata.synthesis.*` and table rows drift apart | Medium | Medium | Prediction recorder reads directly from synthesis output (single source); integration test validates consistency |
| **Cold-start calibration** — few ventures have actual outcome data | High (initially) | Low | Graceful degradation: accuracy queries return `insufficient_data` flag when `sample_size < 5` |
| **Table rename breaks production** — missed reference to `modeling_requests` | Low | High | Full codebase grep for `modeling_requests` before migration; zero references exist today (table is unused) |
| **Synthesis pipeline performance** — prediction recording adds latency | Low | Medium | Prediction recording is async (fire-and-forget after synthesis completes); uses `Promise.all` for batch inserts |
| **Stage gate handler modification** — calibration write fails and blocks gate | Medium | High | All calibration writes are in `.catch()` blocks — failures are logged but never block stage progression |
| **Market trend LLM hallucination** — new analysis produces unreliable predictions | Medium | Low | Market trend predictions start with low confidence score; calibration data eventually reveals actual accuracy |
| **Import path migration** — file rename misses a consumer | Low | Medium | `grep -r "modeling.js\|modeling'" lib/ test/ scripts/` catches all references; test suite validates |
| **Mental Models naming collision** — "situational modeling" collides with mental models code | Very Low | Low | Separate directory (`situational-modeling/` vs `mental-models/`), separate tables, separate SDs. Grep validation in CI |
