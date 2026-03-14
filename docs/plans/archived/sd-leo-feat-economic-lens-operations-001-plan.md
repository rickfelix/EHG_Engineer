<!-- Archived from: docs/plans/economic-lens-operations-module-architecture.md -->
<!-- SD Key: SD-LEO-FEAT-ECONOMIC-LENS-OPERATIONS-001 -->
<!-- Archived at: 2026-03-11T10:35:22.474Z -->

# Architecture Plan: Economic Lens — Operations Module Integration

## Stack & Repository Decisions

| Decision | Choice |
|----------|--------|
| **Frontend** | EHG repo (`C:\Users\rickf\Projects\_EHG\ehg`) — React + TypeScript + Shadcn UI + Tailwind + Recharts |
| **Backend** | EHG_Engineer repo — Node.js analysis template + Supabase edge function or API route |
| **LLM Provider** | Anthropic Claude (via existing EVA analysis pipeline) |
| **Data Storage** | `venture_artifacts` table (existing) with `artifact_type: 'economic_lens'` |
| **Chart Library** | Recharts `RadarChart` (already imported in 10+ components) |

Both repos require changes. No new dependencies. No new database tables — leverages existing `venture_artifacts`.

## Legacy Deprecation Plan

- **IntelligenceDrawer**: Confirmed legacy. Separate cleanup SD required (~40 files). Economic Lens does NOT depend on or interact with IntelligenceDrawer in any way.
- **No other deprecations**: Economic Lens is additive — no existing features replaced or modified.

## Route & Component Structure

### Frontend Components (EHG repo)

```
src/
  components/
    ventures/
      operations-mode/
        EconomicsTab.tsx              # NEW — 6-axis classification cards + refresh
        EconomicsTab.types.ts         # NEW — TypeScript interfaces
      chairman-v3/
        operations/
          EconomicRadarCard.tsx        # NEW — Portfolio radar chart
    ui/
      economic-badge.tsx              # NEW — Kill gate badge component
  hooks/
    useEconomicLens.ts                # NEW — Fetch/trigger/cache hook
  services/
    economicLens.ts                   # NEW — API client for economic analysis
```

### Backend Components (EHG_Engineer repo)

```
lib/
  eva/
    economic-lens-analysis.js         # NEW — LLM prompt template + structured output
scripts/
  api/
    economic-lens.js                  # NEW — API endpoint (trigger + fetch)
```

### Integration Points (Existing Files Modified)

```
# EHG repo
src/components/ventures/operations-mode/OperationsMode.tsx    # Add Economics tab
src/components/chairman-v3/operations/OperationsDashboard.tsx # Add radar card
src/components/ventures/stage-views/KillGateRenderer.tsx      # Add economic badge

# EHG_Engineer repo
lib/eva/stage-execution-engine.js    # Hook: auto-trigger economic analysis post-Stage 5
```

## Data Layer

### Storage: `venture_artifacts` Table (Existing)

No migration needed. Economic analysis stores as a new artifact type:

