# Self-Improving LEO Protocol - Architectural Vision v1

**Created**: 2026-01-31
**Status**: Draft - Pending Triangulation Review
**Author**: Claude (with Rick Felix brainstorming input)

## Executive Summary

Design a closed-loop autonomous improvement system for the LEO Protocol that can:
- Discover its own enhancements
- Log them to a canonical backlog (feedback table)
- Prioritize them via rubrics
- Execute them (plan → execute → validate) with minimal human involvement
- Operate under a constitution + guardrails model
- Learn from user feedback
- Audit its recent work for completeness

## Core Constraints

1. **EHG** = Venture Factory (runtime) - stage workflow is immutable
2. **EHG_Engineering** = Governance plane where LEO lives
3. Self-improvement operates in governance plane only
4. Agent hierarchy is a governance wrapper on top of stage workflow

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SELF-IMPROVING LEO PROTOCOL                              │
│                    (Closed-Loop Architecture)                               │
└─────────────────────────────────────────────────────────────────────────────┘


                         ┌─────────────────────┐
                         │    CONSTITUTION     │
                         │    + GUARDRAILS     │
                         │                     │
                         │ • Goals/boundaries  │
                         │ • Escalation rules  │
                         │ • Safety invariants │
                         └──────────┬──────────┘
                                    │ governs all
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │  Feedback   │  │   Failed    │  │  Recurring  │  │  SD Audit   │       │
│   │  Analyzer   │  │   Tests     │  │  Patterns   │  │  (Recent)   │       │
│   │             │  │  Detector   │  │  Detector   │  │             │       │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│          │                │                │                │              │
│          │    DISCOVERY AGENTS (Capability A)               │              │
│          └────────────────┼────────────────┼────────────────┘              │
│                           │                │                               │
│                           ▼                ▼                               │
│                    ┌─────────────────────────────┐                         │
│                    │        FEEDBACK TABLE       │                         │
│                    │     (Canonical Backlog)     │                         │
│                    │                             │                         │
│                    │  Structured proposals:      │                         │
│                    │  • problem_statement        │                         │
│                    │  • affected_area            │                         │
│                    │  • expected_value           │                         │
│                    │  • risk_level               │                         │
│                    │  • proposed_approach        │                         │
│                    │  • validation_plan          │                         │
│                    │  • escalation_triggers      │                         │
│                    └──────────────┬──────────────┘                         │
│                                   │                                        │
│                                   ▼                                        │
│                    ┌─────────────────────────────┐                         │
│                    │   PRIORITIZATION ENGINE     │  (Capability B)         │
│                    │      (Orchestrator)         │                         │
│                    │                             │                         │
│                    │  • Cluster into themes      │                         │
│                    │  • Deduplicate              │                         │
│                    │  • Score via rubrics:       │                         │
│                    │    - value                  │                         │
│                    │    - alignment              │                         │
│                    │    - risk reduction         │                         │
│                    │    - effort                 │                         │
│                    │    - dependency             │                         │
│                    │    - confidence             │                         │
│                    └──────────────┬──────────────┘                         │
│                                   │                                        │
│                                   ▼                                        │
│                    ┌─────────────────────────────┐                         │
│                    │     RISK ASSESSMENT         │                         │
│                    │                             │                         │
│                    │  Low Risk ──► Direct Execute│                         │
│                    │  Med Risk ──► Triangulate   │                         │
│                    │  High Risk ─► Human Review  │                         │
│                    └──────────────┬──────────────┘                         │
│                                   │                                        │
│                    ┌──────────────┴──────────────┐                         │
│                    │                             │                         │
│                    ▼                             ▼                         │
│   ┌───────────────────────────┐   ┌───────────────────────────┐           │
│   │     TRIANGULATION         │   │      HUMAN REVIEW         │           │
│   │     (Capability C)        │   │      (Escalation)         │           │
│   │                           │   │                           │           │
│   │  Dynamic expert roster:   │   │  • High-risk changes      │           │
│   │  • Security reviewer      │   │  • Constitution conflicts │           │
│   │  • Data/privacy reviewer  │   │  • Novel patterns         │           │
│   │  • Architecture reviewer  │   │                           │           │
│   │  • Domain expert          │   │                           │           │
│   │                           │   │                           │           │
│   │  Deliberation → Plan      │   │                           │           │
│   └─────────────┬─────────────┘   └─────────────┬─────────────┘           │
│                 │                               │                          │
│                 └───────────────┬───────────────┘                          │
│                                 │                                          │
│                                 ▼                                          │
│                    ┌─────────────────────────────┐                         │
│                    │      EXECUTION ENGINE       │                         │
│                    │                             │                         │
│                    │  ┌─────────┐  ┌─────────┐   │                         │
│                    │  │Quick-Fix│  │   SD    │   │                         │
│                    │  │ (≤50)   │  │ (>50)   │   │                         │
│                    │  └────┬────┘  └────┬────┘   │                         │
│                    │       │            │        │                         │
│                    │       └─────┬──────┘        │                         │
│                    │             │               │                         │
│                    │   LEAD → PLAN → EXEC       │                         │
│                    │   (rigor based on type)     │                         │
│                    └──────────────┬──────────────┘                         │
│                                   │                                        │
│                                   ▼                                        │
│                    ┌─────────────────────────────┐                         │
│                    │    VALIDATION GATES         │  (Capability D)         │
│                    │    (Non-negotiable)         │                         │
│                    │                             │                         │
│                    │  • Unit/integration/e2e     │                         │
│                    │  • Linting/quality gates    │                         │
│                    │  • Traceability checks      │                         │
│                    │  • Artifact verification    │                         │
│                    │  • Rubric scoring:          │                         │
│                    │    - correctness            │                         │
│                    │    - maintainability        │                         │
│                    │    - testability            │                         │
│                    │    - reversibility          │                         │
│                    └──────────────┬──────────────┘                         │
│                                   │                                        │
│                                   ▼                                        │
│                         ┌─────────────────┐                                │
│                         │     SHIPPED     │                                │
│                         │   (Complete)    │                                │
│                         └────────┬────────┘                                │
│                                  │                                         │
│                                  │ feeds back                              │
│                                  ▼                                         │
│                    ┌─────────────────────────────┐                         │
│                    │      SELF-AUDIT LOOP        │  (Capability E)         │
│                    │    (Recent Work Review)     │                         │
│                    │                             │                         │
│                    │  • Review SDs from last N   │                         │
│                    │    days                     │                         │
│                    │  • Detect:                  │                         │
│                    │    - Missing components     │                         │
│                    │    - Incomplete impls       │                         │
│                    │    - Validation gaps        │                         │
│                    │    - Regression signals     │                         │
│                    │                             │                         │
│                    │  Findings → FEEDBACK TABLE  │──────────┐              │
│                    └─────────────────────────────┘          │              │
│                                                             │              │
│                                                             │              │
└─────────────────────────────────────────────────────────────┼──────────────┘
                                                              │
                                    ┌─────────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   LEARNING SYSTEM   │
                         │                     │
                         │  • Pattern capture  │
                         │  • Rubric tuning    │
                         │  • Confidence adj   │
                         └─────────────────────┘
