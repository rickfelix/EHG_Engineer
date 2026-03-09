# Architecture Plan: 5-10X Value vs Competition Methodology

## Stack & Repository Decisions
- **Repositories**: EHG_Engineer (backend — scoring pipeline, stage gates, portfolio optimizer)
- **Runtime**: Node.js (existing LEO Protocol infrastructure)
- **LLM**: Claude Sonnet for competitive baseline analysis and value multiplier estimation. Uses existing `client-factory.js` for LLM routing.
- **Database**: Supabase (PostgreSQL) — extends existing schema
- **Existing Infrastructure (Fully Reusable)**: OpportunityScorer (394 LOC, 6 weighted dimensions), GapAnalyzer (343 LOC, 6 gap dimensions), moat-architecture.js (109 LOC, 7 moat types), stage-gates.js (704 LOC, kill/promotion gates), financial-contract.js (276 LOC, unit economics), cross-venture-learning.js (612 LOC, pattern extraction), portfolio-optimizer.js (524 LOC, resource allocation)
- **New Dependencies**: None required

## Legacy Deprecation Plan
N/A — additive infrastructure. The existing OpportunityScorer gains a 7th dimension; existing 6 dimensions and their weights are rebalanced but not removed. Stage gates gain an advisory check; existing kill/promotion gates unchanged. Portfolio optimizer gains an additional signal; existing 5 signals unchanged.

## Route & Component Structure

### EHG_Engineer (Backend)
- `lib/discovery/opportunity-scorer.js` — **Modified**: Add `value_multiplier` as 7th scoring dimension. Rebalance weights. Add `calculateValueMultiplier()` method.
- `lib/discovery/value-multiplier-calculator.js` — **New**: Calculates value multiplier from gap scores, financial contract data, moat output. Produces multiplier range with confidence interval.
- `lib/discovery/competitive-baseline-service.js` — **New**: Manages competitive baseline data per venture. CRUD operations on `competitive_baselines` table. Integrates with gap analyzer outputs.
- `lib/agents/modules/venture-state-machine/stage-gates.js` — **Modified**: Add advisory value multiplier gate at stages 5 and 13. Non-blocking (advisory only) until calibration data supports kill gate.
- `lib/eva/portfolio-optimizer.js` — **Modified**: Add `value_multiplier` as 6th signal weight. Rebalance existing 5 weights.
- `lib/eva/cross-venture-learning.js` — **Modified**: Add `analyzeValueMultiplierCalibration()` for historical accuracy tracking.
- `scripts/eva/value-multiplier-dashboard.mjs` — **New**: Generates portfolio value multiplier report for chairman.

## Data Layer

### New Tables
- `competitive_baselines` — Per-venture competitive baseline data
  - `id` (uuid), `venture_id` (fk → ventures), `competitor_name` (text)
  - `pricing_data` (jsonb — plans, tiers, per-seat costs), `feature_coverage` (jsonb — feature list with scores)
  - `performance_metrics` (jsonb — speed, reliability, uptime), `user_satisfaction` (jsonb — NPS, reviews, ratings)
  - `data_quality` (text — FACT, ASSUMPTION, SIMULATION, UNKNOWN per four-bucket model)
  - `source` (text — where data came from), `collected_at` (timestamptz)
  - `created_at` (timestamptz), `updated_at` (timestamptz)

- `value_multiplier_scores` — Per-venture value multiplier time-series
  - `id` (uuid), `venture_id` (fk → ventures), `scored_at` (timestamptz)
  - `overall_multiplier` (numeric — composite score, e.g., 7.3)
  - `multiplier_low` (numeric — confidence interval low bound, e.g., 5.0)
  - `multiplier_high` (numeric — confidence interval high bound, e.g., 9.5)
  - `confidence_level` (text — FACT, ASSUMPTION, SIMULATION, UNKNOWN)
  - `sub_scores` (jsonb — { price_performance: 8.2, capability_breadth: 6.5, time_to_value: 9.0, ux_quality: 7.0, integration_depth: 5.5 })
  - `competitor_baseline_ids` (uuid[] — references to competitive_baselines used)
  - `scoring_context` (jsonb — gap scores, financial data, moat data used in calculation)
  - `created_at` (timestamptz)

