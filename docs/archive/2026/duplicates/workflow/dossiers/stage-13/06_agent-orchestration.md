<!-- ARCHIVED: 2026-01-26T16:26:45.716Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-13\06_agent-orchestration.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Agent Orchestration: Stage 13 Exit-Oriented Design


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, testing, e2e, unit

## CrewAI Mapping

### Crew Definition
```python
# Stage 13: Exit-Oriented Design Crew
# Owner: Chairman (Strategic Decision Authority)

from crewai import Agent, Task, Crew, Process

# Agent Definitions
exit_strategist_agent = Agent(
    role="Exit Strategy Advisor",
    goal="Evaluate exit options and recommend optimal exit path",
    backstory="Expert in M&A, IPO, and corporate exit strategies with 20+ years experience",
    tools=[
        "market_data_tool",  # Fetch M&A comps, valuation multiples
        "valuation_model_tool",  # DCF, comparable company analysis
        "exit_options_evaluator"  # Score exit paths
    ],
    verbose=True,
    allow_delegation=False
)

valuation_specialist_agent = Agent(
    role="Valuation Specialist",
    goal="Identify and quantify value drivers for exit optimization",
    backstory="Financial analyst specializing in enterprise valuation and growth metrics",
    tools=[
        "metrics_calculator_tool",  # Calculate ARR, EBITDA, growth rates
        "industry_benchmarks_tool",  # Fetch industry-specific multiples
        "ip_valuation_tool"  # Assess IP portfolio value
    ],
    verbose=True,
    allow_delegation=False
)

buyer_intelligence_agent = Agent(
    role="Buyer Intelligence Analyst",
    goal="Map potential acquirer landscape and assess strategic fit",
    backstory="Corporate development expert with deep M&A market knowledge",
    tools=[
        "buyer_database_tool",  # M&A buyer universe database
        "crm_integration_tool",  # Track buyer relationships
        "strategic_fit_scorer"  # Calculate fit scores
    ],
    verbose=True,
    allow_delegation=False
)

chairman_oversight_agent = Agent(
    role="Chairman Strategic Reviewer",
    goal="Approve exit strategy and ensure alignment with enterprise vision",
    backstory="C-level executive with final decision authority on exit strategy",
    tools=[
        "approval_workflow_tool",  # Gate 1 approval process
        "risk_assessment_tool",  # Evaluate strategic risks
        "stakeholder_alignment_tool"  # Validate with board/investors
    ],
    verbose=True,
    allow_delegation=True  # Can delegate to CFO/COO for analysis
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:551-553 "id: 13, title: Exit-Oriented Design"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:18 "Clear ownership (Chairman)"

### Task Definitions

```python
# Substage 13.1: Exit Strategy Definition
task_13_1_exit_options = Task(
    description="""
    Evaluate all viable exit options for the venture:
    1. Research exit categories (IPO, acquisition, merger, MBO)
    2. Score each option on timeline, valuation, complexity, market conditions
    3. Create evaluation matrix

    Inputs: {business_model}, {market_analysis}, {industry_trends}
    Outputs: Exit options evaluation matrix
    """,
    agent=exit_strategist_agent,
    expected_output="Structured evaluation matrix with 4-5 exit options scored"
)

task_13_1_select_path = Task(
    description="""
    Chairman decision on optimal exit strategy:
    1. Review evaluation matrix from prior task
    2. Conduct executive team workshop
    3. Select preferred exit path with documented rationale

    Inputs: {exit_options_matrix}
    Outputs: Exit strategy selection memo
    """,
    agent=chairman_oversight_agent,
    expected_output="Exit strategy selection memo with Chairman approval",
    context=[task_13_1_exit_options]  # Depends on prior task
)

task_13_1_establish_timeline = Task(
    description="""
    Define exit horizon and key milestones:
    1. Set target exit date (quarters/years)
    2. Backmap critical milestones (valuation targets, buyer engagement, IPO readiness)
    3. Create exit timeline Gantt chart

    Inputs: {selected_exit_path}
    Outputs: Exit timeline Gantt chart
    """,
    agent=exit_strategist_agent,
    expected_output="Exit timeline with quarterly milestones",
    context=[task_13_1_select_path]
)

