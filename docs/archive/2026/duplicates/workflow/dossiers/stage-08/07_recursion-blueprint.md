<!-- ARCHIVED: 2026-01-26T16:26:48.231Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-08\07_recursion-blueprint.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 8 Recursion Blueprint (DETAILED)


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

## Overview

Stage 8 (Problem Decomposition Engine) is a **PRIMARY RECURSION TARGET** in the unified venture creation system. Downstream technical validation failures (particularly from Stage 10 Comprehensive Technical Review) can invalidate decomposition assumptions, triggering recursion back to Stage 8 to re-decompose the problem with updated technical constraints.

**Recursion Readiness Score**: 4/5 (HIGH)
**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:15 "Recursion Readiness: 4: Receives TECH-001, handles scope adjustments"`

## Intelligent Dependency-Driven Recursion

This stage participates in the unified venture creation system where downstream technical reviews can invalidate decomposition assumptions, triggering recursion back to re-decompose the problem with updated constraints.

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:31-32 "downstream technical reviews can invalidate decomposition assumptions"`

---

## Inbound Recursion Triggers (TO Stage 8)

### Primary Trigger: Stage 10 TECH-001 (Blocking Technical Issues)

**Trigger ID**: TECH-001
**Source Stage**: Stage 10 (Comprehensive Technical Review)
**Condition**: Blocking technical issues identified during technical feasibility analysis
**Severity**: HIGH
**Auto-Execute**: No (Requires Chairman approval)
**Reason**: Technical infeasibility discovered during Stage 10 requires WBS re-decomposition with technical constraints. Tasks may need to be broken down differently or combined based on technical dependencies.

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:38 "Stage 10: TECH-001: Blocking technical issues: HIGH: Needs approval"`

#### Detailed Trigger Logic (JavaScript Implementation)

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:67-106 (40 lines)`

```javascript
// Success Criteria SC-004: Stage 10 blocking technical issues trigger automatic recursion to Stage 8
async function onStage10TechnicalIssuesDetected(ventureId, technicalReview) {
  const blockingIssues = technicalReview.issues.filter(i => i.severity === 'BLOCKING');

  if (blockingIssues.length > 0) {
    // HIGH severity: Requires Chairman approval
    const approvalNeeded = await recursionEngine.requestChairmanApproval({
      ventureId,
      fromStage: 10,
      toStage: 8,
      triggerType: 'TECH-001',
      triggerData: {
        blocking_issues_count: blockingIssues.length,
        blocking_issues: blockingIssues.map(i => ({
          category: i.category,
          description: i.description,
          impact: i.impact,
          suggested_decomposition_changes: i.suggestedFix
        })),
        original_wbs_tasks: technicalReview.originalWBS.taskCount,
        technical_debt_score: technicalReview.technicalDebtScore
      },
      severity: 'HIGH',
      autoExecuted: false,
      resolution_notes: `${blockingIssues.length} blocking technical issues require problem re-decomposition:
        ${blockingIssues.map((i, idx) => `${idx + 1}. ${i.description}`).join('\n        ')}

        Recommended actions:
        1. Break down complex tasks into technically feasible sub-tasks
        2. Resequence based on technical dependencies
        3. Consider alternative technical approaches for blocked tasks`
    });

    if (approvalNeeded.approved) {
      // Recursion executed, return to Stage 8 with technical context
    }
  }
}
```

**Code Analysis**:
1. **Line 69**: Filter technical issues for BLOCKING severity only
2. **Lines 71-100**: If blocking issues exist, request Chairman approval
3. **Lines 74-77**: Identify recursion parameters (from Stage 10 to Stage 8, TECH-001 type)
4. **Lines 78-88**: Package trigger data:
   - Count of blocking issues
   - Issue details (category, description, impact, suggested fixes)
   - Original WBS task count (for comparison)
   - Technical debt score (quantifies technical risk)
