# Stage 8 Professional Standard Operating Procedure

## Purpose
This SOP defines the step-by-step execution procedure for Stage 8 (Problem Decomposition Engine), transforming approved comprehensive plans from Stage 7 into structured Work Breakdown Structures (WBS) with clear task hierarchies, dependencies, and execution sequences.

## Scope
- **Applies To**: EXEC agent executing Stage 8
- **Phase**: EXEC phase entry point (first stage after PLAN)
- **Upstream Dependency**: Stage 7 (Comprehensive Planning) must be complete
- **Downstream Impact**: All execution stages (9+) depend on Stage 8 outputs

## Prerequisites

### Entry Gate Validation
Before starting Stage 8, verify:

1. **Plans Approved** (Entry Gate 1)
   - Stage 7 exit gates passed
   - Business plan approved by Chairman
   - Technical requirements validated
   - Resource/timeline plans finalized
   - **Evidence Required**: Stage 7 completion timestamp in database

2. **Scope Defined** (Entry Gate 2)
   - Clear venture boundaries established
   - Constraints documented (budget, timeline, resources)
   - Success criteria defined
   - **Evidence Required**: Scope definition document from Stage 7

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:338-340 "entry: Plans approved, Scope defined"`

### Required Inputs
| Input | Source | Format | Validation |
|-------|--------|--------|------------|
| Business plan | Stage 7 | Document | Check for goals, scope, constraints |
| Technical requirements | Stage 7 | Specification | Check for functional/non-functional reqs |
| Complexity assessment | Stage 7 | Analysis report | Check for complexity scoring |

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:325-328`

### Required Resources
- EXEC agent with decomposition expertise
- Access to Stage 7 outputs database
- WBS creation tools (manual or assisted)
- Dependency mapping tools (graph visualization)

## Procedure

### Substage 8.1: Problem Analysis

**Objective**: Identify and assess core problems before decomposition

**Steps**:

1. **Review Business Plan**
   - Read business plan from Stage 7
   - Extract stated goals and objectives
   - Identify explicit problems to solve
   - **Time**: 30 minutes
   - **Output**: Problem inventory list

2. **Analyze Technical Requirements**
   - Review technical requirements from Stage 7
   - Identify technical challenges and constraints
   - Categorize requirements by complexity (high/medium/low)
   - **Time**: 45 minutes
   - **Output**: Technical challenge matrix

3. **Assess Complexity**
   - Review complexity assessment from Stage 7
   - Identify high-complexity areas requiring detailed breakdown
   - Determine decomposition strategy based on complexity
   - **Time**: 30 minutes
   - **Output**: Complexity heat map

4. **Identify Core Problems**
   - Synthesize business, technical, and complexity inputs
   - List 3-7 core problems to decompose
   - Prioritize by business impact and technical difficulty
   - **Time**: 30 minutes
   - **Output**: Core problems list (prioritized)
   - **Validation**: `done_when: Core problems identified` (stages.yaml:349)

5. **Complete Complexity Assessment**
   - For each core problem, assign complexity score (1-5)
   - Document complexity rationale
   - Flag problems requiring recursion risk (technical feasibility unclear)
   - **Time**: 30 minutes
   - **Output**: Complexity assessment report
   - **Validation**: `done_when: Complexity assessed` (stages.yaml:350)

