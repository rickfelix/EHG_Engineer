# Architecture Plan: Mental Models Repository — 3-Layer Integration

## Stack & Repository Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Repository** | `EHG_Engineer` (backend) | All Stage 0 orchestration, synthesis components, and stage templates live here |
| **Frontend repo** | `ehg` (no changes in Phase 1-2) | No new UI; future Operations dashboard widget in Phase 4 |
| **Database** | Supabase (existing) | 4 new tables following existing UUID PK + timestamptz patterns |
| **LLM provider** | Gemini (existing) | Follows Stage 0's established provider; exercise calls use same client |
| **Module system** | ESM (existing) | All new files use `import/export`, matching `lib/eva/stage-zero/` conventions |
| **Test framework** | Vitest (existing) | Unit tests for model selection, context block generation, effectiveness scoring |

### File Organization

```
lib/eva/
  mental-models/
    index.js                          # Public API: getMentalModelContextBlock, analyzeMentalModels
    model-selector.js                 # Archetype + effectiveness-based model selection
    context-block-builder.js          # Formats selected models into prompt injection block
    exercise-runner.js                # Runs model exercise templates via LLM
    effectiveness-tracker.js          # Logs applications, computes correlations
    seed-models.js                    # 43 model definitions for DB seeding
  stage-zero/
    synthesis/
      mental-model-analysis.js        # Component 14 implementation
    paths/
      competitor-teardown.js          # Modified: +15 lines for context block injection
      discovery-mode.js               # Modified: +10 lines for context block injection
database/
  migrations/
    YYYYMMDD_mental_models_schema.sql # 4 tables + indexes + RLS
    YYYYMMDD_mental_models_seed.sql   # Initial 15-20 model seed data
```

## Legacy Deprecation Plan

No legacy systems are replaced. This is purely additive:

| Existing Component | Impact |
|-------------------|--------|
| `deconstructToFirstPrinciples()` | **Preserved** — hardcoded First Principles prompt stays; Layer 1 adds complementary models alongside it |
| 13 synthesis components | **Preserved** — Component 14 runs in parallel via wrapper, advisory namespace only |
| `runSynthesis()` | **Preserved** — wrapped by `deps.synthesize`, not modified |
| `executeStageZero()` orchestrator | **Zero changes** — all integration via dependency injection |
| Stage templates 1-25 | **Preserved** — `onBeforeAnalysis` hooks are additive, existing behavior unchanged |

## Route & Component Structure

### Backend Module Architecture

```
                    ┌──────────────────────────────┐
                    │     Stage 0 Orchestrator      │
                    │  (executeStageZero — NO EDIT) │
                    └──────────┬───────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                    │
    ┌──────▼──────┐    ┌──────▼──────┐     ┌──────▼──────┐
    │  Competitor  │    │  Discovery  │     │  Blueprint  │
    │  Teardown    │    │    Mode     │     │   Browse    │
    │ (+L1 inject) │    │ (+L1 inject)│     │  (no LLM)  │
    └──────┬──────┘    └──────┬──────┘     └──────┬──────┘
           │                   │                    │
           └───────────────────┼────────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │   deps.synthesize wrapper     │
                    │  runSynthesis() + Component 14│
                    └──────────┬───────────────────┘
                               │
           ┌───────────────────┼────── ... ────────┐
           │                   │                    │
    Components 1-13     ┌──────▼──────┐      Chairman
    (unchanged)         │ Component 14│      Review
                        │Mental Models│    (unchanged)
                        │  (advisory) │
                        └──────┬──────┘
                               │
                    ┌──────────▼───────────────────┐
                    │    mental-models/index.js     │
                    ├──────────────────────────────┤
                    │ getMentalModelContextBlock()  │ ← Layer 1 API
                    │ analyzeMentalModels()         │ ← Layer 2 API
                    │ getStageModelContext()         │ ← Layer 3 API
                    └──────────┬───────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                    │
    ┌──────▼──────┐    ┌──────▼──────┐     ┌──────▼──────┐
    │   model-    │    │  exercise-  │     │effectiveness│
    │  selector   │    │   runner    │     │  -tracker   │
    └─────────────┘    └─────────────┘     └─────────────┘
```

