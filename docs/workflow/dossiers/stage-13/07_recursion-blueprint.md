# Recursion Blueprint: Stage 13 Exit-Oriented Design


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, unit, schema, validation

## Current Recursion Status

**Critique Assessment**: NO recursion section present in stage-13.md
**Lines Reviewed**: 1-72 (complete file)
**Recursion Indicators Found**: None

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:1-72 "No recursion section in critique"

**Interpretation**: Stage 13 (Exit-Oriented Design) is currently treated as a terminal strategic decision point with no explicit feedback loops to prior stages. However, this is a gap given Stage 13's high Risk Exposure (4/5) and strategic nature.

## Risk Context

**Risk Exposure Score**: 4/5 (Highest in workflow as of Stage 13)
**Risk Classification**: Critical decision point
**Rationale**: Exit strategy decisions have enterprise-wide impact, long-term consequences, and high uncertainty

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:10 "Risk Exposure | 4 | Critical decision point"

**Implication**: High-risk stage SHOULD have recursion mechanisms to iterate when exit assumptions invalidated.

## Proposed Recursion Mechanisms

### Trigger EXIT-001: Valuation Insufficient
**Condition**: Valuation potential below Chairman-defined threshold
**Direction**: Stage 13 → Stage 5 (Profitability Focused)
**Rationale**: Exit strategy not viable without improved unit economics

**Workflow**:
```
Stage 13: Exit-Oriented Design
  ↓
Substage 13.2: Value Driver Identification
  ↓
Calculate valuation_potential (Step 2.1)
  ↓
IF valuation_potential_max < $XM (threshold)
  THEN trigger EXIT-001
    ↓
    Stage 5: Profitability Focused
      ↓
    Optimize business model for:
      - Improved gross margins
      - Reduced customer acquisition cost
      - Increased lifetime value
    ↓
    Return to Stage 13 when profitability targets met
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:565-566 "metrics: Valuation potential"

**Implementation Note**: This is the FIRST proposed recursion to Stage 5 (Profitability) from a later stage. Indicates need for profitability optimization even late in venture lifecycle if exit strategy requires it.

**Recursion Type**: Corrective (fix fundamental business model issues)
**Frequency**: One-time per venture (unlikely to loop multiple times)
**Exit Condition**: valuation_potential_max ≥ threshold (from Stage 13 re-execution)

### Trigger EXIT-002: No Viable Exit Path
**Condition**: All exit options scored <2.5/5.0 in Substage 13.1 evaluation
**Direction**: Stage 13 → Stage 12 (Business Model Development)
**Rationale**: Fundamental business model issues preventing any exit path

**Workflow**:
```
Stage 13: Exit-Oriented Design
  ↓
Substage 13.1: Exit Strategy Definition
  ↓
Step 1.1: Evaluate Exit Options
  ↓
IF all_exit_options_scores < 2.5
  THEN trigger EXIT-002
    ↓
    Stage 12: Business Model Development
      ↓
    Pivot business model to:
      - Align with acquirable market segments
      - Improve strategic fit characteristics
      - Address structural exit barriers
    ↓
    Return to Stage 13 after business model pivot
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:577-582 "13.1 Exit Strategy Definition, done_when"

**Recursion Type**: Structural pivot (requires business model changes)
**Frequency**: Rare (indicates fundamental market/model mismatch)
**Exit Condition**: At least one exit option scored ≥3.5/5.0 (from Stage 13 re-execution)

### Trigger EXIT-003: Strategic Fit Too Low
**Condition**: Average strategic fit <2.5/5.0 across all potential acquirers
**Direction**: Stage 13 → Stage 6-7 (Market Validation)
**Rationale**: Market positioning not aligned with buyer landscape

