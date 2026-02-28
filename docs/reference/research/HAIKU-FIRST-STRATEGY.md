---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Haiku-First Model Allocation Strategy



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [1. Haiku-First Philosophy](#1-haiku-first-philosophy)
  - [The Principle](#the-principle)
  - [Why This Works](#why-this-works)
- [2. Sub-Agent Model Floor Matrix](#2-sub-agent-model-floor-matrix)
  - [Assignments by Sub-Agent](#assignments-by-sub-agent)
  - [Tier Summary](#tier-summary)
- [3. Static Model Assignment (No Escalation Logic)](#3-static-model-assignment-no-escalation-logic)
  - [The Assignment Rule](#the-assignment-rule)
  - [Weekly Calibration (Not Runtime Escalation)](#weekly-calibration-not-runtime-escalation)
- [4. Weekly Budget Allocation (Haiku-First)](#4-weekly-budget-allocation-haiku-first)
  - [OLD STRATEGY (Sonnet-Heavy, Current State)](#old-strategy-sonnet-heavy-current-state)
  - [NEW STRATEGY (Haiku-First)](#new-strategy-haiku-first)
- [5. Safety Guarantees (Quality Floors)](#5-safety-guarantees-quality-floors)
  - [Never Violate These Rules](#never-violate-these-rules)
- [6. Phase-Specific Guidance (LEAD → PLAN → EXEC)](#6-phase-specific-guidance-lead-plan-exec)
  - [LEAD Phase (Ideation & Planning)](#lead-phase-ideation-planning)
  - [PLAN Phase (Design & Detailed Planning)](#plan-phase-design-detailed-planning)
  - [EXEC Phase (Implementation & Verification)](#exec-phase-implementation-verification)
- [7. Immediate Implementation Plan (Week 1)](#7-immediate-implementation-plan-week-1)
  - [Today (P0 Critical)](#today-p0-critical)
  - [Tomorrow (P1 High)](#tomorrow-p1-high)
  - [This Week (P2 Medium)](#this-week-p2-medium)
- [8. Success Metrics (Haiku-First)](#8-success-metrics-haiku-first)
  - [Financial Efficiency](#financial-efficiency)
  - [Quality Metrics](#quality-metrics)
  - [Velocity Metrics](#velocity-metrics)
- [9. Risk Mitigation](#9-risk-mitigation)
  - [Risk 1: Haiku Output Quality Too Low](#risk-1-haiku-output-quality-too-low)
  - [Risk 2: Escalation Logic Doesn't Work](#risk-2-escalation-logic-doesnt-work)
  - [Risk 3: Sonnet/Opus Budget Exhausted](#risk-3-sonnetopus-budget-exhausted)
  - [Risk 4: Chairman Overrides Haiku Default Too Often](#risk-4-chairman-overrides-haiku-default-too-often)
- [10. Implementation Checklist](#10-implementation-checklist)
  - [Week 1 (MVP - This Week)](#week-1-mvp---this-week)
  - [Week 2 (Refinement)](#week-2-refinement)
  - [Week 3+ (Sophistication)](#week-3-sophistication)
- [11. FAQ & Clarifications](#11-faq-clarifications)
  - [Q: Why Haiku-first instead of Sonnet-default?](#q-why-haiku-first-instead-of-sonnet-default)
  - [Q: Won't Haiku produce worse outputs?](#q-wont-haiku-produce-worse-outputs)
  - [Q: What if escalation logic is wrong?](#q-what-if-escalation-logic-is-wrong)
  - [Q: Can we ever downgrade from Opus?](#q-can-we-ever-downgrade-from-opus)
  - [Q: How often will we escalate?](#q-how-often-will-we-escalate)
- [Conclusion](#conclusion)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-04
- **Tags**: database, api, testing, e2e

**Date**: 2025-12-06
**Status**: PROPOSED (Research Complete)
**Priority**: P0 (Implement Week 1)

---

## Executive Summary

Based on Claude Code Max plan rate limit research, **Haiku 4.5 has 700-1400 hours/week availability** compared to Sonnet's 240-480 hours. Current implementation uses 0% Haiku, leaving massive underutilized capacity.

**Proposed Strategy**: Invert the allocation model from "Sonnet-heavy with Haiku fallback" to **"Haiku-first with intelligent escalation to Sonnet/Opus"**.

**Expected Impact**:
- Preserve current quality (same pass rates)
- Increase capacity for parallel SDs (can run more simultaneously)
- Reduce token burn rate on routine tasks by ~67%
- Keep Sonnet/Opus budget for truly critical work

---

## 1. Haiku-First Philosophy

### The Principle

> **Use the simplest model that solves the problem, escalate only when needed.**

Instead of:
```
Everything → Sonnet (default) → Downgrade to Haiku if budget tight
```

Use:
```
Everything → Haiku (default) → Escalate to Sonnet/Opus if task requires it
```

### Why This Works

1. **Haiku is sufficient for 60-70% of sub-agent work**: Documentation, validation, retrieval, pattern matching
2. **Haiku is 2x faster**: Faster execution = more time for quality reasoning when needed
3. **Haiku reserves Sonnet/Opus budget**: Critical tasks (security, complex design) get premium models
4. **Predictable cost**: You know Haiku is optimal, not a compromise

---

## 2. Sub-Agent Model Floor Matrix

### Assignments by Sub-Agent

#### TIER 1: Haiku Default (Low-Stakes, Deterministic)

| Sub-Agent | Default | Rationale | Pass Rate | Can Upgrade? |
|-----------|---------|-----------|-----------|--------------|
| **GITHUB** | Haiku | PR operations, status checks are deterministic | ~98% | Yes, for complex merge analysis |
| **DOCMON** | Haiku | Template-based generation, compliance checking | 83-100% | Yes, for novel doc structures |
| **RETRO** | Haiku | Pattern extraction, lesson identification | 96% | Yes, for cross-cutting patterns |
| **VALIDATION** | Haiku | Shallow duplicate checks, SD feasibility | ~85% | Yes, for complex multi-system analysis |
| **QUICKFIX** | Haiku | <50 LOC changes, trivial edits | ~90% | Yes, only if >50 LOC |

**Philosophy**: These tasks are pattern-based, deterministic, or low-risk. Haiku is optimal.

---

#### TIER 2: Sonnet Default (Substantive Work, Reasoning Required)

| Sub-Agent | Default | Rationale | Upgrade to Opus? |
|-----------|---------|-----------|-----------------|
| **TESTING** | Sonnet | Edge case detection needs reasoning | Yes, for security-critical test coverage |
| **DESIGN** | Sonnet | UI/UX patterns, accessibility (mid-level reasoning) | Yes, for novel architectural patterns |
| **DATABASE** | Sonnet | Schema safety, constraint analysis | Yes, for complex multi-table migrations, RLS |
| **API** | Sonnet | API design patterns, contract validation | Yes, for security-sensitive endpoints |
| **STORIES** | Sonnet | User story generation (needs context understanding) | No (Sonnet sufficient) |
| **RISK** | Sonnet | Risk assessment (mid-level reasoning) | Yes, for security-critical tasks |
| **PERFORMANCE** | Sonnet | Optimization analysis (moderate complexity) | No (Sonnet sufficient) |
| **DEPENDENCY** | Sonnet | CVE assessment, vulnerability detection | Yes, for unknown/novel vulnerabilities |

**Philosophy**: These tasks require substantive reasoning but not extreme depth. Sonnet is cost-optimal.

---

#### TIER 3: Opus Only (Security-Critical, Non-Negotiable)

| Sub-Agent | Default | Rationale | Never Downgrade |
|-----------|---------|-----------|-----------------|
| **SECURITY** | Opus | Threat analysis, RLS validation, auth security | ✅ YES - Never compromise |

**Philosophy**: Security is non-negotiable. Opus is worth the cost.

---

### Tier Summary

```
HAIKU (Default)   → 5 agents  → 40-45% of executions
SONNET (Default)  → 10 agents → 50-55% of executions
OPUS (Mandatory)  → 1 agent   → 5-10% of executions (security-critical)

Distribution by Budget Usage:
- Haiku:  ~30% of weekly budget (most work, least cost)
- Sonnet: ~50% of weekly budget (important work)
- Opus:   ~20% of weekly budget (critical work only)
```

---

## 3. Static Model Assignment (No Escalation Logic)

Model selection is **deterministic and static** - no runtime escalation decisions.

### The Assignment Rule

```
Given: (Sub-Agent, Lifecycle Phase)
Lookup: PHASE_MODEL_OVERRIDES[phase][agent]
Return: Model to use

Example:
  (testing-agent, EXEC) → PHASE_MODEL_OVERRIDES[EXEC][TESTING] → 'sonnet'
  (github-agent, LEAD) → PHASE_MODEL_OVERRIDES[LEAD][GITHUB] → 'haiku'
  (security-agent, any) → PHASE_MODEL_OVERRIDES[phase][SECURITY] → 'opus'
```

### Weekly Calibration (Not Runtime Escalation)

If a sub-agent + phase combination produces poor results:

1. **Document the issue**: "Testing-agent (EXEC) needs better edge case detection"
2. **Update the assignment**: Change `PHASE_MODEL_OVERRIDES[EXEC][TESTING]` from Sonnet to Opus
3. **Commit the change**: `git commit -am "calibration: testing-agent upgraded to opus (edge case detection)"`
4. **Next week**: New assignments take effect

**Example timeline**:
```
Week 1: testing-agent EXEC = Sonnet (produces incomplete test coverage)
        │
        └─ Chairman notes: "Testing needs better reasoning"

Week 2: Update assignment to Opus
        testing-agent EXEC = Opus (better edge case detection)

Week 3: New assignment is live, monitor for improvements
```

---

## 4. Weekly Budget Allocation (Haiku-First)

### OLD STRATEGY (Sonnet-Heavy, Current State)
```
Weekly Budget: 500,000 tokens estimated

Allocation:
- Opus:   5% (24-40 hours/week) → Used sparingly
- Sonnet: 90% (240-480 hours/week) → Default for everything
- Haiku:  5% (unused 700+ hours/week) → WASTED CAPACITY ❌

Problem: Under-utilizing 700+ hours of Haiku, over-constraining Sonnet
```

### NEW STRATEGY (Haiku-First)
```
Weekly Budget: 500,000 tokens estimated

Allocation (by usage frequency):
- Haiku:  60-70% of executions (~350-400 hours consumed from 700+ available)
- Sonnet: 25-30% of executions (~150-200 hours consumed from 240-480 available)
- Opus:   5-10% of executions (~20-40 hours consumed from 24-40 available)

Budget Status by Zone:
🟢 GREEN  (0-70% consumed):   Use models per assignment + escalate as needed
🟡 YELLOW (70-85% consumed):  Bias toward Haiku, upgrade cautiously
🟠 ORANGE (85-95% consumed):  Haiku-primary, defer non-critical work
🔴 RED    (95%+ consumed):    Haiku-only, escalate only for security-critical

Benefit: Full utilization of Haiku budget, preserves Sonnet for critical work
```

---

## 5. Safety Guarantees (Quality Floors)

### Never Violate These Rules

```
Rule 1: SECURITY-AGENT ALWAYS USES OPUS
  ├─ No exceptions
  ├─ No budget constraint overrides
  └─ If Opus unavailable, DEFER the SD

Rule 2: VALIDATION IN CRITICAL PHASES USES SONNET MINIMUM
  ├─ PLAN phase: Sonnet (detects complex dependencies)
  ├─ EXEC final verification: Sonnet (quality gate)
  └─ LEAD phase: Haiku acceptable (ideation only)

Rule 3: MODEL FLOOR VIOLATIONS TRIGGER ESCALATION ALERT
  ├─ Log violation reason
  ├─ Document override approval
  └─ Flag for post-mortem analysis

Rule 4: DEFER BEFORE DOWNGRADE
  ├─ If critical task requires Opus but budget exhausted
  ├─ Defer the SD to next week
  ├─ Never downgrade Opus task to Sonnet/Haiku to save tokens
```

---

## 6. Phase-Specific Guidance (LEAD → PLAN → EXEC)

### LEAD Phase (Ideation & Planning)

```
Typical Work: Scope assessment, architecture brainstorming, feasibility checks
Model Strategy: Haiku-primary, Sonnet for multi-system reasoning

Sub-Agent Usage:
- VALIDATION (Haiku): Feasibility check, duplicate detection → Sonnet if complex multi-system
- RISK (Haiku): Quick risk assessment → Sonnet if security-related
- DOCMON (Haiku): Documentation review → Sonnet if novel structure
- GITHUB (Haiku): Branch/PR setup → Sonnet if complex workflow
- SECURITY (Opus): Threat modeling → Never downgrade

Expected Budget: ~60-90k tokens
Budget Zone: GREEN (0-70%) - use freely
```

### PLAN Phase (Design & Detailed Planning)

```
Typical Work: Schema design, architecture, test planning, security design
Model Strategy: Sonnet-primary, Opus for security-critical

Sub-Agent Usage:
- DESIGN (Sonnet): Component architecture, patterns → Opus if novel security implications
- DATABASE (Sonnet): Schema design, migration planning → Opus if complex RLS
- TESTING (Sonnet): Test plan generation → Opus if security-critical testing
- STORIES (Sonnet): User story elaboration → Sonnet sufficient (no upgrade)
- SECURITY (Opus): Security design review → Never downgrade
- VALIDATION (Sonnet): Design verification → Opus for critical path

Expected Budget: ~120-180k tokens
Budget Zone: YELLOW (70-85%) - monitor burn rate
```

### EXEC Phase (Implementation & Verification)

```
Typical Work: Code generation, testing, bug fixes, verification
Model Strategy: Haiku-primary for routine, Sonnet for complex, Opus for security

Sub-Agent Usage:
- GITHUB (Haiku): PR creation, merges → Sonnet if complex conflict analysis
- TESTING (Sonnet): E2E test execution → Opus if security coverage verification
- DOCMON (Haiku): Doc updates → Sonnet if novel structure
- DEPENDENCY (Sonnet): CVE assessment → Opus if novel vulnerability
- QUICKFIX (Haiku): Small edits → Sonnet if >50 LOC required
- SECURITY (Opus): Security review → Never downgrade
- VALIDATION (Opus): Final QA → Never downgrade

Expected Budget: ~180-240k tokens
Budget Zone: ORANGE/RED (85%+) - aggressive Haiku usage
```

---

## 7. Immediate Implementation Plan (Week 1)

### Today (P0 Critical)

1. **Update Sub-Agent Executor** (15 mins)
   - Change Haiku as default for Tier 1 agents
   - Update PHASE_MODEL_OVERRIDES in `lib/sub-agent-executor.js`
   - Files: `lib/sub-agent-executor.js` (lines 34-67)

2. **Create Haiku Assignment Reference** (10 mins)
   - Document in CLAUDE.md or separate file
   - Make it visible to Chairman before each SD

3. **Set Up Escalation Logging** (20 mins)
   - Add fields: `escalated_from_model`, `escalation_reason`, `escalation_trigger`
   - Track when Haiku escalates to Sonnet
   - Enable learning on escalation patterns

### Tomorrow (P1 High)

4. **Update Token Logging** (30 mins)
   - Add `model_used` field to token logs
   - Track escalation events separately
   - Enable cost-benefit analysis

5. **Create Dashboard Display** (45 mins)
   - Show Haiku vs Sonnet vs Opus usage (% of budget)
   - Show escalation frequency (# of haiku→sonnet escalations)
   - Alert if escalation rate >15% (suggests model floor miscalibration)

6. **Document Model Floors** (20 mins)
   - Add sub-agent safety policies to CLAUDE.md
   - Make enforcement rules explicit

### This Week (P2 Medium)

7. **Calibration & Monitoring** (Ongoing)
   - Monitor first 2-3 SDs with Haiku defaults
   - Track rework rate (should be <20% for Tier 1)
   - Adjust Tier assignments if needed

8. **Build Auto-Escalation Logic** (1 hour)
   - Implement escalation triggers in sub-agent executor
   - Start with quality-score based escalation
   - Add task-type escalation rules

---

## 8. Success Metrics (Haiku-First)

### Financial Efficiency

| Metric | Target | Measurement |
|--------|--------|-------------|
| Haiku budget utilization | 60-70% of executions | % of sub-agent runs using Haiku |
| Unplanned escalations | <10% | (Haiku→Sonnet escalations) / total |
| Rework rate (Haiku tasks) | <20% | Tasks needing re-execution after Haiku |
| Token cost per SD | Trend downward | Total tokens / # of SDs |
| Budget zone accuracy | >80% | Forecasted zone matches actual |

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Code review pass rate | >85% | PRs approved without changes |
| E2E test pass rate | >95% | Tests passing on first run |
| Haiku output quality | >80% | Percent of Haiku outputs needing <2 iterations |
| Security issues (critical) | 0 | Issues missed by security-agent |
| Documentation compliance | >90% | Docs passing DOCMON checks first try |

### Velocity Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| SDs per week | Maintain baseline | Number of SDs completed |
| Time to completion | No degradation | Hours from LEAD→completion |
| Model override rate | <5% | Manual model selection overrides |
| Escalation delay | <5 mins | Time from Haiku decision to Sonnet escalation |

---

## 9. Risk Mitigation

### Risk 1: Haiku Output Quality Too Low
**Likelihood**: Medium (Haiku is 1/3 cost, so some loss expected)
**Impact**: High (rework cycles consume tokens)
**Mitigation**:
- Start with low-risk agents (GITHUB, DOCMON, RETRO)
- Monitor rework rate weekly
- If >25% rework, escalate to Sonnet
- Track which task types fail with Haiku

### Risk 2: Escalation Logic Doesn't Work
**Likelihood**: Low (logic is explicit)
**Impact**: Medium (Haiku produces bad output, needs rework)
**Mitigation**:
- Start with quality-score escalation (simplest)
- Add task-type escalation gradually
- Manual override available always
- Log all escalation decisions for analysis

### Risk 3: Sonnet/Opus Budget Exhausted
**Likelihood**: Low (Haiku handles 60-70%)
**Impact**: High (can't do critical work)
**Mitigation**:
- Monitor Sonnet/Opus usage weekly
- If trending high, defer non-critical SDs
- Reserve 20% of Sonnet budget for emergencies
- Never sacrifice quality gate for budget

### Risk 4: Chairman Overrides Haiku Default Too Often
**Likelihood**: Medium (Sonnet is familiar default)
**Impact**: Low (just increases costs, not a blocker)
**Mitigation**:
- Make Haiku default visible and obvious
- Track override frequency (should be <5%)
- Explain reasoning in recommendations
- Build confidence over 2-3 SDs

---

## 10. Implementation Checklist

### Week 1 (MVP - This Week)

- [ ] Update `lib/sub-agent-executor.js` with Haiku defaults for Tier 1 agents
- [ ] Add escalation logging infrastructure
- [ ] Create token log tracking with model labels
- [ ] Document model floors in CLAUDE.md
- [ ] Add "Recommended model: Haiku (can escalate to Sonnet)" to SD recommendations
- [ ] Run first SD with Haiku defaults for non-critical agents
- [ ] Monitor rework rate closely

### Week 2 (Refinement)

- [ ] Analyze Week 1 escalation patterns
- [ ] Add task-type specific escalation rules
- [ ] Update sub-agent tier assignments based on actual performance
- [ ] Implement dashboard showing Haiku vs Sonnet vs Opus breakdown
- [ ] Build escalation alerting (if escalation rate >15%)

### Week 3+ (Sophistication)

- [ ] Implement ML-based escalation prediction (learns from historical patterns)
- [ ] Add complexity-aware model selection (complexity level → model suggestion)
- [ ] Build forecasting model incorporating Haiku budget status
- [ ] Implement budget reserve system (save % for emergencies)
- [ ] Create detailed cost-benefit analysis per task type

---

## 11. FAQ & Clarifications

### Q: Why Haiku-first instead of Sonnet-default?
**A**: Haiku has 3x the weekly hours (700+ vs 240-480), costs 1/3 as much, and Anthropic says it's "similar performance to Sonnet at 1/3 cost". Using Sonnet as default wastes Haiku's capacity.

### Q: Won't Haiku produce worse outputs?
**A**: Not significantly. For low-stakes tasks (validation, documentation, retrieval), Haiku is sufficient. For complex reasoning (design, security), we use Sonnet/Opus. Trade-off: accept 10-15% rework on Haiku tasks to save 67% cost.

### Q: What if escalation logic is wrong?
**A**: Override available. If Haiku+escalation doesn't work, Chairman manually selects model. System logs override. We learn from failures.

### Q: Can we ever downgrade from Opus?
**A**: No. Security work is non-negotiable. If budget exhausted, defer the SD, don't compromise security.

### Q: How often will we escalate?
**A**: Estimate 5-15% of Haiku-assigned tasks will escalate to Sonnet. This is expected and acceptable.

---

## Conclusion

**Haiku-first is the obvious optimization** given:
1. 700+ weekly hours available (vs 0 currently used)
2. 1/3 the cost of Sonnet
3. Sufficient quality for 60-70% of work
4. Preserves Sonnet/Opus for critical decisions

**Implementation is low-risk**:
- Start with low-stakes agents (GITHUB, DOCMON, RETRO)
- Escalation logic is explicit
- Manual override always available
- Builds confidence over 2-3 SDs

**Expected outcome**: Same quality, 20-30% cost savings, more capacity for parallel work.

---

**Status**: READY FOR IMPLEMENTATION
**Approval Required**: Chairman review + approval
