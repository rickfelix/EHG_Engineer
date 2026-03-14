<!-- Archived from: docs/plans/close-experiment-feedback-loop-architecture.md -->
<!-- SD Key: SD-LEO-FEAT-EXPERIMENT-FEEDBACK-LOOP-001 -->
<!-- Archived at: 2026-03-11T20:36:04.538Z -->

# Architecture Plan: Close the Experiment Feedback Loop

## Stack & Repository Decisions

**Repository**: `EHG_Engineer` (this repo) — all feedback loop infrastructure lives alongside the existing experiment engine and EVA scoring pipeline.

**Stack**:
- **Runtime**: Node.js (consistent with existing experiment engine and EVA pipeline)
- **Database**: Supabase (PostgreSQL) — extend existing experiment tables, create telemetry view
- **Statistics**: Existing `bayesian-analyzer.js` extended with survival-based analysis mode
- **LLM**: Claude via existing `lib/llm/` infrastructure for LLM Meta-Optimizer
- **Prompt Storage**: `leo_prompts` table (existing, versioned, checksummed)
- **Traffic Splitting**: Existing `experiment-assignment.js` hash-based bucketing (deterministic)

**No new services or infrastructure required** — everything extends the existing Node.js + Supabase architecture.

## Legacy Deprecation Plan

No systems are replaced. The framework extends existing infrastructure:

| Existing Component | Relationship | Migration |
|---|---|---|
| `experiment_outcomes` table | Extended — add gate survival columns | ALTER TABLE migration |
| `dual-evaluator.js` | Unchanged — continues scoring at Stage 0 | None needed |
| `bayesian-analyzer.js` | Extended — add survival-based analysis mode | New function, existing preserved |
| `chairman-report.js` | Extended — add survival metrics section | New section, existing preserved |
| `prompt-promotion.js` | Extended — weight survival signal | New scoring mode, existing preserved |
| `gate-signal-service.js` | Extended — dual-write to experiment tables | Add experiment bridge call |
| `evaluation_profile_outcomes` | Read — source of existing gate signals | None needed |
| `eva_stage_gate_results` | Resolve — adopt as canonical or deprecate | Decision in Phase 1 |
| `stage-of-death-predictor.js` | Activated — feed with real outcomes | Wire `calibratePredictions()` |
| `counterfactual-engine.js` | Complementary — retrospective validation | None needed |
| Hardcoded `SYSTEM_PROMPT` consts | Future migration to `leo_prompts` | Fallback preserved |

## Route & Component Structure

### Module Organization
```
lib/
  eva/
    experiments/                              # EXISTING — experiment engine
      experiment-manager.js                   # EXISTING — CRUD for experiments
      experiment-assignment.js                # EXISTING — venture-to-variant bucketing
      dual-evaluator.js                       # EXISTING — Stage 0 dual scoring (unchanged)
      bayesian-analyzer.js                    # EXTENDED — add survival analysis mode
      chairman-report.js                      # EXTENDED — add survival metrics section
      prompt-promotion.js                     # EXTENDED — weight survival signal
      proxy-metric-engine.js                  # EXISTING — cold-start synthetic scores
      first-experiment-runner.js              # EXISTING — end-to-end orchestration
      gate-outcome-bridge.js                  # NEW — maps gate signals to experiment outcomes
      experiment-lifecycle.js                 # NEW — auto-iteration loop (stop → promote → generate → start)
      meta-optimizer.js                       # NEW — LLM-based next-hypothesis generation
    stage-zero/
      gate-signal-service.js                  # EXTENDED — dual-write to experiment tables
      stage-of-death-predictor.js             # EXISTING — wire calibratePredictions()
      counterfactual-engine.js                # EXISTING — retrospective validation
      sensitivity-analysis.js                 # EXISTING — component importance ranking
    stage-templates/
      analysis-steps/
        stage-03-*.js                         # REFERENCE — Stage 3 kill gate (measurement point)
        stage-05-*.js                         # REFERENCE — Stage 5 kill gate (measurement point)
        stage-13-*.js                         # REFERENCE — Stage 13 kill gate (measurement point)
  agents/
    modules/
      venture-state-machine/
        stage-gates.js                        # EXISTING — kill gate execution, recordGateSignal() call site
scripts/
  experiment-baseline.js                      # EXTENDED — backfill + calibration
  experiment-lifecycle-runner.js              # NEW — CLI for auto-iteration loop
database/
  migrations/
    YYYYMMDD_experiment_survival_columns.sql  # NEW — extend experiment_outcomes
    YYYYMMDD_experiment_telemetry_view.sql    # NEW — materialized view
```