**Workflow**:
```
Stage 13: Exit-Oriented Design
  ↓
Substage 13.3: Buyer Landscape
  ↓
Step 3.2: Assess Strategic Fit
  ↓
IF strategic_fit_avg < 2.5
  THEN trigger EXIT-003
    ↓
    Stage 6 & 7: Market Validation / Positioning
      ↓
    Reposition venture for:
      - Better alignment with acquirer needs
      - Improved strategic fit on key dimensions
      - Enhanced product/market fit for acquirers
    ↓
    Return to Stage 13 after repositioning validated
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:566-567 "metrics: Strategic fit"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:592-593 "done_when: Strategic fit assessed"

**Recursion Type**: Market repositioning (tactical adjustments)
**Frequency**: Occasional (market positioning misalignment)
**Exit Condition**: strategic_fit_avg ≥3.5/5.0 (from Stage 13 re-execution)

### Trigger EXIT-004: Timeline Infeasible
**Condition**: Exit timeline extends beyond stakeholder tolerance (e.g., >5 years)
**Direction**: Stage 13 → Stage 8-9 (Growth Optimization)
**Rationale**: Accelerate growth trajectory to shorten exit timeline

**Workflow**:
```
Stage 13: Exit-Oriented Design
  ↓
Substage 13.1: Exit Strategy Definition
  ↓
Step 1.3: Establish Timeline
  ↓
IF exit_timeline > stakeholder_max_timeline
  THEN trigger EXIT-004
    ↓
    Stage 8 & 9: Growth Optimization
      ↓
    Accelerate growth through:
      - Increased marketing investment
      - Sales team expansion
      - Product development acceleration
    ↓
    Return to Stage 13 when growth trajectory shortens timeline
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:574-575 "exit: Timeline set"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:581-582 "done_when: Timeline established"

**Recursion Type**: Growth acceleration (resource investment)
**Frequency**: Occasional (investor/founder timeline pressure)
**Exit Condition**: Projected exit timeline ≤ stakeholder_max_timeline

## Inbound Triggers (from prior stages to Stage 13)

### Trigger IN-001: Early Exit Opportunity
**Source**: External event (unsolicited acquisition offer during Stage 8-12)
**Condition**: Attractive acquisition offer received before planned Stage 13 entry
**Direction**: Stage 8-12 → Stage 13 (out-of-sequence)
**Rationale**: Opportunistic exit evaluation

**Workflow**:
```
Stage 8-12: Normal venture progression
  ↓
External acquirer makes unsolicited offer
  ↓
IF offer_value > threshold AND offer_serious
  THEN trigger IN-001 (interrupt current stage)
    ↓
    Stage 13: Exit-Oriented Design (emergency execution)
      ↓
    Fast-track substages:
      - 13.1: Evaluate offer vs. planned exit strategy
      - 13.2: Assess value drivers (offer price vs. intrinsic value)
      - 13.3: Compare acquirer to planned buyer landscape
    ↓
    Chairman decision: Accept offer OR Decline and return to prior stage
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:554-555 "depends_on: - 12" (normally sequential)

**Inbound Type**: Opportunistic (external trigger)
**Frequency**: Rare but high-impact
**Exit Condition**: Offer accepted (venture exit) OR Offer declined (return to prior stage)

### Trigger IN-002: Forced Exit Planning
**Source**: Stage 12 completion with investor pressure for exit timeline
**Condition**: Investors/board mandate exit planning even if not naturally triggered
**Direction**: Stage 12 → Stage 13 (standard sequence but forced)
**Rationale**: Stakeholder requirement for exit visibility

**Workflow**:
```
Stage 12: Business Model Development
  ↓
Board/investor review identifies:
  - Venture maturity suitable for exit planning
  - Stakeholder desire for liquidity event
  - Market conditions favorable for exit
  ↓
Trigger IN-002 (natural progression but stakeholder-driven)
  ↓
Stage 13: Exit-Oriented Design (full execution)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:18 "Clear ownership (Chairman)" (strategic decisions)

**Inbound Type**: Stakeholder-driven (standard progression)
**Frequency**: Common (most ventures reach Stage 13 naturally)
**Exit Condition**: Stage 13 exit gates satisfied

## Outbound Triggers (from Stage 13 to subsequent stages)

### Trigger OUT-001: Exit Strategy Approved
**Target**: Stage 14 (next sequential stage)
**Condition**: All Stage 13 exit gates passed
**Direction**: Stage 13 → Stage 14
**Rationale**: Normal progression after exit strategy established