### Key APIs

| Function | Layer | Input | Output |
|----------|-------|-------|--------|
| `getMentalModelContextBlock(stage, path, strategy, archetype)` | 1 | Context params | Formatted prompt string block |
| `analyzeMentalModels(pathOutput, deps)` | 2 | Path output + dependencies | Advisory analysis object with model exercise results |
| `getStageModelContext(ventureId, stageNumber)` | 3 | Venture ID + stage | Model recommendations for stage hooks |
| `selectModels(stage, path, strategy, archetype, excludeIds)` | Internal | Selection params | Ranked list of 3-5 model objects |
| `runExercise(model, context)` | Internal | Model + venture context | Structured exercise output |
| `logApplication(modelId, ventureId, stage, layer, result)` | Internal | Application data | void (async, non-blocking) |

## Data Layer

### New Tables

#### `mental_models` — Core model definitions
```sql
CREATE TABLE mental_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('decision', 'market', 'psychology', 'growth', 'framework')),
  description TEXT NOT NULL,
  core_concept TEXT NOT NULL,
  applicable_stages INTEGER[] NOT NULL,
  applicable_paths TEXT[],
  applicable_strategies TEXT[],
  applicable_archetypes TEXT[],
  difficulty_level TEXT DEFAULT 'intermediate' CHECK (difficulty_level IN ('basic', 'intermediate', 'advanced')),
  exercise_template JSONB,
  evaluation_rubric JSONB,
  artifact_template JSONB,
  prompt_context_block TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mental_models_stages ON mental_models USING GIN (applicable_stages);
CREATE INDEX idx_mental_models_paths ON mental_models USING GIN (applicable_paths);
CREATE INDEX idx_mental_models_active ON mental_models (is_active) WHERE is_active = true;
```

#### `mental_model_applications` — Application tracking
```sql
CREATE TABLE mental_model_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES mental_models(id) NOT NULL,
  venture_id UUID,
  stage_number INTEGER NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('path_injection', 'synthesis', 'stage_hook')),
  path_used TEXT,
  strategy_used TEXT,
  applied_by TEXT DEFAULT 'ai_auto' CHECK (applied_by IN ('ai_auto', 'manual')),
  exercise_output JSONB,
  evaluation_score NUMERIC CHECK (evaluation_score >= 0 AND evaluation_score <= 10),
  artifact_data JSONB,
  operator_rating INTEGER CHECK (operator_rating >= 1 AND operator_rating <= 5),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, model_id, stage_number, layer)
);

CREATE INDEX idx_mma_venture ON mental_model_applications (venture_id);
CREATE INDEX idx_mma_model_stage ON mental_model_applications (model_id, stage_number);
```

#### `mental_model_effectiveness` — Aggregate scoring
```sql
CREATE TABLE mental_model_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES mental_models(id) NOT NULL,
  stage_number INTEGER NOT NULL,
  path TEXT,
  strategy TEXT,
  venture_archetype TEXT,
  application_count INTEGER DEFAULT 0,
  avg_evaluation_score NUMERIC,
  avg_operator_rating NUMERIC,
  stage_progression_correlation NUMERIC CHECK (stage_progression_correlation >= -1 AND stage_progression_correlation <= 1),
  revenue_correlation NUMERIC,
  composite_effectiveness_score NUMERIC,
  last_calculated_at TIMESTAMPTZ,
  UNIQUE(model_id, stage_number, path, strategy, venture_archetype)
);

CREATE INDEX idx_mme_model ON mental_model_effectiveness (model_id);
CREATE INDEX idx_mme_composite ON mental_model_effectiveness (composite_effectiveness_score DESC);
```

#### `model_archetype_affinity` — Archetype-specific affinity
```sql
CREATE TABLE model_archetype_affinity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES mental_models(id) NOT NULL,
  archetype TEXT NOT NULL,
  path TEXT,
  affinity_score NUMERIC DEFAULT 0.5 CHECK (affinity_score >= 0 AND affinity_score <= 1),
  sample_size INTEGER DEFAULT 0,
  confidence_level TEXT DEFAULT 'low' CHECK (confidence_level IN ('low', 'medium', 'high')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, archetype, path)
);
```