### Existing Tables Used
- `ventures` — Venture context for scoring
- `venture_financial_contract` — Unit economics data for price-performance sub-score
- `competitors` — Existing competitor tracking (if populated)
- `opportunity_scans` — Gap analyzer outputs

### RLS
- Service role for backend scoring pipeline
- Authenticated read for dashboard access (chairman view)

## API Surface
- No new REST endpoints needed (internal pipeline)
- RPC: `get_value_multiplier_history(venture_id, since_date)` — time-series for dashboard
- RPC: `get_portfolio_value_summary()` — all ventures' latest multiplier scores
- The existing stage gate system handles gate integration internally

## Implementation Phases
- **Phase 1** (2 weeks): Value Multiplier Dimension — Create `value_multiplier_scores` table. Build `value-multiplier-calculator.js` composing multiplier from gap scores + financial contract + moat output. Integrate as 7th dimension in OpportunityScorer with rebalanced weights: market_opportunity 0.20, competitive_advantage 0.15, feasibility 0.15, evidence_strength 0.15, time_to_value 0.10, risk_adjusted 0.10, value_multiplier 0.15. Dashboard widget showing multiplier per venture.
- **Phase 2** (2 weeks): Competitive Baselines — Create `competitive_baselines` table. Build `competitive-baseline-service.js` for CRUD and gap analyzer integration. Epistemic quality tags (FACT/ASSUMPTION/SIMULATION/UNKNOWN) per data point. LLM-assisted baseline extraction from existing competitor analysis artifacts.
- **Phase 3** (2 weeks): Stage Gate Integration — Add advisory value multiplier gate at stages 5 (post-discovery) and 13 (pre-scale). Non-blocking — produces advisory output, does not prevent stage advancement. Multiplier trajectory tracking via time-series in `value_multiplier_scores`. Decay detection: alert when multiplier drops >20% quarter-over-quarter. Cross-venture learning calibration: `analyzeValueMultiplierCalibration()` in cross-venture-learning.js.
- **Phase 4** (2 weeks): Portfolio Intelligence — Add `value_multiplier` as signal weight (0.15) in portfolio-optimizer.js. Rebalance existing weights: urgency 0.25, roi 0.20, financial 0.15, market 0.15, health 0.10, value_multiplier 0.15. Portfolio value heat map generation (`value-multiplier-dashboard.mjs`). Calibration report (estimated vs actual multiplier for completed ventures).

## Testing Strategy
- Unit tests for value multiplier calculator (known gap scores + financial data → expected multiplier range)
- Unit tests for confidence interval calculation (FACT data → narrow intervals, ASSUMPTION → wider)
- Integration tests for OpportunityScorer with 7th dimension (existing 6-dimension tests still pass)
- Integration tests for stage gate advisory check (venture at stage 5 → advisory output without blocking)
- Calibration tests: synthetic historical data → calibration report accuracy
- Edge case tests: no competitor data → status quo fallback, multi-segment ventures → weighted composite

## Risk Mitigation
- **False precision**: Confidence intervals required on all multiplier scores. UNKNOWN epistemic level when data is insufficient. Chairman sees ranges, not single numbers. Advisory-only gates until calibration proves predictive power.
- **Weight rebalancing destabilization**: Existing OpportunityScorer tests must continue to pass. Rebalanced weights maintain same ordering on test portfolio (no rank inversions for well-scored ventures). Feature flag to toggle 7th dimension during rollout.
- **Competitive data staleness**: `collected_at` timestamp on all baselines. Auto-warning when baseline data > 90 days old. Confidence level degrades over time (FACT → ASSUMPTION after 6 months without refresh).
- **Kill gate misuse**: Advisory-only for minimum 12 months. Explicit "lens not gate" labeling. Kill gate requires chairman opt-in per venture, not automatic enforcement.
- **Denominator estimation error**: The value multiplier is "EHG value / competitor value" where competitor value is estimated. Error propagation tracked via confidence intervals. Cross-venture learning calibrates estimation accuracy. Portfolio decisions use the conservative (low) end of the interval.
