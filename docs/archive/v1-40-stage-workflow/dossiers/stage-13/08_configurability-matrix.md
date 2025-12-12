# Configurability Matrix: Stage 13 Exit-Oriented Design

## Overview
This document defines all tunable parameters for Stage 13 execution, enabling customization based on venture characteristics, market conditions, and stakeholder preferences.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:551-596 "id: 13, title: Exit-Oriented Design"

## Configuration Categories

### 1. Metric Thresholds

#### 1.1 Exit Readiness Score
**Parameter**: `exit_readiness_threshold`
**Type**: Numeric (0-100 scale)
**Default**: 80 (proposed)
**Range**: 60-95
**Impact**: Gate 2 validation (value drivers identified)

**Configuration Guidance**:
- **Conservative (85-95)**: Use for high-stakes exits (large enterprise value, complex M&A)
- **Moderate (75-85)**: Use for standard acquisition exits
- **Aggressive (60-75)**: Use for opportunistic exits (unsolicited offers, time-sensitive)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:564-565 "metrics: Exit readiness score"
**Gap Noted**: Threshold undefined in stages.yaml (critique:38-39)

**Tuning Impact**:
- **Higher threshold** (90+): More preparation required, longer Stage 13 duration, higher exit success probability
- **Lower threshold** (65-70): Faster exit timeline, higher execution risk, potential value loss

#### 1.2 Valuation Potential Minimum
**Parameter**: `valuation_potential_min`
**Type**: Numeric (USD)
**Default**: Venture-specific (Chairman-defined)
**Range**: $1M - $100M+ (depends on venture stage, industry)
**Impact**: Rollback trigger EXIT-001 (to Stage 5 if below threshold)

**Configuration Guidance**:
- **Early-stage venture**: $5-10M minimum
- **Growth-stage venture**: $20-50M minimum
- **Late-stage venture**: $50-100M+ minimum

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:565-566 "metrics: Valuation potential"
**Gap Noted**: Threshold undefined in stages.yaml (critique:38-39)

**Tuning Impact**:
- **Higher threshold** ($50M+): Fewer viable exit paths, may trigger EXIT-001 recursion to Stage 5
- **Lower threshold** ($5-10M): More exit options available, faster Stage 13 completion

#### 1.3 Strategic Fit Average
**Parameter**: `strategic_fit_avg_threshold`
**Type**: Numeric (0-5.0 scale)
**Default**: 3.5 (proposed)
**Range**: 2.5-4.5
**Impact**: Rollback trigger EXIT-003 (to Stage 6-7 if below threshold)

**Configuration Guidance**:
- **High fit required (4.0-4.5)**: Strategic buyer focus, deep synergies needed
- **Moderate fit (3.0-3.5)**: Balanced strategic/financial buyer mix
- **Low fit acceptable (2.5-3.0)**: Financial buyer focus, synergies less critical

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:566-567 "metrics: Strategic fit"
**Gap Noted**: Threshold undefined in stages.yaml (critique:38-39)

**Tuning Impact**:
- **Higher threshold** (4.0+): Smaller buyer shortlist, potential EXIT-003 recursion to Stage 6-7
- **Lower threshold** (2.5-3.0): Larger buyer shortlist, faster Substage 13.3 completion

### 2. Timeline Parameters

#### 2.1 Target Exit Horizon
**Parameter**: `exit_timeline_years`
**Type**: Numeric (years)
**Default**: 2-3 years (typical)
**Range**: 0.5-5 years
**Impact**: Substage 13.1 Step 1.3 (timeline establishment), EXIT-004 recursion trigger

**Configuration Guidance**:
- **Immediate exit (0.5-1 year)**: Opportunistic acquisition, market conditions urgent
- **Short-term exit (1-2 years)**: Standard acquisition timeline, IPO market favorable
- **Medium-term exit (2-3 years)**: Growth optimization needed, IPO preparation
- **Long-term exit (3-5 years)**: Strategic positioning required, market development

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:581-582 "done_when: Timeline established"

**Tuning Impact**:
- **Shorter timeline** (<1 year): Triggers OUT-002 (parallel exit execution), higher urgency, less optimization time
- **Longer timeline** (4-5 years): More time for value driver optimization, risk of market condition changes

#### 2.2 Maximum Timeline Tolerance
**Parameter**: `stakeholder_max_timeline_years`
**Type**: Numeric (years)
**Default**: 5 years (proposed)
**Range**: 2-10 years
**Impact**: EXIT-004 recursion trigger (to Stage 8-9 if exit_timeline > this value)