5. **Lines 89-90**: Set severity HIGH, autoExecuted false (requires approval)
6. **Lines 91-98**: Generate resolution notes with recommended actions
7. **Lines 101-103**: If approved, execute recursion to Stage 8

**Chairman Approval Payload**:
- **blocking_issues_count**: Number of BLOCKING issues (triggers recursion if >0)
- **blocking_issues[]**: Array of issue objects with category, description, impact, suggestedFix
- **original_wbs_tasks**: Task count from WBS v1 (baseline for comparison)
- **technical_debt_score**: Numeric score quantifying technical risk
- **resolution_notes**: Human-readable summary with recommended actions

**Recommended Actions** (lines 95-97):
1. Break down complex tasks into technically feasible sub-tasks
2. Resequence based on technical dependencies
3. Consider alternative technical approaches for blocked tasks

---

### Secondary Trigger: Stage 14 TECH-001 (Development Complexity Issues)

**Trigger ID**: TECH-001
**Source Stage**: Stage 14 (Development Environment Preparation)
**Condition**: Development preparation reveals complexity issues (e.g., environment setup uncovers technical barriers)
**Severity**: HIGH
**Auto-Execute**: No (Requires Chairman approval)
**Reason**: Development environment setup uncovers technical barriers requiring task restructuring (e.g., dependencies on unavailable libraries, incompatible versions)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:39 "Stage 14: TECH-001: Development preparation reveals complexity issues: HIGH"`

**Example Scenario**:
- Stage 8 WBS assumes using React library X version 2.0
- Stage 14 discovers React library X version 2.0 is incompatible with project dependencies
- TECH-001 triggered: Re-decompose tasks to use alternative library or different approach

---

### Tertiary Trigger: Stage 22 TECH-001 (Architectural Limitations)

**Trigger ID**: TECH-001
**Source Stage**: Stage 22 (Iterative Development & Testing Loops)
**Condition**: Iterative development hits architectural limitations (e.g., performance bottlenecks, scalability issues)
**Severity**: MEDIUM
**Auto-Execute**: No (Advisory only, not blocking)
**Reason**: Development loops reveal decomposition assumptions were incorrect (e.g., task assumed single-server architecture, but needs distributed system)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:40 "Stage 22: TECH-001: Iterative development hits architectural limitations: MEDIUM"`

**Advisory Nature**: MEDIUM severity means recursion is suggested but not required. Chairman can choose to accept technical debt and continue execution.

---

## Recursion Behavior When Triggered

When Stage 10 (or other downstream stages) triggers TECH-001 recursion back to Stage 8:

### Step 1: Preserve Original Decomposition

**Objective**: Keep WBS v1 for comparison and learning
**Action**: Save WBS v1 to `venture_wbs_history` table with version tag "v1"
**Rationale**: Historical tracking for pattern analysis, audit trail, and v1 vs v2 comparison

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:45 "Preserve Original Decomposition: Keep WBS v1 for comparison and learning"`

**Database Schema** (proposed):
```sql
-- venture_wbs_history table
CREATE TABLE venture_wbs_history (
  id SERIAL PRIMARY KEY,
  venture_id INTEGER REFERENCES ventures(id),
  version VARCHAR(10) NOT NULL, -- 'v1', 'v2', 'v3', etc.
  wbs_data JSONB NOT NULL, -- Full WBS structure
  created_at TIMESTAMP DEFAULT NOW(),
  recursion_trigger VARCHAR(50), -- 'TECH-001' or NULL (if v1)
  recursion_from_stage INTEGER, -- 10, 14, 22, or NULL
  notes TEXT -- Rationale for version change
);
```

---

### Step 2: Re-decompose with Technical Constraints

**Objective**: Incorporate technical feasibility insights from Stage 10 (or 14, 22)

**Inputs** (from recursion trigger):
- Technical feasibility insights from Stage 10 review
- Architecture limitations discovered
- Development complexity assessments
- Resource skill set constraints
- Suggested decomposition changes (from blocking issues)

**Process**:
1. **Review Blocking Issues**: Read `blocking_issues[]` from recursion trigger data
2. **Apply Technical Constraints**: For each blocking issue:
   - Identify affected WBS tasks (by category or description matching)
   - Apply `suggested_decomposition_changes` to tasks
   - Break down complex tasks into smaller sub-tasks if needed
   - Combine tasks that share technical dependencies
3. **Resequence Tasks**: Based on technical prerequisites identified in Stage 10
4. **Generate WBS v2**: New decomposition reflecting technical constraints

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:46-53`

