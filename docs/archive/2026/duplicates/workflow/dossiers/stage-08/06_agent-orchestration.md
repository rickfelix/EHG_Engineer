---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [CrewAI Agent Mapping](#crewai-agent-mapping)
  - [Proposed Agent Architecture](#proposed-agent-architecture)
  - [Agent Workflow (CrewAI Sequential Process)](#agent-workflow-crewai-sequential-process)
- [Governance Framework](#governance-framework)
  - [LEAD Agent Governance (Strategic Oversight)](#lead-agent-governance-strategic-oversight)
  - [PLAN Agent Governance (Pre-EXEC Validation)](#plan-agent-governance-pre-exec-validation)
  - [EXEC Agent Governance (Primary Owner)](#exec-agent-governance-primary-owner)
  - [Chairman Governance (Recursion Approval)](#chairman-governance-recursion-approval)
- [Human-in-the-Loop (HITL) Requirements](#human-in-the-loop-hitl-requirements)
  - [Manual Review Points](#manual-review-points)
  - [Automation vs Human Review](#automation-vs-human-review)
- [Sub-Agent Coordination Patterns](#sub-agent-coordination-patterns)
  - [Pattern 1: Sequential Decomposition (Current Manual Process)](#pattern-1-sequential-decomposition-current-manual-process)
  - [Pattern 2: Parallel AI-Assisted Decomposition (Proposed)](#pattern-2-parallel-ai-assisted-decomposition-proposed)
  - [Pattern 3: Recursion Re-Decomposition (TECH-001 Handling)](#pattern-3-recursion-re-decomposition-tech-001-handling)
- [Integration Points with Other Agents](#integration-points-with-other-agents)
- [Delegation and Escalation Rules](#delegation-and-escalation-rules)
  - [Delegation (EXEC Agent → AI Agents)](#delegation-exec-agent-ai-agents)
  - [Escalation (EXEC Agent → Chairman)](#escalation-exec-agent-chairman)
- [Performance Metrics for Agent Orchestration](#performance-metrics-for-agent-orchestration)
- [Gap Analysis for Agent Orchestration](#gap-analysis-for-agent-orchestration)
- [Sources Table](#sources-table)

<!-- ARCHIVED: 2026-01-26T16:26:46.146Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-08\06_agent-orchestration.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 8 Agent Orchestration & Governance


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: sd, handoff, validation, reference

## CrewAI Agent Mapping

**Current State**: No CrewAI agent mapping defined for Stage 8
**Gap Reference**: Gap #5 (Feeds SD-CREWAI-ARCHITECTURE-001)

### Proposed Agent Architecture

#### Primary Agent: Problem Decomposer Agent

**Role**: Decomposition Specialist
**Goal**: Break down complex venture problems into actionable WBS tasks
**Backstory**: Expert in work breakdown structures, task decomposition, and dependency analysis with 10+ years experience in project planning

**Capabilities**:
- Analyze business plans and technical requirements
- Create hierarchical work breakdown structures
- Identify task dependencies and critical paths
- Assess task complexity and effort

**Tools**:
- WBS generator (AI-assisted or manual)
- Dependency graph analyzer
- Complexity scoring engine
- Task effort estimator

**LLM Parameters**:
- Model: GPT-4 or Claude Sonnet 3.5
- Temperature: 0.3 (precise, structured decomposition)
- Max tokens: 4000 (large WBS structures)

**Inputs** (from Stage 7):
- Business plan document
- Technical requirements specification
- Complexity assessment report

**Outputs** (to Stage 9):
- Decomposed task list (JSON)
- Work breakdown structure (hierarchical tree)
- Dependencies map (directed graph)

**Evidence**: No current implementation - proposed architecture
**SD Cross-Reference**: Feeds SD-CREWAI-ARCHITECTURE-001 (CrewAI agent definitions)

---

#### Supporting Agent: Dependency Analyzer Agent

**Role**: Dependency Mapping Specialist
**Goal**: Identify task dependencies, calculate critical paths, resolve blockers
**Backstory**: Expert in critical path method (CPM), PERT analysis, and scheduling optimization

**Capabilities**:
- Parse task lists to identify dependencies
- Construct directed acyclic graphs (DAG)
- Calculate critical path and project duration
- Detect circular dependencies and blockers

**Tools**:
- DAG builder
- Critical path calculator
- Blocker detection algorithm
- Gantt chart generator

**LLM Parameters**:
- Model: GPT-4 or Claude Sonnet 3.5
- Temperature: 0.2 (deterministic graph analysis)
- Max tokens: 2000 (dependency graphs)

**Collaboration**:
- Works in parallel with Problem Decomposer Agent
- Receives WBS from Problem Decomposer Agent
- Returns dependency graph and critical path

**Evidence**: No current implementation - proposed architecture
**SD Cross-Reference**: Feeds SD-CREWAI-ARCHITECTURE-001

---

#### Validation Agent: WBS Validator Agent

**Role**: Quality Assurance for WBS
**Goal**: Validate WBS completeness, clarity, and feasibility
**Backstory**: Quality assurance specialist ensuring WBS meets exit gate criteria

**Capabilities**:
- Check WBS depth (3-5 levels)
- Validate task clarity (acceptance criteria present)
- Verify dependency resolution (100% mapped)
- Flag potential recursion risks (technical feasibility)

**Tools**:
- WBS depth analyzer
- Task clarity checker (NLP-based)
- Dependency completeness validator
- Exit gate validation framework

**LLM Parameters**:
- Model: GPT-4 or Claude Sonnet 3.5
- Temperature: 0.1 (strict validation)
- Max tokens: 1500 (validation reports)

**Validation Rules**:
- Decomposition depth: 3-5 levels (fail if <3 or >5)
- Task clarity: >95% tasks have acceptance criteria (fail if <95%)
- Dependency resolution: 100% dependencies mapped (fail if <100%)

**Evidence**: No current implementation - proposed architecture
**SD Cross-Reference**: Feeds SD-CREWAI-ARCHITECTURE-001

---

### Agent Workflow (CrewAI Sequential Process)

```
┌─────────────────────────────────────────────────────────────────┐
│ Stage 8 CrewAI Crew: Problem Decomposition Crew                │
└─────────────────────────────────────────────────────────────────┘

Step 1: Problem Decomposer Agent
  - Input: Business plan, Technical requirements, Complexity assessment
  - Task: Create WBS v1 (Substages 8.1 + 8.2)
  - Output: WBS v1 (JSON), Task list
  - Duration: ~6 hours (manual) → ~1 hour (AI-assisted)
        ↓
Step 2: Dependency Analyzer Agent
  - Input: WBS v1 from Step 1
  - Task: Map dependencies, calculate critical path (Substage 8.3)
  - Output: Dependency graph (DAG), Critical path definition
  - Duration: ~5 hours (manual) → ~30 minutes (AI-assisted)
        ↓
Step 3: WBS Validator Agent
  - Input: WBS v1, Dependency graph from Steps 1-2
  - Task: Validate exit gates, check metrics thresholds
  - Output: Validation report (pass/fail), Identified issues
  - Duration: ~30 minutes (automated)
        ↓
Decision Point:
  - If validation PASS: Proceed to Stage 9
  - If validation FAIL: Return to Step 1 with feedback
  - If TECH-001 triggered: Wait for Chairman approval, then re-run crew with technical constraints
```

**Total Duration**:
- Manual (current): 13.5 hours
- AI-Assisted (target): 2 hours (85% reduction)
- Automation Target: 80% (per critique line 161)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:161 "Target State: 80% automation"`

---

## Governance Framework

### LEAD Agent Governance (Strategic Oversight)

**Role**: Stage 8 has no LEAD agent involvement (EXEC-only stage)
**Rationale**: Decomposition is technical execution, not strategic decision-making
**Escalation Path**: Chairman approval required for TECH-001 recursion (HIGH severity)

**Exception**: LEAD agent may review WBS if recursion escalates beyond max 3 loops

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:19 "Clear ownership (EXEC)"`

---

### PLAN Agent Governance (Pre-EXEC Validation)

**Role**: PLAN agent completed in Stage 7 (no direct Stage 8 involvement)
**Handoff**: Stage 7 PLAN outputs become Stage 8 EXEC inputs
**Validation Point**: Entry gates ensure PLAN phase approved before EXEC begins

**Recursion Handling**:
- If Stage 8 triggers RESOURCE-001 or TIMELINE-001, returns to Stage 7 PLAN agent
- PLAN agent must re-approve resource/timeline adjustments

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:59-63 "Triggers FROM This Stage: Stage 7"`

---

### EXEC Agent Governance (Primary Owner)

**Role**: EXEC agent owns all Stage 8 substages
**Responsibilities**:
1. Execute Substage 8.1 (Problem Analysis)
2. Execute Substage 8.2 (Task Breakdown) - create WBS v1
3. Execute Substage 8.3 (Dependency Mapping) - map dependencies, resolve blockers
4. Validate exit gates (Problems decomposed, Tasks prioritized, Dependencies mapped)
5. Handle TECH-001 recursion (re-decompose with technical constraints)

**Autonomy Level**: HIGH
- No approval required for WBS v1 creation
- Chairman approval required only for recursion decisions

**Accountability**:
- Exit gates must pass before Stage 9 entry
- WBS quality measured by metrics (depth, clarity, dependency resolution)
- Recursion decisions logged for performance tracking

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:19 "Clear ownership (EXEC)"`

---

### Chairman Governance (Recursion Approval)

**Role**: Approve HIGH severity recursion decisions
**Trigger**: Stage 10 TECH-001 (blocking technical issues)
**Approval Interface**:
1. Review WBS v1 vs proposed WBS v2 comparison
2. Review blocking issues from Stage 10 technical review
3. Review suggested decomposition changes
4. Decide: Approve recursion, Modify scope, Reject recursion

**Decision Options**:
- **Approve Recursion**: Apply WBS v2, return to Stage 8
- **Modify Scope**: Remove blocked tasks, proceed with simplified WBS v1
- **Reject Recursion**: Accept technical debt, proceed with WBS v1
- **Allocate Budget**: Approve hiring/contracting to resolve technical blocks

**Override Capability**: Chairman can skip recursion and accept technical debt

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:118-126 "Chairman Controls"`

**Approval SLA**: <24 hours for recursion decisions (prevent Stage 8 bottleneck)

---

## Human-in-the-Loop (HITL) Requirements

### Manual Review Points

| Substage | HITL Trigger | Reviewer | Approval Required? | Evidence |
|----------|--------------|----------|-------------------|----------|
| 8.1 Problem Analysis | Core problems identified | EXEC agent | NO (self-review) | stages.yaml:349 |
| 8.2 Task Breakdown | WBS v1 created | EXEC agent | NO (self-review) | stages.yaml:356 |
| 8.3 Dependency Mapping | Dependencies mapped | EXEC agent | NO (self-review) | stages.yaml:362 |
| Exit Gates | All 3 gates checked | WBS Validator Agent | YES (automated validation) | stages.yaml:341-344 |
| TECH-001 Recursion | Stage 10 triggers recursion | Chairman | YES (manual approval) | critique:118-119 |

### Automation vs Human Review

**Current State** (Manual):
- Problem analysis: 100% human (2.5 hours)
- Task breakdown: 100% human (6 hours)
- Dependency mapping: 100% human (5 hours)
- Exit gate validation: 100% human (30 minutes)
- **Total**: 14 hours, 0% automation

**Target State** (80% Automation):
- Problem analysis: 50% automated (AI suggests problems, human validates) - 1.25 hours
- Task breakdown: 80% automated (AI generates WBS, human refines) - 1.2 hours
- Dependency mapping: 90% automated (AI maps dependencies, human resolves blockers) - 30 minutes
- Exit gate validation: 100% automated (automated validation framework) - 5 minutes
- **Total**: 3 hours, 80% automation

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:160-162 "Target State: 80% automation"`

---

## Sub-Agent Coordination Patterns

### Pattern 1: Sequential Decomposition (Current Manual Process)

```
EXEC Agent
  → Execute Substage 8.1 (manual)
  → Execute Substage 8.2 (manual)
  → Execute Substage 8.3 (manual)
  → Validate exit gates (manual)
```

**Characteristics**:
- Fully sequential (no parallelization)
- Single agent (EXEC)
- No automation
- Duration: 13.5 hours

---

### Pattern 2: Parallel AI-Assisted Decomposition (Proposed)

```
Problem Decomposer Agent     Dependency Analyzer Agent
  (Substages 8.1 + 8.2)           (Substage 8.3)
         ↓                               ↓
    WBS v1 ──────────────────────→ Dependency Graph
         ↓                               ↓
         └───────────→ WBS Validator Agent ←──────────┘
                            ↓
                      Validation Report
                            ↓
                  EXEC Agent (Human Review)
```

**Characteristics**:
- Parallel execution (Problem Decomposer + Dependency Analyzer can work concurrently after 8.1)
- 3 AI agents + 1 human reviewer
- 80% automation
- Duration: 2 hours

**Improvement**: 85% time reduction (13.5 hours → 2 hours)

---

### Pattern 3: Recursion Re-Decomposition (TECH-001 Handling)

```
Stage 10 Technical Review
  → Identifies blocking technical issues
  → Triggers TECH-001 to Stage 8
         ↓
Chairman Approval Interface
  → Reviews WBS v1 vs proposed WBS v2
  → Approves recursion
         ↓
Problem Decomposer Agent (with technical constraints)
  → Re-runs Substages 8.1 + 8.2 with Stage 10 insights
  → Generates WBS v2
         ↓
Dependency Analyzer Agent
  → Re-maps dependencies based on WBS v2
  → Recalculates critical path
         ↓
WBS Comparison Generator
  → Generates v1 vs v2 delta report
  → Highlights: added tasks (green), modified (yellow), removed (red)
         ↓
EXEC Agent (Human Review)
  → Reviews WBS v2 and delta report
  → Proceeds to Stage 9 with WBS v2
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:43-55 "Recursion Behavior When Triggered"`

---

## Integration Points with Other Agents

| Stage | Agent | Integration Type | Data Exchange | Evidence |
|-------|-------|------------------|---------------|----------|
| Stage 7 | PLAN Agent | Input Provider | Business plan, Technical requirements, Complexity assessment | stages.yaml:325-328 |
| Stage 9 | EXEC Agent | Output Consumer | WBS, Task list, Dependency graph | stages.yaml:329-332 |
| Stage 10 | Technical Reviewer | Recursion Trigger | TECH-001 (blocking issues) → WBS v2 request | critique:38 |
| Stage 14 | Development Prep | Recursion Trigger | TECH-001 (complexity issues) → WBS adjustment | critique:39 |
| Stage 22 | Iterative Dev | Recursion Trigger | TECH-001 (architectural limits) → WBS refinement | critique:40 |

---

## Delegation and Escalation Rules

### Delegation (EXEC Agent → AI Agents)

**Rule 1**: Delegate WBS generation to Problem Decomposer Agent if automation enabled
**Rule 2**: Delegate dependency mapping to Dependency Analyzer Agent if automation enabled
**Rule 3**: Delegate exit gate validation to WBS Validator Agent (always automated)

**Escalation Triggers**:
- WBS Validator Agent fails validation → Escalate to EXEC agent for manual review
- Task breakdown exceeds timeline → Escalate to Stage 7 (TIMELINE-001)
- Task breakdown requires more resources → Escalate to Stage 7 (RESOURCE-001)

### Escalation (EXEC Agent → Chairman)

**Rule 1**: TECH-001 recursion (HIGH severity) → Requires Chairman approval
**Rule 2**: Max 3 recursions exceeded → Requires Chairman decision (kill, pivot, hire, simplify)
**Rule 3**: Circular dependencies unresolvable → Escalate to Chairman for scope adjustment

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:110-114 "Escalation: After 3rd TECH-001 trigger"`

---

## Performance Metrics for Agent Orchestration

| Metric | Target | Measurement | Impact |
|--------|--------|-------------|--------|
| **Agent Execution Time** | <2 hours (vs 13.5 manual) | Sum of agent durations | 85% time reduction |
| **Validation Pass Rate** | >90% | % of WBS passing exit gates on first attempt | Quality of AI-generated WBS |
| **Recursion Trigger Rate** | <20% | % of ventures triggering TECH-001 | Quality of initial decomposition |
| **Chairman Approval Time** | <24 hours | Time from TECH-001 trigger to approval | Bottleneck prevention |
| **Automation Coverage** | 80% | % of substages using AI agents | Automation adoption |

---

## Gap Analysis for Agent Orchestration

**Current Gaps** (feeds SD-CREWAI-ARCHITECTURE-001):

1. **No CrewAI agent definitions** - Need to define Problem Decomposer, Dependency Analyzer, WBS Validator agents
2. **No agent orchestration logic** - Need to implement sequential vs parallel execution patterns
3. **No LLM parameter tuning** - Need to determine optimal temperature, tokens, models for each agent
4. **No validation framework** - Need automated exit gate validation (currently manual)
5. **No recursion handling automation** - TECH-001 triggers manual process (should be agent-assisted)
6. **No WBS comparison generator** - v1 vs v2 delta visualization requires tooling
7. **No performance tracking** - Agent execution times, validation pass rates not logged

**Recommended Priority**: Implement gaps #1, #2, #4 first (core agent architecture + validation)

## Sources Table

| Claim | Source | Evidence |
|-------|--------|----------|
| No CrewAI mapping defined | Gap analysis | `Gap #5: No agent orchestration defined` |
| Ownership: EXEC | critique:19 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:19 "Clear ownership (EXEC)"` |
| Target: 80% automation | critique:161 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:161 "Target State: 80% automation"` |
| Chairman approval for recursion | critique:118-119 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:118-119 "HIGH severity: Requires Chairman approval"` |
| Max 3 recursions | critique:109 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:109 "Max recursions: 3"` |
| Escalation after 3rd TECH-001 | critique:110-114 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:110-114 "Chairman must decide"` |
| Recursion behavior | critique:43-55 | `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:43-55 "Re-decompose with constraints"` |

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
