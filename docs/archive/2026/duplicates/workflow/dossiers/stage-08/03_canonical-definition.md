<!-- ARCHIVED: 2026-01-26T16:26:39.742Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-08\03_canonical-definition.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 8 Canonical Definition (from stages.yaml)


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: schema, guide, validation, reference

## Full YAML Definition

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:320-364`

```yaml
- id: 8
  title: Problem Decomposition Engine
  description: Break down complex problems into manageable, actionable components.
  depends_on:
    - 7
  inputs:
    - Business plan
    - Technical requirements
    - Complexity assessment
  outputs:
    - Decomposed tasks
    - Work breakdown structure
    - Dependencies map
  metrics:
    - Decomposition depth
    - Task clarity
    - Dependency resolution
  gates:
    entry:
      - Plans approved
      - Scope defined
    exit:
      - Problems decomposed
      - Tasks prioritized
      - Dependencies mapped
  substages:
    - id: '8.1'
      title: Problem Analysis
      done_when:
        - Core problems identified
        - Complexity assessed
    - id: '8.2'
      title: Task Breakdown
      done_when:
        - Tasks decomposed
        - Subtasks defined
        - WBS created
    - id: '8.3'
      title: Dependency Mapping
      done_when:
        - Dependencies identified
        - Critical path defined
        - Blockers resolved
  notes:
    progression_mode: Manual → Assisted → Auto (suggested)
```

## Definition Analysis

### Core Attributes

| Attribute | Value | Line Reference | Notes |
|-----------|-------|----------------|-------|
| **ID** | 8 | 320 | Unique stage identifier |
| **Title** | Problem Decomposition Engine | 321 | Machine-processable name |
| **Description** | Break down complex problems into manageable, actionable components | 322 | Human-readable purpose |
| **Depends On** | [7] | 323-324 | Single upstream dependency (Comprehensive Planning) |
| **Progression Mode** | Manual → Assisted → Auto (suggested) | 364 | Evolution path for automation |

### Inputs (3 defined)

| # | Input | Source Stage | Format | Line Reference |
|---|-------|--------------|--------|----------------|
| 1 | Business plan | Stage 7 | Document | 326 |
| 2 | Technical requirements | Stage 7 | Specification | 327 |
| 3 | Complexity assessment | Stage 7 | Analysis report | 328 |

**Input Characteristics**:
- All inputs from single upstream stage (Stage 7)
- Mix of structured (requirements) and unstructured (business plan) formats
- Complexity assessment guides decomposition strategy

### Outputs (3 defined)

| # | Output | Consumed By | Format | Line Reference |
|---|--------|-------------|--------|----------------|
| 1 | Decomposed tasks | Stage 9+ | Task list | 330 |
| 2 | Work breakdown structure | Stage 9+ | Hierarchical tree | 331 |
| 3 | Dependencies map | Stage 9+ | Directed graph | 332 |

**Output Characteristics**:
- Structured outputs (vs unstructured inputs)
- WBS is primary artifact (tasks + dependencies are derived)
- All execution stages depend on these outputs

### Metrics (3 defined)

| # | Metric | Type | Line Reference | Threshold Defined? |
|---|--------|------|----------------|-------------------|
| 1 | Decomposition depth | Structural | 334 | NO (Gap #1) |
| 2 | Task clarity | Quality | 335 | NO (Gap #1) |
| 3 | Dependency resolution | Completeness | 336 | NO (Gap #1) |

**Metrics Characteristics**:
- Mix of structural, quality, and completeness metrics
- No thresholds defined in YAML (see File 09 for proposed targets)
- No measurement frequency specified (Gap #2)

### Quality Gates

#### Entry Gates (2 conditions)

| # | Gate Condition | Validates | Line Reference |
|---|----------------|-----------|----------------|
| 1 | Plans approved | Stage 7 exit gate passed | 339 |
| 2 | Scope defined | Boundary conditions clear | 340 |

**Entry Gate Analysis**:
- Both gates validate Stage 7 completion
- "Plans approved" = business + technical + resource/timeline plans
- "Scope defined" = clear boundaries for decomposition

#### Exit Gates (3 conditions)

| # | Gate Condition | Validates | Line Reference |
|---|----------------|-----------|----------------|
| 1 | Problems decomposed | Substage 8.1 complete | 342 |
| 2 | Tasks prioritized | Substage 8.2 complete | 343 |
| 3 | Dependencies mapped | Substage 8.3 complete | 344 |

**Exit Gate Analysis**:
- Maps 1:1 to substage completion
- Sequential validation (8.1 → 8.2 → 8.3)
- Gates entire EXEC phase execution

### Substages (3 defined)

#### Substage 8.1: Problem Analysis

```yaml
id: '8.1'
title: Problem Analysis
done_when:
  - Core problems identified
  - Complexity assessed
