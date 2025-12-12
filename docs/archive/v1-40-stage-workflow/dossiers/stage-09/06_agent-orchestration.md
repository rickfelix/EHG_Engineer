# Stage 9: Agent Orchestration & Governance

**Purpose**: Define how LEO Protocol agents execute Stage 9, with CrewAI implementation patterns.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:18 "Clear ownership (LEAD)"

---

## Agent Ownership

**Primary Owner**: LEAD Agent
**Rationale**: Gap analysis and market opportunity modeling are strategic decisions requiring LEAD's business judgment and long-term vision alignment.

**Supporting Agents**:
- **PLAN Agent**: Provides capability roadmap structure, timeline validation
- **EXEC Agent**: Validates technical feasibility of gap closure approaches

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:18 "Clear ownership (LEAD)"

---

## CrewAI Agent Definition

```python
# agents/gap_analysis_agent.py
from crewai import Agent

gap_analysis_agent = Agent(
    role="Gap Analysis Strategist",
    goal="Identify capability gaps and prioritize market opportunities for venture success",
    backstory="""You are a strategic analyst with expertise in organizational capability assessment,
    market analysis, and competitive intelligence. You excel at identifying gaps between current state
    and market requirements, and translating those gaps into actionable capability roadmaps with ROI projections.""",
    tools=[
        capability_inventory_tool,  # Query internal capability database
        market_research_tool,        # Access market size/competitor data
        roi_calculator_tool,         # Calculate ROI for gap closure investments
        competitor_analysis_tool     # Scrape/analyze competitor offerings
    ],
    verbose=True,
    allow_delegation=False,  # LEAD agent works independently
    llm="gpt-4"  # Requires strong reasoning for strategic decisions
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:365-409 "Stage 9 inputs/outputs for agent design"

---

## CrewAI Task Definitions

### Task 9.1: Capability Assessment

```python
# tasks/stage_09_tasks.py
from crewai import Task