**Configuration Guidance**:
- **Investor-driven**: Use investor fund lifecycle (e.g., 3-5 years from investment)
- **Founder-driven**: Use founder liquidity needs (e.g., 5-10 years)
- **Market-driven**: Use market cycle timing (e.g., 2-3 years if IPO window open)

**Tuning Impact**:
- **Shorter tolerance** (2-3 years): May trigger EXIT-004 to accelerate growth
- **Longer tolerance** (8-10 years): More flexibility, less pressure on growth optimization

#### 2.3 Substage Duration Targets
**Parameter**: `substage_duration_weeks`
**Type**: Object {13.1: X, 13.2: Y, 13.3: Z}
**Default**: {13.1: 4, 13.2: 7, 13.3: 5} (total 16 weeks / 4 months)
**Range**: 13.1: 2-6 weeks, 13.2: 4-10 weeks, 13.3: 3-7 weeks
**Impact**: Stage 13 total duration, Chairman time allocation

**Configuration Guidance**:
- **Fast-track**: {13.1: 2, 13.2: 4, 13.3: 3} = 9 weeks (for opportunistic exits)
- **Standard**: {13.1: 4, 13.2: 7, 13.3: 5} = 16 weeks (default)
- **Comprehensive**: {13.1: 6, 13.2: 10, 13.3: 7} = 23 weeks (for complex IPO prep)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:576-594 "substages: 13.1, 13.2, 13.3"

**Tuning Impact**:
- **Shorter durations**: Less thorough analysis, higher execution risk, faster exit decision
- **Longer durations**: More comprehensive evaluation, better exit outcomes, higher Chairman time investment

### 3. Strategic Fit Criteria Weightings

#### 3.1 Product Complementarity Weight
**Parameter**: `strategic_fit_product_weight`
**Type**: Numeric (0-1.0, sum of all weights = 1.0)
**Default**: 0.30 (30%)
**Range**: 0.15-0.45
**Impact**: Substage 13.3 Step 3.2 (strategic fit scoring)

**Configuration Guidance**:
- **Product-centric exit** (0.40-0.45): SaaS, platform companies (acquirer wants technology/IP)
- **Balanced exit** (0.25-0.30): Mixed buyer motivations
- **Market-centric exit** (0.15-0.20): Acquirer wants customer base, not product

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-13/05_professional-sop.md "Product/service complementarity (30% weight)"

**Tuning Impact**:
- **Higher weight** (0.40+): Acquirers with complementary products score higher
- **Lower weight** (0.15-0.20): Product fit less important, customer/market fit prioritized

#### 3.2 Customer Base Overlap Weight
**Parameter**: `strategic_fit_customer_weight`
**Type**: Numeric (0-1.0)
**Default**: 0.20 (20%)
**Range**: 0.10-0.35
**Impact**: Substage 13.3 Step 3.2 (strategic fit scoring)

**Configuration Guidance**:
- **Customer acquisition focus** (0.30-0.35): Acquirer wants access to new customer segments
- **Balanced** (0.15-0.20): Standard weight
- **Customer not critical** (0.10-0.15): Product/tech more important than customer base

**Tuning Impact**:
- **Higher weight** (0.30+): Acquirers with complementary customer bases score higher
- **Lower weight** (0.10-0.15): Customer overlap less important in fit assessment

#### 3.3 Geographic Expansion Weight
**Parameter**: `strategic_fit_geographic_weight`
**Type**: Numeric (0-1.0)
**Default**: 0.15 (15%)
**Range**: 0.05-0.30
**Impact**: Substage 13.3 Step 3.2 (strategic fit scoring)

**Configuration Guidance**:
- **Geographic expansion driver** (0.25-0.30): International venture, acquirer wants new markets
- **Balanced** (0.10-0.15): Standard weight
- **Geography not factor** (0.05): Single-market venture, geographic fit irrelevant

**Tuning Impact**:
- **Higher weight** (0.25+): Acquirers seeking geographic expansion score higher
- **Lower weight** (0.05-0.10): Geographic fit minimal impact on strategic fit score

#### 3.4 Technology/IP Synergy Weight
**Parameter**: `strategic_fit_technology_weight`
**Type**: Numeric (0-1.0)
**Default**: 0.20 (20%)
**Range**: 0.10-0.40
**Impact**: Substage 13.3 Step 3.2 (strategic fit scoring)

**Configuration Guidance**:
- **IP-driven exit** (0.35-0.40): Deep tech, patent-heavy venture
- **Balanced** (0.15-0.20): Standard weight
- **IP not differentiator** (0.10): Commodity business, tech not key asset

**Tuning Impact**:
- **Higher weight** (0.35+): Acquirers with tech/IP synergies score much higher
- **Lower weight** (0.10-0.15): Technology synergies less important in fit assessment

