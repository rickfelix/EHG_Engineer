# Stage 7: Canonical Definition


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, security, validation, infrastructure

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:274-319

---

## Full YAML Definition

```yaml
- id: 7
  title: Comprehensive Planning Suite
  description: Develop comprehensive business and technical plans for venture execution.
  depends_on:
    - 6
  inputs:
    - Risk assessment
    - Resource requirements
    - Timeline constraints
  outputs:
    - Business plan
    - Technical roadmap
    - Resource plan
  metrics:
    - Plan completeness
    - Timeline feasibility
    - Resource efficiency
  gates:
    entry:
      - Risks evaluated
      - Resources identified
    exit:
      - Business plan approved
      - Technical roadmap set
      - Resources allocated
  substages:
    - id: '7.1'
      title: Business Planning
      done_when:
        - Business model defined
        - Go-to-market planned
        - Operations designed
    - id: '7.2'
      title: Technical Planning
      done_when:
        - Architecture designed
        - Tech stack selected
        - Development roadmap created
    - id: '7.3'
      title: Resource Planning
      done_when:
        - Team requirements defined
        - Budget allocated
        - Timeline set
  notes:
    progression_mode: Manual → Assisted → Auto (suggested)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:274-319 "id: 7...progression_mode"

---

## Field-by-Field Breakdown

### Core Metadata

**id**: 7
- **Type**: Integer
- **Purpose**: Unique stage identifier in workflow
- **Usage**: Referenced by Stage 8 (depends_on: [7])

**title**: Comprehensive Planning Suite
- **Type**: String
- **Purpose**: Human-readable stage name
- **Interpretation**: Creates ALL plans needed for execution (business + technical + resource)

**description**: Develop comprehensive business and technical plans for venture execution.
- **Type**: String
- **Purpose**: Explains stage objective
- **Key Term**: "comprehensive" = business + technical + resource (all 3 substages)

---

### Dependencies

**depends_on**: [6]
- **Type**: Array of integers
- **Purpose**: Defines upstream dependencies
- **Constraint**: Stage 7 cannot start until Stage 6 (Risk Evaluation) is complete
- **Reasoning**: Risk assessment informs resource requirements and timeline constraints

---

### Inputs (from Stage 6)

**inputs**: [Risk assessment, Resource requirements, Timeline constraints]

1. **Risk assessment**: Identified risks with severity, mitigation strategies, compliance requirements
2. **Resource requirements**: Initial resource estimates based on risk mitigation (e.g., security experts needed)
3. **Timeline constraints**: Risk-adjusted timeline (e.g., GDPR compliance deadline)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:279-282 "inputs: Risk assessment"

---

### Outputs (to Stages 8, 9, 10)

**outputs**: [Business plan, Technical roadmap, Resource plan]

1. **Business plan**: Business model, go-to-market strategy, operations design (Substage 7.1)
2. **Technical roadmap**: Architecture, tech stack, development milestones (Substage 7.2)
3. **Resource plan**: Team requirements, budget allocation, timeline (Substage 7.3)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:283-286 "outputs: Business plan"

---

### Metrics

**metrics**: [Plan completeness, Timeline feasibility, Resource efficiency]

1. **Plan completeness**: % of required sections completed in business/technical/resource plans
2. **Timeline feasibility**: Whether timeline is realistic (validated by Stage 10 Technical Review)
3. **Resource efficiency**: Budget/team size vs benchmarks for similar ventures

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:287-290 "metrics: Plan completeness"

**Status**: ⚠️ Not Implemented (critique notes "threshold values, measurement frequency" missing)

---

### Entry Gates

**entry**: [Risks evaluated, Resources identified]

1. **Risks evaluated**: Stage 6 completed, risk register populated
2. **Resources identified**: Initial resource estimates available (from Stage 6)

**Purpose**: Ensure Stage 7 has necessary inputs before starting

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:292-294 "entry: Risks evaluated"

---

### Exit Gates

**exit**: [Business plan approved, Technical roadmap set, Resources allocated]

1. **Business plan approved**: Chairman/stakeholder approval of business model and go-to-market
2. **Technical roadmap set**: Architecture decisions finalized, tech stack selected
3. **Resources allocated**: Team hired/assigned, budget locked, timeline committed

**Purpose**: Ensure Stage 7 outputs are complete before advancing to Stage 8

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:295-298 "exit: Business plan approved"

---

### Substages

#### Substage 7.1: Business Planning

**done_when**:
- Business model defined (revenue streams, cost structure, value proposition)
- Go-to-market planned (customer acquisition, pricing, sales channels)
- Operations designed (processes, org structure, key partnerships)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:300-305 "id: '7.1', title: Business Planning"

---

#### Substage 7.2: Technical Planning

**done_when**:
- Architecture designed (system components, data flow, integrations)
- Tech stack selected (frontend, backend, database, infrastructure)
- Development roadmap created (milestones, releases, dependencies)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:306-311 "id: '7.2', title: Technical Planning"

---

#### Substage 7.3: Resource Planning

**done_when**:
- Team requirements defined (roles, skills, seniority levels)
- Budget allocated (salaries, infrastructure, tools, contingency)
- Timeline set (milestones, deliverable dates, buffer time)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:312-317 "id: '7.3', title: Resource Planning"

---

### Notes

**progression_mode**: Manual → Assisted → Auto (suggested)

**Interpretation**:
- **Manual**: Human Chairman creates business/technical/resource plans
- **Assisted**: AI generates draft plans, human reviews/approves
- **Auto**: AI generates plans automatically, only flagging high-risk decisions for approval

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:318-319 "progression_mode: Manual → Assisted"

---

## Comparison with Critique Assessment

| YAML Field | Critique Score | Notes |
|------------|----------------|-------|
| **Clarity** | 4/5 | Well-defined purpose and outputs |
| **Feasibility** | 3/5 | Requires significant resources |
| **Metrics** | 3/5 | Defined but validation criteria unclear |
| **Automation** | 3/5 | Partial automation possible (currently Manual) |
| **Overall** | 2.9/5 | Functional but needs optimization |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:3-15 "Clarity 4, Feasibility 3, Overall 2.9"

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Full YAML | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 274-319 |
| Critique scores | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 3-15 |

---

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
