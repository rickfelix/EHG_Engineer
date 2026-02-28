---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Claude Code Swarm Mode Readiness Rubric


## Table of Contents

- [Background](#background)
- [Scoring Dimensions](#scoring-dimensions)
- [Scoring Criteria Detail](#scoring-criteria-detail)
  - [1. Parallelizability (25%)](#1-parallelizability-25)
  - [2. Specialist Benefit (20%)](#2-specialist-benefit-20)
  - [3. Current Bottleneck Severity (20%)](#3-current-bottleneck-severity-20)
  - [4. Context Isolation Value (15%)](#4-context-isolation-value-15)
  - [5. Coordination Simplicity (10%)](#5-coordination-simplicity-10)
  - [6. Failure Isolation (10%)](#6-failure-isolation-10)
- [LEO Protocol Areas Scored](#leo-protocol-areas-scored)
- [Top 3 Swarm Implementation Candidates](#top-3-swarm-implementation-candidates)
  - [P0: Validation Gates (Score: 4.55)](#p0-validation-gates-score-455)
  - [P1: User Story Generation (Score: 4.30)](#p1-user-story-generation-score-430)
  - [P1: Multi-Sub-Agent Orchestration (Score: 4.30)](#p1-multi-sub-agent-orchestration-score-430)
- [Priority Thresholds](#priority-thresholds)
- [When to Re-Apply This Rubric](#when-to-re-apply-this-rubric)
- [Implementation Checklist (When Swarm Releases)](#implementation-checklist-when-swarm-releases)
  - [Phase 1: Validation Gates (P0)](#phase-1-validation-gates-p0)
  - [Phase 2: User Stories (P1)](#phase-2-user-stories-p1)
  - [Phase 3: Sub-Agent Orchestration (P1)](#phase-3-sub-agent-orchestration-p1)
- [References](#references)
- [Changelog](#changelog)

**Created**: 2026-02-02
**Status**: Ready for Implementation (awaiting Claude Code Swarm release)
**Context**: Designed to identify LEO Protocol areas that would benefit from multi-agent swarm orchestration

## Background

In January 2026, developers discovered that Claude Code has a hidden "Swarms" feature behind feature flags. This feature transforms Claude Code from a single AI into a team orchestrator where:

- A "lead" agent plans and delegates work to specialist agents
- Multiple agents work in parallel, sharing a task board
- Agents coordinate via inter-agent messaging with @mentions
- Each agent gets fresh context windows, avoiding token bloat

This rubric was designed to identify which areas of the LEO Protocol would benefit most from swarm orchestration once the feature is officially released.

---

## Scoring Dimensions

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Parallelizability** | 25% | Can subtasks execute independently without blocking? |
| **Specialist Benefit** | 20% | Would domain-expert agents improve quality over generalist? |
| **Current Bottleneck** | 20% | How much time/context is wasted on sequential execution? |
| **Context Isolation Value** | 15% | Would fresh context windows per agent reduce errors? |
| **Coordination Simplicity** | 10% | Can agents work with minimal inter-agent messaging? |
| **Failure Isolation** | 10% | Can one agent's failure be contained without cascade? |

---

## Scoring Criteria Detail

### 1. Parallelizability (25%)

| Score | Criteria |
|-------|----------|
| 5 | Fully independent subtasks, no shared state, embarrassingly parallel |
| 4 | Mostly independent, shared read-only context, minimal dependencies |
| 3 | Some dependencies but clear phases where parallelism is possible |
| 2 | Significant dependencies, only 2-3 subtasks can run concurrently |
| 1 | Strictly sequential, each step depends on previous output |

### 2. Specialist Benefit (20%)

| Score | Criteria |
|-------|----------|
| 5 | Task requires 3+ distinct expertise domains (e.g., security + database + UI) |
| 4 | Task benefits from 2 deep specializations |
| 3 | Moderate benefit from specialist knowledge |
| 2 | Generalist can handle with occasional specialist consultation |
| 1 | Single domain, no specialist advantage |

### 3. Current Bottleneck Severity (20%)

| Score | Criteria |
|-------|----------|
| 5 | Sequential execution takes 10x+ longer than theoretical parallel |
| 4 | Significant waiting, context window fills before completion |
| 3 | Noticeable delays, some context pressure |
| 2 | Minor inefficiency, acceptable performance |
| 1 | Already efficient, no bottleneck |

### 4. Context Isolation Value (15%)

| Score | Criteria |
|-------|----------|
| 5 | Current approach suffers severe context pollution/confusion |
| 4 | Fresh context would significantly reduce hallucination/drift |
| 3 | Some benefit from isolated context per subtask |
| 2 | Shared context is manageable |
| 1 | Shared context is actually beneficial |

### 5. Coordination Simplicity (10%)

| Score | Criteria |
|-------|----------|
| 5 | Fire-and-forget: agents produce independent outputs, merged at end |
| 4 | Task board sufficient: async status updates, no real-time chat |
| 3 | Moderate coordination: occasional @mentions between agents |
| 2 | Significant coordination: frequent inter-agent messaging required |
| 1 | Tight coupling: agents need constant synchronization |

### 6. Failure Isolation (10%)

| Score | Criteria |
|-------|----------|
| 5 | Agent failure has zero impact on others, easy retry |
| 4 | Failure contained to subtask, partial results still valuable |
| 3 | Some downstream impact but recoverable |
| 2 | Failure requires significant rework by other agents |
| 1 | Single agent failure cascades to full task failure |

---

## LEO Protocol Areas Scored

| Area | Para | Spec | Bottle | Context | Coord | Fail | **Total** | **Priority** |
|------|:----:|:----:|:------:|:-------:|:-----:|:----:|:---------:|:------------:|
| **Validation Gates (per handoff)** | 5 | 4 | 4 | 5 | 5 | 5 | **4.55** | P0 |
| **User Story Generation (batch)** | 5 | 3 | 4 | 4 | 5 | 5 | **4.30** | P1 |
| **Multi-Sub-Agent Orchestration** | 4 | 5 | 5 | 4 | 3 | 4 | **4.30** | P1 |
| **Test Suite Execution** | 5 | 3 | 4 | 3 | 5 | 4 | **3.95** | P2 |
| **Code Review (multi-perspective)** | 4 | 5 | 3 | 4 | 3 | 5 | **3.90** | P2 |
| **PRD Section Generation** | 4 | 4 | 3 | 4 | 4 | 4 | **3.85** | P2 |
| **RCA 5-Whys Parallel Paths** | 4 | 4 | 3 | 5 | 3 | 4 | **3.80** | P2 |
| **Orchestrator Child Decomposition** | 3 | 4 | 4 | 4 | 3 | 3 | **3.55** | P3 |
| **Documentation Generation** | 4 | 3 | 2 | 3 | 4 | 5 | **3.35** | P3 |
| **Single SD EXEC Phase** | 2 | 3 | 2 | 2 | 2 | 2 | **2.25** | P4 |

---

## Top 3 Swarm Implementation Candidates

### P0: Validation Gates (Score: 4.55)

**Current State**: Gates run sequentially in `scripts/modules/handoff/executors/BaseExecutor.js`

```
SD_TRANSITION_READINESS → TARGET_APPLICATION → BASELINE_DEBT_CHECK → ...
```

**Swarm Architecture**:
```
Lead Agent (Coordinator)
├── Gate Validator 1: SD_TRANSITION_READINESS
├── Gate Validator 2: TARGET_APPLICATION
├── Gate Validator 3: BASELINE_DEBT_CHECK
├── Gate Validator 4: SMOKE_TEST_SPECIFICATION
└── Gate Validator 5: SD_TYPE_VALIDATION
         ↓
    Merge Results → Pass/Fail Decision
```

**Why Swarm Fits**:
- Zero inter-agent coordination needed (fire-and-forget)
- Each validator has focused context (only its gate's requirements)
- Results merge into aggregate score
- Agent failure is isolated (one gate failing doesn't break others)

**Expected Benefit**: 5x faster validation, isolated context prevents cross-gate confusion

**Implementation Notes**:
- Each gate validator gets: SD metadata, relevant schema, gate-specific rules
- Lead agent merges scores using existing weighted formula
- Failed gates return detailed remediation guidance
- Partial results are valuable (know which gates passed)

---

### P1: User Story Generation (Score: 4.30)

**Current State**: Stories generated sequentially in `lib/sub-agents/modules/stories/`

**Swarm Architecture**:
```
Stories Lead Agent (receives PRD)
├── Story Agent: Authentication flows
├── Story Agent: Dashboard features
├── Story Agent: API endpoints
├── Story Agent: Error handling
└── Story Agent: Edge cases
         ↓
    Dedup + Gap Analysis → Final Story Set
```

**Why Swarm Fits**:
- PRD naturally decomposes into feature areas
- Story agents work independently on their domain
- Shared task board tracks coverage without real-time coordination
- Fresh context per agent prevents story drift/confusion

**Expected Benefit**: Higher coverage, specialist focus per domain, faster generation

**Implementation Notes**:
- Lead agent decomposes PRD into 4-6 feature areas
- Each story agent receives: feature area context, personas, acceptance criteria template
- Final merge checks for: duplicates, gaps, consistency
- Quality scoring applied per-agent and aggregate

---

### P1: Multi-Sub-Agent Orchestration (Score: 4.30)

**Current State**: Sub-agents invoked sequentially during PLAN/EXEC phases

**Swarm Architecture**:
```
Phase Coordinator (receives SD + PRD)
├── DATABASE Agent: Schema analysis, migration plan
├── TESTING Agent: Test strategy, coverage plan
├── SECURITY Agent: Threat model, auth requirements
├── DESIGN Agent: UI/UX review, accessibility
└── API Agent: Endpoint design, versioning
         ↓
    Conflict Resolution → Unified Technical Plan
```

**Why Swarm Fits**:
- Sub-agents already have distinct specializations
- Each analyzes the same PRD from their domain perspective
- Conflicts are rare and resolvable at merge time
- Current sequential approach causes significant context pressure

**Expected Benefit**: Catches cross-cutting concerns earlier, reduces late-stage rework

**Implementation Notes**:
- Each sub-agent gets: PRD, relevant schema/codebase context, domain-specific checklist
- Lead agent handles conflict resolution (e.g., security vs. UX trade-offs)
- Results feed into unified technical plan
- Can be phased: start with 2-3 agents, expand based on results

---

## Priority Thresholds

| Score Range | Priority | Action |
|-------------|----------|--------|
| ≥ 4.0 | **P0-P1** | Implement swarm orchestration immediately when available |
| 3.5 - 3.9 | **P2** | Implement if bottleneck is painful or context exhaustion frequent |
| 3.0 - 3.4 | **P3** | Consider for future optimization |
| < 3.0 | **P4** | Current approach is acceptable, no swarm needed |

---

## When to Re-Apply This Rubric

1. **After Claude Code Swarm release** - Re-score with actual feature capabilities
2. **When new sub-agents are added** - Score their swarm potential
3. **During retrospectives** - If sequential execution pain is identified
4. **Context exhaustion incidents** - May indicate swarm opportunity
5. **New workflow phases** - Score for parallel execution potential

---

## Implementation Checklist (When Swarm Releases)

### Phase 1: Validation Gates (P0)
- [ ] Design gate validator agent prompts
- [ ] Create merge/aggregation logic for gate results
- [ ] Test with LEAD-TO-PLAN handoff (5 gates)
- [ ] Measure time savings vs sequential
- [ ] Roll out to all handoff types

### Phase 2: User Stories (P1)
- [ ] Design PRD decomposition logic
- [ ] Create story agent specialist prompts
- [ ] Build dedup/gap analysis merge step
- [ ] Test with medium-complexity PRD
- [ ] Compare quality scores vs sequential

### Phase 3: Sub-Agent Orchestration (P1)
- [ ] Identify 3 sub-agents for initial swarm (DATABASE, TESTING, SECURITY)
- [ ] Design conflict resolution patterns
- [ ] Create unified output schema
- [ ] Test with feature SD type
- [ ] Expand to remaining sub-agents

---

## References

- [Claude Code Swarms Discovery (Hacker News)](https://news.ycombinator.com/item?id=46743908)
- [Unlock Swarm Mode with claude-sneakpeek](https://scottspence.com/posts/unlock-swarm-mode-in-claude-code)
- [Claude-Flow Orchestration Platform](https://github.com/ruvnet/claude-flow)
- [Claude Code's Hidden Multi-Agent System](https://paddo.dev/blog/claude-code-hidden-swarm/)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-02 | Initial rubric created, scored 10 LEO Protocol areas |

