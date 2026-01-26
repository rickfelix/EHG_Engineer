# Stage 17: Recursion Blueprint


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

## Current State Analysis

### Critique Recursion Section: DOES NOT EXIST

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:1-72 "72 lines total"

**Observation**: Current critique file contains NO recursion section. This is consistent with the gap pattern identified in Stages 11-16 dossiers.

**Line Count Verification**:
- Stage 17 critique: 72 lines
- Pattern: Identical to Stages 14, 15, 16 (all 72 lines, no recursion)
- Conclusion: Recursion analysis missing from current workflow documentation

## Gap Assessment

**Critical Gap**: No automated triggers for recursive workflow loops
**Impact**:
- Failed campaigns cannot automatically trigger corrective actions
- Manual intervention required for strategy adjustments
- Delays in feedback loop reduce marketing efficiency

**Evidence from Critique**:
- Weakness: "No explicit error handling" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:26)
- Risk: "Primary Risk: Process delays" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:63)
- Recommendation: "Define clear metrics with thresholds" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:69) - essential for recursion triggers

## Proposed Recursion Architecture

### Framework Reference
**Strategic Directive**: SD-RECURSION-ENGINE-001
**Purpose**: Automate recursive workflow loops for self-healing systems
**Status**: Active (per dossier specification)

**Evidence**: SD-RECURSION-ENGINE-001 provides the infrastructure for automated recursion triggers, eliminating manual escalation for known failure patterns.

### Recursion Trigger Definitions

#### Trigger GTM-001: Campaign Effectiveness Recursion

**Condition**: Campaign effectiveness <50% of target for 14 consecutive days

**Metric Definition**:
- **Campaign Effectiveness**: Composite score = (0.4 × click_rate) + (0.3 × engagement_rate) + (0.3 × conversion_rate)
- **Target**: Venture-specific, defined in substage 17.1 (strategy configuration)
- **Threshold**: <50% indicates fundamental strategy misalignment

**Recursion Targets**:
1. **Stage 15 (Financial Modeling)**: If effectiveness gap correlates with pricing resistance
   - Evidence: High click rates but low conversion → pricing issue
   - Action: Re-run pricing analysis with new market data
2. **Stage 5 (Profitability Model)**: If CAC (Customer Acquisition Cost) >2× LTV (Lifetime Value)
   - Evidence: Campaign ROI negative despite good engagement
   - Action: Revise profitability assumptions, adjust go-to-market strategy

**Automation Logic**:
```sql
-- Trigger query (runs daily)
SELECT venture_id,
       campaign_id,
       AVG(effectiveness_score) as avg_effectiveness,
       COUNT(*) as days_below_threshold
FROM campaign_performance
WHERE effectiveness_score < (target_effectiveness * 0.5)
  AND measurement_date >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY venture_id, campaign_id
HAVING COUNT(*) >= 14;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 15 or 5
```

**Expected Outcome**:
- Automated recursion to Stage 15 or Stage 5
- Re-execution of strategic analysis with campaign performance data
- New GTM strategy generated in Stage 17 (second iteration)

**Evidence Mapping**:
- Campaign effectiveness metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:749 "Campaign effectiveness"
- Conversion rates metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:751 "Conversion rates"

#### Trigger GTM-002: Lead Generation Recursion

**Condition**: Lead generation <10 leads/week for 2 consecutive weeks

**Metric Definition**:
- **Lead Generation**: Count of qualified leads (form submissions, demo requests, free trial signups)
- **Threshold**: <10 leads/week for B2B ventures, <50 leads/week for B2C (venture-specific)
- **Duration**: 2 consecutive weeks (14 days)

**Recursion Targets**:
1. **Stage 11 (Naming/Branding)**: If low lead volume correlates with poor brand recognition
   - Evidence: Low ad impressions, high CPM (Cost Per Mille), poor engagement
   - Action: Re-evaluate brand messaging, test new positioning
2. **Stage 15 (Pricing)**: If lead volume acceptable but qualification rate low
   - Evidence: High form submissions but low sales-qualified leads
   - Action: Adjust pricing tiers, improve value proposition clarity

