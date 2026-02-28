---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 15: Agent Orchestration & Governance Mapping


## Table of Contents

- [Python CrewAI Implementation](#python-crewai-implementation)
  - [Agent Definition](#agent-definition)
  - [Task Definitions (3 Substages)](#task-definitions-3-substages)
  - [Crew Assembly](#crew-assembly)
  - [Entry Gate Validation (Pre-Execution)](#entry-gate-validation-pre-execution)
  - [Exit Gate Validation (Post-Execution)](#exit-gate-validation-post-execution)
  - [Execution Orchestration](#execution-orchestration)
- [Governance Mapping](#governance-mapping)
  - [RACI Matrix](#raci-matrix)
  - [Decision Gates](#decision-gates)
  - [Escalation Paths](#escalation-paths)
  - [Handoff Protocols](#handoff-protocols)
  - [Metrics Governance](#metrics-governance)
- [Agent Collaboration Patterns](#agent-collaboration-patterns)
- [Error Handling & Recovery](#error-handling-recovery)
- [Automation Roadmap](#automation-roadmap)
- [Governance Artifacts](#governance-artifacts)
- [Continuous Improvement](#continuous-improvement)

**Purpose**: CrewAI implementation guide and governance framework for Pricing Strategy & Revenue Architecture
**Owner**: LEAD agent
**Agent Type**: Strategic planning agent with financial analysis capabilities
**Execution Pattern**: Sequential substage execution with decision gates

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:643-645` "id: 15 | Pricing Strategy & Revenue Arc"

---

## Python CrewAI Implementation

### Agent Definition

```python
from crewai import Agent, Task, Crew
from langchain.llms import OpenAI

# Stage 15: Pricing Strategy Agent
pricing_strategy_agent = Agent(
    role='Pricing Strategy Architect',
    goal='Develop comprehensive pricing strategy and revenue model based on cost structure, market research, and competitive analysis',
    backstory="""You are an expert pricing strategist with 15+ years of experience
    in SaaS, e-commerce, and services pricing. You excel at balancing cost recovery,
    competitive positioning, and customer value perception. Your pricing models have
    generated $500M+ in revenue across 50+ products.""",
    verbose=True,
    allow_delegation=False,  # LEAD agent works independently
    llm=OpenAI(temperature=0.3)  # Low temperature for consistent financial analysis
)
```

**Evidence**: Stage owner is LEAD (from workflow context)

**Agent Capabilities**:
- Financial modeling and scenario analysis
- Competitive pricing analysis
- Customer willingness-to-pay assessment
- Revenue projection and forecasting
- Pricing tier design and optimization

---

### Task Definitions (3 Substages)

#### Task 15.1: Pricing Research

```python
task_15_1_pricing_research = Task(
    description="""Conduct comprehensive pricing research for Stage 15.1:

    1. Analyze competitor pricing:
       - Identify 5-10 direct competitors
       - Document pricing tiers, features, and price points
       - Create competitor pricing matrix
       - Identify pricing patterns and gaps

    2. Assess customer willingness-to-pay:
       - Design willingness-to-pay survey
       - Collect minimum 100 responses (or justify smaller sample)
       - Analyze median willingness-to-pay per customer segment
       - Correlate with customer segments

    3. Define value metrics:
       - Identify value drivers from market research
       - Define quantifiable value metrics (users, usage, features)
       - Map value metrics to pricing model type
       - Validate metrics with customer alignment

    INPUTS (required):
    - Cost structure from Stage 14: {cost_structure_path}
    - Market research from Stage 5: {market_research_path}
    - Competitor list: {competitor_list}

    OUTPUTS (deliverables):
    - Competitor pricing matrix (CSV or Excel)
    - Customer willingness-to-pay report (PDF)
    - Value metrics framework (Markdown)

    COMPLETION CRITERIA (all must be TRUE):
    - Competitor prices analyzed (minimum 5 competitors)
    - Customer willingness assessed (minimum 100 responses or justification)
    - Value metrics defined (minimum 2 metrics)
    """,
    agent=pricing_strategy_agent,
    expected_output="3 deliverables: competitor pricing matrix, willingness-to-pay report, value metrics framework"
)
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:669-674` "id: '15.1' | Pricing Research"

---

#### Task 15.2: Model Development

```python
task_15_2_model_development = Task(
    description="""Develop pricing model, tiers, and discount policies for Stage 15.2:

    1. Create pricing model:
       - Select pricing model type (cost-plus, value-based, competitive, hybrid)
       - Calculate price points and validate against inputs
       - Define pricing logic and formula
       - Document rationale for pricing model selection

    2. Structure pricing tiers:
       - Define 3-5 pricing tiers (minimum 3 required)
       - Map features to each tier (Good-Better-Best framework)
       - Design tier pricing with price anchoring
       - Validate clear value differentiation

    3. Plan discount policies:
       - Identify discount types (annual, volume, promotional, special)
       - Define discount percentages and approval workflows
       - Calculate discount impact on revenue
       - Document discount policy and terms

    INPUTS (required):
    - Competitor pricing matrix from Task 15.1: {competitor_matrix_path}
    - Customer willingness report from Task 15.1: {willingness_report_path}
    - Value metrics framework from Task 15.1: {value_metrics_path}
    - Cost structure from Stage 14: {cost_structure_path}

    OUTPUTS (deliverables):
    - Pricing model document (Markdown or PDF)
    - Pricing tiers document (customer-facing ready)
    - Discount policy document (internal governance)

    COMPLETION CRITERIA (all must be TRUE):
    - Pricing model created (with rationale and logic)
    - Tiers structured (minimum 3 tiers with features)
    - Discounts planned (with approval workflows)

    OPTIONAL: Customer validation checkpoint (recommended)
    - Present tiers to customer advisory board
    - Collect feedback and adjust pricing
    """,
    agent=pricing_strategy_agent,
    expected_output="3 deliverables: pricing model document, pricing tiers document, discount policy document",
    context=[task_15_1_pricing_research]  # Depends on Task 15.1 outputs
)
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:675-680` "id: '15.2' | Model Development"

---

#### Task 15.3: Revenue Projection

```python
task_15_3_revenue_projection = Task(
    description="""Calculate revenue projections, model scenarios, and set financial targets for Stage 15.3:

    1. Calculate revenue projections:
       - Define projection timeframe (12 months minimum, 3 years recommended)
       - Estimate customer acquisition per tier
       - Apply churn rate (industry benchmark)
       - Apply discount impact (weighted average)
       - Calculate MRR, ARR, and total revenue

    2. Model scenarios:
       - Define 3 scenarios: Best-case, Likely-case, Worst-case
       - Adjust key variables per scenario (acquisition, churn, pricing)
       - Calculate revenue for each scenario
       - Assign probability weights (totaling 100%)
       - Calculate probability-weighted revenue

    3. Set financial targets:
       - Define revenue targets (MRR, ARR per quarter/year)
       - Define customer targets (per tier)
       - Define growth rate targets (MoM, YoY)
       - Align targets with business goals (break-even, profitability)
       - Create KPI tracking plan

    INPUTS (required):
    - Pricing model document from Task 15.2: {pricing_model_path}
    - Pricing tiers document from Task 15.2: {pricing_tiers_path}
    - Discount policy document from Task 15.2: {discount_policy_path}
    - Cost structure from Stage 14: {cost_structure_path}

    OUTPUTS (deliverables):
    - Revenue projection spreadsheet (Excel with formulas)
    - Scenario comparison table (best/likely/worst)
    - Financial targets document (with KPI tracking plan)

    COMPLETION CRITERIA (all must be TRUE):
    - Projections calculated (MRR, ARR for 12+ months)
    - Scenarios modeled (minimum 3 scenarios with probabilities)
    - Targets set (revenue, customer, growth rate targets)
    """,
    agent=pricing_strategy_agent,
    expected_output="3 deliverables: revenue projection spreadsheet, scenario comparison table, financial targets document",
    context=[task_15_1_pricing_research, task_15_2_model_development]  # Depends on Tasks 15.1 and 15.2
)
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:681-686` "id: '15.3' | Revenue Projection"

---

### Crew Assembly

```python
# Stage 15: Pricing Strategy Crew
pricing_strategy_crew = Crew(
    agents=[pricing_strategy_agent],
    tasks=[
        task_15_1_pricing_research,
        task_15_2_model_development,
        task_15_3_revenue_projection
    ],
    verbose=True,
    process='sequential'  # Tasks must execute in order (15.1 → 15.2 → 15.3)
)
```

**Process Type**: Sequential (substages are dependent)
**Rationale**: Task 15.2 requires Task 15.1 outputs; Task 15.3 requires Task 15.2 outputs

---

### Entry Gate Validation (Pre-Execution)

```python
def validate_stage_15_entry_gates(cost_structure_path: str, market_research_path: str) -> bool:
    """
    Validate entry gates before Stage 15 execution.

    Entry Gate #1: Costs calculated
    Entry Gate #2: Market research complete

    Returns:
        bool: True if all entry gates pass, False otherwise
    """
    import os

    # Entry Gate #1: Costs calculated
    if not os.path.exists(cost_structure_path):
        print(f"❌ Entry Gate #1 FAILED: Cost structure not found at {cost_structure_path}")
        print("BLOCKER: Stage 14 (Cost Estimation) must be completed first.")
        return False

    # Validate cost structure content (basic check)
    with open(cost_structure_path, 'r') as f:
        cost_content = f.read()
        if len(cost_content) < 100:  # Minimum content threshold
            print(f"❌ Entry Gate #1 FAILED: Cost structure appears incomplete (<100 chars)")
            return False

    print("✅ Entry Gate #1 PASSED: Costs calculated")

    # Entry Gate #2: Market research complete
    if not os.path.exists(market_research_path):
        print(f"❌ Entry Gate #2 FAILED: Market research not found at {market_research_path}")
        print("BLOCKER: Stage 5 (Market Analysis) must be completed OR external research required.")
        return False

    # Validate market research content (basic check)
    with open(market_research_path, 'r') as f:
        market_content = f.read()
        if len(market_content) < 500:  # Minimum content threshold
            print(f"❌ Entry Gate #2 FAILED: Market research appears incomplete (<500 chars)")
            return False

    print("✅ Entry Gate #2 PASSED: Market research complete")

    # All entry gates passed
    print("✅ ALL ENTRY GATES PASSED: Stage 15 ready to execute")
    return True
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:660-663` "entry: Costs calculated | Market resear"

---

### Exit Gate Validation (Post-Execution)

```python
def validate_stage_15_exit_gates(
    pricing_model_path: str,
    pricing_tiers_path: str,
    revenue_projections_path: str,
    lead_approval: bool
) -> bool:
    """
    Validate exit gates after Stage 15 execution.

    Exit Gate #1: Pricing approved (LEAD sign-off)
    Exit Gate #2: Tiers defined (minimum 3 tiers)
    Exit Gate #3: Projections validated (financial review)

    Returns:
        bool: True if all exit gates pass, False otherwise
    """
    import os
    import pandas as pd

    # Exit Gate #1: Pricing approved
    if not lead_approval:
        print("❌ Exit Gate #1 FAILED: Pricing model not approved by LEAD agent")
        print("BLOCKER: LEAD agent must review and approve pricing model")
        return False

    if not os.path.exists(pricing_model_path):
        print(f"❌ Exit Gate #1 FAILED: Pricing model not found at {pricing_model_path}")
        return False

    print("✅ Exit Gate #1 PASSED: Pricing approved")

    # Exit Gate #2: Tiers defined (minimum 3 tiers)
    if not os.path.exists(pricing_tiers_path):
        print(f"❌ Exit Gate #2 FAILED: Pricing tiers not found at {pricing_tiers_path}")
        return False

    # Validate tier structure (check for minimum 3 tiers)
    # Assuming tiers are in CSV or Excel format
    try:
        if pricing_tiers_path.endswith('.csv'):
            tiers_df = pd.read_csv(pricing_tiers_path)
        elif pricing_tiers_path.endswith('.xlsx'):
            tiers_df = pd.read_excel(pricing_tiers_path)
        else:
            print(f"⚠️ Exit Gate #2 WARNING: Cannot validate tier count (unsupported format)")
            tiers_df = None

        if tiers_df is not None and len(tiers_df) < 3:
            print(f"❌ Exit Gate #2 FAILED: Only {len(tiers_df)} tiers defined (minimum 3 required)")
            return False
    except Exception as e:
        print(f"⚠️ Exit Gate #2 WARNING: Could not parse tiers file: {e}")

    print("✅ Exit Gate #2 PASSED: Tiers defined (minimum 3 tiers)")

    # Exit Gate #3: Projections validated
    if not os.path.exists(revenue_projections_path):
        print(f"❌ Exit Gate #3 FAILED: Revenue projections not found at {revenue_projections_path}")
        return False

    # Validate projection content (check for minimum columns: MRR, ARR, Scenarios)
    try:
        if revenue_projections_path.endswith('.csv'):
            proj_df = pd.read_csv(revenue_projections_path)
        elif revenue_projections_path.endswith('.xlsx'):
            proj_df = pd.read_excel(revenue_projections_path)
        else:
            print(f"⚠️ Exit Gate #3 WARNING: Cannot validate projections (unsupported format)")
            proj_df = None

        if proj_df is not None:
            required_cols = ['MRR', 'ARR']  # Minimum required columns
            missing_cols = [col for col in required_cols if col not in proj_df.columns]
            if missing_cols:
                print(f"❌ Exit Gate #3 FAILED: Revenue projections missing columns: {missing_cols}")
                return False
    except Exception as e:
        print(f"⚠️ Exit Gate #3 WARNING: Could not parse projections file: {e}")

    print("✅ Exit Gate #3 PASSED: Projections validated")

    # All exit gates passed
    print("✅ ALL EXIT GATES PASSED: Stage 15 complete, ready for Stage 16")
    return True
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:664-667` "exit: Pricing approved | Tiers defined"

---

### Execution Orchestration

```python
def execute_stage_15(
    cost_structure_path: str,
    market_research_path: str,
    competitor_list: list,
    output_dir: str,
    lead_approval_callback: callable
) -> dict:
    """
    Orchestrate full Stage 15 execution with entry/exit gate validation.

    Args:
        cost_structure_path: Path to Stage 14 cost structure artifact
        market_research_path: Path to Stage 5 market research report
        competitor_list: List of competitor names for pricing analysis
        output_dir: Directory to save Stage 15 outputs
        lead_approval_callback: Function to request LEAD approval (returns bool)

    Returns:
        dict: Execution results with status and output paths
    """
    import os

    # Step 1: Validate entry gates
    print("=" * 60)
    print("STAGE 15: PRICING STRATEGY & REVENUE ARCHITECTURE")
    print("=" * 60)
    print("\nStep 1: Validating entry gates...")

    if not validate_stage_15_entry_gates(cost_structure_path, market_research_path):
        return {
            'status': 'BLOCKED',
            'message': 'Entry gates failed validation',
            'outputs': {}
        }

    # Step 2: Execute Stage 15 crew (3 substages)
    print("\nStep 2: Executing Stage 15 crew (3 substages)...")

    # Prepare task inputs
    task_inputs = {
        'cost_structure_path': cost_structure_path,
        'market_research_path': market_research_path,
        'competitor_list': ', '.join(competitor_list),
        'output_dir': output_dir
    }

    # Execute crew (sequential tasks)
    try:
        crew_output = pricing_strategy_crew.kickoff(inputs=task_inputs)
        print(f"✅ Crew execution completed")
    except Exception as e:
        print(f"❌ Crew execution failed: {e}")
        return {
            'status': 'FAILED',
            'message': f'Crew execution error: {e}',
            'outputs': {}
        }

    # Step 3: Parse outputs
    print("\nStep 3: Parsing outputs...")

    output_paths = {
        'pricing_model': os.path.join(output_dir, 'pricing_model.md'),
        'pricing_tiers': os.path.join(output_dir, 'pricing_tiers.csv'),
        'revenue_projections': os.path.join(output_dir, 'revenue_projections.xlsx'),
        'competitor_matrix': os.path.join(output_dir, 'competitor_pricing_matrix.csv'),
        'willingness_report': os.path.join(output_dir, 'customer_willingness_report.pdf'),
        'value_metrics': os.path.join(output_dir, 'value_metrics_framework.md'),
        'discount_policy': os.path.join(output_dir, 'discount_policy.md'),
        'scenario_comparison': os.path.join(output_dir, 'scenario_comparison.csv'),
        'financial_targets': os.path.join(output_dir, 'financial_targets.md')
    }

    # Verify outputs exist
    missing_outputs = [k for k, v in output_paths.items() if not os.path.exists(v)]
    if missing_outputs:
        print(f"⚠️ WARNING: Missing expected outputs: {missing_outputs}")

    # Step 4: Request LEAD approval
    print("\nStep 4: Requesting LEAD approval...")

    lead_approval = lead_approval_callback(output_paths['pricing_model'])

    if not lead_approval:
        print("❌ LEAD approval DENIED: Pricing model requires revision")
        return {
            'status': 'APPROVAL_DENIED',
            'message': 'LEAD agent did not approve pricing model',
            'outputs': output_paths
        }

    print("✅ LEAD approval GRANTED")

    # Step 5: Validate exit gates
    print("\nStep 5: Validating exit gates...")

    if not validate_stage_15_exit_gates(
        output_paths['pricing_model'],
        output_paths['pricing_tiers'],
        output_paths['revenue_projections'],
        lead_approval
    ):
        return {
            'status': 'EXIT_GATES_FAILED',
            'message': 'Exit gates failed validation',
            'outputs': output_paths
        }

    # Step 6: Mark Stage 15 complete
    print("\nStep 6: Stage 15 completion...")
    print("=" * 60)
    print("✅ STAGE 15 COMPLETE: Pricing Strategy & Revenue Architecture")
    print("=" * 60)
    print(f"\nOutputs saved to: {output_dir}")
    print("\nNext Stage: Stage 16 (Business Model Canvas)")

    return {
        'status': 'COMPLETE',
        'message': 'Stage 15 completed successfully',
        'outputs': output_paths
    }


# Example usage
if __name__ == "__main__":
    # Define LEAD approval callback (human-in-the-loop)
    def request_lead_approval(pricing_model_path: str) -> bool:
        print(f"\n📋 LEAD APPROVAL REQUEST:")
        print(f"   Pricing model: {pricing_model_path}")
        print(f"   Please review and approve pricing strategy.")

        # In production, this would be a UI prompt or API call
        # For demo, we'll auto-approve
        approval = input("   Approve pricing model? (yes/no): ").strip().lower()
        return approval == 'yes'

    # Execute Stage 15
    result = execute_stage_15(
        cost_structure_path='/path/to/stage14/cost_structure.md',
        market_research_path='/path/to/stage5/market_research.pdf',
        competitor_list=['Competitor A', 'Competitor B', 'Competitor C', 'Competitor D', 'Competitor E'],
        output_dir='/path/to/stage15/outputs',
        lead_approval_callback=request_lead_approval
    )

    print(f"\n📊 EXECUTION RESULT:")
    print(f"   Status: {result['status']}")
    print(f"   Message: {result['message']}")
    if result['outputs']:
        print(f"   Outputs: {len(result['outputs'])} files generated")
```

**Evidence**: Full Stage 15 workflow from stages.yaml (lines 643-688)

---

## Governance Mapping

### RACI Matrix

| Activity | LEAD | PLAN | EXEC | External |
|----------|------|------|------|----------|
| Entry gate validation | **A** | I | I | - |
| Competitor pricing analysis | **R** | C | I | S (data providers) |
| Customer willingness surveys | **R** | C | I | S (survey platform) |
| Value metrics definition | **R** | C | I | - |
| Pricing model creation | **R** | C | I | C (financial advisor) |
| Tier structure design | **R** | C | I | - |
| Discount policy planning | **R** | C | I | C (legal, sales) |
| Revenue projection calculation | **R** | C | I | C (financial team) |
| Scenario modeling | **R** | C | I | - |
| Financial targets setting | **R** | C | I | C (executive team) |
| Pricing approval | **A** | C | I | - |
| Exit gate validation | **A** | C | I | - |

**Legend**: R = Responsible, A = Accountable, C = Consulted, I = Informed, S = Supplier

**Evidence**: Stage 15 owner is LEAD (from workflow context)

---

### Decision Gates

**Decision Gate #1: Pricing Model Selection** (Substage 15.2, Step 2.1)
- **Decision**: Choose pricing model type (cost-plus, value-based, competitive, hybrid)
- **Decision Maker**: LEAD agent (with input from financial advisor)
- **Criteria**: Maximize profitability while maintaining competitive position
- **Approval**: Required before proceeding to tier structure design

**Decision Gate #2: Customer Validation Checkpoint** (Substage 15.2, Optional)
- **Decision**: Present pricing tiers to customers for validation
- **Decision Maker**: LEAD agent
- **Criteria**: Customer feedback indicates acceptable pricing
- **Approval**: Optional but recommended (improves market acceptance)

**Decision Gate #3: Financial Targets Approval** (Substage 15.3, Step 3.3)
- **Decision**: Approve revenue targets and projections
- **Decision Maker**: LEAD agent (with executive team consultation)
- **Criteria**: Targets are achievable and align with business goals
- **Approval**: Required before Stage 15 completion

**Evidence**: Exit gates require LEAD approval (stages.yaml lines 664-667)

---

### Escalation Paths

**Escalation #1: Entry Gates Blocked**
- **Trigger**: Cost structure unavailable or market research incomplete
- **Path**: LEAD agent → Stage 14 owner (Cost Estimation) OR Stage 5 owner (Market Analysis)
- **Resolution**: Complete upstream stages or provide alternative data sources

**Escalation #2: Competitor Pricing Data Unavailable**
- **Trigger**: Cannot collect competitor pricing data (legal or technical constraints)
- **Path**: LEAD agent → Legal team (compliance review) OR External data providers
- **Resolution**: Use public data only OR purchase third-party pricing data

**Escalation #3: Customer Survey Low Response Rate**
- **Trigger**: Survey responses < 100 and no active customer base
- **Path**: LEAD agent → Marketing team (survey distribution) OR Fallback to competitor pricing
- **Resolution**: Extend survey timeline OR use competitor pricing as proxy

**Escalation #4: LEAD Approval Denied**
- **Trigger**: LEAD agent rejects pricing model in exit gate validation
- **Path**: Return to substage 15.2 (Model Development) for revision
- **Resolution**: Revise pricing model based on LEAD feedback and re-submit

**Escalation #5: Revenue Projections Unrealistic**
- **Trigger**: Financial team flags projections as overly optimistic or pessimistic
- **Path**: LEAD agent → Financial team (collaborative revision)
- **Resolution**: Adjust assumptions and recalculate projections in substage 15.3

---

### Handoff Protocols

**Handoff #1: Stage 14 → Stage 15**
- **Artifact**: Cost structure document
- **Format**: Markdown or Excel with detailed cost breakdown
- **Validation**: Entry gate "Costs calculated" must pass
- **Recipient**: LEAD agent (Stage 15 owner)

**Handoff #2: Stage 5 → Stage 15**
- **Artifact**: Market research report
- **Format**: PDF or Markdown with customer segments and pricing insights
- **Validation**: Entry gate "Market research complete" must pass
- **Recipient**: LEAD agent (Stage 15 owner)

**Handoff #3: Stage 15 → Stage 16**
- **Artifacts**: Pricing model, revenue projections, pricing tiers
- **Format**: Pricing model (Markdown), projections (Excel), tiers (CSV or customer-facing doc)
- **Validation**: Exit gates "Pricing approved", "Tiers defined", "Projections validated" must pass
- **Recipient**: Stage 16 owner (Business Model Canvas)

**Handoff #4: Stage 15 → Marketing/Sales**
- **Artifact**: Pricing tiers document (customer-facing)
- **Format**: Formatted document ready for pricing page display
- **Validation**: Tiers approved and customer-facing ready
- **Recipient**: Marketing team (pricing page) and Sales team (sales enablement)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:648-655` "inputs: Cost structure | outputs: Pricin"

---

### Metrics Governance

**Metric #1: Price Optimization**
- **Owner**: LEAD agent
- **Measurement**: Revenue per customer vs. churn rate correlation
- **Frequency**: Monthly (during pricing optimization), Quarterly (steady state)
- **Threshold**: TBD (define in Stage 15 execution)
- **Action**: If churn > 10% and correlated with price, trigger pricing review

**Metric #2: Revenue Potential**
- **Owner**: LEAD agent
- **Measurement**: Actual ARR vs. projected ARR
- **Frequency**: Monthly (first year), Quarterly (thereafter)
- **Threshold**: Actual ARR ≥ 80% of worst-case projection (minimum acceptable)
- **Action**: If actual < 80% of worst-case, trigger rollback to substage 15.3

**Metric #3: Market Acceptance**
- **Owner**: LEAD agent
- **Measurement**: Customer willingness-to-pay survey score
- **Frequency**: Quarterly (post-launch), Ad-hoc (pre-launch)
- **Threshold**: Acceptance ≥ 75% (recommended)
- **Action**: If acceptance < 75%, trigger rollback to substage 15.1

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:656-659` "metrics: Price optimization | Revenue p"

**Governance Note**: Critique identifies missing threshold values as a gap (Priority 2 improvement).

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-15.md:37-39` "Missing: Threshold values, measurement"

---

## Agent Collaboration Patterns

**Pattern #1: Independent Execution (Current State)**
- **Agents**: LEAD agent only
- **Collaboration**: None (single agent owns all substages)
- **Rationale**: Pricing strategy requires cohesive strategic thinking

**Pattern #2: Assisted Execution (Target State)**
- **Agents**: LEAD agent + AI assistant tools
- **Collaboration**: LEAD agent delegates data collection and analysis to AI tools
  - Competitor pricing scraping → Automated scraping tool
  - Revenue projection calculations → Automated spreadsheet/modeling tool
  - Scenario modeling → Monte Carlo simulation tool
- **Rationale**: Increase automation to 80% (from 20%) per critique Priority 1

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-15.md:31-34` "Current State: Manual process | Target"

**Pattern #3: Multi-Agent Execution (Future State)**
- **Agents**: LEAD agent + Financial Analyst agent + Market Research agent
- **Collaboration**: Specialized agents handle substages
  - Market Research agent → Substage 15.1 (competitor analysis, customer surveys)
  - Financial Analyst agent → Substage 15.3 (revenue projections, scenario modeling)
  - LEAD agent → Substage 15.2 (pricing model, tiers) + overall approval
- **Rationale**: Further automation and specialization for complex pricing scenarios

---

## Error Handling & Recovery

**Error #1: Entry Gate Failure (Cost Structure Missing)**
- **Detection**: Entry gate validation fails in `validate_stage_15_entry_gates()`
- **Recovery**: Halt Stage 15, escalate to Stage 14 owner, wait for cost structure
- **Logging**: Record blocker in Stage 15 execution log
- **Retry**: Automatic retry after cost structure becomes available

**Error #2: Competitor Pricing Scraping Failure**
- **Detection**: Task 15.1 fails to collect competitor pricing data
- **Recovery**: Fallback to manual competitor research OR use third-party data providers
- **Logging**: Record scraping failure and fallback method
- **Retry**: Manual process (no automatic retry)

**Error #3: Low Survey Response Rate**
- **Detection**: Task 15.1 collects < 100 survey responses
- **Recovery**: Either extend survey timeline OR use competitor pricing as proxy (with justification)
- **Logging**: Record sample size and justification for proceeding
- **Retry**: Extend survey distribution timeline (one retry)

**Error #4: LEAD Approval Denied**
- **Detection**: `lead_approval_callback()` returns False
- **Recovery**: Return to substage 15.2, revise pricing model, re-submit for approval
- **Logging**: Record LEAD feedback and revision iteration number
- **Retry**: Unlimited retries until approval (with mandatory revisions)

**Error #5: Exit Gate Failure (Projections Invalid)**
- **Detection**: Exit gate validation fails in `validate_stage_15_exit_gates()`
- **Recovery**: Return to substage 15.3, revise projections based on validation errors
- **Logging**: Record validation failure reason and revision iteration
- **Retry**: Automatic retry after revisions (maximum 3 iterations, then escalate)

---

## Automation Roadmap

**Current State**: 20% automation (manual pricing research and model development)

**Phase 1: Automated Data Collection (30% automation)**
- **Timeline**: 3 months
- **Actions**:
  - Implement competitor pricing scraping (web scraping or API integration)
  - Automate survey distribution (email automation, SurveyMonkey API)
  - Automate data aggregation (Python scripts for data processing)
- **Impact**: Reduce manual effort in substage 15.1 by 50%

**Phase 2: Automated Financial Modeling (60% automation)**
- **Timeline**: 6 months
- **Actions**:
  - Integrate with pricing SaaS platforms (PriceIntelligently, Profitwell)
  - Automate revenue projection spreadsheets (Excel formulas, Python openpyxl)
  - Implement Monte Carlo simulations for scenario modeling (Python, R)
- **Impact**: Reduce manual effort in substages 15.2 and 15.3 by 70%

**Phase 3: AI-Driven Pricing Optimization (80% automation)**
- **Timeline**: 12 months
- **Actions**:
  - Implement AI-assisted pricing recommendations (machine learning models)
  - Automate A/B testing framework (for post-launch pricing optimization)
  - Implement dynamic pricing (real-time price adjustments based on market data)
- **Impact**: Achieve 80% automation target (per critique Priority 1)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:688` "progression_mode: Manual → Assisted → A"

---

## Governance Artifacts

**Artifact #1: Pricing Strategy Approval Record**
- **Purpose**: Document LEAD approval of pricing model
- **Format**: Digital signature or approval log entry
- **Storage**: Stage 15 execution history database
- **Retention**: Permanent (for audit trail)

**Artifact #2: Customer Validation Report** (Optional)
- **Purpose**: Document customer feedback on pricing tiers
- **Format**: PDF report with survey results and focus group notes
- **Storage**: Stage 15 outputs directory
- **Retention**: 2 years (for reference in pricing adjustments)

**Artifact #3: Financial Targets Record**
- **Purpose**: Document approved revenue targets and KPIs
- **Format**: Markdown or Excel with quarterly/annual targets
- **Storage**: Financial planning system (shared with Stage 16+)
- **Retention**: Permanent (for performance tracking)

**Artifact #4: Rollback Decision Log**
- **Purpose**: Document rollback triggers and resolutions
- **Format**: Structured log entries (trigger, root cause, substage, resolution)
- **Storage**: Stage 15 execution history database
- **Retention**: Permanent (for continuous improvement)

---

## Continuous Improvement

**Improvement #1: Automation Level Tracking**
- **Metric**: % of Stage 15 tasks automated (target: 80%)
- **Measurement**: Track manual hours vs. automated hours per substage
- **Frequency**: Quarterly review
- **Owner**: LEAD agent

**Improvement #2: Pricing Accuracy Tracking**
- **Metric**: Actual revenue vs. projected revenue (% variance)
- **Measurement**: Compare actual ARR to projected ARR from substage 15.3
- **Frequency**: Quarterly (first 2 years), Annual (thereafter)
- **Owner**: LEAD agent + Financial team

**Improvement #3: Customer Feedback Integration**
- **Metric**: Customer satisfaction with pricing (NPS, survey scores)
- **Measurement**: Quarterly pricing perception surveys
- **Frequency**: Quarterly (ongoing)
- **Owner**: LEAD agent + Customer Success team

**Improvement #4: Rollback Frequency Tracking**
- **Metric**: Number of rollbacks per year (target: ≤ 1)
- **Measurement**: Count rollback triggers in Stage 15 execution logs
- **Frequency**: Annual review
- **Owner**: LEAD agent

---

**Document Metadata**:
- **Generated**: 2025-11-05
- **Source Commit**: EHG_Engineer@6ef8cf4
- **Stage Version**: stages.yaml lines 643-688
- **Critique Version**: stage-15.md (Priority 1: Automation)
- **Phase**: 7 (Contract Specification)

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