### RLS Policies

All 4 tables follow EHG standard: `service_role` has full access; authenticated users have SELECT access for reads.

### Queries

| Query | Table | Pattern |
|-------|-------|---------|
| Select models for path injection | `mental_models` | `WHERE is_active AND stage @> ARRAY[0] AND (applicable_paths IS NULL OR path = ANY(applicable_paths))` |
| Select with effectiveness ranking | `mental_models` JOIN `mental_model_effectiveness` | `ORDER BY COALESCE(effectiveness.composite_effectiveness_score, 0.5) DESC LIMIT 5` |
| Log application (non-blocking) | `mental_model_applications` | `INSERT ... ON CONFLICT (venture_id, model_id, stage_number, layer) DO UPDATE` |
| Calculate effectiveness | `mental_model_applications` JOIN `chairman_decisions` | Aggregate by model_id, correlate with kill gate outcomes |
| Read stage context | `mental_model_applications` | `WHERE venture_id = ? AND stage_number < ? ORDER BY stage_number` |

## API Surface

### Internal Module API (No External Endpoints)

Phase 1-3 introduces no new REST endpoints or RPC functions. All integration is via internal JavaScript module imports.

| Module | Exported Functions | Consumers |
|--------|-------------------|-----------|
| `mental-models/index.js` | `getMentalModelContextBlock`, `analyzeMentalModels`, `getStageModelContext` | Path handlers (L1), synthesis wrapper (L2), stage templates (L3) |
| `mental-models/model-selector.js` | `selectModels`, `selectModelsForStage` | index.js |
| `mental-models/exercise-runner.js` | `runExercise`, `runExerciseBatch` | index.js (L2) |
| `mental-models/effectiveness-tracker.js` | `logApplication`, `calculateEffectiveness`, `updateArchetypeAffinity` | index.js, event handlers |

### Future RPC Functions (Phase 4)

| Function | Purpose |
|----------|---------|
| `get_model_effectiveness_report(venture_id)` | Portfolio-level model analytics for Operations dashboard |
| `recalculate_model_effectiveness()` | Periodic job to update effectiveness scores |

## Implementation Phases

### Phase 1: Stage 0 Foundation (3-4 weeks, ~800-1,000 LOC)

| Week | Deliverables |
|------|-------------|
| 1 | DB migration (4 tables), seed 15-20 models with exercise templates, `model-selector.js`, `context-block-builder.js` |
| 2 | `getMentalModelContextBlock()` API, Layer 1 injection into `competitor-teardown.js` and `discovery-mode.js` |
| 3 | `exercise-runner.js`, `mental-model-analysis.js` (Component 14), `deps.synthesize` wrapper integration |
| 3-4 | `effectiveness-tracker.js`, `venture.created` event handler, application logging, unit tests |

**Validation**: Run Stage 0 with existing test fixtures; verify P95 latency delta <500ms; verify existing 13 components produce identical output.

### Phase 2: Stage Progression + Scoring (2-3 weeks, ~400-600 LOC)

| Week | Deliverables |
|------|-------------|
| 1 | `getStageModelContext()` API, `onBeforeAnalysis` hooks for Stages 1-3 |
| 2 | Stages 4-5 hooks, effectiveness scoring algorithm (kill gate correlation) |
| 2-3 | Auto-selection with archetype affinity, expand catalog to 43 models, integration tests |

**Validation**: Create 5+ test ventures; verify model suggestions improve (effectiveness differentiation > 0.1 variance).

### Phase 3: Full Lifecycle + Branding/Marketing (3-4 weeks, ~500-700 LOC)