### Key Interfaces

```javascript
// gate-outcome-bridge.js (NEW)
// Maps gate signal events to experiment outcome records
export async function recordGateOutcomeForExperiment(deps, {
  ventureId,       // UUID — which venture hit the gate
  killGateStage,   // 3 | 5 | 13 — which kill gate
  passed,          // boolean — survived or killed
  gateScore,       // number — raw gate score
  chairmanOverride, // boolean — did Chairman change the outcome
  gateTimestamp    // ISO string — when the gate was evaluated
}) → { recorded: boolean, experimentId?, assignmentId? }

// experiment-lifecycle.js (NEW)
// Automated loop: stop experiment → promote → generate next → start
export async function checkAndAdvanceExperiment(deps, {
  experimentId
}) → {
  action: 'continue' | 'stopped_and_promoted' | 'stopped_and_rejected',
  newExperimentId?,   // if auto-created next experiment
  promotionResult?,   // if prompt was promoted
  nextHypothesis?     // from meta-optimizer
}

// meta-optimizer.js (NEW)
// LLM-based next-hypothesis generation
export async function generateNextChallenger(deps, {
  winnerPrompt,        // full text of winning prompt
  loserPrompt,         // full text of losing prompt
  experimentResults,   // Bayesian analysis output with survival data
  previousHypotheses   // last 3 tested hypotheses (for diversity enforcement)
}) → {
  challengerPrompt,    // full text of proposed new prompt
  hypothesis,          // falsifiable hypothesis statement
  perturbationUsed,    // which operator was applied
  rationale            // LLM explanation of why this change should help
}

// bayesian-analyzer.js (EXTENDED)
// New survival-based analysis alongside existing score-based
export function analyzeExperimentSurvival(deps, {
  experiment,
  outcomes,     // now includes gate survival records
  config: {
    survivalGates: [3, 5, 13],   // which gates to analyze
    minSamples: 20,
    requiredProbability: 0.85,    // lower than 0.95 — achievable with survival binary
    gateWeights: { 3: 1, 5: 2, 13: 3 }  // later gates weighted higher
  }
}) → {
  status,
  per_variant: { [key]: { count, survival_rates: { stage_3, stage_5, stage_13 }, composite_survival } },
  comparisons,
  stopping,
  recommendation
}
```

## Data Layer

### Schema Extension: `experiment_outcomes`

```sql
-- Add gate survival columns to existing table
ALTER TABLE experiment_outcomes
  ADD COLUMN IF NOT EXISTS kill_gate_stage INTEGER CHECK (kill_gate_stage IN (3, 5, 13)),
  ADD COLUMN IF NOT EXISTS gate_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS gate_score NUMERIC,
  ADD COLUMN IF NOT EXISTS chairman_override BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS time_to_gate_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS outcome_type TEXT DEFAULT 'synthesis' CHECK (outcome_type IN ('synthesis', 'gate_survival'));

-- Index for gate outcome queries
CREATE INDEX IF NOT EXISTS idx_exp_outcomes_gate
  ON experiment_outcomes (kill_gate_stage, gate_passed)
  WHERE outcome_type = 'gate_survival';

-- Unique constraint: one gate outcome per assignment per gate stage
CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_outcomes_assignment_gate
  ON experiment_outcomes (assignment_id, kill_gate_stage)
  WHERE outcome_type = 'gate_survival';
```

### New Materialized View: `stage_zero_experiment_telemetry`

