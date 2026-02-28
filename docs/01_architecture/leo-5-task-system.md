---
category: architecture
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [architecture, auto-generated]
---
# LEO 5.0 Task System Architecture


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Architectural Philosophy](#architectural-philosophy)
  - [Identity vs. Execution](#identity-vs-execution)
  - [Core Innovations](#core-innovations)
- [The Track System](#the-track-system)
  - [Track Definitions](#track-definitions)
  - [Track Selection Logic](#track-selection-logic)
  - [Track Comparison](#track-comparison)
- [Phase Hydration](#phase-hydration)
  - [Hydration Flow](#hydration-flow)
  - [TaskHydrator Implementation](#taskhydrator-implementation)
  - [Template Structure](#template-structure)
- [Wall Enforcement](#wall-enforcement)
  - [Wall Overview](#wall-overview)
  - [Wall Types](#wall-types)
  - [Wall Implementation](#wall-implementation)
  - [Why Walls Are Impenetrable](#why-walls-are-impenetrable)
  - [SAFETY-WALL (Hotfix Compensating Control)](#safety-wall-hotfix-compensating-control)
- [Failure Handling](#failure-handling)
  - [Kickback System](#kickback-system)
  - [Wall Invalidation](#wall-invalidation)
  - [Task Status Extensions](#task-status-extensions)
- [Sub-Agent Orchestration](#sub-agent-orchestration)
  - [Parallel Execution Pattern](#parallel-execution-pattern)
  - [Type-Aware Requirements](#type-aware-requirements)
  - [Phase-Specific Timing](#phase-specific-timing)
  - [SubAgentOrchestrator](#subagentorchestrator)
- [Database Schema](#database-schema)
  - [Core Tables](#core-tables)
  - [View: `sd_execution_dashboard`](#view-sd_execution_dashboard)
- [Component Diagram](#component-diagram)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Architecture
- **Status**: Approved
- **Version**: 5.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-23
- **Tags**: leo-protocol, task-system, governance, execution-model
- **Related SD**: 7ffc037e-a85a-4b31-afae-eb8a00517dd0

## Overview

LEO 5.0 introduces a **Hybrid Architecture** that separates Strategic Directive (SD) identity from execution state. This document describes the technical architecture of the task system that powers SD execution in LEO Protocol.

**Key Insight**: CLAUDE.md files define WHO the agent is (rules, constraints), while Claude Code Tasks define WHAT the agent is doing (state, dependencies, progress).

## Table of Contents

1. [Architectural Philosophy](#architectural-philosophy)
2. [The Track System](#the-track-system)
3. [Phase Hydration](#phase-hydration)
4. [Wall Enforcement](#wall-enforcement)
5. [Failure Handling](#failure-handling)
6. [Sub-Agent Orchestration](#sub-agent-orchestration)
7. [Database Schema](#database-schema)
8. [Component Diagram](#component-diagram)

## Architectural Philosophy

### Identity vs. Execution

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE HYBRID MODEL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   IDENTITY (The Constitution)       EXECUTION (The Work Orders) │
│   ───────────────────────────────       ─────────────────────── │
│                                                                  │
│   CLAUDE.md          ←─────→        Tasks (persistent files)    │
│   CLAUDE_LEAD.md                    ~/.claude/tasks/{SD_ID}/    │
│   CLAUDE_PLAN.md                                                │
│   CLAUDE_EXEC.md                    • Hydrated at handoffs      │
│                                     • Strict dependencies       │
│   • Git-tracked                     • Walls via blockedBy       │
│   • Persistent                      • Per-SD lifecycle          │
│   • Rules & constraints             • State & progress          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Core Innovations

1. **Handoff-Triggered Hydration**: Task lists generated on-demand, not upfront
2. **4 Execution Tracks**: Right-sized governance (FULL → STANDARD → FAST → HOTFIX)
3. **Impenetrable Walls**: `blockedBy` constraints create hard phase boundaries
4. **Kickback System**: Graceful failure recovery with automatic paths
5. **Wall Invalidation**: Mid-phase corrections without SD restart

## The Track System

### Track Definitions

| Track | SD Types | Phases | Walls | PRD Type | Duration |
|-------|----------|--------|-------|----------|----------|
| **FULL** | infrastructure, security, orchestrator | 5 | 5 | Full PRD | Days-Weeks |
| **STANDARD** | feature, enhancement, refactor | 4 | 4 | Standard PRD | Hours-Days |
| **FAST** | fix, documentation | 3 | 3 | Mini-Spec | Hours |
| **HOTFIX** | hotfix, typo, config | 2 | 2 | None | Minutes |

### Track Selection Logic

Track selection is automatic based on SD type, with escalation rules:

```javascript
// lib/tasks/track-selector.js

const TRACK_MAP = {
  'infrastructure': 'FULL',
  'security': 'FULL',
  'orchestrator': 'FULL',
  'feature': 'STANDARD',
  'enhancement': 'STANDARD',
  'refactor': 'STANDARD',
  'fix': 'FAST',
  'documentation': 'FAST',
  'hotfix': 'HOTFIX',
  'typo': 'HOTFIX',
  'config': 'HOTFIX'
};

function selectTrack(sd) {
  let track = TRACK_MAP[sd.sd_type] || 'STANDARD';

  // Escalate if large scope (>200 LOC)
  if (sd.estimated_loc > 200) {
    track = upgradeTrack(track);
  }

  // Force FULL if security-relevant
  if (sd.security_relevant) {
    track = 'FULL';
  }

  return track;
}
```

### Track Comparison

| Aspect | FULL | STANDARD | FAST | HOTFIX |
|--------|------|----------|------|--------|
| Phases | 5 | 4 | 3 | 2 |
| Walls | 5 | 4 | 3 | 2 |
| PRD Required | ✅ Full | ✅ Standard | ⚠️ Mini-Spec | ❌ None |
| Sub-Agents | ✅ Required | ⚠️ Optional | ❌ None | ❌ None |
| BMAD Validation | ✅ 85% | ✅ 75% | ❌ None | ❌ None |
| Verify Phase | ✅ Dedicated | ⚠️ In FINAL | ❌ None | ✅ SAFETY-WALL |

## Phase Hydration

### Hydration Flow

Tasks are generated just-in-time when a handoff transitions occur:

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYDRATION FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Handoff triggered (e.g., LEAD-TO-PLAN)                      │
│                                                                  │
│  2. handoff.js validates gates                                  │
│                                                                  │
│  3. TaskHydrator invoked:                                       │
│     a) Determine track (selectTrack)                            │
│     b) Load template for track + phase                          │
│     c) Interpolate variables ({{SD_ID}}, {{SD_TITLE}})          │
│     d) Create tasks via TaskCreate                              │
│     e) Set up blockedBy dependencies                            │
│                                                                  │
│  4. Next phase tasks are now available                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### TaskHydrator Implementation

```javascript
// lib/tasks/task-hydrator.js

export class TaskHydrator {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async hydratePhase(sdId, targetPhase) {
    // 1. Load SD metadata
    const sd = await this.loadSD(sdId);

    // 2. Determine track
    const track = selectTrack(sd);

    // 3. Load template for track + phase
    const template = await this.loadTemplate(track, targetPhase);

    // 4. Interpolate variables
    const tasks = this.interpolate(template.tasks, {
      SD_ID: sdId,
      SD_TITLE: sd.title,
      SD_TYPE: sd.sd_type,
      TARGET_APP: sd.target_application,
      TRACK: track
    });

    // 5. Create tasks and record hydration event
    const createdTasks = await this.createTasks(tasks);
    await this.recordHydration(sdId, targetPhase, track, createdTasks);

    return createdTasks;
  }
}
```

### Template Structure

```
lib/tasks/templates/
├── tracks/
│   ├── full/          # 5-phase templates
│   ├── standard/      # 4-phase templates
│   ├── fast/          # 3-phase templates
│   └── hotfix/        # 2-phase templates with SAFETY-WALL
├── shared/
│   ├── gates/         # Reusable gate definitions
│   ├── kickback/      # Failure recovery templates
│   └── sub-agents/    # Sub-agent task templates
└── track-selector.js  # Track selection logic
```

## Wall Enforcement

### Wall Overview

Walls are **impenetrable barriers** that enforce phase boundaries using Claude Code Tasks' `blockedBy` constraint.

### Wall Types

| Wall | Tracks | Blocks | Required Gates |
|------|--------|--------|----------------|
| LEAD-WALL | FULL, STANDARD, FAST | PLAN/EXEC-READY | 9-Question (FULL), Scope (STD), Mini-Spec (FAST) |
| PLAN-WALL | FULL, STANDARD | EXEC-READY | PRD Complete, BMAD, Sub-Agents |
| EXEC-WALL | ALL | VERIFY/SAFETY-READY | Tests Pass, Code Review |
| SAFETY-WALL | HOTFIX only | FINAL-READY | Build, Tests, Lint |
| VERIFY-WALL | FULL only | FINAL-READY | Fidelity, Sub-Agent Orch, Retro |
| FINAL-APPROVE | ALL | (completion) | User Stories, PR Merged |

### Wall Implementation

Each wall is a task with `blockedBy` dependencies on all gates in that phase:

```json
{
  "id_template": "{{SD_ID}}-PLAN-WALL",
  "subject": "PLAN VALIDATION COMPLETE",
  "description": "All PLAN phase gates have passed. EXEC phase is now unblocked.",
  "blockedBy": ["{{SD_ID}}-GATE-PRD", "{{SD_ID}}-GATE-BMAD", "{{SD_ID}}-GATE-SCORE"],
  "metadata": {
    "category": "wall",
    "is_phase_boundary": true,
    "next_phase": "EXEC",
    "gates_required": ["PRD_COMPLETE", "BMAD_VALIDATION", "SCORE_THRESHOLD"]
  }
}
```

### Why Walls Are Impenetrable

```
EXEC-READY cannot start because:
  blockedBy: [PLAN-WALL]

PLAN-WALL cannot complete because:
  blockedBy: [GATE-PRD, GATE-BMAD, GATE-SCORE]

Gates cannot complete until validation logic passes.

∴ EXEC is physically blocked until PLAN validation succeeds.
```

### SAFETY-WALL (Hotfix Compensating Control)

The HOTFIX track skips LEAD and PLAN phases for speed. The SAFETY-WALL provides compensating controls:

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOTFIX SAFETY-WALL                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EXEC-IMPL completes                                            │
│       │                                                          │
│       ├──────────────────┬──────────────────┐                   │
│       │                  │                  │                   │
│       ▼                  ▼                  ▼                   │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐             │
│  │  BUILD  │        │  TESTS  │        │  LINT   │             │
│  │  PASS   │        │  PASS   │        │  PASS   │             │
│  └────┬────┘        └────┬────┘        └────┬────┘             │
│       │                  │                  │                   │
│       └──────────────────┼──────────────────┘                   │
│                          │                                      │
│                          ▼                                      │
│                    ┌───────────┐                                │
│                    │  SAFETY   │                                │
│                    │   WALL    │                                │
│                    └─────┬─────┘                                │
│                          │                                      │
│                          ▼                                      │
│                    FINAL-APPROVE                                │
│                                                                  │
│  Compensates for: LEAD-WALL + PLAN-WALL                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Failure Handling

### Kickback System

When gates fail after 3 retries, the system creates a kickback task that:

1. Invalidates the current wall
2. Returns work to previous phase
3. Carries failure context
4. Provides recovery path

```
┌─────────────────────────────────────────────────────────────────┐
│                    FAILURE HANDLING                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Gate Attempt #1 → FAIL                                         │
│       │                                                          │
│       ▼                                                          │
│  Gate Attempt #2 → FAIL                                         │
│       │                                                          │
│       ▼                                                          │
│  Gate Attempt #3 → FAIL                                         │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────┐                            │
│  │  KICKBACK TASK AUTO-CREATED    │                            │
│  │                                 │                            │
│  │  • Invalidates current wall    │                            │
│  │  • Returns to previous phase   │                            │
│  │  • Carries failure reason      │                            │
│  └─────────────────────────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Wall Invalidation

Mid-phase corrections without SD restart:

```bash
# Invalidate a wall for correction
node scripts/handoff.js invalidate PLAN-WALL SD-001 --reason "PRD scope change"

# This creates:
# 1. SD-001-CORRECTION-PRD (new correction task)
# 2. SD-001-CORRECTION-SYNTHESIS (blocked by above)
# 3. SD-001-PLAN-WALL-V2 (new versioned wall)

# After correction completes:
# - Original PLAN-WALL marked "superseded"
# - PLAN-WALL-V2 passes
# - EXEC work resumes from where it left off
```

### Task Status Extensions

```json
{
  "status": "failed",
  "retry_count": 3,
  "max_retries": 3,
  "failure_reason": "PRD missing required sections: security, testing",
  "kickback_created": "SD-001-KICKBACK-PLAN",
  "last_attempt": "2026-01-23T10:30:00Z"
}
```

```json
{
  "status": "paused",
  "paused_reason": "Wall invalidation - PRD scope change",
  "resume_after": "SD-001-PLAN-WALL-V2",
  "paused_at": "2026-01-23T10:30:00Z"
}
```

```json
{
  "status": "invalidated",
  "invalidation_reason": "PRD scope change required",
  "superseded_by": "SD-001-PLAN-WALL-V2",
  "invalidated_at": "2026-01-23T10:30:00Z"
}
```

## Sub-Agent Orchestration

### Parallel Execution Pattern

In FULL track, PLAN phase spawns multiple sub-agents in parallel:

```
                    ┌─────────────────┐
                    │   PRD Created   │
                    │  (PLAN-PRD)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   DESIGN    │  │   DATABASE  │  │   SECURITY  │
    │  Sub-Agent  │  │  Sub-Agent  │  │  Sub-Agent  │
    │  (parallel) │  │  (parallel) │  │  (parallel) │
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                │                │
           │   blockedBy: [DESIGN, DB, SECURITY]
           └────────────────┼────────────────┘
                            │
                            ▼
                  ┌─────────────────┐
                  │    SYNTHESIS    │
                  │   (combines)    │
                  └─────────────────┘
```

### Type-Aware Requirements

Different SD types require different sub-agents:

```javascript
// lib/tasks/track-selector.js

export const SUBAGENT_REQUIREMENTS = {
  byType: {
    feature: {
      required: ['TESTING', 'DESIGN', 'STORIES'],
      recommended: ['UAT', 'VALIDATION']
    },
    infrastructure: {
      required: ['GITHUB', 'DOCMON'],
      recommended: ['TESTING', 'VALIDATION']
    },
    bugfix: {
      required: ['RCA', 'REGRESSION', 'TESTING'],
      recommended: ['RETRO']
    },
    security: {
      required: ['SECURITY', 'DATABASE'],
      recommended: ['RISK', 'TESTING']
    },
    hotfix: {
      required: [],
      recommended: []
    }
  }
};
```

### Phase-Specific Timing

```javascript
export const SUBAGENT_TIMING = {
  PLAN_PHASE: ['DESIGN', 'STORIES', 'API', 'DATABASE'],
  EXEC_PHASE: ['TESTING', 'UAT', 'VALIDATION', 'REGRESSION'],
  FINAL_PHASE: ['RETRO'],
  ANY_PHASE: ['SECURITY', 'RISK', 'RCA', 'DOCMON', 'GITHUB']
};
```

### SubAgentOrchestrator

```javascript
// lib/tasks/subagent-orchestrator.js

export class SubAgentOrchestrator {
  async getRequiredSubAgents(sdId, phase) {
    const sd = await this._loadSD(sdId);
    const requirements = getSubAgentRequirements(sd.sd_type, sd.categories || []);
    const phaseAgents = this._filterByPhase(requirements, phase);

    return {
      sdId, sdType: sd.sd_type, phase,
      required: phaseAgents.required,
      recommended: phaseAgents.recommended,
      all: [...phaseAgents.required, ...phaseAgents.recommended]
    };
  }

  async spawnSubAgents(sdId, phase, options = {}) {
    const agentReqs = await this.getRequiredSubAgents(sdId, phase);
    const agentsToSpawn = options.includeRecommended ? agentReqs.all : agentReqs.required;

    const executions = [];
    for (const agentCode of agentsToSpawn) {
      const execution = await this._createExecution(sdUuid, agentCode, phase, options);
      executions.push(execution);
    }

    return {
      success: true,
      spawned: executions,
      synthesisBlockedBy: agentsToSpawn.map(a => `${sd.id}-${phase}-${a}`)
    };
  }

  async checkSynthesisReady(sdId, phase) {
    const executions = await this.supabase
      .from('sub_agent_execution_results')
      .select('*')
      .eq('sd_id', sdUuid)
      .eq('phase', phase);

    const pending = executions.filter(e =>
      e.status === 'pending' || e.status === 'running'
    );

    return {
      ready: pending.length === 0,
      pending,
      completed: executions.filter(e => e.status === 'completed'),
      failed: executions.filter(e => e.status === 'failed')
    };
  }
}
```

## Database Schema

### Core Tables

#### `sd_wall_states`
Tracks wall status per SD:

```sql
CREATE TABLE sd_wall_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id),
  wall_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'blocked', 'ready', 'passed', 'invalidated')),
  track TEXT NOT NULL,
  gates_required JSONB DEFAULT '[]',
  gates_passed JSONB DEFAULT '[]',
  UNIQUE(sd_id, wall_name)
);
```

#### `gate_execution_history`
Records all gate attempts:

```sql
CREATE TABLE gate_execution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id),
  gate_name TEXT NOT NULL,
  wall_name TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'blocked', 'skipped')),
  score INTEGER,
  failure_reason TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `kickback_events`
Tracks failure kickbacks:

```sql
CREATE TABLE kickback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id),
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  failed_gate TEXT,
  retry_count INTEGER DEFAULT 0,
  invalidated_wall TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
```

#### `wall_invalidation_log`
Tracks wall invalidations:

```sql
CREATE TABLE wall_invalidation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id),
  wall_name TEXT NOT NULL,
  invalidation_reason TEXT NOT NULL,
  new_wall_version TEXT NOT NULL,
  paused_tasks JSONB DEFAULT '[]',
  correction_tasks JSONB DEFAULT '[]',
  invalidated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
```

#### `sub_agent_execution_results`
Tracks sub-agent executions:

```sql
CREATE TABLE sub_agent_execution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id),
  agent_code TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'timeout')),
  verdict TEXT CHECK (verdict IN ('PASS', 'FAIL', 'BLOCKED', 'SKIP')),
  output_summary TEXT,
  recommendations JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(sd_id, agent_code, phase)
);
```

#### `task_hydration_log`
Records phase hydration events:

```sql
CREATE TABLE task_hydration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id),
  phase TEXT NOT NULL,
  track TEXT NOT NULL,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  task_ids JSONB DEFAULT '[]',
  hydrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### View: `sd_execution_dashboard`

Combines wall, gate, and kickback data for monitoring:

```sql
CREATE VIEW sd_execution_dashboard AS
SELECT
  w.sd_id,
  w.track,
  COUNT(DISTINCT w.wall_name) as total_walls,
  COUNT(DISTINCT w.wall_name) FILTER (WHERE w.status = 'passed') as passed_walls,
  COUNT(DISTINCT g.gate_name) as total_gates,
  COUNT(DISTINCT g.gate_name) FILTER (WHERE g.status = 'passed') as passed_gates,
  COUNT(k.id) as kickback_count,
  COUNT(i.id) as invalidation_count,
  MAX(g.executed_at) as last_activity
FROM sd_wall_states w
LEFT JOIN gate_execution_history g ON g.sd_id = w.sd_id
LEFT JOIN kickback_events k ON k.sd_id = w.sd_id
LEFT JOIN wall_invalidation_log i ON i.sd_id = w.sd_id
GROUP BY w.sd_id, w.track;
```

## Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                     LEO 5.0 COMPONENTS                          │
└────────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│   CLAUDE.md Files   │  ← Identity Layer (git-tracked)
│ • CLAUDE_LEAD.md    │
│ • CLAUDE_PLAN.md    │
│ • CLAUDE_EXEC.md    │
└──────────┬──────────┘
           │
           │ Loaded at phase start
           │
           ▼
┌─────────────────────┐         ┌─────────────────────┐
│   Handoff System    │────────▶│   TaskHydrator      │
│  (handoff.js)       │         │ • selectTrack()     │
│ • Execute handoff   │         │ • loadTemplate()    │
│ • Validate gates    │         │ • interpolate()     │
│ • Trigger hydration │         │ • createTasks()     │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           │                               │ Creates tasks
           │                               │
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   WallManager       │         │ Claude Code Tasks   │
│ • checkWallStatus() │         │ (execution layer)   │
│ • recordGatePassed()│         │ • Task dependencies │
│ • getWallOverview() │         │ • blockedBy chains  │
└──────────┬──────────┘         │ • Status tracking   │
           │                    └──────────┬──────────┘
           │                               │
           │                               │ Blocks/unblocks
           │                               │
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│ KickbackManager     │         │  CorrectionManager  │
│ • createKickback()  │         │ • invalidateWall()  │
│ • trackRetries()    │         │ • pauseTasks()      │
│ • getPending()      │         │ • createCorrection()│
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           │                               │
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│ SubAgentOrchestrator│         │   Supabase DB       │
│ • getRequired()     │────────▶│ • sd_wall_states    │
│ • spawnSubAgents()  │         │ • gate_execution    │
│ • checkSynthesis()  │         │ • kickback_events   │
└─────────────────────┘         │ • sub_agent_results │
                                └─────────────────────┘
```

## Related Documentation

- [LEO Protocol Testing Improvements](../reference/leo-protocol-testing-improvements-2025-10-12.md) - Testing patterns
- [LEO 5.0 Operational Guide](../06_deployment/leo-5-operations.md) - Operations and runbook
- [Command Ecosystem](../leo/commands/command-ecosystem.md) - Inter-command workflows

## Version History

- **5.0.0** (2026-01-23): Initial LEO 5.0 architecture documentation
  - Hybrid Identity + Execution model
  - 4 execution tracks (FULL, STANDARD, FAST, HOTFIX)
  - Handoff-triggered hydration
  - Wall enforcement via blockedBy
  - Kickback and correction systems
  - Sub-agent orchestration with type-aware requirements