```sql
-- Existing table structure
venture_artifacts (
  id UUID PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  artifact_type TEXT,        -- 'economic_lens'
  content TEXT,              -- Overall assessment text
  metadata JSONB,            -- Structured 6-axis analysis (see schema below)
  is_current BOOLEAN,        -- TRUE for latest analysis, FALSE for historical
  lifecycle_stage TEXT,       -- NULL (venture-level, not stage-bound)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### JSONB Schema (`metadata` field)

```json
{
  "version": "1.0",
  "axes": {
    "market_structure": {
      "classification": "TIGHT_OLIGOPOLY",
      "score": 7,
      "confidence": 0.8,
      "rationale": "Top 3 players hold ~75% market share...",
      "implications": {
        "pricing_power": "LOW",
        "entry_feasibility": "MODERATE",
        "recommended_strategy": "DIFFERENTIATION"
      }
    },
    "network_effects": {
      "classification": "INDIRECT_STRONG",
      "score": 7,
      "confidence": 0.7,
      "rationale": "Two-sided market where each side attracts the other...",
      "cold_start_severity": "HIGH",
      "multi_homing_risk": "MODERATE",
      "winner_take_all": false
    },
    "unit_economics": {
      "classification": "STRONG",
      "score": 8,
      "confidence": 0.9,
      "rationale": "Marginal cost decreasing. $0.50/user at current scale, $0.08 at 100K...",
      "cost_curve_type": "DECREASING",
      "step_functions": [
        {"trigger": "1000 users", "cost_jump": "Support hire ~$60K/yr", "impact": "MODERATE"}
      ],
      "breakeven_inflection": "~2000 paying users at $10/mo"
    },
    "market_timing": {
      "classification": "RIGHT_ON_TIME",
      "score": 8,
      "confidence": 0.7,
      "rationale": "API commoditization creating window...",
      "window_status": "OPENING",
      "catalyst": "LLM API pricing dropping 10x in 18 months",
      "first_mover_value": "MODERATE"
    },
    "entry_barriers": {
      "classification": "MODERATE",
      "score": 5,
      "confidence": 0.8,
      "rationale": "Switching costs are high but capital requirements are low...",
      "barriers": [
        {"type": "switching_costs", "severity": "HIGH", "detail": "..."},
        {"type": "capital_requirements", "severity": "LOW", "detail": "..."},
        {"type": "regulatory", "severity": "LOW", "detail": "..."}
      ],
      "highest_risk_barrier": "switching_costs"
    },
    "scale_economics": {
      "classification": "FAVORABLE",
      "score": 7,
      "confidence": 0.8,
      "rationale": "Strong economies of scale. Fixed costs dominate...",
      "operating_leverage": "HIGH",
      "scale_thresholds": [
        {"users": 5000, "effect": "Unit economics turn positive"},
        {"users": 50000, "effect": "Infrastructure costs plateau"}
      ]
    }
  },
  "overall_risk_level": "MODERATE",
  "overall_assessment": "Economically well-positioned...",
  "source_stages": ["stage_0", "stage_3", "stage_4", "stage_5", "stage_6"],
  "model_used": "claude-sonnet-4-20250514",
  "generated_at": "2026-03-11T14:32:00Z"
}
```

### Score Normalization Rubric (Deterministic)

The LLM outputs classifications. The frontend converts to 1-10 scores for radar chart rendering using a fixed mapping:

| Axis | Classification → Score |
|------|----------------------|
| Market Structure | EMERGING=8, MONOPOLISTIC_COMPETITION=6, LOOSE_OLIGOPOLY=5, TIGHT_OLIGOPOLY=4, NEAR_PERFECT_COMPETITION=3, MONOPOLY=2 |
| Network Effects | DIRECT_STRONG=10, INDIRECT_STRONG=8, DATA_NETWORK=7, DIRECT_WEAK=5, INDIRECT_WEAK=4, LOCAL_NETWORK=3, NONE=1 |
| Unit Economics | STRONG=9, MODERATE=6, WEAK=3, NEGATIVE=1 |
| Market Timing | RIGHT_ON_TIME=10, EARLY_BUT_VIABLE=7, LATE_BUT_DIFFERENTIATED=5, TOO_EARLY=2, TOO_LATE=1 |
| Entry Barriers | LOW=9, MODERATE=6, HIGH=3, PROHIBITIVE=1 (inverted: low barriers = favorable) |
| Scale Economics | STRONG_ECONOMIES=9, MODERATE=6, LINEAR=4, DISECONOMIES=1 |

Note: Higher scores = more favorable for the venture. The radar chart shows "economic attractiveness", not raw magnitude.

### Queries

```sql
-- Fetch latest economic analysis for a venture
SELECT * FROM venture_artifacts
WHERE venture_id = $1
  AND artifact_type = 'economic_lens'
  AND is_current = TRUE
ORDER BY created_at DESC
LIMIT 1;

-- Portfolio view: all ventures with economic analyses
SELECT va.*, v.name as venture_name
FROM venture_artifacts va
JOIN ventures v ON v.id = va.venture_id
WHERE va.artifact_type = 'economic_lens'
  AND va.is_current = TRUE
ORDER BY va.created_at DESC;

-- Invalidate previous analysis on refresh
UPDATE venture_artifacts
SET is_current = FALSE
WHERE venture_id = $1
  AND artifact_type = 'economic_lens'
  AND is_current = TRUE;