#### 3.5 Cultural Alignment Weight
**Parameter**: `strategic_fit_culture_weight`
**Type**: Numeric (0-1.0)
**Default**: 0.15 (15%)
**Range**: 0.05-0.25
**Impact**: Substage 13.3 Step 3.2 (strategic fit scoring)

**Configuration Guidance**:
- **Culture-critical exit** (0.20-0.25): Mission-driven venture, culture preservation key
- **Balanced** (0.10-0.15): Standard weight
- **Culture not priority** (0.05-0.10): Financial exit, culture fit less important

**Tuning Impact**:
- **Higher weight** (0.20+): Cultural mismatch significantly lowers strategic fit score
- **Lower weight** (0.05-0.10): Cultural alignment minimal impact on scoring

**Constraint**: Sum of all 5 weights must equal 1.0

### 4. Buyer Landscape Parameters

#### 4.1 Buyer Longlist Size
**Parameter**: `buyer_longlist_size`
**Type**: Integer
**Default**: 25
**Range**: 15-40
**Impact**: Substage 13.3 Step 3.1 (list potential acquirers)

**Configuration Guidance**:
- **Niche market** (15-20): Limited acquirer universe, focus on quality
- **Standard market** (20-30): Balanced breadth and depth
- **Broad market** (30-40): Many potential acquirers, cast wide net

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-13/05_professional-sop.md "Create long list (20-30 potential acquirers)"

**Tuning Impact**:
- **Larger longlist** (35-40): More research time required, better coverage, potential noise
- **Smaller longlist** (15-20): Faster research, risk of missing key acquirers

#### 4.2 Buyer Shortlist Size
**Parameter**: `buyer_shortlist_size`
**Type**: Integer
**Default**: 8
**Range**: 5-12
**Impact**: Substage 13.3 Step 3.2 output (shortlist creation)

**Configuration Guidance**:
- **Focused approach** (5-7): Target only highest-fit acquirers
- **Balanced approach** (7-10): Standard shortlist size
- **Broad approach** (10-12): Maximize optionality, more relationship cultivation

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-13/05_professional-sop.md "Create shortlist (top 5-10 acquirers with score ≥3.5)"

**Tuning Impact**:
- **Larger shortlist** (10-12): More relationship management, broader coverage, diluted focus
- **Smaller shortlist** (5-7): Concentrated relationship building, risk of limited options

#### 4.3 Shortlist Minimum Score
**Parameter**: `shortlist_min_strategic_fit`
**Type**: Numeric (0-5.0 scale)
**Default**: 3.5
**Range**: 2.5-4.5
**Impact**: Substage 13.3 Step 3.2 (shortlist qualification threshold)

**Configuration Guidance**:
- **High bar** (4.0-4.5): Only excellent-fit acquirers on shortlist
- **Moderate bar** (3.0-3.5): Good-fit acquirers qualify
- **Low bar** (2.5-3.0): Acceptable-fit acquirers included (use if longlist has limited high-scorers)

**Tuning Impact**:
- **Higher threshold** (4.0+): Smaller shortlist, higher quality, may have <5 acquirers
- **Lower threshold** (2.5-3.0): Larger shortlist, lower average fit, more options

### 5. Automation Configuration

#### 5.1 Automation Level Target
**Parameter**: `automation_target_percentage`
**Type**: Numeric (0-100)
**Default**: 80 (per critique recommendation)
**Range**: 20-90
**Impact**: Stage 13 execution efficiency, Chairman time investment

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:32-34 "Target State: 80% automation"

**Configuration Guidance**:
- **Manual-heavy** (20-40): Early implementation, low automation tooling
- **Semi-automated** (50-70): Partial automation, human oversight required
- **Highly automated** (75-90): Advanced automation, Chairman only for strategic decisions

**Tuning Impact**:
- **Higher automation** (80-90): Faster execution, less Chairman time, requires automation tooling investment
- **Lower automation** (20-40): More manual work, longer Stage 13 duration, higher labor cost

#### 5.2 Tool Integration Flags
**Parameter**: `tool_integrations_enabled`
**Type**: Object {market_data: bool, crm: bool, valuation_model: bool, approval_workflow: bool}
**Default**: {market_data: false, crm: false, valuation_model: false, approval_workflow: false}
**Range**: Boolean flags (true/false)
**Impact**: Automation level achieved, external dependency on tools

**Configuration Guidance**:
- **Fully integrated**: All flags true (requires PitchBook/CB Insights, Salesforce, valuation tool, DocuSign)
- **Partially integrated**: Some flags true (e.g., CRM + approval workflow)
- **Manual**: All flags false (spreadsheet-based execution)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:25 "Missing specific tool integrations"