**Automation Logic**:
```sql
-- Trigger query (runs weekly)
WITH weekly_leads AS (
  SELECT venture_id,
         DATE_TRUNC('week', created_at) as week_start,
         COUNT(*) as lead_count
  FROM leads
  WHERE status = 'qualified'
    AND created_at >= CURRENT_DATE - INTERVAL '14 days'
  GROUP BY venture_id, week_start
)
SELECT venture_id,
       COUNT(*) as weeks_below_threshold
FROM weekly_leads
WHERE lead_count < 10  -- B2B threshold, adjust for B2C
GROUP BY venture_id
HAVING COUNT(*) >= 2;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 11 or 15
```

**Expected Outcome**:
- Automated recursion to Stage 11 (branding) or Stage 15 (pricing)
- Revised messaging/positioning or pricing strategy
- New campaigns deployed in Stage 17 (second iteration)

**Evidence Mapping**:
- Lead generation metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:750 "Lead generation"
- Customer segments input: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:742 "Customer segments" (source of targeting data)

#### Trigger GTM-003: Conversion Rate Recursion

**Condition**: Conversion rate <1% for 30 consecutive days

**Metric Definition**:
- **Conversion Rate**: (Paying customers / Total leads) × 100
- **Threshold**: <1% indicates severe funnel issues (industry benchmark: 2-5% for B2B, 1-3% for B2C)
- **Duration**: 30 days (full sales cycle observation)

**Recursion Targets**:
1. **Stage 17 (self-recursion)**: If conversion issue isolated to specific campaign/channel
   - Evidence: Some campaigns converting well (>2%), others failing (<0.5%)
   - Action: Pause underperforming campaigns, reallocate budget to winners
2. **Stage 18 (Sales Agent)**: If conversion issue stems from sales process
   - Evidence: High lead qualification but low close rates
   - Action: Forward-recurse to Stage 18 for sales workflow optimization
3. **Stage 16 (Pricing)**: If conversion drop correlates with pricing changes
   - Evidence: Leads reaching pricing page but not proceeding
   - Action: Re-evaluate pricing strategy, test new tiers

**Automation Logic**:
```sql
-- Trigger query (runs daily)
WITH conversion_metrics AS (
  SELECT venture_id,
         DATE(created_at) as metric_date,
         SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END)::FLOAT /
           NULLIF(COUNT(*), 0) * 100 as conversion_rate
  FROM leads
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY venture_id, DATE(created_at)
)
SELECT venture_id,
       AVG(conversion_rate) as avg_conversion_rate,
       COUNT(*) as days_below_threshold
FROM conversion_metrics
WHERE conversion_rate < 1.0
GROUP BY venture_id
HAVING COUNT(*) >= 30;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 17, 18, or 16
```

**Expected Outcome**:
- Automated recursion to Stage 17 (self-improvement), Stage 18 (sales fix), or Stage 16 (pricing fix)
- Targeted intervention based on root cause analysis
- Conversion rate recovery within next 30-day cycle

**Evidence Mapping**:
- Conversion rates metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:751 "Conversion rates"
- Workflows active gate: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:759 "Workflows active" (automation enables recursion)

#### Trigger GTM-004: Budget Efficiency Recursion

**Condition**: ROAS (Return on Ad Spend) <2.0 for 21 consecutive days

**Metric Definition**:
- **ROAS**: (Revenue from campaigns / Campaign spend) × 1
- **Threshold**: <2.0 indicates unprofitable marketing (need ≥3.0 for healthy margins)
- **Duration**: 21 days (3 weeks, typical optimization cycle)

**Recursion Targets**:
1. **Stage 5 (Profitability Model)**: If ROAS gap indicates CAC/LTV imbalance
   - Evidence: Campaign costs exceed customer lifetime value projections
   - Action: Revise profitability model, adjust marketing spend limits
2. **Stage 15 (Pricing)**: If ROAS low due to insufficient margins
   - Evidence: Acquiring customers at reasonable cost, but revenue per customer too low
   - Action: Increase pricing or upsell/cross-sell strategies