**Example**:
- **WBS v1 Task**: "Implement user authentication (8 hours)"
- **Blocking Issue**: "OAuth 2.0 library not compatible with current framework (BLOCKING)"
- **Suggested Fix**: "Use JWT token-based authentication instead"
- **WBS v2 Tasks**:
  - "Research JWT libraries compatible with framework (2 hours)"
  - "Implement JWT token generation (4 hours)"
  - "Implement JWT token validation (4 hours)"
  - "Add JWT refresh token logic (2 hours)"
- **Result**: 1 task → 4 tasks, total effort increased from 8 hours to 12 hours

---

### Step 3: Adjust Task Granularity

**Actions**:

1. **Break Down Technical Blockers into Smaller Sub-tasks**
   - If task is blocked by technical complexity, decompose further
   - Target: Each sub-task should be <8 hours effort (atomic unit)
   - Example: "Implement search feature" → "Design search index", "Implement search API", "Add search UI"

2. **Combine Tasks that Share Technical Dependencies**
   - If multiple tasks require same technical setup, combine them
   - Reduces redundant work and technical overhead
   - Example: "Setup database connection" + "Setup Redis cache" → "Setup data layer infrastructure"

3. **Resequence Tasks Based on Technical Prerequisites**
   - Move tasks to later in WBS if they depend on currently blocked tasks
   - Update critical path calculation
   - Example: "User profile page" depends on "User authentication" (which is blocked) → move profile page after auth is unblocked

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:49-53 "Adjust Task Granularity"`

**Gap Note**: No task granularity guidelines defined (Gap #9)

---

### Step 4: Update Dependency Map

**Objective**: Recalculate critical path with technical insights from Stage 10

**Actions**:
1. **Rebuild Dependency Graph**: Based on WBS v2 task structure
2. **Recalculate Critical Path**: Using Critical Path Method (CPM) algorithm
3. **Update Project Timeline**: Based on new critical path duration
4. **Compare Timelines**: v1 critical path duration vs v2 critical path duration
5. **Flag Timeline Exceedance**: If v2 duration > Stage 7 timeline constraints, trigger TIMELINE-001 to Stage 7

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:54 "Update Dependency Map: Recalculate critical path with technical insights"`

**Performance Requirement**: <1 second to generate v1 vs v2 diff
**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:131 "WBS comparison: <1 second"`

---

### Step 5: Comparison Analysis

**Objective**: Show delta between WBS v1 and v2

**Visualization**:
- **Green**: New tasks added to address technical issues
- **Yellow**: Tasks modified due to technical constraints
- **Red**: Tasks removed (out of scope due to complexity)

**Comparison Report Contents**:
1. **Summary Statistics**:
   - Total tasks: v1 count vs v2 count
   - Added tasks: count and list
   - Modified tasks: count and list
   - Removed tasks: count and list
   - Effort change: v1 total hours vs v2 total hours
   - Timeline change: v1 duration vs v2 duration

2. **Task-Level Comparison Table**:
   | Task ID | Task Name (v1) | Task Name (v2) | Change Type | Rationale |
   |---------|----------------|----------------|-------------|-----------|
   | 1.1 | User auth (OAuth) | User auth (JWT) | MODIFIED | OAuth library incompatible |
   | 1.2 | - | JWT research | ADDED | New prerequisite |
   | 2.1 | Search feature | - | REMOVED | Too complex for timeline |

3. **Critical Path Impact**:
   - v1 critical path: [Task IDs]
   - v2 critical path: [Task IDs]
   - New critical path tasks: [Tasks now on critical path]
   - Removed critical path tasks: [Tasks no longer on critical path]

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:55 "Comparison Analysis: Show delta between v1 and v2 WBS"`