```

**Line Reference**: 346-350
**Purpose**: Identify and assess core problems before decomposition
**Completion Criteria**: 2 conditions (core problems identified, complexity assessed)
**Outputs**: Problem inventory, complexity ratings
**Estimated Duration**: 20% of total Stage 8 time

#### Substage 8.2: Task Breakdown

```yaml
id: '8.2'
title: Task Breakdown
done_when:
  - Tasks decomposed
  - Subtasks defined
  - WBS created
```

**Line Reference**: 351-356
**Purpose**: Decompose problems into hierarchical task structure
**Completion Criteria**: 3 conditions (tasks, subtasks, WBS)
**Outputs**: WBS v1 (initial decomposition)
**Estimated Duration**: 50% of total Stage 8 time
**Critical Substage**: Primary recursion target for TECH-001 triggers

#### Substage 8.3: Dependency Mapping

```yaml
id: '8.3'
title: Dependency Mapping
done_when:
  - Dependencies identified
  - Critical path defined
  - Blockers resolved
```

**Line Reference**: 357-362
**Purpose**: Map inter-task dependencies and resolve blocking issues
**Completion Criteria**: 3 conditions (dependencies, critical path, blockers)
**Outputs**: Dependency graph, critical path definition
**Estimated Duration**: 30% of total Stage 8 time

### Notes Section

**Progression Mode**: `Manual → Assisted → Auto (suggested)`

**Line Reference**: 364

**Interpretation**:
- **Manual** (current): Human-driven decomposition with no automation
- **Assisted** (near-term): AI-suggested WBS with human validation
- **Auto** (long-term): Fully automated decomposition with exception handling

**Implementation Path**:
1. Manual baseline (current state)
2. Add AI decomposition suggestions (Assisted)
3. Implement validation automation (Assisted+)
4. Full automation with human oversight (Auto)

**Target**: 80% automation (per critique line 161)

## Definition Completeness Assessment

| Category | Defined? | Completeness | Missing Elements |
|----------|----------|--------------|------------------|
| **Core Attributes** | YES | 100% | None |
| **Inputs** | YES | 70% | Data schemas, validation rules (Gap #2) |
| **Outputs** | YES | 70% | Data schemas, transformation logic (Gap #2) |
| **Metrics** | YES | 40% | Thresholds, measurement frequency (Gap #1) |
| **Quality Gates** | YES | 80% | Validation procedures (Gap #3) |
| **Substages** | YES | 90% | Agent assignments (Gap #5) |
| **Notes** | YES | 100% | Progression mode defined |

**Overall YAML Completeness**: 78% (Good foundation, needs operational detail)

## YAML Evolution Tracking

**Current Version**: v1.0 (initial definition)
**Last Modified**: Unknown (no version tracking in YAML)
**Change History**: Not tracked in YAML file

**Recommended Enhancements**:
1. Add `version` field to track YAML schema changes
2. Add `last_modified` timestamp
3. Add `owner` field (EXEC agent)
4. Add `automation_level` numeric field (1-5 scale)
5. Add `recursion_enabled` boolean field

**Proposed v2.0 YAML** (additions):
```yaml
- id: 8
  title: Problem Decomposition Engine
  version: 2.0                          # NEW
  last_modified: '2025-11-05'           # NEW
  owner: 'EXEC'                         # NEW
  automation_level: 3                   # NEW (1=manual, 5=fully auto)
  recursion_enabled: true               # NEW
  recursion_max_loops: 3                # NEW
  # ... existing fields ...
```

## Sources Table

| Claim | Source | Evidence |
|-------|--------|----------|
| Full YAML definition | stages.yaml:320-364 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:320-364 "Full Stage 8 definition"` |
| Stage ID: 8 | stages.yaml:320 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:320 "- id: 8"` |
| Title: Problem Decomposition Engine | stages.yaml:321 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:321 "title: Problem Decomposition Engine"` |
| Depends on Stage 7 | stages.yaml:323-324 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:323-324 "depends_on: - 7"` |
| 3 inputs defined | stages.yaml:325-328 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:325-328 "Business plan, Technical requirements, Complexity assessment"` |
| 3 outputs defined | stages.yaml:329-332 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:329-332 "Decomposed tasks, WBS, Dependencies map"` |
| 3 metrics defined | stages.yaml:333-336 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:333-336 "Decomposition depth, Task clarity, Dependency resolution"` |
| 2 entry gates | stages.yaml:338-340 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:338-340 "Plans approved, Scope defined"` |
| 3 exit gates | stages.yaml:341-344 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:341-344 "Problems decomposed, Tasks prioritized, Dependencies mapped"` |
| 3 substages | stages.yaml:345-362 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:345-362 "8.1, 8.2, 8.3"` |
| Progression mode | stages.yaml:364 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:364 "Manual → Assisted → Auto (suggested)"` |

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
