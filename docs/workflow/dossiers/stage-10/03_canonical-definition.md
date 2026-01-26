# Stage 10: Canonical Definition


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: security, validation, architecture, workflow

**Source**: stages.yaml (single source of truth)
**Lines**: 410-460

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:410-460 "id: 10, Comprehensive Technical Review"

---

## Full YAML Definition

```yaml
- id: 10
  title: Comprehensive Technical Review
  description: Validate technical architecture and implementation feasibility.
  depends_on:
    - 9
  inputs:
    - Technical requirements
    - Architecture design
    - Resource constraints
  outputs:
    - Technical review report
    - Architecture validation
    - Implementation plan
  metrics:
    - Technical debt score
    - Scalability rating
    - Security score
  gates:
    entry:
      - Architecture designed
      - Requirements defined
    exit:
      - Architecture approved
      - Feasibility confirmed
      - Tech debt acceptable
  substages:
    - id: '10.1'
      title: Architecture Review
      done_when:
        - Design validated
        - Patterns approved
        - Standards met
    - id: '10.2'
      title: Scalability Assessment
      done_when:
        - Load projections validated
        - Scaling strategy defined
    - id: '10.3'
      title: Security Review
      done_when:
        - Security assessment complete
        - Compliance verified
        - Risks mitigated
    - id: '10.4'
      title: Implementation Planning
      done_when:
        - Development approach set
        - Timeline validated
        - Resources confirmed
  notes:
    progression_mode: Manual → Assisted → Auto (suggested)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:410-460 "Full YAML block"

---

## Field-by-Field Analysis

### Basic Attributes

| Field | Value | Notes |
|-------|-------|-------|
| **id** | 10 | Final stage of Ideation phase (Stages 1-10) |
| **title** | Comprehensive Technical Review | Critical technical quality gate |
| **description** | Validate technical architecture and implementation feasibility | Focus on architecture, scalability, security, implementation planning |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:410-412 "id: 10, title, description"

---

### Dependencies

**depends_on**: `[9]`

- Stage 9: Resource Allocation & Capacity Planning
- Requires resource constraints and capacity planning outputs before technical review

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:413-414 "depends_on: [9]"

---

### Inputs (3)

1. **Technical requirements**: From upstream stages (particularly Stage 8 WBS)
2. **Architecture design**: Architecture designed (from entry gate)
3. **Resource constraints**: From Stage 9 capacity planning

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:415-418 "inputs: Technical requirements"

---

### Outputs (3)

1. **Technical review report**: Comprehensive assessment of architecture, scalability, security
2. **Architecture validation**: Formal approval/rejection with issues documented
3. **Implementation plan**: Development approach, timeline, resource allocation validated

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:419-422 "outputs: Technical review report"

---

### Metrics (3)

1. **Technical debt score**: 0-100 scale (>70 triggers recursion advisory)
2. **Scalability rating**: 5-star rating for load handling capability
3. **Security score**: 0-100 scale (<60 triggers HIGH severity recursion)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:423-426 "metrics: Technical debt score"

---

### Gates

**Entry Gates (2)**:
1. Architecture designed
2. Requirements defined

**Exit Gates (3)**:
1. Architecture approved
2. Feasibility confirmed
3. Tech debt acceptable

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:427-434 "gates: entry, exit"

---

### Substages (4)

#### 10.1: Architecture Review

**Done When**:
- Design validated
- Patterns approved
- Standards met

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:436-441 "id: '10.1', Architecture Review"

---

#### 10.2: Scalability Assessment

**Done When**:
- Load projections validated
- Scaling strategy defined

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:442-446 "id: '10.2', Scalability Assessment"

---

#### 10.3: Security Review

**Done When**:
- Security assessment complete
- Compliance verified
- Risks mitigated

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:447-452 "id: '10.3', Security Review"

---

#### 10.4: Implementation Planning

**Done When**:
- Development approach set
- Timeline validated
- Resources confirmed

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:453-458 "id: '10.4', Implementation Planning"

---

### Notes

**progression_mode**: Manual → Assisted → Auto (suggested)

**Interpretation**:
- **Manual**: Initial implementation requires human technical review
- **Assisted**: AI-powered analysis with human validation
- **Auto**: Fully automated technical validation (future state)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:459-460 "progression_mode: Manual → Assisted → Auto"

---

## Consistency Check

**Inputs/Outputs Alignment**: ✅ Pass
- 3 inputs map to 3 outputs (technical requirements → technical review report, architecture design → architecture validation, resource constraints → implementation plan)

**Metrics Alignment**: ✅ Pass
- 3 metrics directly support exit gate "Tech debt acceptable" (technical debt score, scalability rating, security score)

**Substages Coverage**: ✅ Pass
- 4 substages cover all technical review domains (architecture, scalability, security, implementation)

**Dependencies Valid**: ✅ Pass
- Stage 9 is valid upstream dependency (provides resource constraints input)

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