**Workflow**:
```
Stage 13: Exit-Oriented Design
  ↓
All substages complete (13.1, 13.2, 13.3)
  ↓
Exit gates validated:
  - Exit strategy approved (Chairman sign-off)
  - Value drivers identified
  - Timeline set
  ↓
Trigger OUT-001
  ↓
Stage 14: [Next stage in sequence - not yet defined in stages.yaml review]
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:572-575 "exit: Exit strategy approved, Value drivers"

**Outbound Type**: Sequential progression (standard)
**Frequency**: Always (if Stage 13 successful)
**Exit Condition**: N/A (one-way progression)

### Trigger OUT-002: Exit Execution Initiated
**Target**: External exit process (M&A or IPO execution)
**Condition**: Exit timeline triggers immediate execution phase
**Direction**: Stage 13 → Exit Execution Workstream (parallel to Stage 14+)
**Rationale**: Begin exit process while continuing venture operations

**Workflow**:
```
Stage 13: Exit-Oriented Design
  ↓
Substage 13.3 identifies immediate exit opportunity
  ↓
Chairman decision: Initiate exit process in parallel with Stage 14+
  ↓
Trigger OUT-002 (parallel workstream)
  ↓
Exit Execution Workstream:
  - Engage investment banker / M&A advisor
  - Prepare confidential information memorandum (CIM)
  - Begin buyer outreach (from 13.3 shortlist)
  - Negotiate LOI / term sheet
WHILE Stage 14+ continues normal operations
```

**Outbound Type**: Parallel workstream (non-blocking)
**Frequency**: Occasional (when exit timeline short, e.g., <6 months)
**Exit Condition**: Exit closed (venture acquired/IPO) OR Exit process aborted (return to Stage 14+)

## Recursion Loop Prevention

### Maximum Iteration Limits
- **EXIT-001 (to Stage 5)**: Max 2 iterations (prevent infinite profitability optimization)
- **EXIT-002 (to Stage 12)**: Max 1 iteration (prevent excessive pivoting)
- **EXIT-003 (to Stage 6-7)**: Max 2 iterations (allow repositioning + validation)
- **EXIT-004 (to Stage 8-9)**: Max 1 iteration (growth acceleration is one-time investment decision)

**Rationale**: Stage 13 high risk (4/5) + Chairman ownership requires escape hatches to prevent analysis paralysis.

### Loop Detection
```python
# Pseudocode for recursion loop tracking
stage_13_execution_history = get_execution_history(venture_id=venture.id, stage_id=13)

if stage_13_execution_history.count() > 3:
    alert_chairman(
        "Stage 13 executed 3+ times for this venture",
        "Potential recursion loop detected",
        "Recommend escalation to board for strategic pivot decision"
    )
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:10 "Risk Exposure | 4 | Critical decision point"

## Recursion Cost-Benefit Analysis

### EXIT-001: Stage 13 → Stage 5 (Profitability)
- **Cost**: 3-6 months to optimize profitability (Stage 5 re-execution)
- **Benefit**: Improved valuation potential (+$2-5M estimated enterprise value)
- **Risk**: Market conditions change during optimization (delay risk)
- **ROI**: High (valuation uplift justifies profitability work)

### EXIT-002: Stage 13 → Stage 12 (Business Model)
- **Cost**: 2-4 months for business model pivot (Stage 12 re-execution)
- **Benefit**: Unlock previously unviable exit path (e.g., make acquisition possible)
- **Risk**: Pivot failure (business model changes may not address exit issues)
- **ROI**: Medium (high-risk, high-reward pivot)

### EXIT-003: Stage 13 → Stage 6-7 (Market Validation)
- **Cost**: 1-3 months for repositioning (Stage 6-7 re-execution)
- **Benefit**: Improved strategic fit with acquirers (3.5+ avg score)
- **Risk**: Repositioning confuses existing customers (brand risk)
- **ROI**: Medium (tactical fix for strategic fit issues)

### EXIT-004: Stage 13 → Stage 8-9 (Growth)
- **Cost**: 6-12 months for accelerated growth (Stage 8-9 re-execution)
- **Benefit**: Shortened exit timeline (e.g., 5 years → 3 years)
- **Risk**: Growth investment may not accelerate timeline as expected
- **ROI**: Variable (depends on growth effectiveness and stakeholder patience)