**Substage 8.1 Duration**: 2.5 hours
**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:346-350`

---

### Substage 8.2: Task Breakdown

**Objective**: Decompose problems into hierarchical task structure (WBS v1)

**Steps**:

1. **Decompose Core Problems into Tasks**
   - For each core problem, create 3-10 high-level tasks
   - Ensure tasks are actionable and have clear outputs
   - Use verb-noun structure (e.g., "Design user authentication")
   - **Time**: 1 hour
   - **Output**: High-level task list (Level 1)
   - **Validation**: `done_when: Tasks decomposed` (stages.yaml:354)

2. **Define Subtasks**
   - For each high-level task, create 2-5 subtasks
   - Target 3-5 levels of WBS depth (per proposed metric threshold)
   - Ensure subtasks are atomic (can be assigned to single developer)
   - **Time**: 2 hours
   - **Output**: Subtask hierarchy (Levels 2-3)
   - **Validation**: `done_when: Subtasks defined` (stages.yaml:355)
   - **Gap**: No task granularity guidelines defined (Gap #9)

3. **Create Work Breakdown Structure (WBS)**
   - Organize tasks/subtasks into hierarchical tree
   - Assign unique IDs to each WBS element (e.g., 1.1.1)
   - Document task descriptions, outputs, acceptance criteria
   - **Time**: 1.5 hours
   - **Output**: WBS v1 (structured document)
   - **Format**: JSON or hierarchical outline
   - **Validation**: `done_when: WBS created` (stages.yaml:356)

4. **Estimate Task Effort**
   - For each atomic task, estimate effort (hours or story points)
   - Roll up estimates to calculate total project effort
   - Compare against Stage 7 timeline constraints
   - **Time**: 1 hour
   - **Output**: Effort estimates per task
   - **Gap**: No estimation methodology defined

5. **Assign Task Priorities**
   - Prioritize tasks by business value and technical dependencies
   - Use MoSCoW method (Must/Should/Could/Won't)
   - **Time**: 30 minutes
   - **Output**: Prioritized task list
   - **Validation**: Exit gate "Tasks prioritized" (stages.yaml:343)

**Substage 8.2 Duration**: 6 hours (50% of total Stage 8 time)
**Critical Note**: This substage is the primary target for TECH-001 recursion from Stage 10
**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:351-356`

---

### Substage 8.3: Dependency Mapping

**Objective**: Map inter-task dependencies and resolve blocking issues

**Steps**:

1. **Identify Task Dependencies**
   - For each task, identify prerequisite tasks (must finish before this starts)
   - Document dependency type (finish-to-start, start-to-start, etc.)
   - Create dependency matrix or directed graph
   - **Time**: 1.5 hours
   - **Output**: Dependency graph (directed acyclic graph)
   - **Validation**: `done_when: Dependencies identified` (stages.yaml:360)

2. **Define Critical Path**
   - Calculate critical path through dependency graph
   - Identify tasks on critical path (zero slack time)
   - Calculate total project duration based on critical path
   - **Time**: 1 hour
   - **Output**: Critical path definition, project timeline
   - **Validation**: `done_when: Critical path defined` (stages.yaml:361)
   - **Tool**: Critical Path Method (CPM) algorithm

3. **Identify Blockers**
   - Review dependencies for circular dependencies (deadlocks)
   - Identify resource conflicts (same resource needed for parallel tasks)
   - Flag tasks with missing prerequisites
   - **Time**: 45 minutes
   - **Output**: Blocker list with severity ratings

4. **Resolve Blockers**
   - For each blocker, determine resolution strategy:
     - Resequence tasks to break circular dependencies
     - Split tasks to resolve resource conflicts
     - Add prerequisite tasks if missing
   - Document blocker resolution in WBS
   - **Time**: 1 hour
   - **Output**: Updated WBS v1 with blocker resolutions
   - **Validation**: `done_when: Blockers resolved` (stages.yaml:362)

5. **Check Timeline Feasibility**
   - Compare calculated project duration vs Stage 7 timeline constraints
   - If exceeds timeline, trigger TIMELINE-001 recursion to Stage 7
   - **Time**: 30 minutes
   - **Output**: Timeline feasibility report
   - **Recursion Trigger**: `TIMELINE-001` if duration exceeds constraints
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:63 "TIMELINE-001: Task breakdown exceeds timeline constraints"`

6. **Check Resource Feasibility**
   - Estimate resource requirements based on task effort and timeline
   - Compare against Stage 7 resource allocations
   - If exceeds resources, trigger RESOURCE-001 recursion to Stage 7
   - **Time**: 30 minutes
   - **Output**: Resource feasibility report
   - **Recursion Trigger**: `RESOURCE-001` if resources insufficient
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62 "RESOURCE-001: Decomposition reveals resource shortage"`

