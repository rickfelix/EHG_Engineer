<!-- Archived from: docs/plans/adaptive-discovery-strategy-evolution-architecture.md -->
<!-- SD Key: SD-LEO-FEAT-ADAPTIVE-DISCOVERY-STRATEGY-001 -->
<!-- Archived at: 2026-03-13T13:03:34.722Z -->

# Architecture Plan: Adaptive Discovery Strategy Evolution

## Stack & Repository Decisions
- **Backend**: EHG_Engineer repo — Node.js scripts + Supabase PostgreSQL
- **Frontend**: ehg repo — minor update to DiscoveryModeDialog to display EVA-generated strategies (future phase)
- **No new dependencies**: Uses existing Supabase client, LLM client factory, experiment framework
- **Single-repo delivery for Phase 1**: All changes in EHG_Engineer (backend logic + migration)

## Legacy Deprecation Plan
Replaces the hardcoded `VALID_STRATEGIES` whitelist in `discovery-mode.js` with dynamic strategy loading from `discovery_strategies` table. The 4 original strategies remain as rows with `is_baseline=true` — they are not removed, just loaded differently. Backward compatible: if `discovery_strategies` table is empty, falls back to hardcoded strategies.

## Route & Component Structure

### Backend (EHG_Engineer)
```
database/migrations/
  └── 20260313_strategy_evolution_schema.sql    # Add columns to discovery_strategies

scripts/eva/
  └── strategy-analyzer.js                      # Pattern analysis engine (new)

lib/eva/stage-zero/
  ├── paths/discovery-mode.js                   # Refactored: dynamic strategy loading
  └── strategy-evolution.js                     # Hypothesis generator (new, Phase 2)
```

### Frontend (ehg) — Phase 2
```
src/components/chairman-v3/opportunities/
  └── DiscoveryModeDialog.tsx                   # Modified: show EVA-generated strategies with ⚡ badge
```

## Data Layer

### Migration: Schema Extension
```sql
-- Add evolution tracking columns to discovery_strategies
ALTER TABLE discovery_strategies
  ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_strategies JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS generation INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS performance_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Mark original 4 strategies as baselines
UPDATE discovery_strategies
SET is_baseline = true, generation = 0
WHERE key IN ('trend_scanner', 'democratization_finder', 'capability_overhang', 'nursery_reeval');

-- Index for active strategy queries
CREATE INDEX IF NOT EXISTS idx_discovery_strategies_active
  ON discovery_strategies (is_active) WHERE is_active = true;
```

### Strategy Pattern Analyzer Query
```sql
-- Per-strategy rubric dimension breakdown from gate outcomes
SELECT
  v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' AS strategy,
  COUNT(DISTINCT v.id) AS venture_count,
  COUNT(epo.id) AS total_outcomes,
  ROUND(COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END)::NUMERIC / NULLIF(COUNT(epo.id), 0), 3) AS pass_rate,
  ROUND(AVG((epo.outcome->>'score')::NUMERIC), 2) AS avg_score,
  -- Per-dimension averages (from venture rubric_scores)
  ROUND(AVG((v.metadata->'stage_zero'->'rubric_scores'->>'market_opportunity')::NUMERIC), 2) AS avg_market_opportunity,
  ROUND(AVG((v.metadata->'stage_zero'->'rubric_scores'->>'revenue_viability')::NUMERIC), 2) AS avg_revenue_viability,
  ROUND(AVG((v.metadata->'stage_zero'->'rubric_scores'->>'unit_economics')::NUMERIC), 2) AS avg_unit_economics,
  ROUND(AVG((v.metadata->'stage_zero'->'rubric_scores'->>'execution_feasibility')::NUMERIC), 2) AS avg_execution_feasibility,
  ROUND(AVG((v.metadata->'stage_zero'->'rubric_scores'->>'competitive_defensibility')::NUMERIC), 2) AS avg_competitive_defensibility
FROM ventures v
JOIN evaluation_profile_outcomes epo ON epo.venture_id = v.id
WHERE v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' IS NOT NULL
  AND v.status != 'deleted'
  AND (epo.outcome->>'simulated')::BOOLEAN IS DISTINCT FROM TRUE
GROUP BY v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy';
```

### No New Tables
Extends `discovery_strategies` with new columns. Pattern analysis reads from existing `evaluation_profile_outcomes` and `ventures` tables.