```sql
CREATE MATERIALIZED VIEW stage_zero_experiment_telemetry AS
SELECT
  ea.experiment_id,
  ea.venture_id,
  ea.variant_key,
  e.name AS experiment_name,
  e.status AS experiment_status,
  -- Stage 0 synthesis scores (existing outcome type)
  synth.scores AS synthesis_scores,
  synth.evaluated_at AS synthesis_evaluated_at,
  -- Gate survival outcomes
  g3.gate_passed AS stage_3_survived,
  g3.gate_score AS stage_3_score,
  g3.chairman_override AS stage_3_override,
  g3.time_to_gate_hours AS stage_3_hours,
  g5.gate_passed AS stage_5_survived,
  g5.gate_score AS stage_5_score,
  g5.chairman_override AS stage_5_override,
  g5.time_to_gate_hours AS stage_5_hours,
  g13.gate_passed AS stage_13_survived,
  g13.gate_score AS stage_13_score,
  g13.chairman_override AS stage_13_override,
  g13.time_to_gate_hours AS stage_13_hours,
  -- Composite survival
  CASE WHEN g3.gate_passed AND g5.gate_passed AND g13.gate_passed THEN TRUE ELSE FALSE END AS full_survival,
  (COALESCE(g3.gate_passed::int, 0) + COALESCE(g5.gate_passed::int, 0) * 2 + COALESCE(g13.gate_passed::int, 0) * 3) AS weighted_survival_score
FROM experiment_assignments ea
JOIN experiments e ON e.id = ea.experiment_id
LEFT JOIN experiment_outcomes synth ON synth.assignment_id = ea.id AND synth.outcome_type = 'synthesis'
LEFT JOIN experiment_outcomes g3 ON g3.assignment_id = ea.id AND g3.kill_gate_stage = 3 AND g3.outcome_type = 'gate_survival'
LEFT JOIN experiment_outcomes g5 ON g5.assignment_id = ea.id AND g5.kill_gate_stage = 5 AND g5.outcome_type = 'gate_survival'
LEFT JOIN experiment_outcomes g13 ON g13.assignment_id = ea.id AND g13.kill_gate_stage = 13 AND g13.outcome_type = 'gate_survival'
ORDER BY ea.experiment_id, ea.venture_id;

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_experiment_telemetry()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY stage_zero_experiment_telemetry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### RLS Policies
- `experiment_outcomes` (extended): Service role only (system-managed)
- `stage_zero_experiment_telemetry`: Read access for authenticated users (dashboard/reporting)

### Key Queries

```sql
-- Baseline accuracy: correlation between Stage 0 composite score and Stage 3 survival
SELECT corr(
  (synth.scores->>'venture_score')::numeric,
  g3.gate_passed::int
) AS stage_0_to_stage_3_correlation
FROM experiment_outcomes synth
JOIN experiment_assignments ea ON ea.id = synth.assignment_id
LEFT JOIN experiment_outcomes g3 ON g3.assignment_id = ea.id AND g3.kill_gate_stage = 3
WHERE synth.outcome_type = 'synthesis' AND g3.outcome_type = 'gate_survival';

-- Experiment survival rates by variant
SELECT
  ea.variant_key,
  COUNT(*) FILTER (WHERE g3.gate_passed) AS stage_3_survived,
  COUNT(*) FILTER (WHERE g3.gate_passed IS NOT NULL) AS stage_3_total,
  ROUND(COUNT(*) FILTER (WHERE g3.gate_passed)::numeric / NULLIF(COUNT(*) FILTER (WHERE g3.gate_passed IS NOT NULL), 0), 2) AS stage_3_rate
FROM experiment_assignments ea
LEFT JOIN experiment_outcomes g3 ON g3.assignment_id = ea.id AND g3.kill_gate_stage = 3
WHERE ea.experiment_id = $1
GROUP BY ea.variant_key;