# Substage 13.2: Value Driver Identification
task_13_2_define_metrics = Task(
    description="""
    Identify metrics that drive enterprise valuation:
    1. Research industry-specific valuation multiples
    2. Select top 5-7 metrics for venture
    3. Define current baseline and target values

    Inputs: {business_model}, {market_analysis}
    Outputs: Value driver metrics framework
    """,
    agent=valuation_specialist_agent,
    expected_output="Metrics framework with 5-7 KPIs and target values"
)

task_13_2_growth_levers = Task(
    description="""
    Determine optimization opportunities to maximize valuation:
    1. Analyze each key metric for improvement opportunities
    2. Estimate valuation impact of each optimization
    3. Prioritize growth levers by ROI

    Inputs: {value_driver_metrics}
    Outputs: Growth lever optimization roadmap
    """,
    agent=valuation_specialist_agent,
    expected_output="Prioritized roadmap with valuation impact estimates",
    context=[task_13_2_define_metrics]
)

task_13_2_ip_strategy = Task(
    description="""
    Establish intellectual property protection plan:
    1. Inventory all IP assets (patents, trademarks, trade secrets)
    2. Assess IP protection gaps
    3. Value IP portfolio contribution to enterprise value

    Inputs: {business_model}, {product_roadmap}
    Outputs: IP protection strategy document
    """,
    agent=valuation_specialist_agent,
    expected_output="IP strategy with protection gaps and valuation estimate"
)

# Substage 13.3: Buyer Landscape
task_13_3_list_acquirers = Task(
    description="""
    Identify target buyer universe:
    1. Research potential acquirers (strategic, financial, competitors, platforms)
    2. Create long list (20-30 potential acquirers)
    3. Gather intelligence on M&A criteria and recent activity

    Inputs: {market_analysis}, {industry_trends}
    Outputs: Buyer landscape database
    """,
    agent=buyer_intelligence_agent,
    expected_output="Database with 20-30 potential acquirers and M&A intelligence"
)

task_13_3_strategic_fit = Task(
    description="""
    Score alignment between venture and potential acquirers:
    1. Define strategic fit criteria (product, customer, geo, tech, culture)
    2. Score each acquirer on 1-5 scale
    3. Create shortlist (top 5-10 with score ≥3.5)

    Inputs: {buyer_landscape_database}
    Outputs: Strategic fit scoring matrix + shortlist
    """,
    agent=buyer_intelligence_agent,
    expected_output="Scored matrix with top 5-10 acquirer shortlist",
    context=[task_13_3_list_acquirers]
)

task_13_3_map_relationships = Task(
    description="""
    Identify existing relationships and connection opportunities:
    1. Map existing relationships for each shortlist acquirer
    2. Create relationship network graph
    3. Develop relationship cultivation plan

    Inputs: {acquirer_shortlist}
    Outputs: Buyer relationship map + cultivation plan
    """,
    agent=buyer_intelligence_agent,
    expected_output="Network graph and cultivation plan with relationship owners",
    context=[task_13_3_strategic_fit]
)