**UI/UX Requirements** (lines 140-148):
- **Task Delta Visualization**:
  - Green: New tasks added
  - Yellow: Tasks modified
  - Red: Tasks removed
- **Side-by-side task comparison**
- **Effort and timeline deltas highlighted**

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:140-148 "Task Delta Visualization"`

---

## Outbound Recursion Triggers (FROM Stage 8)

### Trigger 1: RESOURCE-001 to Stage 7 (Resource Shortage)

**Trigger ID**: RESOURCE-001
**Target Stage**: Stage 7 (Comprehensive Planning)
**Condition**: Decomposition reveals resource shortage (e.g., WBS requires 5 developers but Stage 7 allocated 3)
**Severity**: HIGH
**Reason**: Planning assumptions about team size/skills were incorrect, need to adjust resource allocations

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62 "Stage 7: RESOURCE-001: Decomposition reveals resource shortage: HIGH"`

**Trigger Logic**:
```javascript
async function checkResourceFeasibility(ventureId, wbsV1) {
  const totalEffort = calculateTotalEffort(wbsV1); // Sum of all task hours
  const criticalPathDuration = calculateCriticalPath(wbsV1); // Longest path in weeks
  const stage7Allocations = await getStage7ResourceAllocations(ventureId);

  const requiredDevelopers = Math.ceil(totalEffort / (criticalPathDuration * 40)); // 40 hours/week
  const allocatedDevelopers = stage7Allocations.developers;

  if (requiredDevelopers > allocatedDevelopers) {
    // Trigger RESOURCE-001 recursion to Stage 7
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 8,
      toStage: 7,
      triggerType: 'RESOURCE-001',
      triggerData: {
        required_developers: requiredDevelopers,
        allocated_developers: allocatedDevelopers,
        shortfall: requiredDevelopers - allocatedDevelopers,
        total_effort_hours: totalEffort,
        critical_path_weeks: criticalPathDuration
      },
      severity: 'HIGH',
      autoExecuted: false // Requires approval
    });
  }
}
```

**Chairman Decision Options**:
1. **Increase Resources**: Allocate more developers (hire, contract, reassign)
2. **Reduce Scope**: Remove tasks from WBS to fit available resources
3. **Extend Timeline**: Allow more time with fewer resources (recalculate critical path)

---

### Trigger 2: TIMELINE-001 to Stage 7 (Timeline Exceeded)

**Trigger ID**: TIMELINE-001
**Target Stage**: Stage 7 (Comprehensive Planning)
**Condition**: Task breakdown exceeds timeline constraints (e.g., critical path is 20 weeks but Stage 7 planned 12 weeks)
**Severity**: MEDIUM
**Reason**: Comprehensive Planning needs timeline adjustment to accommodate actual task complexity

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:63 "Stage 7: TIMELINE-001: Task breakdown exceeds timeline constraints: MEDIUM"`

**Trigger Logic**:
```javascript
async function checkTimelineFeasibility(ventureId, wbsV1) {
  const criticalPathDuration = calculateCriticalPath(wbsV1); // In weeks
  const stage7Timeline = await getStage7Timeline(ventureId);

  if (criticalPathDuration > stage7Timeline.planned_duration_weeks) {
    // Trigger TIMELINE-001 recursion to Stage 7
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 8,
      toStage: 7,
      triggerType: 'TIMELINE-001',
      triggerData: {
        critical_path_weeks: criticalPathDuration,
        planned_duration_weeks: stage7Timeline.planned_duration_weeks,
        overage_weeks: criticalPathDuration - stage7Timeline.planned_duration_weeks,
        overage_percentage: ((criticalPathDuration / stage7Timeline.planned_duration_weeks) - 1) * 100
      },
      severity: 'MEDIUM',
      autoExecuted: false // Requires approval
    });
  }
}
```

**Chairman Decision Options**:
1. **Extend Timeline**: Approve longer duration (update Stage 7 timeline)
2. **Reduce Scope**: Remove non-critical tasks from WBS
3. **Increase Resources**: Add more developers to shorten critical path (triggers RESOURCE-001)

---

## Loop Prevention

### Max Recursions Rule

**Limit**: 3 returns to Stage 8 per venture
**Tracking**: `recursion_events` table logs each recursion with venture_id, from_stage, to_stage, trigger_type
**Enforcement**: After 3rd TECH-001 trigger to same venture, block further recursions

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:109 "Max recursions: 3 returns to Stage 8 per venture"`