```

### RLS
Follows existing `venture_artifacts` RLS policies — no new policies needed.

## API Surface

### Trigger Economic Analysis
```
POST /api/eva/economic-lens/:ventureId
Body: { "force_refresh": boolean }
Response: { "analysis": <JSONB schema above>, "artifact_id": UUID }
```

Internally:
1. Fetch upstream artifacts (Stage 0 moat, Stage 3 validation, Stage 4 competitive, Stage 5 financial, Stage 6 risk)
2. Construct LLM prompt with upstream context + classification taxonomy
3. Parse structured JSONB response
4. Invalidate previous `is_current` artifacts
5. Persist new artifact with `is_current = TRUE`
6. Return analysis

### Fetch Cached Analysis
```
GET /api/eva/economic-lens/:ventureId
Response: { "analysis": <JSONB schema above> | null, "generated_at": ISO string | null }
```

### Portfolio View
```
GET /api/eva/economic-lens/portfolio
Response: { "ventures": [{ "venture_id", "venture_name", "analysis", "generated_at" }] }
```

## Implementation Phases

### Phase 1: Venture Economics Tab (~300 LOC, 1 SD)
**Backend (EHG_Engineer):**
- `lib/eva/economic-lens-analysis.js` — LLM prompt template consuming upstream stage artifacts, producing 6-axis JSONB (~80 LOC)
- `scripts/api/economic-lens.js` — POST (trigger) + GET (fetch) endpoints (~70 LOC)

**Frontend (EHG):**
- `useEconomicLens.ts` — React Query hook for fetch + trigger + cache invalidation (~50 LOC)
- `EconomicsTab.tsx` — 6 classification cards in 2x3 grid, overall assessment, "Refresh" button (~120 LOC)
- Wire into `OperationsMode.tsx` as 7th tab (~15 LOC)

**Auto-trigger hook:**
- In `stage-execution-engine.js`, after Stage 5 completes, fire POST to economic-lens endpoint (~15 LOC)

**Deliverable**: Chairman can open any post-Stage-5 venture's operations mode, see Economics tab with 6-axis analysis, and click Refresh for updated analysis.

### Phase 2: Portfolio Radar (~120 LOC, 1 SD or QF)
**Frontend (EHG):**
- `EconomicRadarCard.tsx` — Recharts RadarChart with venture overlays, legend, "Refresh All" button (~80 LOC)
- Wire into `OperationsDashboard.tsx` as a new card/section (~20 LOC)
- Fetch portfolio data via GET /api/eva/economic-lens/portfolio (~20 LOC in existing hook)

**Deliverable**: Chairman sees radar chart in operations dashboard comparing all ventures with cached economic profiles.

### Phase 3: Kill Gate Badges (~40 LOC, Quick Fix)
**Frontend (EHG):**
- `economic-badge.tsx` — Small badge component showing top 2-3 economic classifications with color coding (~25 LOC)
- Wire into `KillGateRenderer.tsx` — conditional render if economic analysis exists (~15 LOC)

**Deliverable**: Kill gate views at Stages 5, 13, 23 show economic risk badge linking to full Economics tab.

## Testing Strategy

### Unit Tests
- LLM prompt template: verify upstream artifact consumption produces valid prompt structure
- Score normalization rubric: verify all classifications map to expected 1-10 scores
- JSONB schema validation: verify LLM output matches expected schema (use zod or similar)

### Integration Tests
- API endpoint: trigger analysis for a test venture with mocked stage artifacts, verify JSONB stored correctly
- Cache invalidation: trigger refresh, verify previous artifact marked `is_current = FALSE`
- Portfolio query: verify multi-venture fetch returns correct data shape

### E2E Tests (Manual)
- Navigate to venture operations → Economics tab → verify 6 cards render
- Click Refresh → verify loading state → verify updated timestamp
- Navigate to chairman operations → verify radar chart renders with venture overlays
- Verify kill gate badge appears for post-Stage-5 ventures

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **LLM produces inconsistent classifications** | Constrain output with explicit enum lists in system prompt. Validate response against allowed values before persisting. |
| **Stage 5 data conflict** | Economic Lens prompt explicitly includes Stage 5 financial model as input context. Instructions say "use the following financial analysis, do not re-derive." |
| **Radar chart misleading** | Use deterministic score mapping, not LLM-generated scores. Document the rubric. Include confidence indicators. |
| **7-tab mobile overflow** | Switch `OperationsMode.tsx` from `grid-cols-6` to scrollable `TabsList`. Test on mobile viewport. |
| **LLM cost accumulation** | Cache aggressively. Portfolio "Refresh All" refreshes one at a time with confirmation. No batch auto-fire. |
| **Stale analysis at kill gates** | Badge shows "Generated at Stage X" age indicator. If analysis is >3 stages old, badge shows amber "Outdated" warning. |