capability_assessment_task = Task(
    description="""
    Objective: Document current organizational capabilities and required capabilities for venture.

    Context:
    - Stage 8 WBS output: {wbs_tasks}
    - Internal capability inventory: {capability_inventory}
    - Technical specifications: {tech_specs}

    Instructions:
    1. Review Stage 8 WBS to understand all required tasks
    2. For each task, identify required technical and non-technical capabilities
    3. Query internal capability inventory to document current state
    4. Rate current capabilities on 1-5 maturity scale
    5. Rate required capabilities on 1-5 maturity scale

    Deliverables:
    - Current Capabilities Matrix (markdown table)
    - Required Capabilities Matrix (markdown table)

    Success Criteria:
    - All WBS tasks mapped to required capabilities
    - Current state maturity ratings justified with evidence
    - Required maturity ratings aligned with technical complexity
    """,
    agent=gap_analysis_agent,
    expected_output="Two markdown tables: Current Capabilities Matrix and Required Capabilities Matrix",
    context=[problem_decomposition_task],  # Depends on Stage 8 output
    output_file="stage_09_1_capability_assessment.md"
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:392-396 "9.1 Capability Assessment substage"

### Task 9.2: Gap Identification

```python
gap_identification_task = Task(
    description="""
    Objective: Identify and prioritize capability gaps between current and required states.

    Context:
    - Current Capabilities Matrix: {current_capabilities}
    - Required Capabilities Matrix: {required_capabilities}
    - Stage 7 Resource Plan: {resource_plan}

    Instructions:
    1. Compare current vs required maturity for each capability
    2. Calculate gap size (required - current) for each capability
    3. Classify gaps: CRITICAL (missing), HIGH (2+ gap), MEDIUM (1 gap), LOW (<1 gap)
    4. Assess severity based on WBS critical path and customer requirements
    5. Prioritize gaps using urgency × strategic fit × cost matrix

    Deliverables:
    - Capability Gaps Table (markdown table)
    - Gap Severity Assessment (markdown table)
    - Prioritized Gap List (P0/P1/P2/P3)

    Success Criteria:
    - All gaps ≥1 maturity point documented
    - Severity ratings justified with impact analysis
    - P0/P1 gaps have defined closure approach (build/buy/partner/hire)
    """,
    agent=gap_analysis_agent,
    expected_output="Three markdown tables: Capability Gaps, Severity Assessment, Prioritized Gaps",
    context=[capability_assessment_task],  # Depends on 9.1 output
    output_file="stage_09_2_gap_identification.md"
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:397-403 "9.2 Gap Identification substage"

### Task 9.3: Opportunity Modeling

```python
opportunity_modeling_task = Task(
    description="""
    Objective: Model market opportunities and create capability roadmap with ROI projections.

    Context:
    - Prioritized Gap List: {prioritized_gaps}
    - Market requirements: {market_requirements}
    - Competitor analysis: {competitor_analysis}

    Instructions:
    1. Map each market opportunity to required capabilities
    2. Estimate TAM/SAM/SOM for each opportunity using market research tools
    3. Calculate cost to close each gap (hire/train/buy/partner)
    4. Project 3-year revenue for each opportunity
    5. Calculate ROI: (Revenue - Cost) / Cost
    6. Create capability roadmap timeline (Gantt chart format)

    Deliverables:
    - Opportunity Matrix (markdown table)
    - Market Size Estimates (TAM/SAM/SOM)
    - ROI Projections (markdown table)
    - Capability Roadmap (timeline with milestones)

    Success Criteria:
    - All P0/P1 gaps included in roadmap
    - Market size estimates cite sources
    - ROI ≥100% for all P0 gap closures
    - Roadmap timeline aligns with Stage 7 Technical Planning
    """,
    agent=gap_analysis_agent,
    expected_output="Opportunity Matrix, Market Size Estimates, ROI Projections, Capability Roadmap",
    context=[gap_identification_task, comprehensive_planning_task],  # Depends on 9.2 + Stage 7
    output_file="stage_09_3_opportunity_modeling.md"
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:404-407 "9.3 Opportunity Modeling substage"

---

## CrewAI Crew Configuration

```python
# crews/stage_09_crew.py
from crewai import Crew, Process

stage_09_crew = Crew(
    agents=[gap_analysis_agent],  # Single agent for strategic coherence
    tasks=[
        capability_assessment_task,
        gap_identification_task,
        opportunity_modeling_task
    ],
    process=Process.sequential,  # Must execute in order (9.1 → 9.2 → 9.3)
    verbose=True,
    memory=True,  # Maintain context across substages
    embedder={
        "provider": "openai",
        "config": {"model": "text-embedding-3-small"}
    }
)

# Execution
def execute_stage_9(venture_id: str, wbs_output: dict, market_data: dict):
    """Execute Stage 9: Gap Analysis & Market Opportunity Modeling"""
    result = stage_09_crew.kickoff(inputs={
        "venture_id": venture_id,
        "wbs_tasks": wbs_output["tasks"],
        "capability_inventory": fetch_capability_inventory(),
        "tech_specs": fetch_technical_specifications(venture_id),
        "market_requirements": market_data["requirements"],
        "competitor_analysis": market_data["competitors"],
        "resource_plan": fetch_stage_7_resource_plan(venture_id)
    })

    return {
        "gap_analysis_report": result.tasks_output[0].raw_output,
        "opportunity_matrix": result.tasks_output[1].raw_output,
        "capability_roadmap": result.tasks_output[2].raw_output,
        "metrics": calculate_stage_9_metrics(result)
    }
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:392-407 "Sequential substages 9.1 → 9.2 → 9.3"

---

## Governance & Quality Gates

### Entry Gate Validation

```python
# validation/stage_09_gates.py
def validate_stage_9_entry_gates(venture_id: str) -> dict:
    """Validate entry gates before starting Stage 9"""
    gates = {
        "decomposition_complete": False,
        "market_analyzed": False
    }

    # Check Stage 8 completion
    stage_8_status = fetch_stage_status(venture_id, stage=8)
    if stage_8_status == "COMPLETE" and stage_8_wbs_exists(venture_id):
        gates["decomposition_complete"] = True

    # Check market research availability
    market_data = fetch_market_data(venture_id)
    if market_data and len(market_data.get("requirements", [])) > 0:
        gates["market_analyzed"] = True

    return {
        "passed": all(gates.values()),
        "gates": gates,
        "blocking_gates": [k for k, v in gates.items() if not v]
    }
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:383-386 "entry gates: Decomposition complete, Market analyzed"

### Exit Gate Validation

```python
def validate_stage_9_exit_gates(venture_id: str, outputs: dict) -> dict:
    """Validate exit gates after Stage 9 completion"""
    gates = {
        "gaps_identified": False,
        "opportunities_prioritized": False,
        "roadmap_defined": False
    }

    # Check gaps identified
    gap_report = outputs.get("gap_analysis_report", "")
    if gap_report and "Capability Gaps Table" in gap_report:
        gaps = parse_gaps_table(gap_report)
        gates["gaps_identified"] = len(gaps) > 0

    # Check opportunities prioritized
    opp_matrix = outputs.get("opportunity_matrix", "")
    if opp_matrix and "ROI Projections" in opp_matrix:
        opportunities = parse_opportunity_matrix(opp_matrix)
        gates["opportunities_prioritized"] = len(opportunities) > 0

    # Check roadmap defined
    roadmap = outputs.get("capability_roadmap", "")
    if roadmap and ("Quarter" in roadmap or "Timeline" in roadmap):
        milestones = parse_roadmap_milestones(roadmap)
        gates["roadmap_defined"] = len(milestones) >= 3  # At least 3 milestones

    return {
        "passed": all(gates.values()),
        "gates": gates,
        "blocking_gates": [k for k, v in gates.items() if not v]
    }
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:387-391 "exit gates: Gaps identified, Opportunities prioritized, Roadmap defined"

---

## Metrics Calculation

```python
# metrics/stage_09_metrics.py
def calculate_stage_9_metrics(crew_result: dict) -> dict:
    """Calculate Stage 9 metrics: Gap coverage, Opportunity size, Capability score"""

    gaps = parse_gaps_table(crew_result.tasks_output[0].raw_output)
    roadmap = parse_roadmap_milestones(crew_result.tasks_output[2].raw_output)

    # Gap coverage: % of gaps in roadmap
    total_gaps = len(gaps)
    gaps_in_roadmap = count_gaps_in_roadmap(gaps, roadmap)
    gap_coverage = (gaps_in_roadmap / total_gaps * 100) if total_gaps > 0 else 0

    # Opportunity size: Total SOM
    opportunities = parse_opportunity_matrix(crew_result.tasks_output[1].raw_output)
    opportunity_size = sum(opp.get("som", 0) for opp in opportunities)

    # Capability score: Average current maturity
    capabilities = parse_current_capabilities(crew_result.tasks_output[0].raw_output)
    capability_score = sum(cap.get("maturity", 0) for cap in capabilities) / len(capabilities) if capabilities else 0

    return {
        "gap_coverage": gap_coverage,
        "opportunity_size": opportunity_size,
        "capability_score": capability_score,
        "thresholds": {
            "gap_coverage_target": 80,  # ≥80% gaps addressed
            "opportunity_size_target": 2_000_000,  # ≥$2M SOM
            "capability_score_target": 3.0  # ≥3.0/5.0 maturity
        }
    }
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:379-382 "metrics: Gap coverage, Opportunity size, Capability score"

---

## Database Integration

### Stage 9 Schema (Proposed)

```sql
-- Store Stage 9 outputs in database
CREATE TABLE stage_09_gap_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Capability Assessment (9.1)
    current_capabilities JSONB,  -- Array of {capability, maturity, evidence}
    required_capabilities JSONB, -- Array of {capability, required_maturity, source_task}

    -- Gap Identification (9.2)
    capability_gaps JSONB,       -- Array of {gap, severity, priority, closure_approach}
    gap_coverage_pct DECIMAL(5,2), -- Calculated metric

    -- Opportunity Modeling (9.3)
    opportunity_matrix JSONB,    -- Array of {opportunity, tam, sam, som, roi}
    opportunity_size_usd BIGINT, -- Total SOM
    capability_roadmap JSONB,    -- Array of {milestone, date, gaps_addressed}

    -- Metrics
    capability_score DECIMAL(3,2), -- 0.00-5.00

    -- Governance
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ
);

CREATE INDEX idx_stage_09_venture ON stage_09_gap_analysis(venture_id);
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:375-382 "Outputs and metrics structure"

---

## Human-in-the-Loop (HITL) Points

**Chairman Approval Required**:
1. **After Gap Identification (9.2)**: Review P0/P1 gaps before committing resources
   - **Approval Question**: "Approve $X investment to close P0/P1 gaps?"
   - **Options**: Approve / Modify scope / Reject venture

2. **After Opportunity Modeling (9.3)**: Review ROI projections and capability roadmap
   - **Approval Question**: "Approve capability roadmap with {timeline} and {budget}?"
   - **Options**: Approve / Request changes / Reject

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:51-54 "Customer Integration: Add customer validation checkpoint"

---

## Error Handling

**Common Failure Modes**:
1. **Insufficient market data**: Market requirements incomplete
   - **Mitigation**: Halt Stage 9, return to earlier market research stages

2. **Capability inventory missing**: No internal capability database
   - **Mitigation**: Run manual capability audit, bootstrap inventory

3. **ROI calculation errors**: Missing cost data for gap closure
   - **Mitigation**: Use industry benchmarks, flag as estimates

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:26 "No explicit error handling"

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| stages.yaml | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 365-409 | Stage definition for agent design |
| critique | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-09.md | 18 | Agent ownership (LEAD) |

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