**Tuning Impact**:
- **More integrations enabled**: Higher automation level (toward 80% target), tool subscription costs
- **Fewer integrations enabled**: Lower automation level (20-40%), manual process overhead

### 6. Recursion Configuration

#### 6.1 Recursion Enabled Flags
**Parameter**: `recursion_triggers_enabled`
**Type**: Object {EXIT_001: bool, EXIT_002: bool, EXIT_003: bool, EXIT_004: bool}
**Default**: {EXIT_001: true, EXIT_002: true, EXIT_003: false, EXIT_004: false}
**Range**: Boolean flags (true/false)
**Impact**: Rollback behavior when exit strategy issues detected

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-13/07_recursion-blueprint.md "Proposed Recursion Mechanisms: EXIT-001 through EXIT-004"

**Configuration Guidance**:
- **All recursions enabled**: Maximum flexibility, iterative optimization (all true)
- **Critical recursions only**: Enable EXIT-001 (valuation), EXIT-002 (no exit path), disable others
- **No recursions**: All false (force proceed to Stage 14 regardless of issues - NOT RECOMMENDED)

**Tuning Impact**:
- **More recursions enabled**: More rollback opportunities, longer overall timeline, higher Stage 13 re-execution rate
- **Fewer recursions enabled**: Faster progression, risk of suboptimal exit strategy

#### 6.2 Maximum Recursion Iterations
**Parameter**: `max_recursion_iterations`
**Type**: Object {EXIT_001: int, EXIT_002: int, EXIT_003: int, EXIT_004: int}
**Default**: {EXIT_001: 2, EXIT_002: 1, EXIT_003: 2, EXIT_004: 1}
**Range**: 0-3 per trigger
**Impact**: Prevention of infinite loops, escalation to Chairman/board

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-13/07_recursion-blueprint.md "Maximum Iteration Limits"

**Tuning Impact**:
- **Higher limits** (2-3): More optimization opportunities, risk of analysis paralysis
- **Lower limits** (0-1): Faster resolution, risk of premature exit with suboptimal strategy

### 7. Stakeholder Configuration

#### 7.1 Chairman Approval Required For
**Parameter**: `chairman_approval_steps`
**Type**: Array of step IDs
**Default**: ['13.1.2', '13.exit_gate_1', 'recursion_triggers']
**Range**: Any combination of substage steps
**Impact**: Stage 13 duration (Chairman availability dependency), decision quality

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:18 "Clear ownership (Chairman)"

**Configuration Guidance**:
- **Minimal approval** (exit gate only): ['13.exit_gate_1'] - fastest, highest delegation
- **Standard approval** (key decisions): ['13.1.2', '13.exit_gate_1', 'recursion_triggers'] - balanced
- **Comprehensive approval** (all substages): ['13.1.1', '13.1.2', '13.1.3', '13.2.1', '13.2.2', '13.2.3', '13.3.1', '13.3.2', '13.3.3', '13.exit_gate_1'] - slowest, highest Chairman involvement

**Tuning Impact**:
- **More approval steps**: Higher decision quality, longer Stage 13 duration, more Chairman time
- **Fewer approval steps**: Faster execution, more CFO/COO delegation, Chairman only for final approval

#### 7.2 External Advisor Engagement
**Parameter**: `external_advisors_required`
**Type**: Object {investment_banker: bool, ma_attorney: bool, valuation_firm: bool}
**Default**: {investment_banker: false, ma_attorney: false, valuation_firm: false}
**Range**: Boolean flags (true/false)
**Impact**: Stage 13 cost (advisor fees), execution quality, market intelligence

**Configuration Guidance**:
- **No advisors**: All false (in-house execution, lower cost, limited market intelligence)
- **Investment banker only**: {investment_banker: true, others false} (market intelligence, buyer introductions)
- **Full advisory team**: All true (comprehensive support, highest cost, best execution)

**Tuning Impact**:
- **More advisors**: Higher cost ($50K-$500K+ fees), better market intelligence, professional execution
- **Fewer advisors**: Lower cost, in-house execution, risk of suboptimal exit outcomes

### 8. Metrics Collection Configuration

#### 8.1 Measurement Frequency
**Parameter**: `metrics_review_frequency_months`
**Type**: Integer
**Default**: 3 (quarterly)
**Range**: 1-12
**Impact**: Stage 13 monitoring cadence, early detection of exit strategy issues

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:38-39 "Missing: Threshold values, measurement frequency"