**Automation Logic**:
```sql
-- Trigger query (runs daily)
WITH roas_metrics AS (
  SELECT c.venture_id,
         DATE(p.measurement_date) as metric_date,
         SUM(p.revenue) / NULLIF(SUM(c.spend), 0) as daily_roas
  FROM campaign_performance p
  JOIN campaigns c ON p.campaign_id = c.campaign_id
  WHERE p.measurement_date >= CURRENT_DATE - INTERVAL '21 days'
  GROUP BY c.venture_id, DATE(p.measurement_date)
)
SELECT venture_id,
       AVG(daily_roas) as avg_roas,
       COUNT(*) as days_below_threshold
FROM roas_metrics
WHERE daily_roas < 2.0
GROUP BY venture_id
HAVING COUNT(*) >= 21;

-- If returned rows > 0, invoke SD-RECURSION-ENGINE-001 with target_stage = 5 or 15
```

**Expected Outcome**:
- Automated recursion to Stage 5 (profitability) or Stage 15 (pricing)
- Revised financial model or pricing strategy
- Campaign spend reallocation in Stage 17

**Evidence Mapping**:
- Budget allocation: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:766 "Budgets allocated" (source of spend data)
- Critique recommendation: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:34 "Build automation workflows" (includes ROAS monitoring)

### Forward Recursion (Stage 17 → Stage 18)

**Trigger**: Campaign success creates new optimization opportunities

**Condition**: Lead generation >100 leads/week for 4 consecutive weeks + conversion rate >3%

**Action**: Forward-recurse to Stage 18 (Sales Agent Development) to:
1. Scale sales team capacity (more leads require more sales resources)
2. Optimize sales workflows for increased volume
3. Implement lead scoring to prioritize high-value prospects

**Automation Logic**:
```sql
-- Trigger query (runs weekly)
WITH performance_metrics AS (
  SELECT venture_id,
         DATE_TRUNC('week', created_at) as week_start,
         COUNT(*) as weekly_leads,
         AVG(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) * 100 as conversion_rate
  FROM leads
  WHERE created_at >= CURRENT_DATE - INTERVAL '28 days'
  GROUP BY venture_id, week_start
)
SELECT venture_id,
       AVG(weekly_leads) as avg_weekly_leads,
       AVG(conversion_rate) as avg_conversion_rate
FROM performance_metrics
GROUP BY venture_id
HAVING AVG(weekly_leads) > 100 AND AVG(conversion_rate) > 3.0;

-- If returned rows > 0, suggest forward recursion to Stage 18 (not automatic, requires LEAD approval)
```

**Evidence Mapping**:
- Downstream impact: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:59 "Downstream Impact: Stages 18"
- Lead generation metric: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:750 "Lead generation"

## Implementation Requirements

### Database Schema Extensions

```sql
-- Recursion trigger log
CREATE TABLE stage_recursion_triggers (
  trigger_id UUID PRIMARY KEY,
  venture_id VARCHAR(50),
  source_stage INT,  -- 17 for Stage 17
  target_stage INT,  -- 5, 11, 15, 16, or 18
  trigger_type VARCHAR(50),  -- 'GTM-001', 'GTM-002', etc.
  trigger_condition TEXT,
  metric_value FLOAT,
  threshold_value FLOAT,
  triggered_at TIMESTAMP DEFAULT NOW(),
  recursion_status VARCHAR(20)  -- 'pending', 'executing', 'completed', 'failed'
);

-- Recursion execution history
CREATE TABLE stage_recursion_executions (
  execution_id UUID PRIMARY KEY,
  trigger_id UUID REFERENCES stage_recursion_triggers(trigger_id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  outcome VARCHAR(20),  -- 'success', 'failure', 'manual_override'
  new_strategy_json JSONB,  -- Store revised strategy from target stage
  notes TEXT
);
```

### Integration with SD-RECURSION-ENGINE-001

**Required API Endpoints**:
1. `POST /api/recursion/trigger`: Initiate recursion
   - Parameters: `venture_id`, `source_stage`, `target_stage`, `trigger_type`, `context_data`
   - Response: `recursion_execution_id`

2. `GET /api/recursion/status/{execution_id}`: Check recursion status
   - Response: `status`, `progress_percentage`, `estimated_completion`

3. `POST /api/recursion/approve`: Manual approval gate (if required)
   - Parameters: `execution_id`, `approved_by`, `approval_notes`