-- Chairman override rate per experiment
SELECT
  COUNT(*) FILTER (WHERE chairman_override) AS overrides,
  COUNT(*) AS total,
  ROUND(COUNT(*) FILTER (WHERE chairman_override)::numeric / NULLIF(COUNT(*), 0), 3) AS override_rate
FROM experiment_outcomes
WHERE outcome_type = 'gate_survival';
```

## API Surface

### RPC Functions

```sql
-- Record a gate outcome for experiment tracking (called by gate-outcome-bridge.js)
CREATE OR REPLACE FUNCTION record_experiment_gate_outcome(
  p_venture_id UUID,
  p_kill_gate_stage INTEGER,
  p_gate_passed BOOLEAN,
  p_gate_score NUMERIC DEFAULT NULL,
  p_chairman_override BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
  v_assignment RECORD;
  v_outcome_id UUID;
  v_stage_0_time TIMESTAMPTZ;
BEGIN
  -- Find experiment assignment for this venture
  SELECT ea.id, ea.experiment_id, ea.assigned_at
  INTO v_assignment
  FROM experiment_assignments ea
  JOIN experiments e ON e.id = ea.experiment_id AND e.status = 'running'
  WHERE ea.venture_id = p_venture_id
  LIMIT 1;

  IF v_assignment IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'no_active_assignment');
  END IF;

  -- Calculate time to gate
  v_stage_0_time := v_assignment.assigned_at;

  INSERT INTO experiment_outcomes (
    assignment_id, variant_key, outcome_type,
    kill_gate_stage, gate_passed, gate_score, chairman_override,
    time_to_gate_hours, scores, metadata, evaluated_at
  )
  SELECT
    v_assignment.id,
    ea.variant_key,
    'gate_survival',
    p_kill_gate_stage,
    p_gate_passed,
    p_gate_score,
    p_chairman_override,
    EXTRACT(EPOCH FROM (NOW() - v_stage_0_time)) / 3600,
    jsonb_build_object('gate_score', p_gate_score, 'passed', p_gate_passed),
    jsonb_build_object('experiment_id', v_assignment.experiment_id, 'venture_id', p_venture_id),
    NOW()
  FROM experiment_assignments ea
  WHERE ea.id = v_assignment.id
  ON CONFLICT (assignment_id, kill_gate_stage) WHERE outcome_type = 'gate_survival'
  DO UPDATE SET
    gate_passed = EXCLUDED.gate_passed,
    gate_score = EXCLUDED.gate_score,
    chairman_override = EXCLUDED.chairman_override,
    evaluated_at = NOW()
  RETURNING id INTO v_outcome_id;

  RETURN jsonb_build_object(
    'recorded', true,
    'outcome_id', v_outcome_id,
    'experiment_id', v_assignment.experiment_id,
    'assignment_id', v_assignment.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### CLI Commands

| Command | Purpose |
|---------|---------|
| `node scripts/experiment-baseline.js` | Backfill outcomes, run `calibratePredictions()`, report baseline accuracy |
| `node scripts/experiment-lifecycle-runner.js` | Start the auto-iteration loop (monitors experiments, promotes, generates next) |
| `node scripts/experiment-lifecycle-runner.js --status` | Show current experiment cycle status |

## Implementation Phases

### Phase 1: Observation Bridge (2-3 days)
**Deliverables:**
1. Resolve canonical gate table — adopt `eva_stage_gate_results` or continue with `evaluation_profile_outcomes`
2. Database migration: extend `experiment_outcomes` with gate survival columns
3. `gate-outcome-bridge.js` — maps gate signals to experiment outcome records
4. Wire bridge into `gate-signal-service.js` (dual-write when venture is enrolled in experiment)
5. Create `stage_zero_experiment_telemetry` materialized view
6. Run `calibratePredictions()` on existing data for baseline accuracy report
7. Extend chairman-report with survival metrics section

**Files modified:**
- `lib/eva/stage-zero/gate-signal-service.js` (extend recordGateSignal)
- `lib/eva/experiments/chairman-report.js` (add survival section)
- `database/migrations/YYYYMMDD_experiment_survival_columns.sql` (new)
- `lib/eva/experiments/gate-outcome-bridge.js` (new)
- `scripts/experiment-baseline.js` (extend with calibration)

### Phase 2: Statistical Integration + Auto-Iteration (3-5 days)
**Deliverables:**
1. `bayesian-analyzer.js` extended with `analyzeExperimentSurvival()` mode
2. Thompson Sampling bandit logic in `experiment-assignment.js` (adaptive allocation)
3. `prompt-promotion.js` weights survival signal alongside synthesis scores
4. `experiment-lifecycle.js` — automated stop → promote → generate → start loop
5. `meta-optimizer.js` — LLM generates next challenger prompt with perturbation operators
6. Safety rails: drift detection, diversity enforcement, diminishing returns, prompt length budget
7. End-to-end test: full experiment cycle without human intervention

**Files modified:**
- `lib/eva/experiments/bayesian-analyzer.js` (extend)
- `lib/eva/experiments/experiment-assignment.js` (add Thompson Sampling mode)
- `lib/eva/experiments/prompt-promotion.js` (extend)
- `lib/eva/experiments/experiment-lifecycle.js` (new)
- `lib/eva/experiments/meta-optimizer.js` (new)
- `scripts/experiment-lifecycle-runner.js` (new)

### Phase 3: Automated Pipeline Runner (separate SD)
- Programmatic venture generation through full pipeline for experimentation
- Batch processing scheduler with configurable throughput
- Monitoring and alerting

## Testing Strategy

### Unit Tests
- `gate-outcome-bridge.js`: Gate signal correctly maps to experiment outcome; no-op when venture not enrolled; handles duplicate gate signals (upsert)
- `bayesian-analyzer.js` survival mode: Known input/output pairs for survival rates, composite scores, stopping rules
- `meta-optimizer.js`: Generates valid prompt text; respects diversity constraint (differs from last 3 failures); stays within token budget
- `experiment-lifecycle.js`: Correct state transitions (running → stopped → new experiment created); safety rails trigger correctly

### Integration Tests
- End-to-end: Create experiment → enroll venture → simulate gate outcome at Stage 3 → verify outcome in experiment_outcomes → Bayesian analysis includes survival data → chairman report shows survival metrics
- Auto-iteration: Create experiment → accumulate enough outcomes to trigger stopping rule → verify promotion → verify next experiment auto-created with new challenger prompt
- Materialized view: Insert outcomes → refresh view → verify telemetry query returns correct joined data

### Validation
- Baseline accuracy: Cross-validate `calibratePredictions()` output against manual review of 5-10 ventures
- Statistical sanity: Verify Bayesian survival analysis with known datasets (e.g., 80% survival in variant A vs. 60% in control → P > 0.85)
- Meta-optimizer output quality: Human review of first 3 generated challenger prompts for coherence and relevance

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| **False confidence from small samples** | High | Thompson Sampling with minimum 20 observations before declaring winner; safety rail requires 3+ gate outcomes per variant before analysis |
| **Chairman override confounding** | Medium | Track overrides as separate signal; report both "algorithmic" and "actual" survival rates; flag high override experiments |
| **Schema migration breaks existing experiments** | Medium | All new columns are nullable with defaults; `outcome_type` column distinguishes synthesis vs. gate_survival records; existing queries unaffected |
| **Gate signal recording fails silently** | Medium | Upgrade from fire-and-forget `.catch()` to reliable write with retry; add monitoring for missed signals |
| **LLM Meta-Optimizer generates incoherent prompts** | Medium | Prompt length budget; diversity constraint vs. last 3 failures; human review of first 3 cycles before full automation |
| **Signal decay Stage 0 → Stage 13** | Low-Medium | Analyze per-gate separately (Stage 3 first, most signal); weight earlier gates higher initially; add correlation analysis to detect decay |
| **Materialized view staleness** | Low | Refresh on gate signal events; daily cron as backup |
| **Compute cost of automated throughput** | Low | Covered by Claude Max plan; configurable batch size; monitoring on LLM spend |