**Substage 8.3 Duration**: 5 hours (30% of total Stage 8 time)
**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:357-362`

---

### Exit Gate Validation

Before proceeding to Stage 9, verify:

1. **Problems Decomposed** (Exit Gate 1)
   - All core problems from 8.1 have corresponding WBS tasks
   - No problems left unaddressed
   - **Validation Query**: Check that all items in problem inventory have linked WBS tasks
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:342`

2. **Tasks Prioritized** (Exit Gate 2)
   - All tasks have priority assignments (MoSCoW)
   - Priority rationale documented
   - **Validation Query**: Check that all WBS tasks have priority field populated
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:343`

3. **Dependencies Mapped** (Exit Gate 3)
   - All task dependencies documented in dependency graph
   - Critical path defined
   - Blockers resolved
   - **Validation Query**: Check that dependency graph is complete and acyclic
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:344`

### Metrics Validation

Measure and record:

| Metric | Measurement | Target Threshold | Pass/Fail |
|--------|-------------|------------------|-----------|
| **Decomposition Depth** | Count WBS levels | 3-5 levels | Check within range |
| **Task Clarity** | % tasks with acceptance criteria | >95% | Calculate percentage |
| **Dependency Resolution** | % dependencies mapped | 100% | Verify completeness |

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:333-336 "metrics"`
**Gap Note**: Thresholds not in YAML, proposed here (Gap #1)

## Outputs

At Stage 8 completion, deliver:

1. **Decomposed Tasks**
   - Format: Prioritized task list (CSV or JSON)
   - Contents: Task ID, description, priority, effort estimate, acceptance criteria
   - Storage: Database table `venture_tasks`

2. **Work Breakdown Structure (WBS)**
   - Format: Hierarchical tree (JSON)
   - Contents: Task hierarchy, IDs, descriptions, outputs
   - Storage: Database table `venture_wbs`
   - Version: v1 (baseline WBS before recursion)

3. **Dependencies Map**
   - Format: Directed acyclic graph (JSON)
   - Contents: Task dependencies, critical path, project timeline
   - Storage: Database table `venture_dependencies`

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:329-332`

## Recursion Handling

### Receiving TECH-001 from Stage 10 (Primary Recursion)

If Stage 10 Technical Review identifies blocking technical issues:

1. **Receive Recursion Trigger**
   - Recursion type: TECH-001
   - Severity: HIGH
   - Approval: Chairman approval required
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:38 "Stage 10: TECH-001: Blocking technical issues: HIGH"`

2. **Preserve Original WBS**
   - Save WBS v1 for comparison and learning
   - Store in `venture_wbs_history` table with version tag
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:45 "Preserve Original Decomposition: Keep WBS v1"`

3. **Re-decompose with Technical Constraints**
   - Incorporate technical feasibility insights from Stage 10
   - Break down technical blockers into smaller sub-tasks
   - Combine tasks that share technical dependencies
   - Resequence based on technical prerequisites
   - **Time**: Repeat Substage 8.2 (6 hours)
   - **Output**: WBS v2
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:46-53`

4. **Update Dependency Map**
   - Recalculate critical path with new task structure
   - Update dependency graph
   - **Time**: Repeat Substage 8.3 (5 hours)
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:54`

5. **Generate Comparison Analysis**
   - Show delta between WBS v1 and v2
   - Highlight: tasks added (green), tasks modified (yellow), tasks removed (red)
   - Document rationale for changes
   - **Output**: WBS comparison report
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:55 "Comparison Analysis: Show delta"`

6. **Submit for Chairman Approval**
   - Present WBS v1 vs v2 comparison
   - Show blocking issues that triggered recursion
   - Recommend approval or scope modification
   - **Decision Options**: Approve v2, Modify scope, Reject recursion
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:118-126`

### Triggering Recursion to Stage 7

If decomposition reveals resource or timeline issues:

