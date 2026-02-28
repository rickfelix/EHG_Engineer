---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 19 "Build Execution" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Sprint-to-Task Derivation](#3-sprint-to-task-derivation)
  - [4. SD Execution Tracking](#4-sd-execution-tracking)
  - [5. Issue Management Enhancement](#5-issue-management-enhancement)
  - [6. Completion Gate Decision](#6-completion-gate-decision)
  - [7. Task Enrichment](#7-task-enrichment)
  - [8. Architecture Layer Progress](#8-architecture-layer-progress)
  - [9. CLI Superiorities (preserve these)](#9-cli-superiorities-preserve-these)
  - [10. Recommended Stage 19 Schema](#10-recommended-stage-19-schema)
  - [11. Minimum Viable Change (Priority-Ordered)](#11-minimum-viable-change-priority-ordered)
  - [12. Cross-Stage Impact](#12-cross-stage-impact)
  - [13. Dependency Conflicts (with Stages 1-18 decisions)](#13-dependency-conflicts-with-stages-1-18-decisions)
  - [14. Contrarian Take](#14-contrarian-take)

> Independent response to the Stage 19 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Task generation from sprint items | GUI has sprint integration | None (all user-provided) | **5 Critical** | Users must manually create tasks for each sprint item. Stage 18 already defines the work -- Stage 19 should initialize from it. | CLOSE | 1:1 mapping: each sprint item → one task with sprint_item_ref. |
| SD execution tracking | N/A (GUI has iteration cycles/decisions) | No SD tracking | **4 High** | The SD Bridge generates payloads in Stage 18, but Stage 19 doesn't track their execution status. The bridge goes nowhere. | ADD | Challenge: SDs execute in the LEO Protocol, not in EVA. Stage 19 tracks status, not execution. |
| Issue severity/status enums | GUI has decision badges | Free text for both | **3 Medium** | Can't aggregate issues by severity. Can't filter for critical blockers. Stage 20 (QA) can't auto-assess issue load. | CHANGE | Per established pattern: severity enum (critical/high/medium/low), status enum (open/in_progress/resolved/wontfix). |
| Completion gate | GUI has ADVANCE/REVISE/REJECT decisions | No threshold | **4 High** | Sprint "completes" at any completion_pct. A sprint at 20% done can flow to Stage 20 QA. | ADD | Challenge: What threshold? 100% is unrealistic. "All critical tasks done + no critical issues open" is reasonable. |
| Task enrichment | GUI has detailed task tracking | Minimal (name/status/assignee) | **3 Medium** | Tasks have no story points, no architecture context, no effort tracking. Stage 20 can't assess build scope. | ADD | Don't duplicate Stage 18 fields. Add architecture_layer_ref and carry forward story_points. |
| Architecture layer progress | GUI tracks API endpoints per layer | No layer tracking | **3 Medium** | Can't see "frontend is 80% built, backend is 40%." Useful for resource reallocation and Stage 22 (Sprint Review). | ADD | Challenge: Derived from task completion per layer. Only works if tasks have architecture_layer_ref. |
| Technical debt tracking | GUI tracks tech debt | No tech debt concept | **2 Low** | Tech debt discovered during build isn't captured for Sprint Review (Stage 22). | ADD | Simple: issues with type = 'tech_debt'. Tracked alongside bugs and blockers. |

### 2. AnalysisStep Design

**Input (from Stage 18)**:
- Sprint items with: title, description, priority, type, scope, success_criteria, story_points, architecture_layers, deliverable_ref
- SD Bridge payloads (the same items enriched with architecture + team context)
- Sprint metadata: sprint_name, sprint_duration_days, phase_ref

**Process (single LLM call)**:

1. **Sprint item → task initialization**: Each Stage 18 sprint item becomes one Stage 19 task. 1:1 mapping. Task inherits: name (from title), assignee (from suggested_assignee_role), sprint_item_ref, architecture_layer_ref (from architecture_layers[0]), story_points.

2. **SD payload reference**: Each task gets an sd_ref linking to the corresponding SD Bridge payload. This enables tracking: "SD-XYZ is in_progress" → task status = in_progress.

3. **Issue seeding**: From Stage 17 unresolved blockers (if build_readiness was conditional_go), create initial issues. From Stage 18 risks[], create risk-awareness issues.

4. **Completion criteria derivation**: Based on sprint items, determine what "done" means. All critical tasks complete + no critical issues open = minimum for Stage 20.

**Output**: Initialized tasks[] from sprint items, initial issues[] from carried risks, completion criteria, sd_execution_summary.

### 3. Sprint-to-Task Derivation

**1:1 mapping from Stage 18 items to Stage 19 tasks.**

```
Stage 18 Sprint Item:
  title: "User authentication"
  type: feature
  priority: critical
  architecture_layers: ["backend", "data"]
  story_points: 8
  → SD Bridge Payload generated

Stage 19 Task:
  name: "User authentication"
  status: todo
  assignee: "Backend Engineer"  (from Stage 18 suggested_assignee_role)
  sprint_item_ref: "items[0]"
  sd_ref: "sd_bridge_payloads[0]"
  architecture_layer_ref: "backend"
  story_points: 8
  priority: critical
```

**sprint_item_ref should be required for generated tasks** (not optional as currently). Manual tasks can omit it.

**Do NOT decompose sprint items into sub-tasks.** Sprint items from Stage 18 are already scoped to be achievable within the sprint. If they need decomposition, that should happen in Stage 18 (sprint planning), not Stage 19.

### 4. SD Execution Tracking

**Add lightweight SD status tracking.**

The SD Bridge generates payloads in Stage 18. Stage 19 should track their lifecycle:

```javascript
sd_execution_summary: {
  type: 'object', derived: true,
  properties: {
    total_sds: { type: 'number' },
    sds_by_status: { type: 'object' },  // { pending: N, in_progress: N, completed: N, blocked: N }
    blocked_sds: { type: 'array' },      // SD refs that are blocked
  },
}
```

**Implementation note**: In practice, SD status comes from the LEO Protocol (strategic_directives_v2 table). Stage 19's computeDerived could query SD status and aggregate it. But at the template level, we track it via the task status -- each task's status reflects its corresponding SD's status.

### 5. Issue Management Enhancement

**Severity and status become enums. Add issue type.**

```javascript
issues: {
  type: 'array',
  items: {
    description: { type: 'string', required: true },
    severity: { type: 'enum', values: ['critical', 'high', 'medium', 'low'], required: true },  // CHANGED
    status: { type: 'enum', values: ['open', 'in_progress', 'resolved', 'wontfix'], required: true },  // CHANGED
    type: { type: 'enum', values: ['bug', 'blocker', 'tech_debt', 'risk'] },  // NEW
    task_ref: { type: 'string' },  // NEW: which task this issue relates to
  },
}
```

### 6. Completion Gate Decision

**Add `sprint_completion` decision object.**

```javascript
sprint_completion: {
  type: 'object', derived: true,
  properties: {
    decision: { type: 'enum', values: ['complete', 'partial', 'blocked'] },
    rationale: { type: 'string' },
    critical_tasks_done: { type: 'boolean' },
    critical_issues_open: { type: 'number' },
    ready_for_qa: { type: 'boolean' },
  },
}
```

**Decision logic**:
- **COMPLETE**: All tasks done + no critical/high issues open → ready_for_qa = true
- **PARTIAL**: ≥70% tasks done + all critical tasks done + no critical issues → ready_for_qa = true (partial QA)
- **BLOCKED**: Critical tasks blocked OR critical issues unresolved → ready_for_qa = false

### 7. Task Enrichment

**Add architecture_layer_ref, story_points, priority, sd_ref.**

```javascript
tasks[].item: {
  name: { type: 'string', required: true },
  status: { type: 'enum', values: ['todo', 'in_progress', 'done', 'blocked'], required: true },
  assignee: { type: 'string' },
  sprint_item_ref: { type: 'string' },       // EXISTING (make structural)
  sd_ref: { type: 'string' },                // NEW: SD Bridge payload reference
  architecture_layer_ref: { type: 'string' }, // NEW: from Stage 14
  story_points: { type: 'number' },           // NEW: from Stage 18 item
  priority: { type: 'enum', values: ['critical', 'high', 'medium', 'low'] },  // NEW
}
```

### 8. Architecture Layer Progress

**Add layer_progress as derived field.**

```javascript
layer_progress: {
  type: 'object', derived: true,
  // Computed from tasks grouped by architecture_layer_ref
  // e.g., { frontend: { total: 3, done: 2, pct: 67 }, backend: { total: 5, done: 2, pct: 40 } }
}
```

Derived by grouping tasks by architecture_layer_ref and calculating completion percentage per layer. Useful for:
- Resource reallocation ("backend is behind, shift resources")
- Stage 22 Sprint Review ("what layers are complete?")
- Risk visibility ("infra at 20% with 2 days left")

### 9. CLI Superiorities (preserve these)

- **Task status enum**: todo/in_progress/done/blocked is a clean, universal state machine. Every task tracker uses this.
- **sprint_item_ref**: The connection to Stage 18 already exists -- just needs to be strengthened.
- **Simple issue tracking**: Issues as a separate array from tasks is correct -- issues are cross-cutting, not task-specific.
- **Completion percentage**: Quick "how done are we?" metric.
- **Minimal schema**: Build execution should be lightweight. The actual work happens in the LEO Protocol, not in this template.

### 10. Recommended Stage 19 Schema

```javascript
const TEMPLATE = {
  id: 'stage-19',
  slug: 'build-execution',
  title: 'Build Execution',
  version: '2.0.0',
  schema: {
    // === Updated: tasks with enrichment ===
    tasks: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        status: { type: 'enum', values: ['todo', 'in_progress', 'done', 'blocked'], required: true },
        assignee: { type: 'string' },
        priority: { type: 'enum', values: ['critical', 'high', 'medium', 'low'] },  // NEW
        sprint_item_ref: { type: 'string' },       // EXISTING
        sd_ref: { type: 'string' },                // NEW: SD Bridge payload reference
        architecture_layer_ref: { type: 'string' }, // NEW
        story_points: { type: 'number' },           // NEW
      },
    },

    // === Updated: issues with enums + type ===
    issues: {
      type: 'array',
      items: {
        description: { type: 'string', required: true },
        severity: { type: 'enum', values: ['critical', 'high', 'medium', 'low'], required: true },  // CHANGED
        status: { type: 'enum', values: ['open', 'in_progress', 'resolved', 'wontfix'], required: true },  // CHANGED
        type: { type: 'enum', values: ['bug', 'blocker', 'tech_debt', 'risk'] },  // NEW
        task_ref: { type: 'string' },  // NEW
      },
    },

    // === Existing derived (unchanged) ===
    total_tasks: { type: 'number', derived: true },
    completed_tasks: { type: 'number', derived: true },
    blocked_tasks: { type: 'number', derived: true },
    completion_pct: { type: 'number', derived: true },
    tasks_by_status: { type: 'object', derived: true },

    // === NEW: layer progress ===
    layer_progress: { type: 'object', derived: true },

    // === NEW: SD execution summary ===
    sd_execution_summary: {
      type: 'object', derived: true,
      properties: {
        total_sds: { type: 'number' },
        sds_by_status: { type: 'object' },
        blocked_sds: { type: 'array' },
      },
    },

    // === NEW: sprint completion decision ===
    sprint_completion: {
      type: 'object', derived: true,
      properties: {
        decision: { type: 'enum', values: ['complete', 'partial', 'blocked'] },
        rationale: { type: 'string' },
        critical_tasks_done: { type: 'boolean' },
        critical_issues_open: { type: 'number' },
        ready_for_qa: { type: 'boolean' },
      },
    },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 11. Minimum Viable Change (Priority-Ordered)

1. **P0: Add `analysisStep` initializing tasks from Stage 18 sprint items**. 1:1 mapping: each sprint item → one task with sprint_item_ref, sd_ref, assignee, architecture_layer_ref, priority, story_points.

2. **P0: Add `sprint_completion` decision**. complete/partial/blocked based on critical task completion and issue severity. Determines ready_for_qa for Stage 20.

3. **P1: Change issue severity/status to enums**. severity: critical/high/medium/low. status: open/in_progress/resolved/wontfix. Add issue type: bug/blocker/tech_debt/risk.

4. **P1: Add `priority`, `sd_ref`, `architecture_layer_ref`, `story_points` to tasks**. Enriches tracking and enables layer progress + SD summary.

5. **P2: Add `layer_progress` derived field**. Completion per architecture layer. Enables resource reallocation visibility.

6. **P2: Add `sd_execution_summary` derived field**. Tracks SD lifecycle status aggregated from task status.

7. **P3: Do NOT add sub-task decomposition**. Sprint items are already scoped. Decomposition is Stage 18's job.
8. **P3: Do NOT add API endpoint tracking**. That's the GUI's Stage 19 scope, not the CLI's.
9. **P3: Do NOT add iteration cycles / ADVANCE/REVISE decisions**. That's review logic (Stage 22), not execution.

### 12. Cross-Stage Impact

| Change | Stage 20 (QA) | Stage 21 (Review) | Stage 22 (Sprint Review) |
|--------|--------------|------------------|------------------------|
| Tasks from sprint items | QA tests against defined tasks with clear success criteria. | Review validates completed tasks against sprint plan. | Sprint review compares planned vs completed. |
| Sprint completion gate | QA starts only when ready_for_qa = true. Partial QA if partial completion. | Review has clear scope of what was built. | Completion decision provides review metrics. |
| Layer progress | QA tests per architecture layer (80% frontend built → test frontend). | Review sees balanced/imbalanced layer progress. | Sprint review tracks layer velocity. |
| Issue type (bug/blocker/tech_debt/risk) | QA focuses on bugs. Blockers escalated. | Review assesses tech debt load. | Sprint review tracks debt accumulation. |

### 13. Dependency Conflicts (with Stages 1-18 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 18 → 19 (sprint items → tasks) | **OK** | Sprint items have all needed fields (title, priority, type, architecture_layers, story_points). 1:1 mapping. |
| Stage 18 → 19 (SD Bridge payloads → sd_ref) | **OK** | Payloads generated in computeDerived. Tasks reference them by index or ID. |
| Stage 14 → 19 (layers → architecture_layer_ref) | **OK** | Layer names consistent across stages. |
| Stage 15 → 19 (team → assignee) | **OK** | suggested_assignee_role from Stage 18 SD Bridge carries forward. |
| Stage 17 → 19 (unresolved items → initial issues) | **Soft** | If build_readiness was conditional_go, remaining blockers should seed issues. |

### 14. Contrarian Take

**Arguing AGAINST making Stage 19 a tracking stage:**

1. **Stage 19 is redundant if SDs execute in LEO.** The SD Bridge generates Strategic Directives. SDs have their own lifecycle in the LEO Protocol (LEAD → PLAN → EXEC → completion). Stage 19's task tracking duplicates what LEO already tracks. Why maintain two systems -- EVA tasks AND LEO SDs -- for the same work?

2. **1:1 task mapping is hollow.** If each sprint item becomes exactly one task, and the task status mirrors the SD status, then Stage 19 is just a status mirror with no independent value. You could skip Stage 19 entirely and have Stage 20 (QA) read SD completion status directly.

3. **Issue tracking competes with SD issues.** LEO Protocol already tracks issues, blockers, and risks per SD. Adding a parallel issue tracker in Stage 19 creates confusion about where the source of truth is.

4. **What could go wrong**: Teams maintain task status in Stage 19 AND SD status in LEO, and they drift. "Task is done" in Stage 19 but "SD is blocked" in LEO. Two conflicting statuses for the same work.

**Counter-argument**: Stage 19 provides a VENTURE-LEVEL view of build progress, not an SD-level view. LEO tracks individual SD execution. Stage 19 aggregates across all SDs in the sprint: "What percentage of the sprint is done? Which layers are behind? What issues cut across SDs?" The layer_progress and sprint_completion views are venture-scoped, not SD-scoped. And the completion gate determines when QA starts -- that's a venture decision, not an SD decision.

**Verdict**: Keep Stage 19 as a lightweight aggregation layer. It doesn't replace LEO's SD tracking -- it aggregates it into venture-level build status. The key insight is: Stage 19 reads SD status, it doesn't duplicate it. task.status should ideally sync from the corresponding SD's status, not be independently maintained.
