---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 8 Configurability Matrix


## Table of Contents

- [Overview](#overview)
- [Input/Output Schemas](#inputoutput-schemas)
  - [Input Schema 1: Business Plan](#input-schema-1-business-plan)
  - [Input Schema 2: Technical Requirements](#input-schema-2-technical-requirements)
  - [Input Schema 3: Complexity Assessment](#input-schema-3-complexity-assessment)
  - [Output Schema 1: Decomposed Tasks](#output-schema-1-decomposed-tasks)
  - [Output Schema 2: Work Breakdown Structure (WBS)](#output-schema-2-work-breakdown-structure-wbs)
  - [Output Schema 3: Dependencies Map](#output-schema-3-dependencies-map)
- [Tunable Parameters](#tunable-parameters)
  - [Category 1: WBS Depth Constraints](#category-1-wbs-depth-constraints)
  - [Category 2: Task Clarity Thresholds](#category-2-task-clarity-thresholds)
  - [Category 3: Dependency Resolution Rules](#category-3-dependency-resolution-rules)
  - [Category 4: Task Effort Estimation](#category-4-task-effort-estimation)
  - [Category 5: Recursion Control](#category-5-recursion-control)
  - [Category 6: Automation Tuning](#category-6-automation-tuning)
  - [Category 7: Performance Limits](#category-7-performance-limits)
  - [Category 8: Validation Rules](#category-8-validation-rules)
- [Configuration Examples](#configuration-examples)
  - [Example 1: Low Complexity Venture](#example-1-low-complexity-venture)
  - [Example 2: High Complexity Venture](#example-2-high-complexity-venture)
  - [Example 3: AI-Assisted Automation Mode](#example-3-ai-assisted-automation-mode)
- [Parameter Dependencies](#parameter-dependencies)
- [Configuration Storage](#configuration-storage)
  - [Option 1: Environment Variables (Static)](#option-1-environment-variables-static)
  - [Option 2: Database Table (Dynamic)](#option-2-database-table-dynamic)
  - [Option 3: YAML Config File (Hybrid)](#option-3-yaml-config-file-hybrid)
- [Gap Analysis for Configurability](#gap-analysis-for-configurability)
- [Sources Table](#sources-table)

## Overview

This document defines tunable parameters for Stage 8 (Problem Decomposition Engine) that can be adjusted to optimize performance, quality, and resource utilization across different venture contexts.

**Purpose**: Enable stage behavior customization without code changes
**Configuration Storage**: Environment variables, database `stage_config` table, or YAML config files
**Update Frequency**: Per-venture (dynamic) or system-wide (static)

---

## Input/Output Schemas

### Input Schema 1: Business Plan

**Format**: JSON document
**Source**: Stage 7 (Comprehensive Planning)
**Required Fields**:
```json
{
  "venture_id": "integer (required)",
  "business_plan": {
    "goals": "array<string> (required, min 1)",
    "scope": {
      "included_features": "array<string> (required)",
      "excluded_features": "array<string> (optional)",
      "boundary_conditions": "object (optional)"
    },
    "constraints": {
      "budget": "number (required, USD)",
      "timeline": "number (required, weeks)",
      "resources": {
        "developers": "integer (required, min 1)",
        "designers": "integer (optional)",
        "qa_engineers": "integer (optional)"
      }
    },
    "success_criteria": "array<object> (required, min 1)",
    "complexity_category": "enum['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'] (required)"
  },
  "approval_timestamp": "timestamp (required)",
  "approved_by": "integer (required, user_id)"
}
```

**Validation Rules**:
- `goals`: Must have at least 1 goal, max 10 goals
- `budget`: Must be > $0
- `timeline`: Must be > 0 weeks, max 104 weeks (2 years)
- `developers`: Must be >= 1
- `success_criteria`: Each criterion must have `metric` and `target` fields

**Evidence**: Inferred from `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:326 "Business plan"`
**Gap Note**: Data schemas not defined in YAML (Gap #2)

---

### Input Schema 2: Technical Requirements

**Format**: JSON specification
**Source**: Stage 7 (Comprehensive Planning)
**Required Fields**:
```json
{
  "venture_id": "integer (required)",
  "technical_requirements": {
    "functional_requirements": [
      {
        "id": "string (required, unique)",
        "description": "string (required)",
        "priority": "enum['MUST', 'SHOULD', 'COULD', 'WONT'] (required)",
        "complexity": "enum['LOW', 'MEDIUM', 'HIGH'] (required)",
        "acceptance_criteria": "array<string> (required, min 1)"
      }
    ],
    "non_functional_requirements": [
      {
        "id": "string (required, unique)",
        "category": "enum['PERFORMANCE', 'SECURITY', 'SCALABILITY', 'USABILITY'] (required)",
        "description": "string (required)",
        "threshold": "string (required, measurable target)"
      }
    ],
    "technical_constraints": {
      "tech_stack": "array<string> (optional)",
      "integrations": "array<string> (optional)",
      "compliance": "array<string> (optional)"
    }
  }
}
```

**Validation Rules**:
- `functional_requirements`: Min 1, max 100 requirements
- `id`: Must follow pattern `FR-XXX-NNN` (e.g., FR-AUTH-001)
- `acceptance_criteria`: Each requirement must have at least 1 acceptance criterion

**Evidence**: Inferred from `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:327 "Technical requirements"`
**Gap Note**: Data schemas not defined in YAML (Gap #2)

---

### Input Schema 3: Complexity Assessment

**Format**: JSON analysis report
**Source**: Stage 7 (Comprehensive Planning)
**Required Fields**:
```json
{
  "venture_id": "integer (required)",
  "complexity_assessment": {
    "overall_score": "integer (required, 1-10 scale)",
    "dimensions": {
      "technical_complexity": "integer (1-10)",
      "business_complexity": "integer (1-10)",
      "team_complexity": "integer (1-10)",
      "integration_complexity": "integer (1-10)"
    },
    "high_complexity_areas": [
      {
        "area": "string (required)",
        "score": "integer (1-10)",
        "rationale": "string (required)",
        "suggested_mitigation": "string (optional)"
      }
    ],
    "decomposition_strategy": "enum['TOP_DOWN', 'BOTTOM_UP', 'HYBRID'] (required)"
  }
}
```

**Validation Rules**:
- `overall_score`: Must be 1-10 (10 = highest complexity)
- `dimensions`: All dimension scores must be 1-10
- `high_complexity_areas`: Flag areas with score >= 7

**Evidence**: Inferred from `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:328 "Complexity assessment"`
**Gap Note**: Data schemas not defined in YAML (Gap #2)

---

### Output Schema 1: Decomposed Tasks

**Format**: JSON array
**Consumed By**: Stage 9+ (all execution stages)
**Schema**:
```json
{
  "venture_id": "integer (required)",
  "wbs_version": "string (required, e.g., 'v1', 'v2')",
  "tasks": [
    {
      "task_id": "string (required, WBS ID format: 1.1.1)",
      "parent_task_id": "string (optional, null for root tasks)",
      "task_name": "string (required)",
      "description": "string (required)",
      "priority": "enum['MUST', 'SHOULD', 'COULD', 'WONT'] (required)",
      "effort_estimate_hours": "number (required)",
      "complexity": "enum['LOW', 'MEDIUM', 'HIGH'] (required)",
      "acceptance_criteria": "array<string> (required, min 1)",
      "assigned_to": "integer (optional, user_id)",
      "status": "enum['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] (default: NOT_STARTED)",
      "dependencies": "array<string> (optional, array of task_ids)",
      "tags": "array<string> (optional)"
    }
  ],
  "total_effort_hours": "number (required, sum of all task efforts)",
  "created_at": "timestamp (required)",
  "created_by": "integer (required, user_id)"
}
```

**Validation Rules**:
- `task_id`: Must follow WBS ID pattern (e.g., 1.1.1, 2.3.4.1)
- `parent_task_id`: Must exist in same tasks array (referential integrity)
- `effort_estimate_hours`: Must be > 0, max 80 hours (atomic task threshold)
- `acceptance_criteria`: Min 1, max 10 criteria per task
- `total_effort_hours`: Must equal sum of all task `effort_estimate_hours`

**Evidence**: Inferred from `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:330 "Decomposed tasks"`

---

### Output Schema 2: Work Breakdown Structure (WBS)

**Format**: JSON hierarchical tree
**Consumed By**: Stage 9+ (all execution stages)
**Schema**:
```json
{
  "venture_id": "integer (required)",
  "wbs_version": "string (required, e.g., 'v1')",
  "root_nodes": [
    {
      "task_id": "string (required, WBS ID)",
      "task_name": "string (required)",
      "description": "string (required)",
      "effort_estimate_hours": "number (required)",
      "children": [
        {
          "task_id": "string (required)",
          "task_name": "string (required)",
          "children": "array (recursive)"
        }
      ]
    }
  ],
  "depth": "integer (required, max depth of WBS tree)",
  "total_tasks": "integer (required, count of all tasks)",
  "total_effort_hours": "number (required)",
  "created_at": "timestamp (required)"
}
```

**Validation Rules**:
- `depth`: Must be 3-5 levels (per proposed metric threshold)
- `total_tasks`: Must match count of nodes in tree
- `children`: Recursive structure, max depth enforced

**Evidence**: Inferred from `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:331 "Work breakdown structure"`

---

### Output Schema 3: Dependencies Map

**Format**: JSON directed acyclic graph (DAG)
**Consumed By**: Stage 9+ (all execution stages)
**Schema**:
```json
{
  "venture_id": "integer (required)",
  "wbs_version": "string (required)",
  "dependencies": [
    {
      "from_task_id": "string (required, prerequisite task)",
      "to_task_id": "string (required, dependent task)",
      "dependency_type": "enum['FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH'] (default: FINISH_TO_START)",
      "lag_days": "number (optional, default: 0)",
      "is_critical_path": "boolean (required)"
    }
  ],
  "critical_path": {
    "task_ids": "array<string> (required, ordered list of tasks on critical path)",
    "duration_weeks": "number (required)",
    "duration_hours": "number (required)"
  },
  "blockers": [
    {
      "task_id": "string (required)",
      "blocker_type": "enum['CIRCULAR_DEPENDENCY', 'MISSING_PREREQUISITE', 'RESOURCE_CONFLICT'] (required)",
      "description": "string (required)",
      "resolution": "string (required)"
    }
  ],
  "created_at": "timestamp (required)"
}
```

**Validation Rules**:
- `dependencies`: Must form DAG (no circular dependencies allowed)
- `from_task_id`, `to_task_id`: Must exist in tasks array (referential integrity)
- `critical_path.task_ids`: Must be ordered sequence with no gaps
- `blockers`: Must be empty array for exit gate validation (all blockers resolved)

**Evidence**: Inferred from `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:332 "Dependencies map"`

---

## Tunable Parameters

### Category 1: WBS Depth Constraints

| Parameter | Default | Range | Unit | Description | Evidence |
|-----------|---------|-------|------|-------------|----------|
| `MIN_WBS_DEPTH` | 3 | 2-5 | levels | Minimum WBS hierarchy depth (exit gate validation) | Proposed |
| `MAX_WBS_DEPTH` | 5 | 3-10 | levels | Maximum WBS hierarchy depth (prevent over-engineering) | Proposed |
| `TARGET_WBS_DEPTH` | 4 | 3-5 | levels | Ideal WBS depth for most ventures | Proposed |

**Adjustment Triggers**:
- **Increase MIN/MAX**: High complexity ventures (overall_score >= 8)
- **Decrease MIN/MAX**: Low complexity ventures (overall_score <= 3)

**Evidence**: Proposed threshold based on `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:334 "Decomposition depth"` metric
**Gap Note**: No thresholds in YAML (Gap #1)

---

### Category 2: Task Clarity Thresholds

| Parameter | Default | Range | Unit | Description | Evidence |
|-----------|---------|-------|------|-------------|----------|
| `MIN_ACCEPTANCE_CRITERIA` | 1 | 1-5 | count | Minimum acceptance criteria per task | Proposed |
| `TARGET_TASK_CLARITY_PCT` | 95 | 80-100 | % | Percentage of tasks with clear acceptance criteria (exit gate) | Proposed |
| `MAX_TASK_DESCRIPTION_LENGTH` | 500 | 100-1000 | chars | Max characters for task description (force conciseness) | Proposed |
| `MIN_TASK_DESCRIPTION_LENGTH` | 50 | 20-200 | chars | Min characters for task description (ensure detail) | Proposed |

**Adjustment Triggers**:
- **Increase MIN_ACCEPTANCE_CRITERIA**: Critical ventures (high business impact)
- **Decrease TARGET_TASK_CLARITY_PCT**: Exploratory ventures (allow ambiguity)

**Evidence**: Proposed threshold based on `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:335 "Task clarity"` metric
**Gap Note**: No thresholds in YAML (Gap #1)

---

### Category 3: Dependency Resolution Rules

| Parameter | Default | Range | Unit | Description | Evidence |
|-----------|---------|-------|------|-------------|----------|
| `TARGET_DEPENDENCY_RESOLUTION_PCT` | 100 | 90-100 | % | Percentage of dependencies mapped (exit gate) | Proposed |
| `MAX_TASK_DEPENDENCIES` | 5 | 1-10 | count | Max dependencies per task (prevent over-coupling) | Proposed |
| `ALLOW_CIRCULAR_DEPENDENCIES` | false | true/false | boolean | Allow circular dependencies (must resolve before exit) | Proposed |
| `MAX_CRITICAL_PATH_DURATION_WEEKS` | 52 | 1-104 | weeks | Max critical path duration (trigger TIMELINE-001 if exceeded) | Proposed |

**Adjustment Triggers**:
- **Increase MAX_CRITICAL_PATH_DURATION**: Long-term ventures (>1 year timeline)
- **Set ALLOW_CIRCULAR_DEPENDENCIES=true**: Complex ventures with iterative tasks (rare)

**Evidence**: Proposed threshold based on `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:336 "Dependency resolution"` metric
**Gap Note**: No thresholds in YAML (Gap #1)

---

### Category 4: Task Effort Estimation

| Parameter | Default | Range | Unit | Description | Evidence |
|-----------|---------|-------|------|-------------|----------|
| `MIN_TASK_EFFORT_HOURS` | 1 | 0.5-8 | hours | Minimum effort for atomic task (prevent over-decomposition) | Proposed |
| `MAX_TASK_EFFORT_HOURS` | 80 | 40-160 | hours | Maximum effort for atomic task (force breakdown if exceeded) | Proposed |
| `TARGET_TASK_EFFORT_HOURS` | 16 | 8-40 | hours | Ideal task size (~2 days for 1 developer) | Proposed |
| `EFFORT_ESTIMATION_BUFFER_PCT` | 20 | 0-50 | % | Add buffer to effort estimates for risk mitigation | Proposed |

**Adjustment Triggers**:
- **Increase BUFFER_PCT**: High uncertainty ventures (new tech stack, unfamiliar domain)
- **Decrease MAX_TASK_EFFORT_HOURS**: Agile ventures (prefer smaller tasks)

**Evidence**: Proposed based on common project management practices
**Gap Note**: No task granularity guidelines in YAML (Gap #9)

---

### Category 5: Recursion Control

| Parameter | Default | Range | Unit | Description | Evidence |
|-----------|---------|-------|------|-------------|----------|
| `MAX_RECURSIONS_PER_VENTURE` | 3 | 1-5 | count | Max times Stage 8 can be recursed to before escalation | critique:109 |
| `TECH_001_SEVERITY_THRESHOLD` | HIGH | HIGH/MEDIUM | enum | Severity level required to trigger TECH-001 recursion | critique:38 |
| `RESOURCE_001_SHORTFALL_PCT` | 20 | 10-50 | % | Resource shortfall % to trigger RESOURCE-001 recursion | Proposed |
| `TIMELINE_001_OVERAGE_PCT` | 10 | 5-30 | % | Timeline overage % to trigger TIMELINE-001 recursion | Proposed |
| `RECURSION_APPROVAL_REQUIRED` | true | true/false | boolean | Require Chairman approval for recursion | critique:118 |

**Adjustment Triggers**:
- **Increase MAX_RECURSIONS**: Highly experimental ventures (expect iteration)
- **Decrease SEVERITY_THRESHOLD to MEDIUM**: Allow more recursions (higher quality bar)
- **Set RECURSION_APPROVAL_REQUIRED=false**: Fast-moving ventures (trust EXEC agent)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:109 "Max recursions: 3"` and `critique:118 "Requires Chairman approval"`

---

### Category 6: Automation Tuning

| Parameter | Default | Range | Unit | Description | Evidence |
|-----------|---------|-------|------|-------------|----------|
| `ENABLE_AI_ASSISTED_WBS` | false | true/false | boolean | Enable AI-suggested WBS generation | critique:161 |
| `AI_CONFIDENCE_THRESHOLD` | 0.8 | 0.5-1.0 | decimal | Min confidence score for AI suggestions (auto-accept if >=) | Proposed |
| `AUTOMATION_LEVEL` | 3 | 1-5 | scale | Current automation level (1=manual, 5=fully auto) | stages.yaml:364 |
| `TARGET_AUTOMATION_PCT` | 80 | 50-95 | % | Target percentage of substages using automation | critique:161 |
| `ENABLE_AUTO_DEPENDENCY_MAPPING` | false | true/false | boolean | Enable automated dependency analysis | Proposed |

**Adjustment Triggers**:
- **Set ENABLE_AI_ASSISTED_WBS=true**: When AI models reach production quality
- **Increase AI_CONFIDENCE_THRESHOLD**: Critical ventures (require higher AI confidence)
- **Decrease AUTOMATION_LEVEL**: New system (start manual, gradually automate)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:161 "Target State: 80% automation"` and `stages.yaml:364 "Manual → Assisted → Auto"`

---

### Category 7: Performance Limits

| Parameter | Default | Range | Unit | Description | Evidence |
|-----------|---------|-------|------|-------------|----------|
| `MAX_DECOMPOSITION_TIME_SECONDS` | 2 | 1-10 | seconds | Max time for re-decomposition logic to run | critique:129 |
| `MAX_RECURSION_DETECTION_TIME_MS` | 100 | 50-500 | milliseconds | Max time to detect recursion trigger | critique:130 |
| `MAX_WBS_COMPARISON_TIME_SECONDS` | 1 | 0.5-5 | seconds | Max time to generate v1 vs v2 diff | critique:131 |
| `MAX_TOTAL_STAGE_DURATION_HOURS` | 16 | 8-40 | hours | Max total time for Stage 8 execution (manual mode) | Proposed |
| `TARGET_TOTAL_STAGE_DURATION_HOURS` | 2 | 1-8 | hours | Target time with 80% automation | Proposed |

**Adjustment Triggers**:
- **Increase MAX_DECOMPOSITION_TIME**: Very large WBS (>100 tasks)
- **Decrease TARGET_DURATION**: When automation implemented (faster execution)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:129-131 "Performance Requirements"`

---

### Category 8: Validation Rules

| Parameter | Default | Range | Unit | Description | Evidence |
|-----------|---------|-------|------|-------------|----------|
| `REQUIRE_ALL_EXIT_GATES` | true | true/false | boolean | All 3 exit gates must pass (vs any 2/3) | stages.yaml:341-344 |
| `ENABLE_WBS_VALIDATOR_AGENT` | false | true/false | boolean | Use AI agent for automated exit gate validation | Proposed |
| `VALIDATION_STRICTNESS` | HIGH | LOW/MEDIUM/HIGH | enum | Validation strictness level (affects pass/fail thresholds) | Proposed |
| `ALLOW_MANUAL_OVERRIDE` | false | true/false | boolean | Allow manual override of failed exit gates (risk acceptance) | Proposed |

**Adjustment Triggers**:
- **Set VALIDATION_STRICTNESS=LOW**: Exploratory ventures (allow flexibility)
- **Set ALLOW_MANUAL_OVERRIDE=true**: Time-critical ventures (accept risk to meet deadline)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:341-344 "exit gates"`

---

## Configuration Examples

### Example 1: Low Complexity Venture

**Context**: Simple CRUD application, small team, 8-week timeline

```yaml
# Stage 8 Configuration: Low Complexity Venture
MIN_WBS_DEPTH: 2
MAX_WBS_DEPTH: 4
TARGET_WBS_DEPTH: 3
MIN_ACCEPTANCE_CRITERIA: 1
TARGET_TASK_CLARITY_PCT: 90
MAX_TASK_EFFORT_HOURS: 40
EFFORT_ESTIMATION_BUFFER_PCT: 10
MAX_RECURSIONS_PER_VENTURE: 2
AUTOMATION_LEVEL: 2
VALIDATION_STRICTNESS: MEDIUM
```

**Rationale**: Simpler ventures need less decomposition depth, fewer recursions, looser validation

---

### Example 2: High Complexity Venture

**Context**: Distributed system, large team, 52-week timeline, novel tech stack

```yaml
# Stage 8 Configuration: High Complexity Venture
MIN_WBS_DEPTH: 4
MAX_WBS_DEPTH: 6
TARGET_WBS_DEPTH: 5
MIN_ACCEPTANCE_CRITERIA: 2
TARGET_TASK_CLARITY_PCT: 98
MAX_TASK_EFFORT_HOURS: 80
EFFORT_ESTIMATION_BUFFER_PCT: 30
MAX_RECURSIONS_PER_VENTURE: 5
TECH_001_SEVERITY_THRESHOLD: MEDIUM
AUTOMATION_LEVEL: 3
VALIDATION_STRICTNESS: HIGH
```

**Rationale**: Complex ventures need deeper decomposition, more recursions, stricter validation, higher buffer

---

### Example 3: AI-Assisted Automation Mode

**Context**: System has implemented AI agents, target 80% automation

```yaml
# Stage 8 Configuration: AI-Assisted Mode
ENABLE_AI_ASSISTED_WBS: true
AI_CONFIDENCE_THRESHOLD: 0.85
AUTOMATION_LEVEL: 4
TARGET_AUTOMATION_PCT: 80
ENABLE_AUTO_DEPENDENCY_MAPPING: true
ENABLE_WBS_VALIDATOR_AGENT: true
MAX_TOTAL_STAGE_DURATION_HOURS: 3
TARGET_TOTAL_STAGE_DURATION_HOURS: 2
```

**Rationale**: With automation, execution time decreases, AI confidence threshold ensures quality

---

## Parameter Dependencies

**Dependency Graph**:
```
MAX_WBS_DEPTH ──┬──> WBS validation logic
MIN_WBS_DEPTH ──┘

TARGET_TASK_CLARITY_PCT ──> Exit gate 2 validation (Tasks prioritized)

TARGET_DEPENDENCY_RESOLUTION_PCT ──> Exit gate 3 validation (Dependencies mapped)

MAX_RECURSIONS_PER_VENTURE ──> Loop prevention logic
                            ──> Chairman escalation trigger

AUTOMATION_LEVEL ──> ENABLE_AI_ASSISTED_WBS decision
                 ──> ENABLE_AUTO_DEPENDENCY_MAPPING decision
                 ──> TARGET_TOTAL_STAGE_DURATION_HOURS calculation

VALIDATION_STRICTNESS ──> TARGET_TASK_CLARITY_PCT threshold
                      ──> TARGET_DEPENDENCY_RESOLUTION_PCT threshold
                      ──> ALLOW_MANUAL_OVERRIDE behavior
```

**Conflict Rules**:
- If `AUTOMATION_LEVEL < 3`, cannot set `ENABLE_AI_ASSISTED_WBS=true`
- If `MAX_WBS_DEPTH < MIN_WBS_DEPTH`, error (invalid configuration)
- If `TARGET_AUTOMATION_PCT > 80` and `AUTOMATION_LEVEL < 4`, warning (unrealistic target)

---

## Configuration Storage

### Option 1: Environment Variables (Static)

```bash
# .env file
STAGE_8_MIN_WBS_DEPTH=3
STAGE_8_MAX_WBS_DEPTH=5
STAGE_8_TARGET_TASK_CLARITY_PCT=95
STAGE_8_MAX_RECURSIONS_PER_VENTURE=3
```

**Pros**: Simple, no database dependency
**Cons**: Requires deployment to change, no per-venture customization

---

### Option 2: Database Table (Dynamic)

```sql
CREATE TABLE stage_config (
  id SERIAL PRIMARY KEY,
  stage_id INTEGER NOT NULL,
  parameter_name VARCHAR(100) NOT NULL,
  parameter_value TEXT NOT NULL,
  parameter_type VARCHAR(20) NOT NULL, -- 'INTEGER', 'DECIMAL', 'BOOLEAN', 'STRING', 'ENUM'
  venture_id INTEGER REFERENCES ventures(id), -- NULL for system-wide default
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(stage_id, parameter_name, venture_id)
);

-- Example rows
INSERT INTO stage_config (stage_id, parameter_name, parameter_value, parameter_type, venture_id)
VALUES
  (8, 'MIN_WBS_DEPTH', '3', 'INTEGER', NULL), -- System-wide default
  (8, 'MAX_WBS_DEPTH', '5', 'INTEGER', NULL),
  (8, 'MIN_WBS_DEPTH', '4', 'INTEGER', 123); -- Override for venture 123 (high complexity)
```

**Pros**: Dynamic configuration, per-venture customization, no deployment required
**Cons**: Requires database queries, more complex logic

---

### Option 3: YAML Config File (Hybrid)

```yaml
# config/stage-08-config.yaml
stage_8:
  defaults:
    min_wbs_depth: 3
    max_wbs_depth: 5
    target_task_clarity_pct: 95
  venture_overrides:
    123: # High complexity venture
      min_wbs_depth: 4
      max_wbs_depth: 6
    456: # AI-assisted venture
      enable_ai_assisted_wbs: true
      automation_level: 4
```

**Pros**: Version-controlled, readable, supports defaults + overrides
**Cons**: Requires file parsing, deployment to change

**Recommended**: Option 2 (Database Table) for production flexibility

---

## Gap Analysis for Configurability

**Identified Gaps**:
1. **No data schemas defined** - Input/output schemas proposed here, not in YAML (Gap #2)
2. **No metric thresholds defined** - All thresholds proposed here, not in YAML (Gap #1)
3. **No configuration storage system** - Need to implement `stage_config` table
4. **No parameter validation logic** - Need to validate ranges, conflicts, dependencies
5. **No per-venture customization** - Current system assumes one-size-fits-all
6. **No configuration UI** - Need admin panel to adjust parameters
7. **No configuration versioning** - No tracking of parameter changes over time

**Recommended Priority**: Implement gaps #1, #2, #3 (schemas, thresholds, storage)

## Sources Table

| Claim | Source | Evidence |
|-------|--------|----------|
| Input: Business plan | stages.yaml:326 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:326 "Business plan"` |
| Input: Technical requirements | stages.yaml:327 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:327 "Technical requirements"` |
| Input: Complexity assessment | stages.yaml:328 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:328 "Complexity assessment"` |
| Output: Decomposed tasks | stages.yaml:330 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:330 "Decomposed tasks"` |
| Output: WBS | stages.yaml:331 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:331 "Work breakdown structure"` |
| Output: Dependencies map | stages.yaml:332 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:332 "Dependencies map"` |
| Metric: Decomposition depth | stages.yaml:334 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:334 "Decomposition depth"` |
| Metric: Task clarity | stages.yaml:335 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:335 "Task clarity"` |
| Metric: Dependency resolution | stages.yaml:336 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:336 "Dependency resolution"` |
| Max recursions: 3 | critique:109 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:109 "Max recursions: 3"` |
| Chairman approval required | critique:118 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:118 "Requires Chairman approval"` |
| Performance: <2s decomposition | critique:129 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:129 "Decomposition analysis: <2 seconds"` |
| Performance: <100ms detection | critique:130 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:130 "Recursion detection: <100ms"` |
| Performance: <1s comparison | critique:131 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:131 "WBS comparison: <1 second"` |
| Target: 80% automation | critique:161 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:161 "Target State: 80% automation"` |
| Progression mode | stages.yaml:364 | `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:364 "Manual → Assisted → Auto"` |

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