1. **RESOURCE-001 Trigger**
   - Condition: Task breakdown reveals resource shortage
   - Severity: HIGH
   - Target: Stage 7 (Comprehensive Planning)
   - **Action**: Return to Stage 7 to adjust resource allocations
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62`

2. **TIMELINE-001 Trigger**
   - Condition: Task breakdown exceeds timeline constraints
   - Severity: MEDIUM
   - Target: Stage 7 (Comprehensive Planning)
   - **Action**: Return to Stage 7 to extend timeline or reduce scope
   - **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:63`

### Loop Prevention

- **Max Recursions**: 3 returns to Stage 8 per venture
- **After 3rd TECH-001**: Chairman must decide to continue with simplified scope, kill venture, acquire expertise, or pivot approach
- **Tracking**: Log each recursion in `recursion_events` table with WBS snapshots
- **Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:109-115`

## Common Issues and Resolutions

| Issue | Symptoms | Root Cause | Resolution |
|-------|----------|------------|------------|
| **WBS Too Shallow** | <3 levels | Insufficient decomposition | Break down high-level tasks further |
| **WBS Too Deep** | >5 levels | Over-engineering | Combine low-level tasks |
| **Circular Dependencies** | Deadlock in critical path | Logical error | Resequence tasks, break dependency cycle |
| **Timeline Exceeds Constraints** | Critical path > Stage 7 timeline | Underestimated complexity | Trigger TIMELINE-001 to Stage 7 |
| **Resource Shortage** | Parallel tasks exceed available resources | Resource conflict | Trigger RESOURCE-001 to Stage 7 or resequence |
| **Unclear Acceptance Criteria** | <95% tasks have criteria | Rushed task definition | Revisit Substage 8.2 Step 3 |

## Roles and Responsibilities

| Role | Responsibility | Time Commitment |
|------|----------------|-----------------|
| **EXEC Agent** | Execute all substages, create WBS, validate gates | 13.5 hours (full Stage 8) |
| **Chairman** | Approve recursion decisions (TECH-001 triggers) | 30 minutes per recursion |
| **Stage 7 Agent** | Provide inputs (business plan, requirements, complexity) | N/A (completed in Stage 7) |
| **Stage 10 Agent** | Trigger TECH-001 if technical blockers found | N/A (occurs in Stage 10) |

## Performance Standards

| Standard | Target | Measurement | Evidence |
|----------|--------|-------------|----------|
| **Decomposition Analysis** | <2 seconds | Time for re-decomposition logic | critique:129 |
| **WBS Comparison** | <1 second | Time to generate v1 vs v2 diff | critique:131 |
| **Total Stage Duration** | 13.5 hours | Sum of substage durations | SOP calculation |
| **Exit Gate Pass Rate** | 100% | All 3 exit gates must pass | Required for Stage 9 entry |

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:128-132 "Performance Requirements"`

## Document References

- **Canonical Definition**: File 03 (stages.yaml lines 320-364)
- **Recursion Blueprint**: File 07 (detailed TECH-001 logic)
- **Metrics Monitoring**: File 09 (KPI thresholds and queries)
- **Configurability Matrix**: File 08 (tunable parameters)

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-05 | Initial SOP creation | Claude Code Phase 5 |

## Sources Table

| Claim | Source | Evidence |
|-------|--------|----------|
| Entry gates: Plans approved, Scope defined | stages.yaml:338-340 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:338-340 "entry gates"` |
| Exit gates: 3 conditions | stages.yaml:341-344 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:341-344 "exit gates"` |
| Substage 8.1: Problem Analysis | stages.yaml:346-350 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:346-350 "Problem Analysis"` |
| Substage 8.2: Task Breakdown | stages.yaml:351-356 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:351-356 "Task Breakdown"` |
| Substage 8.3: Dependency Mapping | stages.yaml:357-362 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:357-362 "Dependency Mapping"` |
| TECH-001 from Stage 10 | critique:38 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:38 "Stage 10: TECH-001: HIGH"` |
| Preserve WBS v1 | critique:45 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:45 "Keep WBS v1 for comparison"` |
| Max 3 recursions | critique:109 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:109 "Max recursions: 3"` |
| Performance: <2s decomposition | critique:129 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:129 "Decomposition analysis: <2 seconds"` |

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
