<!-- Archived from: docs/plans/discovery-strategy-performance-scoring-architecture.md -->
<!-- SD Key: SD-LEO-FEAT-DISCOVERY-STRATEGY-PERFORMANCE-001 -->
<!-- Archived at: 2026-03-13T12:31:34.143Z -->

# Architecture Plan: Discovery Strategy Performance Scoring

## Stack & Repository Decisions
- **Backend**: Supabase RPC function (PostgreSQL) in EHG_Engineer repo
- **Frontend**: React component update in ehg repo (DiscoveryModeDialog.tsx)
- **No new dependencies**: Uses existing Supabase client, Lucide icons (Star), React Query
- **Two-repo delivery**: Backend migration shipped first, frontend consumes RPC

## Legacy Deprecation Plan
N/A — greenfield feature. No existing systems replaced. The static `strategies` array in DiscoveryModeDialog remains but gets augmented with dynamic score data.

## Route & Component Structure

### Backend (EHG_Engineer)
```
database/migrations/
  └── 20260313_discovery_strategy_scores.sql   # RPC function

lib/eva/stage-zero/
  └── gate-signal-service.js                   # Already modified (outcome includes discovery_strategy)

lib/eva/stage-zero/
  └── chairman-review.js                       # Already modified (persists rubric_scores on venture)
```

### Frontend (ehg)
```
src/hooks/
  └── useDiscoveryStrategyScores.ts            # New hook: calls RPC, returns scores by strategy

src/components/chairman-v3/opportunities/
  ├── DiscoveryModeDialog.tsx                  # Modified: consumes scores, renders stars, sorts
  └── StrategyStarRating.tsx                   # New: star rating display component
```

## Data Layer

### Supabase RPC Function
```sql
CREATE OR REPLACE FUNCTION get_discovery_strategy_scores()
RETURNS TABLE (
  strategy TEXT,
  venture_count BIGINT,
  total_outcomes BIGINT,
  pass_count BIGINT,
  pass_rate NUMERIC,
  avg_score NUMERIC,
  composite_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' AS strategy,
    COUNT(DISTINCT v.id) AS venture_count,
    COUNT(epo.id) AS total_outcomes,
    COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END) AS pass_count,
    ROUND(
      COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END)::NUMERIC
      / NULLIF(COUNT(epo.id), 0), 3
    ) AS pass_rate,
    ROUND(AVG((epo.outcome->>'score')::NUMERIC), 2) AS avg_score,
    -- Composite: 70% pass rate + 30% normalized avg score (score/10)
    ROUND(
      0.7 * (COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END)::NUMERIC
             / NULLIF(COUNT(epo.id), 0))
      + 0.3 * (AVG((epo.outcome->>'score')::NUMERIC) / 10.0),
    3) AS composite_score
  FROM ventures v
  JOIN evaluation_profile_outcomes epo ON epo.venture_id = v.id
  WHERE v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' IS NOT NULL
    AND v.status != 'deleted'
    AND (epo.outcome->>'simulated')::BOOLEAN IS DISTINCT FROM TRUE
  GROUP BY v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### Query Pattern (Frontend)
```typescript
const { data } = await supabase.rpc('get_discovery_strategy_scores');
// Returns: [{ strategy, venture_count, pass_rate, avg_score, composite_score }]
```

### No New Tables
Pure read-only aggregation. No mutations, no new tables, no RLS changes.

### RLS
RPC is `SECURITY DEFINER` — callable by authenticated users. The underlying data (ventures, evaluation_profile_outcomes) already has appropriate RLS policies.

## API Surface

### RPC Function
| Function | Input | Output | Auth |
|----------|-------|--------|------|
| `get_discovery_strategy_scores()` | None | Table of strategy scores | Authenticated |

No REST endpoints needed. No governance endpoints.

## Implementation Phases

### Phase 1: Backend RPC (EHG_Engineer) — ~1 hour
1. Create migration `20260313_discovery_strategy_scores.sql` with RPC function
2. Apply migration to Supabase
3. Verify with direct RPC call

### Phase 2: Frontend UI (ehg) — ~2 hours
1. Create `useDiscoveryStrategyScores.ts` hook
2. Create `StrategyStarRating.tsx` component (star display with cold-start handling)
3. Modify `DiscoveryModeDialog.tsx` to consume scores, sort strategies, render ratings
4. Test with real data

### Phase 3: Ship — ~30 minutes
1. PR for backend migration
2. PR for frontend changes
3. Verify in production

**Total estimated effort**: 3-4 hours, single developer

## Testing Strategy

### Unit Tests
- `StrategyStarRating` component: renders correct number of filled/empty stars for various scores
- Star calculation: composite_score → star count mapping (0-1 → 1-5 stars)
- Cold start: shows "New" badge when venture_count < 5

### Integration Tests
- RPC function returns correct aggregations for known test data
- Excludes simulated/synthetic ventures from scoring
- Handles strategies with 0 outcomes gracefully

### E2E (Manual)
- Open DiscoveryModeDialog → star ratings visible for strategies with data
- Strategies sorted by score (highest first)
- "New" badge for nursery_reeval (no data)
- Dialog load time < 500ms

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Small sample size creates misleading ratings | High (current state) | Medium | Minimum threshold (5 ventures) before showing stars; show venture count |
| Star ratings discourage exploration of low-rated strategies | Medium | High | Show "New" badge (not 0 stars) for unrated; periodically prompt Chairman to try underused strategies |
| RPC performance with large dataset | Low | Low | Query is simple GROUP BY on indexed columns; add index on discovery_strategy if needed |
| Cross-repo deploy ordering | Low | Low | Backend RPC is additive; frontend gracefully handles missing RPC (shows no stars) |
| LLM scoring variance inflates/deflates strategy ratings | Medium | Low | Each venture scored once; law of large numbers smooths over time |