```

---

## Capability Breakdown

### Capability A: Self-Improvement Discovery → Backlog

**Sources of Discovery:**
- User feedback, notes, overrides, recurring fixes
- Failed tests / flaky runs / regressions
- Repeated escalations or "decision queue" patterns
- Incomplete SD implementations detected via audit

**Output Structure (per item):**
- problem_statement
- affected_area (governance plane vs runtime plane)
- expected_value (why it matters)
- risk_level (what could go wrong)
- proposed_approach
- validation_plan (how we prove it worked)
- escalation_triggers (when it must ask human)

### Capability B: Prioritization + Theming (Aggregation)

**"Brainstorming Board" Model:**
- Multiple sub-agents each produce recommendations
- Orchestrator aggregates:
  - Clusters into themes
  - Deduplicates
  - Scores/prioritizes via rubrics

**Scoring Rubrics:**
- Value (impact)
- Alignment (with goals)
- Risk reduction
- Effort
- Dependency
- Confidence

**Output:** Ranked list with rationale

### Capability C: Triangulation Protocol (Multi-Model/Multi-Perspective)

**Dynamic Expert Roster (based on risk profile):**
- Security reviewer (when touching auth, RLS, credentials)
- Data/privacy reviewer (when touching logging, storage, user data)
- Architecture reviewer (when touching core patterns)
- Domain expert (context-specific)

**Process:**
- Multiple LLMs / roles / viewpoints
- Deliberation step → coherent plan

### Capability D: Rubrics + Validation Gates (Non-Negotiable)

**Validation Steps:**
- Unit/integration/e2e tests
- Linting/quality gates
- Traceability checks
- Artifact verification

**Rubric Scoring:**
- Correctness
- Maintainability
- Testability
- Reversibility
- Safety
- Alignment with goals

### Capability E: Self-Audit / Double-Check Loop

**"What changed recently and is it actually complete?"**

**Review Scope:**
- SDs shipped in last N days

**Detection Targets:**
- Missing components
- Incomplete implementations
- Validation gaps
- Regression signals

**Output:** Findings written back to FEEDBACK TABLE

---

## Current State Mapping

| What Exists Today | What's Needed |
|-------------------|---------------|
| ✅ feedback table | Expand schema for structured proposals |
| ✅ strategic_directives_v2 | Add workflow_mode (autonomous/supervised) |
| ✅ quick_fixes table | Consider merging into SD as type |
| ✅ /learn command | Expand into Discovery Agents |
| ✅ /leo assist | Evolve into Execution Engine |
| ✅ issue_patterns table | Feed into Discovery |
| ✅ retrospectives table | Feed into Self-Audit |
| ⚠️ Triangulation exists | Needs dynamic expert roster |
| ❌ Prioritization orchestrator | NEW: scoring + theming engine |
| ❌ Constitution/guardrails | NEW: explicit rules table |
| ❌ Self-audit loop | NEW: scheduled SD review |
| ❌ Continuous discovery agents | NEW: scheduled/triggered agents |

---

## Key Architectural Decision

**FEEDBACK TABLE = Central Work Queue**

Everything flows THROUGH it:
- Discovery agents WRITE to it
- Prioritization engine READS from it
- Execution engine CONSUMES from it
- Self-audit WRITES back to it
- Human feedback WRITES to it

It's not just an "inbox" - it's the WORK QUEUE for the entire system.

---

## Open Questions for Triangulation

1. Is the feedback table the right canonical source, or should there be a separate "improvement_proposals" table?
2. How do we prevent runaway self-modification (constitution enforcement)?
3. What's the right granularity for risk assessment thresholds?
4. How do we handle conflicting recommendations from discovery agents?
5. What's the rollback strategy when self-improvements cause regressions?
6. How do we measure the system's improvement over time (meta-metrics)?

---

## Next Steps

1. **Triangulation Review** - Use multi-perspective analysis to identify gaps
2. **Constitution Definition** - Define explicit guardrails and boundaries
3. **Prioritization Engine Design** - Scoring rubrics and theming logic
4. **Feedback Schema Expansion** - Add structured proposal fields
5. **Self-Audit Implementation** - Scheduled SD review capability