## Recursion Governance

### Chairman Approval Required For:
- All recursion triggers (EXIT-001 through EXIT-004)
- Loop iteration beyond max limits (requires board escalation)
- Parallel exit execution initiation (OUT-002)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:18 "Clear ownership (Chairman)"

### Automatic Triggers (no approval needed):
- Inbound IN-001 (early exit opportunity) - automatic Stage 13 fast-track
- Outbound OUT-001 (exit strategy approved) - automatic Stage 14 progression

### Monitoring Requirements:
- Track recursion frequency per venture (alert if >3 Stage 13 executions)
- Monitor recursion ROI (did valuation improve after EXIT-001?)
- Report recursion patterns to Chairman quarterly (trend analysis)

## Integration with Rollback Procedures

**Cross-Reference**: See 05_professional-sop.md Rollback Procedures section

**Alignment**:
- EXIT-001 trigger = Rollback Trigger 1 (Valuation Potential Below Threshold)
- EXIT-002 trigger = Rollback Trigger 2 (No Viable Exit Path)
- EXIT-003 trigger = Rollback Trigger 3 (Strategic Fit Score Too Low)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:47-50 "Current: No rollback defined, Required: Clear"

**Proposed Enhancement**: Unify recursion triggers and rollback procedures into single decision tree.

## Recursion Gap Analysis

### Current State: NO RECURSION DEFINED
**Gap Severity**: HIGH (given Risk Exposure 4/5)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:1-72 "No recursion section"

**Impact**:
- Stage 13 failures have no recovery path (venture exits with suboptimal strategy)
- High-risk decisions lack iterative refinement opportunity
- Chairman forced into binary approve/reject decision (no "return and optimize" option)

### Proposed State: 4 RECURSION TRIGGERS + 2 INBOUND/OUTBOUND
**Gap Closure**: Provides feedback loops for iterative exit strategy optimization

**Implementation Priority**:
1. **High**: EXIT-001 (to Stage 5) - most common recursion need (valuation issues)
2. **High**: IN-001 (early exit opportunity) - opportunistic high-value trigger
3. **Medium**: EXIT-002 (to Stage 12) - less common but critical for pivot scenarios
4. **Medium**: EXIT-003 (to Stage 6-7) - tactical fix for strategic fit issues
5. **Low**: EXIT-004 (to Stage 8-9) - rare scenario (timeline pressure)

## Recursion Documentation Requirements

### For Each Recursion Instance:
1. **Trigger Documentation**: Record which trigger fired (EXIT-001 through EXIT-004)
2. **Condition Documentation**: Record specific metric values that triggered recursion
3. **Cost Documentation**: Track time/resources spent in recursion loop
4. **Outcome Documentation**: Record whether recursion resolved issue (ROI analysis)
5. **Learning Documentation**: Capture lessons for future Stage 13 executions

### Database Schema Addition (proposed):
```sql
CREATE TABLE stage_13_recursions (
    id UUID PRIMARY KEY,
    stage_13_execution_id UUID REFERENCES stage_13_executions(id),
    trigger_type TEXT CHECK (trigger_type IN ('EXIT-001', 'EXIT-002', 'EXIT-003', 'EXIT-004', 'IN-001', 'OUT-002')),
    triggered_at TIMESTAMP,
    target_stage_id INTEGER,  -- Which stage to recurse to (5, 6, 7, 8, 9, 12, 14)
    trigger_condition JSONB,  -- {metric: 'valuation_potential_max', value: 8000000, threshold: 10000000}
    resolution_status TEXT CHECK (resolution_status IN ('in_progress', 'resolved', 'abandoned')),
    resolved_at TIMESTAMP,
    cost_weeks INTEGER,  -- Time spent in recursion loop
    outcome_improved BOOLEAN,  -- Did recursion improve exit strategy?
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

**Recursion Blueprint Version**: 1.0 (Proposed - not yet implemented)
**Critical Finding**: Stage 13 has NO recursion in current critique despite being highest-risk stage (4/5)
**Recommendation**: Implement EXIT-001 (to Stage 5) as minimum viable recursion mechanism

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