### RLS
No RLS changes needed. `discovery_strategies` already has appropriate policies. Pattern analyzer runs server-side with service role key.

## API Surface

### Scripts (CLI)
| Script | Input | Output | Purpose |
|--------|-------|--------|---------|
| `strategy-analyzer.js` | None (reads DB) | JSON report to stdout | Compute per-strategy performance patterns |
| `strategy-analyzer.js --json` | None | Machine-readable JSON | Feed into generation loop |

### Functions (Library)
| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `loadActiveStrategies(supabase)` | Supabase client | Strategy[] | Replace hardcoded VALID_STRATEGIES |
| `analyzeStrategyPatterns(supabase)` | Supabase client | PatternReport | Rubric dimension breakdown per strategy |
| `checkEvolutionThreshold(supabase)` | Supabase client | {ready: boolean, totalVentures: number} | Guard: 20 venture minimum |

No REST endpoints or governance endpoints needed.

## Implementation Phases

### Phase 1: Dynamic Strategy Runner + Pattern Analyzer (~1 day)
1. Add migration `20260313_strategy_evolution_schema.sql` — extend `discovery_strategies` with evolution columns
2. Refactor `discovery-mode.js` — replace `VALID_STRATEGIES` whitelist with `loadActiveStrategies()` that queries `discovery_strategies` table. Fallback to hardcoded list if table is empty.
3. Create `strategy-analyzer.js` — queries gate outcomes grouped by strategy, computes pass rate + avg score + per-rubric-dimension averages, outputs structured report
4. Verify with existing 7 ventures: analyzer should show capability_overhang leading on execution_feasibility and unit_economics dimensions

### Phase 2: Hypothesis Generation Loop (Future SD, ~2 days)
1. Create `strategy-evolution.js` — reads pattern analysis, generates strategy hypotheses via LLM
2. New strategy prompt generation: "Strategy X excels at dimension Y but struggles at Z. Generate a variant that..."
3. Insert new strategies into `discovery_strategies` with `parent_strategies` lineage
4. Run small batch (5-10 ventures) through new strategy via experiment framework
5. Compare against baselines, auto-deactivate underperformers after 10 trials

### Phase 3: UI + Downstream Signals (Future SD, ~1 day)
1. Update DiscoveryModeDialog to show EVA-generated strategies with generation badge
2. Integrate downstream venture outcome data (stage survival beyond Stage 5)
3. Strategy genealogy visualization

## Testing Strategy

### Unit Tests
- `loadActiveStrategies()`: returns all active strategies from DB; falls back to hardcoded on empty table
- `analyzeStrategyPatterns()`: correct aggregation with known test data; handles strategies with 0 outcomes
- `checkEvolutionThreshold()`: returns false below 20 ventures, true at/above 20
- Dynamic strategy loading: new strategy inserted → immediately available in discovery pipeline

### Integration Tests
- End-to-end: insert a test strategy into `discovery_strategies` → run discovery mode with that strategy → verify venture created with correct `discovery_strategy` tag
- Pattern analyzer matches hand-calculated aggregations for existing 7 ventures
- Baseline strategies cannot be deactivated (`is_baseline=true` guard)

### E2E (Manual)
- Run `strategy-analyzer.js` → verify output shows per-dimension breakdown for each strategy
- Insert a test strategy → run discovery → verify it appears in gate outcomes
- Verify original 4 strategies still work identically after refactor

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Convergence monoculture — auto-generated strategies cluster around leader | High | High | Diversity constraint: new strategies must differ on ≥2 rubric dimension emphases; original 4 always preserved as baselines |
| Goodhart's Law — optimizing for gate scores not venture quality | Medium | High | Acknowledge limitation; plan downstream signal integration (Phase 3); track strategy performance over time, not just at activation |
| Thin data creates false patterns | High | Medium | 20-venture activation threshold; statistical significance tests before evolution decisions; never retire baselines |
| Dynamic strategy loading regression | Low | High | Fallback to hardcoded strategies if DB query fails; extensive unit tests on `loadActiveStrategies()` |
| LLM cost escalation from generation loop | Low | Low | Cap at 2 new strategies per evolution cycle; ~$1-3 per strategy evaluation; budget $20-50/month |
| Runaway strategy proliferation | Medium | Medium | Maximum 10 active non-baseline strategies; oldest underperformer retired when limit hit |