| Week | Deliverables |
|------|-------------|
| 1 | Stages 6-9 (THE ENGINE) hooks with model exercise templates |
| 2 | Stages 10-12 (THE IDENTITY) — branding exercise templates: brand positioning canvas, messaging tests, narrative audit |
| 3 | Stages 13-16 (THE BUILD) — marketing exercise templates: channel priority matrix, asset specs, launch stress tests |
| 3-4 | Scored evaluation output type, structured artifact output type, integration tests |

**Validation**: End-to-end venture from Stage 0 through Stage 16 with model integration at every stage.

### Phase 4: Operations + Analytics (2-3 weeks, ~300-500 LOC)

| Week | Deliverables |
|------|-------------|
| 1 | Operations model framework (6 areas), portfolio review rubrics |
| 2 | Cross-venture effectiveness comparison, model retirement logic |
| 2-3 | `recalculate_model_effectiveness()` periodic job, Operations dashboard widget (ehg repo) |

**Validation**: Portfolio review with 10+ ventures shows model effectiveness ranking with confidence levels.

## Testing Strategy

### Unit Tests (`vitest`)

| Module | Test Coverage |
|--------|--------------|
| `model-selector.js` | Model filtering by stage, path, strategy, archetype; effectiveness-weighted ranking; exclusion of already-applied models |
| `context-block-builder.js` | Prompt block formatting; empty/null handling; max model count enforcement |
| `exercise-runner.js` | Template interpolation; timeout behavior (8s); partial result handling |
| `effectiveness-tracker.js` | Application logging; correlation calculation; affinity score updates |
| `mental-model-analysis.js` | Component 14 fail-safe (`.catch(() => null)`); advisory namespace placement; timeout enforcement |

### Integration Tests

| Test | Validates |
|------|-----------|
| Stage 0 end-to-end with mental models | Full pipeline: path → synthesis (13 + Component 14) → chairman → persist |
| Regression: Stage 0 without mental models | Existing behavior identical when mental models system is inactive |
| Layer 1 injection consistency | All 3 path types produce ventures with model application records |
| Effectiveness feedback loop | 5 ventures → kill gate outcomes → effectiveness scores differentiate |

### Performance Tests

| Test | Threshold |
|------|-----------|
| Component 14 P95 latency | <8,000ms (enforced by `Promise.race`) |
| Stage 0 total P95 delta | <500ms added vs. baseline |
| Model selection query | <50ms |
| Application logging (async) | Non-blocking (verified by timing) |

## Risk Mitigation

| Risk | Severity | Mitigation Strategy |
|------|----------|-------------------|
| **Component 14 becomes P99 bottleneck** | High | Nested `Promise.all()` for parallel exercise execution + `Promise.race([analysis, timeout(8000)])`. If timeout, returns partial results. Instrument P95 before and after. |
| **`Promise.all()` fail-fast kills existing components** | Critical | Component 14 runs in advisory namespace via wrapper. `.catch(() => null)` guarantees it cannot affect components 1-13. Regression test validates identical output. |
| **Exercise templates produce noise** | Medium | Start with 5-7 hand-crafted templates for highest-impact models. Expand only after measuring operator value (rating ≥3.5). Templates reviewed before deployment. |
| **Advisory status eroded by future developers** | Medium | Structural enforcement: `metadata.synthesis.advisory.*` namespace. `calculateWeightedScore()` and `extractComponentScore()` explicitly skip advisory keys. Code review convention documented. |
| **Effectiveness tracking reflects correlation not causation** | Low | Document limitation in model. Require n≥5 ventures before allowing effectiveness to influence selection. Confidence levels (low/medium/high) visible to operator. |
| **Write side-effects in synthesis pipeline** | Low | `setImmediate(() => logApplication(...))` for non-blocking writes. Idempotent unique constraint `(venture_id, model_id, stage_number, layer)` prevents duplicate records on retry. |
| **LLM cost escalation** | Low | Layer 1 adds ~200 tokens to existing prompts (negligible). Layer 2 Component 14 exercises use fast model tier (Haiku-class). 8s timeout caps runaway costs. |
| **Content authorship bottleneck** | Medium | Phase 1 focuses on 15-20 models. Exercise templates can be authored in parallel with engineering work. Templates are JSONB — updatable without code deploy. |
