# Stage 8 Dependency Graph & Workflow Position

## Visual Workflow Position

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PLAN PHASE                                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                        ┌───────────────────────┐
                        │   Stage 7             │
                        │ Comprehensive Planning│
                        │ (Resource/Timeline)   │
                        └───────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ EXEC PHASE ENTRY POINT                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                        ┌───────────────────────┐
                        │   ★ Stage 8 ★         │
                        │ Problem Decomposition │
                        │   (This Stage)        │
                        │                       │
                        │ • WBS Creation        │
                        │ • Task Breakdown      │
                        │ • Dependency Mapping  │
                        └───────────────────────┘
                                    ↓
                        ┌───────────────────────┐
                        │   Stage 9             │
                        │ Detailed Design       │
                        │ (Architecture/UI)     │
                        └───────────────────────┘
                                    ↓
                        ┌───────────────────────┐
                        │   Stage 10            │
                        │ Technical Review      │
                        │ (Feasibility Check)   │
                        └───────────────────────┘
                                    ↓
                            [Continues...]
```

## Upstream Dependencies

| Stage | Title | Provides to Stage 8 | Criticality | Evidence |
|-------|-------|---------------------|-------------|----------|
| **7** | **Comprehensive Planning** | Business plan, Technical requirements, Complexity assessment | **BLOCKING** | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:323-324 "depends_on: - 7"` |

**Dependency Analysis**:
- **Stage 7 outputs required**: Business plan (scope definition), Technical requirements (constraints), Complexity assessment (decomposition strategy)
- **Cannot proceed without**: Approved plans, defined scope (entry gates)
- **Handoff format**: Structured planning documents with resource allocations and timeline constraints

## Downstream Dependents

| Stage | Title | Receives from Stage 8 | Impact Level | Evidence |
|-------|-------|----------------------|--------------|----------|
| **9** | **Detailed Design** | Decomposed tasks, WBS, Dependencies map | **BLOCKING** | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:187 "Downstream Impact: Stages 9"` |
| **10+** | **All EXEC Stages** | Task structure, Critical path, Execution sequence | **HIGH** | Implied by EXEC phase gating |

**Impact Analysis**:
- **Stage 9 dependency**: Requires WBS to structure design tasks
- **All execution stages**: Depend on task decomposition for work planning
- **Critical path**: Stage 8 gates entire EXEC phase execution

## Recursion Flows

### Inbound Recursion (Triggers TO Stage 8)

```
┌───────────────────────────────────────────────────────────────────────┐
│ PRIMARY RECURSION SOURCE                                              │
└───────────────────────────────────────────────────────────────────────┘

Stage 10 (Technical Review)  ──[TECH-001: Blocking Issues]──> Stage 8
                                        ↑
                                   HIGH Severity
                              Chairman Approval Required
                              Re-decompose with technical constraints

┌───────────────────────────────────────────────────────────────────────┐
│ SECONDARY RECURSION SOURCES                                           │
└───────────────────────────────────────────────────────────────────────┘

Stage 14 (Dev Prep)   ──[TECH-001: Complexity Issues]──> Stage 8
                                  ↑
                             HIGH Severity
                        Chairman Approval Required

Stage 22 (Iterative Dev) ──[TECH-001: Arch Limitations]──> Stage 8
                                  ↑
                           MEDIUM Severity
                             Advisory Only
```

**Evidence**:
- Primary trigger: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:38 "Stage 10: TECH-001: Blocking technical issues: HIGH"`
- Secondary triggers: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:39-40 "Stage 14, Stage 22 TECH-001"`

### Outbound Recursion (Triggers FROM Stage 8)

```
Stage 8  ──[RESOURCE-001: Resource Shortage]──> Stage 7
              ↑
         HIGH Severity
    Planning assumptions incorrect

Stage 8  ──[TIMELINE-001: Timeline Exceeded]──> Stage 7
              ↑
        MEDIUM Severity
    Comprehensive Planning needs adjustment
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:59-63 "Recursion Triggers FROM This Stage"`

## Workflow Position Characteristics

### Phase Boundary Role
- **Position**: First stage in EXEC phase
- **Significance**: Converts PLAN outputs into EXEC inputs
- **Gating Effect**: All execution stages blocked until WBS complete

### Critical Path Analysis
- **On Critical Path**: YES
- **Parallel Execution**: NO (sequential dependency from Stage 7)
- **Bottleneck Risk**: HIGH (manual process, limited automation)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:188 "Critical Path: Yes"`

### Data Flow Characteristics
- **Input Volume**: 3 document types from Stage 7
- **Output Volume**: 3 structured artifacts (tasks, WBS, dependencies)
- **Transformation Complexity**: HIGH (unstructured → structured)
- **Validation Requirements**: Entry gates (2), Exit gates (3)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:325-344 "inputs/outputs/gates"`

## Inter-Stage Communication

### Data Exchange Format
- **Input Format**: Business plan documents, technical requirement specs, complexity assessments (unstructured)
- **Output Format**: WBS JSON structure, task hierarchy tree, dependency graph (structured)
- **Schema Requirements**: Defined in File 08 (Configurability Matrix)

### Handoff Protocols
- **Entry Handoff**: Stage 7 → Stage 8 (planning documents approved)
- **Exit Handoff**: Stage 8 → Stage 9 (WBS validated, dependencies resolved)
- **Recursion Handoff**: Stage 10 → Stage 8 (technical blockers with suggested fixes)

### Synchronization Points
- **Checkpoint 1**: Scope definition approved (Stage 7 exit → Stage 8 entry)
- **Checkpoint 2**: WBS v1 complete (Stage 8.2 → Stage 8.3)
- **Checkpoint 3**: Dependencies mapped (Stage 8 exit → Stage 9 entry)
- **Checkpoint 4**: Technical review complete (Stage 10 → potential Stage 8 recursion)

## Parallel Execution Opportunities

**Current State**: Sequential execution (no parallelization)

**Potential Parallelization**:
- **Substage 8.1 + 8.2**: Problem analysis could overlap with initial task breakdown
- **Substage 8.3**: Dependency mapping could use automated analysis while manual review continues

**Constraints**:
- WBS must be complete before dependency mapping
- Technical feasibility checks required before finalization
- Chairman approval serializes recursion flows

**Recommendation**: Add automated WBS generation (Gap #6) to enable parallel validation

## Sources Table

| Claim | Source | Evidence |
|-------|--------|----------|
| Depends on Stage 7 | stages.yaml:323-324 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:323-324 "depends_on: - 7"` |
| Downstream impact: Stage 9+ | critique:187 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:187 "Downstream Impact: Stages 9"` |
| Critical path: Yes | critique:188 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:188 "Critical Path: Yes"` |
| Primary trigger: Stage 10 TECH-001 | critique:38 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:38 "Stage 10: TECH-001: Blocking technical issues: HIGH"` |
| Outbound triggers: RESOURCE-001, TIMELINE-001 | critique:59-63 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:59-63 "Target Stage 7"` |
| 3 inputs defined | stages.yaml:325-328 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:325-328 "inputs: Business plan, Technical requirements, Complexity assessment"` |
| 3 outputs defined | stages.yaml:329-332 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:329-332 "outputs: Decomposed tasks, WBS, Dependencies map"` |

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