**Database Tracking**:
```sql
-- recursion_events table
SELECT COUNT(*) AS recursion_count
FROM recursion_events
WHERE venture_id = $1
  AND to_stage = 8
  AND trigger_type = 'TECH-001'
  AND status = 'APPROVED';

-- If recursion_count >= 3, escalate to Chairman
```

---

### Escalation After 3rd Recursion

**Trigger**: After 3rd TECH-001 trigger, Chairman must decide:

**Decision Options**:
1. **Continue with Simplified Scope**: Remove technical blockers from WBS, proceed with reduced functionality
2. **Kill Venture**: Too technically complex, not feasible with current resources/skills
3. **Acquire Technical Expertise**: Hire/contract specialists to unblock technical issues
4. **Pivot to Different Technical Approach**: Change architecture or tech stack to avoid blockers

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:110-114 "After 3rd TECH-001 trigger, Chairman must decide"`

**UI/UX**: Escalation panel shows:
- Recursion history: All 3 TECH-001 triggers with blocking issues
- WBS versions: v1, v2, v3 (all failed technical review)
- Recommended actions: Based on blocking issue patterns
- Cost/benefit analysis: Cost of hiring vs killing venture

---

### WBS Versioning and Change Tracking

**Version Tracking**: Each recursion creates new WBS version (v1, v2, v3, ...)
**Storage**: `venture_wbs_history` table stores full WBS snapshots
**Pattern Analysis**: Log WBS changes for pattern detection (e.g., common blocking issues across ventures)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:115 "Tracking: Each recursion logs WBS changes for pattern analysis"`

**Proposed WBS Version Comparison Logic**:
```javascript
async function compareWBSVersions(ventureId, version1, version2) {
  const wbs1 = await getWBSVersion(ventureId, version1);
  const wbs2 = await getWBSVersion(ventureId, version2);

  const added = findAddedTasks(wbs1, wbs2);
  const modified = findModifiedTasks(wbs1, wbs2);
  const removed = findRemovedTasks(wbs1, wbs2);

  return {
    summary: {
      version1_tasks: wbs1.tasks.length,
      version2_tasks: wbs2.tasks.length,
      added_count: added.length,
      modified_count: modified.length,
      removed_count: removed.length,
      effort_change_hours: wbs2.total_effort - wbs1.total_effort,
      timeline_change_weeks: wbs2.critical_path_duration - wbs1.critical_path_duration
    },
    added,
    modified,
    removed
  };
}
```