**Evidence**: These endpoints enable automated recursion while maintaining LEAD oversight (per LEAD agent responsibilities in Stage 17, EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:18 "Clear ownership (LEAD)").

### Monitoring Dashboard Requirements

**Dashboard: Recursion Health**
- **Metrics**:
  - Recursion trigger count (last 30 days)
  - Most common trigger type (GTM-001, GTM-002, etc.)
  - Average time to recursion completion
  - Recursion success rate (% of executions that improved metrics)

- **Alerts**:
  - >3 recursions for same venture in 30 days (potential systemic issue)
  - Recursion execution >7 days (investigate delays)
  - Recursion failure rate >20% (engine malfunction)

**Visualization**: Sankey diagram showing recursion flows (Stage 17 → Stage 5, Stage 17 → Stage 11, etc.)

## Testing Strategy

### Unit Tests (per trigger)
1. Test trigger condition detection (mock campaign performance data)
2. Validate threshold calculations (ensure correct metric formulas)
3. Test target stage selection logic (GTM-001 → Stage 5 vs Stage 15)

### Integration Tests (with SD-RECURSION-ENGINE-001)
1. Trigger recursion via API (test POST /api/recursion/trigger)
2. Verify recursion execution starts (check status endpoint)
3. Simulate target stage completion (mock revised strategy)
4. Validate Stage 17 re-execution with new strategy

### End-to-End Tests (full recursion cycle)
1. Deploy campaign with intentionally poor targeting (trigger GTM-002)
2. Wait for trigger condition (or fast-forward time in test environment)
3. Verify automated recursion to Stage 11
4. Validate new brand messaging generated
5. Verify Stage 17 re-deploys campaigns with new messaging
6. Measure lead generation improvement

**Evidence**: Testing strategy aligns with substage 17.3 requirement "Testing complete" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:778).

## Success Metrics for Recursion System

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Time to Detect Issue** | <24 hours | Trigger query execution frequency |
| **Time to Initiate Recursion** | <1 hour | API call latency |
| **Time to Complete Recursion** | <7 days | End-to-end cycle time |
| **Recursion Success Rate** | >80% | % of recursions that improve metrics by >20% |
| **False Positive Rate** | <10% | % of triggered recursions deemed unnecessary by LEAD |

**Evidence**: These targets address critique weakness "Process delays" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:63) by automating corrective actions.

## Rollback and Safety Mechanisms

### Recursion Limits
- **Max Recursions per Venture**: 5 per 90 days (prevent infinite loops)
- **Max Recursive Depth**: 2 levels (Stage 17 → Stage 5 → Stage 17 only)
- **Cooldown Period**: 14 days between recursions to same target stage

### Manual Override
- LEAD agent can:
  1. Pause automated recursion for specific venture
  2. Override trigger thresholds (adjust <50% to <40%, etc.)
  3. Force recursion to non-standard stage (e.g., Stage 11 when GTM-001 triggers)
  4. Cancel in-progress recursion

### Rollback Triggers
If recursion WORSENS metrics (e.g., campaign effectiveness drops further after Stage 15 recursion):
1. Automatically revert to previous GTM strategy (stored in `gtm_config_versions` table)
2. Pause automated recursion for this venture
3. Escalate to LEAD for manual intervention

**Evidence**: Addresses critique weakness "Unclear rollback procedures" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:24).

## Future Enhancements

1. **Predictive Recursion**: Trigger recursion BEFORE metrics fall below thresholds (ML model predicts failures)
2. **Multi-Stage Recursion**: Recurse to multiple stages simultaneously (Stage 11 + Stage 15 in parallel)
3. **Recursion Recommendations**: AI suggests optimal target stage based on historical data
4. **Cross-Venture Learning**: Apply successful recursion patterns from one venture to others

**Evidence**: These enhancements further automate Stage 17, exceeding the "80% automation" target (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:33).

---

**Implementation Priority**: CRITICAL (recursion is core to self-healing marketing system)
**Estimated Implementation Time**: 3-4 sprints (6-8 weeks)
**Cross-Reference**: SD-RECURSION-ENGINE-001, 09_metrics-monitoring.md (trigger thresholds)

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