**Configuration Guidance**:
- **Frequent monitoring** (1-2 months): Active exit process (OUT-002 triggered), market conditions volatile
- **Standard monitoring** (3 months): Typical quarterly review
- **Infrequent monitoring** (6-12 months): Long exit timeline (4-5 years), stable market conditions

**Tuning Impact**:
- **Higher frequency** (1-2 months): More monitoring overhead, faster issue detection, more Chairman time
- **Lower frequency** (6-12 months): Less monitoring overhead, delayed issue detection, risk of missing market opportunities

#### 8.2 Metrics Dashboard Enabled
**Parameter**: `metrics_dashboard_enabled`
**Type**: Boolean
**Default**: true
**Range**: true/false
**Impact**: Visibility into exit readiness, valuation potential, strategic fit trends

**Tuning Impact**:
- **Enabled**: Real-time visibility, proactive issue detection, requires dashboard tool
- **Disabled**: Manual reporting only, reactive issue detection, lower tool cost

## Configuration Profiles (Pre-Defined Templates)

### Profile 1: Fast-Track Opportunistic Exit
```yaml
exit_readiness_threshold: 70
valuation_potential_min: 5000000  # $5M
strategic_fit_avg_threshold: 3.0
exit_timeline_years: 0.5
substage_duration_weeks: {13.1: 2, 13.2: 4, 13.3: 3}
buyer_longlist_size: 15
buyer_shortlist_size: 5
automation_target_percentage: 60
recursion_triggers_enabled: {EXIT_001: false, EXIT_002: false, EXIT_003: false, EXIT_004: false}
chairman_approval_steps: ['13.exit_gate_1']
external_advisors_required: {investment_banker: true, ma_attorney: false, valuation_firm: false}
```

**Use Case**: Unsolicited acquisition offer, need quick evaluation and response

### Profile 2: Standard Strategic Exit
```yaml
exit_readiness_threshold: 80
valuation_potential_min: 20000000  # $20M
strategic_fit_avg_threshold: 3.5
exit_timeline_years: 2.5
substage_duration_weeks: {13.1: 4, 13.2: 7, 13.3: 5}
buyer_longlist_size: 25
buyer_shortlist_size: 8
automation_target_percentage: 80
recursion_triggers_enabled: {EXIT_001: true, EXIT_002: true, EXIT_003: false, EXIT_004: false}
chairman_approval_steps: ['13.1.2', '13.exit_gate_1', 'recursion_triggers']
external_advisors_required: {investment_banker: false, ma_attorney: true, valuation_firm: false}
```

**Use Case**: Planned acquisition exit, moderate timeline, standard market conditions

### Profile 3: Comprehensive IPO Preparation
```yaml
exit_readiness_threshold: 90
valuation_potential_min: 100000000  # $100M
strategic_fit_avg_threshold: 4.0
exit_timeline_years: 3.0
substage_duration_weeks: {13.1: 6, 13.2: 10, 13.3: 7}
buyer_longlist_size: 40
buyer_shortlist_size: 12
automation_target_percentage: 90
recursion_triggers_enabled: {EXIT_001: true, EXIT_002: true, EXIT_003: true, EXIT_004: true}
chairman_approval_steps: ['13.1.1', '13.1.2', '13.1.3', '13.2.2', '13.3.2', '13.exit_gate_1', 'recursion_triggers']
external_advisors_required: {investment_banker: true, ma_attorney: true, valuation_firm: true}
```

**Use Case**: IPO exit path, large enterprise value, comprehensive preparation required

## Configuration Storage

**Database Schema** (proposed extension to `stage_13_executions`):
```sql
ALTER TABLE stage_13_executions ADD COLUMN configuration JSONB;

-- Example configuration storage
UPDATE stage_13_executions
SET configuration = '{
  "profile": "standard_strategic_exit",
  "exit_readiness_threshold": 80,
  "valuation_potential_min": 20000000,
  "strategic_fit_avg_threshold": 3.5,
  "exit_timeline_years": 2.5,
  ...
}'::jsonb
WHERE id = '...';
```

## Configuration Validation Rules

1. **Threshold Consistency**: `exit_readiness_threshold` must align with `automation_target_percentage` (higher automation → can achieve higher readiness)
2. **Timeline Feasibility**: `exit_timeline_years` must be ≥ sum of `substage_duration_weeks` / 52
3. **Weight Sum Constraint**: Sum of all `strategic_fit_*_weight` parameters must equal 1.0
4. **Shortlist Size Logic**: `buyer_shortlist_size` must be ≤ `buyer_longlist_size` * 0.5
5. **Recursion Logic**: If `recursion_triggers_enabled.EXIT_001 = false`, then `max_recursion_iterations.EXIT_001` must = 0

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