**Gap Note**: WBS versioning system not implemented (Gap #8)

---

## Chairman Controls

### HIGH Severity Recursion (TECH-001 Blocking Issues)

**Approval Requirement**: Chairman approval before recursion executes
**Review Panel Shows**:
1. **Original WBS (v1)**: Current task structure
2. **Proposed Changes**: Suggested decomposition changes from blocking issues
3. **Blocking Issues**: List of technical issues with severity, impact, suggested fixes
4. **WBS v2 Preview**: Proposed new WBS structure after re-decomposition

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:118-121 "HIGH severity: Requires Chairman approval before recursion, Review panel shows original WBS vs proposed changes"`

**Approval Interface Fields**:
- Venture ID and name
- Recursion trigger: TECH-001 from Stage 10 (or 14, 22)
- Blocking issues count: N blocking issues
- WBS v1 task count vs WBS v2 task count (projected)
- Effort estimate change: X hours → Y hours
- Timeline change: A weeks → B weeks
- Approve/Reject buttons

---

### Override Capability

**Chairman can**:
1. **Skip Recursion and Accept Technical Debt**: Proceed with WBS v1 despite blocking issues (risk acceptance)
2. **Approve Hiring/Contracting**: Resolve technical blocks by acquiring expertise (budget allocation)
3. **Simplify Scope**: Remove blocked tasks from WBS instead of recursing (scope reduction)
4. **Allocate Additional Budget**: For technical complexity (e.g., license fees for compatible libraries)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:122-126 "Override capability: Chairman can skip recursion, approve hiring, simplify scope, allocate budget"`

**Risk of Skip Recursion**: Technical debt accumulates, may cause Stage 14/22 failures later

---

## Performance Requirements

| Metric | Target | Measurement | Evidence |
|--------|--------|-------------|----------|
| **Decomposition Analysis** | <2 seconds | Time for re-decomposition logic to run | critique:129 |
| **Recursion Detection** | <100ms | Time from technical review complete to TECH-001 trigger | critique:130 |
| **WBS Comparison** | <1 second | Time to generate v1 vs v2 diff | critique:131 |
| **Database Logging** | Async | Store full WBS snapshots without blocking | critique:132 |

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:128-132 "Performance Requirements"`

**Implementation Notes**:
- Decomposition analysis: Use cached Stage 10 technical review data (no re-fetch)
- Recursion detection: Trigger function runs immediately after Stage 10 completes
- WBS comparison: Pre-compute diff in background, cache result for Chairman panel
- Database logging: Use async/await, non-blocking writes to `recursion_events` and `venture_wbs_history`

---

## UI/UX Implications

### Recursion Context Panel

**Shows**:
1. **Original WBS (v1)**: Task count, hierarchy view, effort estimate
2. **Technical Blockers**: Identified in Stage 10 with severity badges (BLOCKING, HIGH, MEDIUM)
3. **Proposed WBS Changes (v2)**: Task count, hierarchy view, effort estimate
4. **Side-by-Side Task Comparison**: v1 tasks vs v2 tasks with change highlighting

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:135-139 "Recursion Context Panel"`

**Mockup**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Recursion Context Panel: TECH-001 from Stage 10                │
├─────────────────────────────────────────────────────────────────┤
│ Original WBS (v1)                   │ Proposed WBS (v2)         │
│ - 15 tasks, 120 hours, 8 weeks      │ - 18 tasks, 140 hours, 9 weeks │
│                                      │                            │
│ Technical Blockers (3):              │ Changes Summary:           │
│ [BLOCKING] OAuth library incompatible│ + 5 tasks added (JWT)      │
│ [BLOCKING] Database migration tool   │ ~ 2 tasks modified         │
│ [HIGH] Performance bottleneck        │ - 1 task removed           │
│                                      │                            │
│ [View Side-by-Side Comparison]       │ [Approve Recursion]        │
│                                      │ [Modify Scope]             │
│                                      │ [Reject Recursion]         │
└─────────────────────────────────────────────────────────────────┘
```

---

### Task Delta Visualization

**Color Coding**:
- **Green**: New tasks added to address technical issues (e.g., "Research JWT libraries")
- **Yellow**: Tasks modified due to technical constraints (e.g., "Implement user auth" → "Implement JWT auth")
- **Red**: Tasks removed (out of scope due to complexity, e.g., "Advanced search feature")

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:140-148 "Task Delta Visualization"`

**Mockup**:
```
Task Comparison (v1 → v2):
[GREEN]  1.1.1 Research JWT libraries (NEW)
[YELLOW] 1.1   Implement user auth → Implement JWT auth (MODIFIED)
[GREEN]  1.1.2 Add JWT refresh token logic (NEW)
[RED]    2.3   Advanced search feature (REMOVED - too complex)
```

---

### Approval Interface (Chairman)

**Actions**:
1. **Approve Recursion**: Apply WBS v2, return to Stage 8 with technical context
2. **Modify Scope**: Remove blocked tasks from WBS v1, proceed without recursion
3. **Reject Recursion**: Accept technical debt, proceed with WBS v1 (risk acceptance)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:144-148 "Approval Interface (Chairman)"`

**Decision Impact**:
- **Approve Recursion**: Stage 8 re-executes Substages 8.2 and 8.3 with technical constraints (6-11 hours)
- **Modify Scope**: Immediate proceed to Stage 9 with reduced WBS v1 (0 delay, reduced functionality)
- **Reject Recursion**: Immediate proceed to Stage 9 with full WBS v1 (0 delay, high technical risk)

---

## Integration Points

### Stage 7 (Comprehensive Planning)

**Integration Type**: Outbound recursion target (RESOURCE-001, TIMELINE-001)
**Trigger Conditions**: WBS v1 exceeds resource or timeline constraints from Stage 7
**Data Exchange**: Resource requirements, timeline duration, critical path
**Secondary Recursion**: If Stage 7 adjusts resources/timeline, may need to return to Stage 8 again

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:150 "Stage 7: May trigger secondary recursion if WBS changes affect timeline/resources"`

---

### Stage 10 (Technical Review)

**Integration Type**: Primary recursion source (TECH-001)
**Trigger Conditions**: Blocking technical issues identified during technical feasibility review
**Data Exchange**: Blocking issues array (category, description, impact, suggestedFix), technical debt score
**Recursion Frequency**: ~20% of ventures expected to trigger TECH-001 (based on technical complexity)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:151 "Stage 10: Primary recursion source"`

---

### Stage 14 (Development Prep)

**Integration Type**: Secondary recursion source (TECH-001)
**Trigger Conditions**: Development environment setup uncovers technical barriers
**Data Exchange**: Environment compatibility issues, dependency conflicts
**Recursion Frequency**: ~10% of ventures expected to trigger TECH-001 from Stage 14

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:152 "Stage 14: Secondary recursion source"`

---

### validationFramework.ts

**Integration Type**: Reuse for technical feasibility checks
**Purpose**: Pre-validate WBS v2 against technical constraints before Chairman approval
**Data Exchange**: WBS v2 structure, validation rules (task depth, clarity, dependency resolution)
**Gap**: Technical feasibility pre-check not implemented (Gap #7)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:153 "validationFramework.ts: Reuse for technical feasibility checks"`

---

### recursionEngine.ts

**Integration Type**: Central recursion orchestration
**Purpose**: Manage recursion triggers, approvals, execution, loop prevention
**Data Exchange**: Recursion events (venture_id, from_stage, to_stage, trigger_type, severity, status)
**Database**: `recursion_events` table

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:154 "recursionEngine.ts: Central recursion orchestration"`

**Gap Note**: Recursion engine not implemented (feeds SD-RECURSION-ENGINE-001)

---

### recursion_events Table

**Integration Type**: Log all WBS version changes
**Purpose**: Track recursion history, prevent loops (max 3), pattern analysis
**Schema**:
```sql
CREATE TABLE recursion_events (
  id SERIAL PRIMARY KEY,
  venture_id INTEGER REFERENCES ventures(id),
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- 'TECH-001', 'RESOURCE-001', 'TIMELINE-001'
  trigger_data JSONB NOT NULL, -- Blocking issues, resource shortfall, etc.
  severity VARCHAR(20) NOT NULL, -- 'HIGH', 'MEDIUM', 'LOW'
  auto_executed BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
  approved_by INTEGER REFERENCES users(id), -- Chairman user ID
  approved_at TIMESTAMP,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:155 "recursion_events table: Log all WBS version changes"`

---

## Gap Analysis for Recursion Implementation

**Identified Gaps** (feeds SD-RECURSION-ENGINE-001):

1. **No recursionEngine.ts implementation** - Central orchestration logic not built
2. **No WBS versioning system** - Need `venture_wbs_history` table and comparison logic (Gap #8)
3. **No Chairman approval UI** - Recursion context panel, approval interface not built
4. **No Task Delta Visualization** - v1 vs v2 comparison UI not implemented
5. **No Technical Feasibility Pre-Check** - Could prevent recursions by validating earlier (Gap #7)
6. **No Performance Tracking** - Decomposition analysis time, recursion detection time not logged
7. **No Pattern Analysis** - WBS change patterns not analyzed across ventures
8. **No Recursion Event Logging** - `recursion_events` table not created

**Recommended Priority**:
1. Implement `recursion_events` table and logging (foundation)
2. Implement WBS versioning system (`venture_wbs_history` table)
3. Implement recursionEngine.ts core logic (trigger, approve, execute)
4. Implement Chairman approval UI (recursion context panel)
5. Add technical feasibility pre-check (prevention)
6. Add pattern analysis (long-term optimization)

## Sources Table

| Claim | Source | Evidence |
|-------|--------|----------|
| Recursion Readiness: 4/5 | critique:15 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:15 "Recursion Readiness: 4"` |
| Intelligent dependency-driven recursion | critique:31-32 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:31-32 "downstream technical reviews can invalidate assumptions"` |
| Primary trigger: Stage 10 TECH-001 | critique:38 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:38 "Stage 10: TECH-001: Blocking technical issues: HIGH"` |
| JavaScript implementation | critique:67-106 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:67-106 "onStage10TechnicalIssuesDetected function"` |
| Preserve WBS v1 | critique:45 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:45 "Keep WBS v1 for comparison"` |
| Re-decompose with constraints | critique:46-53 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:46-53 "Technical feasibility insights"` |
| Update dependency map | critique:54 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:54 "Recalculate critical path"` |
| Comparison analysis | critique:55 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:55 "Show delta between v1 and v2"` |
| RESOURCE-001 to Stage 7 | critique:62 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62 "Decomposition reveals resource shortage"` |
| TIMELINE-001 to Stage 7 | critique:63 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:63 "Task breakdown exceeds timeline"` |
| Max recursions: 3 | critique:109 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:109 "Max recursions: 3 returns to Stage 8"` |
| Escalation after 3rd trigger | critique:110-114 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:110-114 "Chairman must decide"` |
| WBS change tracking | critique:115 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:115 "logs WBS changes for pattern analysis"` |
| Chairman approval required | critique:118-121 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:118-121 "HIGH severity: Requires Chairman approval"` |
| Override capability | critique:122-126 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:122-126 "Chairman can: Skip recursion, approve hiring"` |
| Performance: <2s decomposition | critique:129 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:129 "Decomposition analysis: <2 seconds"` |
| Performance: <100ms detection | critique:130 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:130 "Recursion detection: <100ms"` |
| Performance: <1s comparison | critique:131 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:131 "WBS comparison: <1 second"` |
| Recursion Context Panel | critique:135-139 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:135-139 "Shows: Original WBS, Technical blockers"` |
| Task Delta Visualization | critique:140-148 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:140-148 "Green/Yellow/Red color coding"` |
| Integration: Stage 7 | critique:150 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:150 "May trigger secondary recursion"` |
| Integration: Stage 10 | critique:151 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:151 "Primary recursion source"` |
| Integration: validationFramework | critique:153 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:153 "Reuse for technical feasibility checks"` |
| Integration: recursionEngine | critique:154 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:154 "Central recursion orchestration"` |
| Integration: recursion_events table | critique:155 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:155 "Log all WBS version changes"` |

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