# Exit Gate Approval
task_13_exit_gate_approval = Task(
    description="""
    Chairman approval of complete exit strategy package:
    1. Review exit strategy, timeline, value drivers, buyer landscape
    2. Obtain executive team input
    3. Formal Chairman sign-off

    Inputs: {exit_strategy}, {value_drivers}, {acquisition_targets}
    Outputs: Approved exit strategy package
    """,
    agent=chairman_oversight_agent,
    expected_output="Chairman-approved exit strategy package with sign-off",
    context=[
        task_13_1_establish_timeline,
        task_13_2_ip_strategy,
        task_13_3_map_relationships
    ]
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:576-594 "substages: 13.1, 13.2, 13.3"

### Crew Assembly & Execution

```python
# Stage 13 Crew
exit_oriented_design_crew = Crew(
    agents=[
        exit_strategist_agent,
        valuation_specialist_agent,
        buyer_intelligence_agent,
        chairman_oversight_agent
    ],
    tasks=[
        # Sequential execution for Substage 13.1
        task_13_1_exit_options,
        task_13_1_select_path,
        task_13_1_establish_timeline,

        # Parallel execution for Substage 13.2 (can run concurrently)
        task_13_2_define_metrics,
        task_13_2_growth_levers,
        task_13_2_ip_strategy,

        # Sequential execution for Substage 13.3
        task_13_3_list_acquirers,
        task_13_3_strategic_fit,
        task_13_3_map_relationships,

        # Final gate approval
        task_13_exit_gate_approval
    ],
    process=Process.hierarchical,  # Chairman oversight agent manages workflow
    verbose=2,
    manager_llm="gpt-4"  # Strategic decisions require high-capability LLM
)

# Execute Stage 13
stage_13_result = exit_oriented_design_crew.kickoff(
    inputs={
        "business_model": stage_12_outputs["business_model"],
        "market_analysis": stage_5_7_outputs["market_analysis"],
        "industry_trends": external_data_source.fetch_trends()
    }
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:596 "progression_mode: Manual → Assisted → Auto"

### Parallel Execution Opportunities

**Parallel Block 1**: Substage 13.2 tasks
- `task_13_2_define_metrics`, `task_13_2_growth_levers`, `task_13_2_ip_strategy` can run concurrently
- No sequential dependencies within Substage 13.2
- Estimated time savings: 2-3 weeks (serial) → 3-4 weeks (parallel) due to overlap

**Parallel Block 2**: After Substage 13.1 completes
- Substage 13.2 and 13.3 have no interdependencies
- Can execute `task_13_2_*` and `task_13_3_*` in parallel
- Estimated time savings: 6-8 weeks (serial) → 4-5 weeks (parallel)

**Sequential Constraints**:
- Substage 13.1 must complete before 13.2/13.3 (exit path selection drives valuation approach)
- `task_13_exit_gate_approval` requires all prior tasks complete

## LEO Protocol Governance Mapping

### LEAD Phase Integration
**Stage 13 Approval Requirements**:
- Strategic Directive (SD) required: EXIT-STRATEGY-001 (proposed)
- Approval authority: Chairman (per Stage 13 ownership)
- Simplicity-first evaluation: N/A (strategic decision, not implementation)
- Over-engineering check: Ensure exit strategy not over-complicated

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:18 "Clear ownership (Chairman)"

**Strategic Validation Gate Questions** (6-question rubric):
1. **Problem Clarity**: Is the exit need clearly articulated? (What market conditions or venture maturity triggers exit planning?)
2. **Simplest Solution**: Is the proposed exit path the simplest viable option? (IPO vs. acquisition complexity)
3. **Existing Capabilities**: Do we have in-house expertise for exit execution, or do we need external advisors?
4. **Stakeholder Value**: Does exit strategy maximize value for all stakeholders (founders, investors, employees)?
5. **Risk Assessment**: What are the risks of each exit option, and how do they compare?
6. **Success Metrics**: How will we measure exit readiness and success? (Exit readiness score ≥80%?)

**LEAD Approval Outcome**:
- **APPROVED**: Proceed to PLAN phase (Stage 13 PRD creation)
- **CONDITIONAL_PASS**: Address specific concerns (e.g., valuation assumptions, timeline feasibility)
- **REJECTED**: Revisit Stage 12 (Business Model Development) if fundamental issues

### PLAN Phase Integration
**Stage 13 PRD Requirements**:
- **PRD-EXIT-STRATEGY-001**: Exit Strategy Implementation Plan
  - Inputs: Business model, Market analysis, Industry trends (from stages.yaml:556-559)
  - Outputs: Exit strategy, Value drivers, Acquisition targets (from stages.yaml:560-563)
  - Testing strategy: Metrics validation (exit readiness score, valuation potential, strategic fit)
  - Rollback plan: Triggers for returning to Stage 5/12 (per 05_professional-sop.md)

**Pre-EXEC Checklist**:
- [ ] Entry gates validated (Business model defined, Market position clear)
- [ ] Input data quality verified (business model completeness, market analysis recency)
- [ ] Metrics thresholds defined (exit readiness ≥80%, valuation ≥$XM, strategic fit ≥3.5)
- [ ] Automation roadmap approved (20% → 80% automation plan)
- [ ] Chairman availability confirmed (for Step 1.2 decision, Gate 1 approval)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:568-575 "gates: entry/exit"

### EXEC Phase Integration
**Stage 13 Implementation**:
- **Phase**: EXEC-1 (Single phase - strategic planning, not code implementation)
- **Component Scope**: N/A (Stage 13 is process/decision, not software component)
- **Testing Requirements**:
  - **Unit tests**: N/A (no code)
  - **E2E tests**: Metrics calculation validation (exit readiness score, valuation model)
  - **Manual validation**: Chairman workshop (Step 1.2), Executive team review (Gate 1)

**Dual Test Requirement**: Modified for Stage 13
- **Test 1**: Metrics calculation validation (automated - valuation model unit tests)
- **Test 2**: Strategic fit scoring validation (semi-automated - scoring algorithm tests)
- **Manual override**: Chairman judgment on exit path selection (Step 1.2) - not testable

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:596 "progression_mode: Manual → Assisted → Auto"

### Database Integration
**Stage 13 Data Model** (proposed schema):

```sql
-- Stage execution tracking
CREATE TABLE stage_13_executions (
    id UUID PRIMARY KEY,
    venture_id UUID REFERENCES ventures(id),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT CHECK (status IN ('in_progress', 'completed', 'rolled_back')),
    chairman_approval_at TIMESTAMP,

    -- Outputs
    exit_strategy JSONB,  -- {path: 'acquisition', timeline: {...}, rationale: '...'}
    value_drivers JSONB,  -- {metrics: [...], growth_levers: [...], ip_strategy: {...}}
    acquisition_targets JSONB,  -- {shortlist: [...], relationships: {...}}

    -- Metrics
    exit_readiness_score NUMERIC(4,2) CHECK (exit_readiness_score BETWEEN 0 AND 100),
    valuation_potential_min NUMERIC(12,2),
    valuation_potential_max NUMERIC(12,2),
    strategic_fit_avg NUMERIC(3,2) CHECK (strategic_fit_avg BETWEEN 0 AND 5),

    -- Gates
    business_model_defined BOOLEAN DEFAULT FALSE,
    market_position_clear BOOLEAN DEFAULT FALSE,
    exit_strategy_approved BOOLEAN DEFAULT FALSE,
    value_drivers_identified BOOLEAN DEFAULT FALSE,
    timeline_set BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Buyer landscape tracking
CREATE TABLE buyer_landscape (
    id UUID PRIMARY KEY,
    stage_13_execution_id UUID REFERENCES stage_13_executions(id),
    acquirer_name TEXT NOT NULL,
    acquirer_type TEXT CHECK (acquirer_type IN ('strategic', 'financial', 'competitor', 'platform')),

    -- Strategic fit scoring
    product_complementarity_score NUMERIC(2,1) CHECK (product_complementarity_score BETWEEN 0 AND 5),
    customer_overlap_score NUMERIC(2,1),
    geographic_expansion_score NUMERIC(2,1),
    technology_synergy_score NUMERIC(2,1),
    cultural_alignment_score NUMERIC(2,1),
    strategic_fit_total NUMERIC(3,2),  -- Weighted average

    -- Relationship mapping
    existing_relationships JSONB,  -- {board: [...], investors: [...], partners: [...]}
    relationship_quality_score NUMERIC(2,1) CHECK (relationship_quality_score BETWEEN 0 AND 5),

    on_shortlist BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Value driver tracking
CREATE TABLE value_drivers (
    id UUID PRIMARY KEY,
    stage_13_execution_id UUID REFERENCES stage_13_executions(id),
    metric_name TEXT NOT NULL,  -- e.g., 'ARR', 'Churn Rate', 'Market Share'
    current_value NUMERIC,
    target_value NUMERIC,
    unit TEXT,  -- e.g., 'USD', '%', 'count'
    valuation_impact NUMERIC(12,2),  -- Estimated $ impact on enterprise value
    priority_rank INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:12 "Data Readiness | 3 | Input/output defined"

**RLS Policies**:
- `stage_13_executions`: Chairman + CFO read/write access
- `buyer_landscape`: Chairman + CFO + BD team read access (confidential exit planning)
- `value_drivers`: Chairman + CFO + finance team read/write access

### Handoff System Integration
**Stage 13 Handoff Structure** (7-element format):

```typescript
// Handoff from Stage 12 → Stage 13
{
  "handoff_id": "stage-12-to-13-{venture_id}",
  "from_stage": "12_business_model_development",
  "to_stage": "13_exit_oriented_design",
  "status": "pending_review",  // Chairman review required

  "artifacts": {
    "business_model": {
      "value_proposition": "...",
      "revenue_model": "...",
      "cost_structure": "...",
      "key_metrics": [...]
    },
    "market_analysis": {
      "competitive_landscape": "...",
      "positioning_statement": "...",
      "target_segments": [...]
    }
  },

  "gates_passed": {
    "stage_12_exit_gates": ["Business model validated", "Revenue model tested"],
    "stage_13_entry_gates_status": {
      "business_model_defined": true,  // From Stage 12 output
      "market_position_clear": true    // From Stage 5-7 output
    }
  },

  "context": {
    "chairman_availability": "2025-11-15",  // Critical for Step 1.2 decision
    "external_advisors": ["Investment Banker XYZ", "M&A Attorney ABC"],
    "timeline_pressure": "Target exit in 18 months"
  },

  "next_actions": [
    "Schedule Chairman workshop for exit path selection",
    "Engage investment banker for market intelligence",
    "Begin buyer landscape research (Substage 13.3)"
  ]
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:554-555 "depends_on: - 12"

## Agent Communication Patterns

### Sequential Communication
- **Exit Strategist → Chairman Oversight**: Exit options matrix handoff (Task 13.1)
- **Valuation Specialist → Exit Strategist**: Metrics framework informs timeline milestones
- **Buyer Intelligence → Chairman Oversight**: Shortlist for final approval (Gate 1)

### Parallel Communication (Proposed)
- **Valuation Specialist ↔ Buyer Intelligence**: Valuation multiples inform strategic fit scoring
- **Exit Strategist ↔ Valuation Specialist**: Exit timeline drives growth lever prioritization

### Escalation Paths
1. **Agent → Chairman**: Any strategic decision beyond agent scope (e.g., exit path selection pivot)
2. **Agent → CFO**: Financial analysis validation, resource allocation decisions
3. **Chairman → Board**: Exit strategy requiring board approval (e.g., IPO vs. acquisition vote)

## Error Handling & Rollback

### Agent-Level Error Handling
```python
# Example: Exit options evaluation failure
try:
    exit_options_matrix = task_13_1_exit_options.execute()
except InsufficientMarketDataError:
    # Escalate to Chairman
    notify_chairman("Stage 13 blocked: Insufficient M&A market data")
    # Proposed mitigation: Engage investment banker
    engage_external_advisor(advisor_type="investment_banker")
    # Retry with advisor support
    exit_options_matrix = task_13_1_exit_options.execute(with_advisor=True)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:26 "No explicit error handling"

### Rollback Triggers (mapped to 05_professional-sop.md)
```python
# Check rollback conditions after Gate 1
if stage_13_result["valuation_potential_max"] < CHAIRMAN_MIN_THRESHOLD:
    trigger_rollback(
        to_stage="5_profitability",
        reason="Valuation potential below threshold",
        action="Optimize business model for improved unit economics"
    )

if stage_13_result["strategic_fit_avg"] < 2.5:
    trigger_rollback(
        to_stage="6_7_market_validation",
        reason="Strategic fit too low across all acquirers",
        action="Reposition venture for better buyer alignment"
    )
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:47-50 "Current: No rollback defined, Required: Clear"

## Monitoring & Observability

### Agent Performance Metrics
- **Exit Strategist Agent**: Time to complete Task 13.1 (target: ≤3 weeks)
- **Valuation Specialist Agent**: Accuracy of valuation estimates vs. actual market comps (target: ±20%)
- **Buyer Intelligence Agent**: Shortlist quality (% of shortlist acquirers ultimately engaged)
- **Chairman Oversight Agent**: Decision latency (target: ≤1 week for Step 1.2)

### Crew-Level Metrics
- **Stage 13 Duration**: Target 8-10 weeks (with parallel execution)
- **Automation Rate**: Current 20% → Target 80%
- **Chairman Time Investment**: Current 15 hours → Target 6 hours (with automation)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:32-34 "Target State: 80% automation"

## Tool Integration Requirements

### External Tools (for agents)
1. **market_data_tool**: Integration with PitchBook, CB Insights, or Crunchbase for M&A data
2. **valuation_model_tool**: DCF model, comparable company analysis spreadsheet templates
3. **buyer_database_tool**: Maintained list of 500+ potential acquirers by industry
4. **crm_integration_tool**: Salesforce or HubSpot for buyer relationship tracking
5. **approval_workflow_tool**: DocuSign or similar for Chairman electronic sign-off

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-13.md:25 "Missing specific tool integrations"

### Internal Tools
1. **stage_tracker**: Update stage_13_executions table with task progress
2. **handoff_validator**: Verify Stage 12 → Stage 13 handoff completeness
3. **metrics_calculator**: Compute exit readiness score, strategic fit average
4. **gate_validator**: Check entry/exit gate conditions before proceeding

---

**Agent Orchestration Version**: 1.0
**CrewAI Compatibility**: v0.11.0+
**LLM Requirements**: GPT-4 or Claude-Opus for chairman_oversight_agent strategic decisions

<!-- Generated by Claude Code Phase 6 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
