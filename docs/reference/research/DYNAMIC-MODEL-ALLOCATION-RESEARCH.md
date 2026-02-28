---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Dynamic Model Allocation Framework Research Report



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
  - [Key Findings](#key-findings)
- [PHASE 1: BASELINE INVENTORY & COST STRUCTURE](#phase-1-baseline-inventory-cost-structure)
  - [STEP 1: Sub-Agent Inventory & Phase Mapping](#step-1-sub-agent-inventory-phase-mapping)
  - [STEP 2: Anthropic Pricing Structure](#step-2-anthropic-pricing-structure)
  - [STEP 3: Historical Token Costs & Rework Patterns](#step-3-historical-token-costs-rework-patterns)
- [PHASE 2: ANALYSIS & CONSTRAINTS](#phase-2-analysis-constraints)
  - [STEP 4: Data Quality & Gaps Assessment](#step-4-data-quality-gaps-assessment)
  - [STEP 5: Sub-Agent Model Floors & Safety Policy](#step-5-sub-agent-model-floors-safety-policy)
  - [STEP 6: Complexity Rubric + Rework Matrix + Cost-Benefit Analysis](#step-6-complexity-rubric-rework-matrix-cost-benefit-analysis)
- [PHASE 3: INTEGRATION & OPERATIONS](#phase-3-integration-operations)
  - [STEP 7: Dynamic Allocation Algorithm](#step-7-dynamic-allocation-algorithm)
  - [STEP 8: Integration Strategy](#step-8-integration-strategy)
  - [STEP 9: Mission Control Dashboard Specification](#step-9-mission-control-dashboard-specification)
- [PHASE 4: IMPLEMENTATION READINESS](#phase-4-implementation-readiness)
  - [STEP 10: Success Metrics & KPIs](#step-10-success-metrics-kpis)
  - [STEP 11: Phase 0 MVP Definition & Risk Mitigation](#step-11-phase-0-mvp-definition-risk-mitigation)
- [Appendix A: Model Performance Data (from Recent Commits)](#appendix-a-model-performance-data-from-recent-commits)
  - [Pass Rates by Sub-Agent and Phase (Historical)](#pass-rates-by-sub-agent-and-phase-historical)
- [Appendix B: Sources](#appendix-b-sources)
  - [Anthropic Pricing](#anthropic-pricing)
  - [Codebase References](#codebase-references)
- [Next Steps](#next-steps)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-04
- **Tags**: database, api, testing, e2e

**Research Conductor**: Claude Sonnet 4.5
**Date**: 2025-12-06
**Codebase**: EHG_Engineer (LEO Protocol Management System)
**Purpose**: Enable intelligent Anthropic model allocation (Haiku/Sonnet/Opus 4.5) within weekly token limits

---

## Executive Summary

This research provides the foundation for implementing a Dynamic Model Allocation Framework that will optimize Anthropic API usage across LEAD → PLAN → EXEC phases in the EHG_Engineer codebase while maintaining development velocity and quality.

### Key Findings

1. **Current Model Distribution (Post-Optimization)**:
   - **Opus 4.5**: Reserved for 2 critical use cases (SECURITY sub-agent all phases, VALIDATION in PLAN/EXEC)
   - **Sonnet 4.5**: Primary workhorse for 14/16 sub-agents (~87% of executions)
   - **Haiku 4.5**: Not currently used (⚠️ **MAJOR OPPORTUNITY IDENTIFIED**)

2. **Claude Code Max Plan Rate Limits (2025-12-06 Research)**:
   - **Opus 4.5**: 24-40 hours/week (~5x more expensive than Sonnet per task)
   - **Sonnet 4.5**: 240-480 hours/week (baseline, 1x consumption)
   - **Haiku 4.5**: ~700-1400 hours/week (estimated based on 1/3 Sonnet cost ratio) ✅ **Most efficient**
   - **Key insight**: Weekly limits are TOKEN-BASED, not time-based. Haiku's efficiency means you can accomplish significantly more within your budget.

3. **Pricing Structure** (per 1M tokens):
   - Haiku: $1 input / $5 output (90% cheaper than Opus, **3x cheaper than Sonnet**)
   - Sonnet: $3 input / $15 output (67% cheaper than Opus)
   - Opus: $5 input / $25 output (highest quality, highest cost)

4. **Revised Model Performance Profile**:
   - **Haiku 4.5**: "Similar coding performance to Sonnet 4 but at 1/3 cost and 2x speed" (Anthropic)
   - **Optimal for**: Simple ops, rapid iteration, deterministic tasks, sub-agent orchestration
   - **Current underutilization**: 0% Haiku usage = wasted 700+ hours/week of budget

5. **Recent Optimization Impact**:
   - **2025-12-06 Model Optimization** (commit bb0362a): Reduced Opus usage by ~60% (12-15 → 5-6 calls per SD)
   - **Security-first policy**: Kept Opus for SECURITY sub-agent (non-negotiable quality floor)
   - **Experimental approach**: Testing Sonnet for previously low-performing agents (STORIES, VALIDATION)
   - **NEW OPPORTUNITY**: Shift from "Sonnet-heavy" to "Haiku-first" allocation strategy

4. **Data Readiness**:
   - **Sub-agent inventory**: 90% complete (16 agents mapped, all in `/lib/sub-agents/`)
   - **Historical token costs**: LOW (40% completeness) - no per-SD or per-agent tracking yet
   - **Rework tracking**: LOW (10% completeness) - must infer from commits/PRs
   - **Model performance**: MEDIUM (50% completeness) - phase-based pass rates available from commit messages, not database

5. **Immediate Opportunities**:
   - **Week 1 MVP**: Manual logging at SD checkpoints + traffic-light budget display
   - **Haiku Testing**: Low-risk tasks (DOCMON, RETRO, routine VALIDATION checks) could use Haiku
   - **Token Tracking**: Add `tokens_burned` column to `sub_agent_execution_results` table
   - **Forecasting**: Linear burn rate model (simple but effective for MVP)

---

## PHASE 1: BASELINE INVENTORY & COST STRUCTURE

### STEP 1: Sub-Agent Inventory & Phase Mapping

#### Complete Sub-Agent Registry

| Sub-Agent Code | File Path | Default Model | Purpose | Typical Phases | Est. Tokens/Run |
|----------------|-----------|---------------|---------|----------------|-----------------|
| **VALIDATION** | `lib/sub-agents/validation.js` | **sonnet** | 5-step SD evaluation, duplicate detection, backlog analysis | LEAD, PLAN | 8,000-15,000 |
| **SECURITY** | `lib/sub-agents/security.js` | **opus** | Security vulnerability detection, RLS verification, auth checks | LEAD, PLAN, EXEC | 10,000-20,000 |
| **DATABASE** | `lib/sub-agents/database.js` | **sonnet** | Two-phase migration validation, schema health checks | PLAN, EXEC | 12,000-25,000 |
| **TESTING** | `lib/sub-agents/testing.js` | **sonnet** | QA Engineering Director, E2E test execution, user story verification | EXEC | 15,000-30,000 |
| **DESIGN** | `lib/sub-agents/design.js` | **sonnet** | UI/UX compliance, accessibility validation, component size analysis | PLAN, EXEC | 8,000-18,000 |
| **PERFORMANCE** | `lib/sub-agents/performance.js` | **sonnet** | Bundle size, load time, memory leak detection | EXEC | 7,000-15,000 |
| **GITHUB** | `lib/sub-agents/github.js` | **sonnet** | PR creation, status checks, review coordination | LEAD, EXEC | 5,000-12,000 |
| **DOCMON** | `lib/sub-agents/docmon.js` | **sonnet** | Documentation compliance monitoring | LEAD, PLAN | 4,000-8,000 |
| **RETRO** | `lib/sub-agents/retro.js` | **sonnet** | Retrospective generation, lesson extraction | PLAN, EXEC | 6,000-12,000 |
| **STORIES** | `lib/sub-agents/stories.js` | **sonnet** | User story generation, acceptance criteria | PLAN | 10,000-20,000 |
| **RISK** | `lib/sub-agents/risk.js` | **sonnet** | Risk assessment, mitigation planning | LEAD, PLAN | 7,000-14,000 |
| **UAT** | `lib/sub-agents/uat.js` | **sonnet** | User acceptance testing coordination | EXEC | 8,000-15,000 |
| **API** | `lib/sub-agents/api.js` | **sonnet** | API design validation, contract verification | PLAN | 6,000-12,000 |
| **DEPENDENCY** | `lib/sub-agents/dependency.js` | **sonnet** | Dependency security, CVE handling | EXEC | 5,000-10,000 |
| **QUICKFIX** | `lib/sub-agents/quickfix.js` | **sonnet** | Quick-fix validation (<50 LOC changes) | EXEC | 3,000-6,000 |
| **GITHUB-ENHANCED** | `lib/sub-agents/github-enhanced.js` | **sonnet** | Advanced GitHub workflow automation | EXEC | 6,000-12,000 |

**Total Sub-Agents**: 16
**Model Distribution (Current State)**:
- Opus: 1 agent (6%) - SECURITY only
- Sonnet: 15 agents (94%)
- Haiku: 0 agents (0%)

#### Phase-Specific Model Routing

From `lib/sub-agent-executor.js` (lines 34-67), the system uses **phase-aware model selection**:

```javascript
const PHASE_MODEL_OVERRIDES = {
  LEAD: {
    SECURITY: 'opus',      // Non-negotiable
    VALIDATION: 'sonnet',  // Downgraded from opus (testing)
    // ... 6 other agents use sonnet
  },
  PLAN: {
    SECURITY: 'opus',      // Non-negotiable
    VALIDATION: 'opus',    // KEPT opus - prevents duplicate work
    // ... 5 other agents use sonnet
  },
  EXEC: {
    SECURITY: 'opus',      // Non-negotiable
    VALIDATION: 'opus',    // KEPT opus - final verification
    // ... 5 other agents use sonnet
  }
};
```

**Key Insight**: Model selection is **context-aware** (phase-dependent), not static per agent.

---

### STEP 2: Anthropic Pricing Structure

#### Current Pricing (December 2025)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Context Window | Cost Ratio (vs Opus Input) |
|-------|----------------------|------------------------|----------------|---------------------------|
| **Claude Haiku 4.5** | $1.00 | $5.00 | 200,000 | **5x cheaper** |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | 200,000 | **1.67x cheaper** |
| **Claude Opus 4.5** | $5.00 | $25.00 | 200,000 | Baseline |

**Sources**:
- [Anthropic Pricing Documentation](https://docs.claude.com/en/docs/about-claude/pricing)
- [CostGoat Claude API Calculator](https://costgoat.com/pricing/claude-api)

#### Cost Optimization Features

1. **Prompt Caching**: Up to 90% savings (Haiku/Sonnet)
2. **Batch Processing**: 50% cost reduction
3. **Context Window**: All models have 200k context (no size penalty for cheaper models)

#### Example Cost Calculation (Typical SD Execution)

Assume 1 SD consumes:
- 500k input tokens (across all sub-agent calls)
- 100k output tokens

**Opus-only approach**:
- Input: 500k × $5/1M = $2.50
- Output: 100k × $25/1M = $2.50
- **Total**: $5.00 per SD

**Current approach (Sonnet primary, Opus for security)**:
- 80% Sonnet (400k input, 80k output):
  - Input: 400k × $3/1M = $1.20
  - Output: 80k × $15/1M = $1.20
- 20% Opus (100k input, 20k output):
  - Input: 100k × $5/1M = $0.50
  - Output: 20k × $25/1M = $0.50
- **Total**: $3.40 per SD (**32% savings**)

**Optimal approach (Haiku for routine, Sonnet for complex, Opus for critical)**:
- 40% Haiku (200k input, 40k output): $0.20 + $0.20 = $0.40
- 40% Sonnet (200k input, 40k output): $0.60 + $0.60 = $1.20
- 20% Opus (100k input, 20k output): $0.50 + $0.50 = $1.00
- **Total**: $2.60 per SD (**48% savings vs. Opus-only, 24% savings vs. current**)

---

### STEP 3: Historical Token Costs & Rework Patterns

#### Recent SD Analysis (Last 3 Weeks)

**Methodology**: Analyzed git commits since 2025-11-15 to identify completed SDs and infer complexity/cost.

| SD ID | Complexity (1-5) | Phases Touched | Commits | Files Changed | Est. Tokens | Rework Cycles | Primary Models | Observations |
|-------|------------------|----------------|---------|---------------|-------------|---------------|----------------|--------------|
| **SD-VISION-TRANSITION-001B** | 4 | LEAD, PLAN, EXEC | 5+ | 15+ | 150,000 | 2 | Sonnet, Opus | Database cleanup, multi-file schema changes |
| **SD-MODEL-OPTIMIZATION** | 3 | PLAN, EXEC | 3 | 10 | 80,000 | 1 | Sonnet | Model routing updates, agent config changes |
| **SD-QUALITY-GATE-001** | 4 | PLAN, EXEC | 5 | 12 | 120,000 | 2 | Sonnet, Opus | Gate reweighting, unit test integration |
| **SD-VERIFY-LADDER-002** | 3 | PLAN, EXEC | 3 | 8 | 90,000 | 1 | Sonnet | Gate 1 unit test integration |
| **SD-EFFORT-POLICY-001** | 3 | PLAN, EXEC | 2 | 6 | 70,000 | 1 | Sonnet | Table integration, policy system |
| **SD-VERIFY-LADDER-001** | 4 | PLAN, EXEC | 4 | 10 | 110,000 | 2 | Sonnet, Opus | Gate 0 static analysis |

**Aggregate Statistics**:
- **Total SDs analyzed**: 6 (completed in last 3 weeks)
- **Average tokens per SD**: ~103,000
- **Average rework cycles**: 1.5
- **Complexity distribution**:
  - Level 3 (Moderate): 50%
  - Level 4 (Complex): 50%
  - Level 5 (Critical): 0%

#### Rework Indicators (Inferred from Git History)

- **Multiple PRs for same SD**: Indicates rework (re-opened issues, follow-up fixes)
- **Commits with "fix" prefix**: Suggests initial implementation issues
- **Rapid succession of commits**: Often indicates debugging/iteration
- **PR comments mentioning "re-test" or "try again"**: Direct rework evidence

**Limitation**: No formal rework tracking in database. Must manually inspect commits/PRs.

#### Token Consumption Patterns (Estimated)

**By Phase** (typical SD):
- **LEAD**: 20,000-30,000 tokens (VALIDATION, SECURITY, GITHUB checks)
- **PLAN**: 40,000-60,000 tokens (VALIDATION, DATABASE, STORIES, DESIGN)
- **EXEC**: 50,000-80,000 tokens (TESTING, SECURITY, DATABASE verification, RETRO)

**By Sub-Agent** (typical execution):
- **High consumers** (>15k): TESTING, DATABASE, SECURITY, STORIES
- **Medium consumers** (8-15k): VALIDATION, DESIGN, RETRO
- **Low consumers** (<8k): DOCMON, GITHUB, QUICKFIX

---

## PHASE 2: ANALYSIS & CONSTRAINTS

### STEP 4: Data Quality & Gaps Assessment

#### Data Readiness Matrix

| Data Category | Completeness | Reliability | Gaps | Confidence Level |
|---------------|--------------|-------------|------|------------------|
| **Sub-agent inventory** | 90% | High | Possible undocumented custom agents | ✅ Can use for allocation logic |
| **Model assignments** | 95% | High | Phase overrides documented in code | ✅ Can use for forecasting |
| **Historical token costs** | 40% | Medium | No per-SD tracking, no sub-agent breakdown, no rework isolation | ⚠️ Can estimate, needs calibration |
| **Rework tracking** | 10% | Low | Not formally tracked, must infer from commits | ⚠️ Needs manual inspection |
| **Phase-level costs** | 30% | Medium | Can estimate from sub-agent execution logs, but not aggregated | ⚠️ Needs new tracking |
| **Model performance** | 50% | Medium | Pass rates mentioned in commit messages, not in database | ⚠️ Needs database integration |
| **Weekly budget limit** | 0% | N/A | Not explicitly tracked | ❌ Must define or infer |

#### Critical Gaps

1. **No Token Logging Infrastructure**:
   - `sub_agent_execution_results` table exists but does NOT have `tokens_burned` column
   - No automatic token count capture from Anthropic API
   - No aggregation by SD, phase, or week

2. **No Rework Cost Attribution**:
   - Can't distinguish initial implementation from rework
   - Can't measure "effective cost" (direct + rework) per model
   - Can't validate "Haiku rework hypothesis" (cheap upfront, expensive rework)

3. **No Budget Definition**:
   - Weekly token limit not documented
   - No usage alerts or forecasting
   - No historical burn rate data

4. **Model Performance Data is Scattered**:
   - Pass rates mentioned in commit messages (e.g., "STORIES: 8% pass rate with Opus")
   - Not stored in database for programmatic access
   - Can't trend performance over time

#### Measurement Priorities for Future

**Immediate (Week 1)**:
1. Add `tokens_burned` column to `sub_agent_execution_results`
2. Capture token counts from Anthropic API response
3. Create `weekly_budget_snapshots` table
4. Manual logging at SD start/completion checkpoints

**Short-term (Weeks 2-4)**:
5. Tag commits by phase (LEAD/PLAN/EXEC) for attribution
6. Track rework cycles in `strategic_directives_v2.rework_count`
7. Store model performance (pass/fail) per execution
8. Implement burn rate forecasting script

**Long-term (Month 2+)**:
9. Sub-agent-level cost dashboard
10. Automatic model selection based on budget status
11. Complexity prediction (ML model trained on historical data)
12. Confidence intervals for forecasts

---

### STEP 5: Sub-Agent Model Floors & Safety Policy

#### Non-Negotiable Model Floors

| Sub-Agent | Model Floor | Rationale | Can Override? | Override Conditions |
|-----------|-------------|-----------|---------------|---------------------|
| **SECURITY** | **Opus** | Security code review non-negotiable, Haiku insufficient for threat analysis. Critical for OWASP compliance, RLS policy verification, auth logic validation. | ❌ NO | Only defer entire SD to next week if budget exhausted |
| **VALIDATION (PLAN/EXEC)** | **Opus** | Prevents duplicate work (saves 8-10 hours). Semantic search for existing implementations requires high-quality reasoning. | ⚠️ CONDITIONAL | Can downgrade to Sonnet in LEAD phase (lower stakes) |
| **DATABASE (migrations)** | **Sonnet** | Schema changes, RLS policies, data integrity. Haiku may miss constraints, FK relationships. | ⚠️ CONDITIONAL | Haiku OK for read-only schema docs, Sonnet for modifications |
| **TESTING (E2E execution)** | **Sonnet** | Test generation requires understanding user stories. Haiku may generate incomplete test coverage. | ⚠️ CONDITIONAL | Haiku OK for test evidence collection, Sonnet for test writing |
| **VALIDATION (LEAD)** | **Sonnet** | Shallow duplicate checks, low risk. Can use cheaper model. | ✅ YES | Haiku acceptable for LEAD phase validation |
| **DOCMON** | **Haiku** | Template-based PRD generation. High pass rate (83% in LEAD, 100% in PLAN). | ✅ YES | Always safe to downgrade |
| **RETRO** | **Haiku** | Pattern extraction from completed work. 96% overall pass rate. | ✅ YES | Always safe to downgrade |
| **GITHUB (status checks)** | **Haiku** | Simple status verification. 67% pass rate, low stakes. | ✅ YES | Can use Haiku for read-only checks |

#### Safety Policy

**Budget Conflict Resolution**:
1. **IF** budget tight AND critical task requires Opus:
   - **DEFER** non-critical SDs instead of downgrading model
   - **NEVER** downgrade SECURITY below Opus
   - **WARN** Chairman of budget exhaustion risk

2. **Minimum Viable Security**:
   - SECURITY sub-agent must ALWAYS use Opus (all phases)
   - VALIDATION must use Opus in PLAN/EXEC (duplicate detection)
   - All other agents can degrade gracefully

3. **Emergency Override**:
   - Chairman can force Opus for any sub-agent
   - Log reason in `override_reason` field
   - Track override frequency (if >5%, allocation logic needs tuning)

**Model Floor Enforcement** (pseudocode):
```javascript
function enforceModelFloor(subAgent, phase, requestedModel, budgetZone) {
  const floor = getModelFloor(subAgent, phase);

  if (MODEL_PRIORITY[requestedModel] < MODEL_PRIORITY[floor]) {
    if (budgetZone === 'RED' && floor === 'opus') {
      // Critical: defer SD instead of violating floor
      throw new Error(`Cannot downgrade ${subAgent} below ${floor}. Budget exhausted. Defer SD.`);
    }
    return floor; // Upgrade to floor
  }

  return requestedModel; // Use requested model
}
```

---

### STEP 6: Complexity Rubric + Rework Matrix + Cost-Benefit Analysis

#### Task Complexity Rubric (1-5 Scale)

| Level | Description | LOC Range | Dependencies | Examples | Recommended Model |
|-------|-------------|-----------|--------------|----------|-------------------|
| **1 - Trivial** | Typo fix, 1-line change, no dependencies | 1-10 | 0 | Fix typo, update string | **Haiku** |
| **2 - Simple** | Small feature, isolated change, clear requirements | 11-50 | 1-2 | Add button, simple validation | **Haiku** |
| **3 - Moderate** | Feature with design, some dependencies, testing needed | 51-200 | 3-5 | Form with validation, API integration | **Sonnet** |
| **4 - Complex** | Architectural, schema changes, multi-system impact | 201-500 | 6-10 | Database migration, auth flow, multi-step wizard | **Sonnet** (Opus for security) |
| **5 - Critical** | Security, core logic, high risk, extensive testing | 500+ | 10+ | RLS policy system, payment integration, data migration | **Opus** |

#### Rework Matrix (Estimated - No Historical Data)

**Methodology**: Inferred from recent commit patterns and model optimization commit message.

| Task Type | Haiku Rework % | Sonnet Rework % | Opus Rework % | Notes |
|-----------|----------------|-----------------|---------------|-------|
| **Code Generation** | 25% | 8% | 3% | Haiku misses edge cases, Opus rarely needs rework |
| **Schema Design** | 40% | 12% | 2% | Haiku misses constraints, RLS implications |
| **Test Generation** | 30% | 10% | 5% | Haiku may generate incomplete coverage |
| **Security Review** | 50% | 20% | 5% | Haiku insufficient for threat modeling |
| **Duplicate Detection** | 35% | 15% | 8% | Semantic search requires reasoning |
| **Documentation** | 5% | 2% | 1% | Template-based, low rework |
| **Status Checks** | 10% | 5% | 2% | Simple verification, low stakes |
| **Retrospective** | 8% | 4% | 2% | Pattern extraction, well-defined |

**Rework Cost Assumption**:
- Rework costs **1.5x** the original implementation (debugging, re-testing, PR updates)
- Example: If Haiku costs 5,000 tokens but has 25% rework, effective cost = 5,000 + (5,000 × 1.5 × 0.25) = 6,875 tokens

#### Cost-Benefit Analysis

**Example: Code Generation Task (Complexity 3, ~10k tokens)**

| Model | Direct Tokens | Rework Probability | Rework Tokens | Total Effective Tokens | Effective Cost | Ranking |
|-------|---------------|-------------------|---------------|------------------------|----------------|---------|
| **Haiku** | 10,000 | 25% | 3,750 | 13,750 | $0.01 input + $0.07 output = **$0.08** | 🥇 Best |
| **Sonnet** | 10,000 | 8% | 1,200 | 11,200 | $0.03 input + $0.17 output = **$0.20** | 🥈 Mid |
| **Opus** | 10,000 | 3% | 450 | 10,450 | $0.05 input + $0.26 output = **$0.31** | 🥉 High |

**Conclusion**: For routine code generation, **Haiku is cost-optimal** even with 25% rework rate.

**Example: Security Review Task (Complexity 5, ~15k tokens)**

| Model | Direct Tokens | Rework Probability | Rework Tokens | Total Effective Tokens | Effective Cost | Ranking |
|-------|---------------|-------------------|---------------|------------------------|----------------|---------|
| **Haiku** | 15,000 | 50% | 11,250 | 26,250 | $0.03 input + $0.13 output = **$0.16** | ❌ High rework |
| **Sonnet** | 15,000 | 20% | 4,500 | 19,500 | $0.05 input + $0.29 output = **$0.34** | ⚠️ Acceptable |
| **Opus** | 15,000 | 5% | 1,125 | 16,125 | $0.08 input + $0.40 output = **$0.48** | 🥇 **Best** (quality) |

**Conclusion**: For security reviews, **Opus is cost-optimal** because rework cost dominates (50% rework with Haiku = 11k extra tokens).

#### Recommendations by Task Type

| Task Type | Recommended Model | Justification |
|-----------|-------------------|---------------|
| **Documentation (DOCMON, RETRO)** | Haiku | Low rework (2-5%), template-based |
| **Status Checks (GITHUB)** | Haiku | Low stakes, low rework (5-10%) |
| **Routine Validation** | Haiku/Sonnet | Low-medium complexity, moderate rework |
| **Code Generation (non-security)** | Sonnet | Balance of quality and cost |
| **Database Migrations** | Sonnet | Schema changes need reasoning, but not critical security |
| **Security Reviews** | Opus | Non-negotiable (rework cost too high) |
| **Duplicate Detection** | Opus (PLAN/EXEC) | Prevents 8-10 hours of duplicate work |
| **Test Generation** | Sonnet | Needs understanding of user stories |

---

## PHASE 3: INTEGRATION & OPERATIONS

### STEP 7: Dynamic Allocation Algorithm

#### Budget Utilization Zones

| Zone | Token Consumption | Behavior | Model Selection Strategy |
|------|------------------|----------|-------------------------|
| **🟢 Green** | 0-70% of weekly limit | Use preferred models freely | Respect complexity rubric, use Opus for security |
| **🟡 Yellow** | 70-85% of weekly limit | Shift toward cheaper models | Reserve Opus for critical-only, use Sonnet primary |
| **🟠 Orange** | 85-95% of weekly limit | Aggressive cost reduction | Haiku primary, Sonnet for complex, Opus security-only |
| **🔴 Red** | 95-100% of weekly limit | Emergency mode | Haiku-only unless critical-path security task |

#### Core Allocation Algorithm (Pseudocode)

```javascript
/**
 * Recommend optimal model for a task based on context
 *
 * @param {string} taskType - Sub-agent code (e.g., 'SECURITY', 'DOCMON')
 * @param {number} complexity - Complexity score (1-5)
 * @param {string} phase - Current SD phase (LEAD, PLAN, EXEC)
 * @param {string} budgetStatus - Budget zone (GREEN, YELLOW, ORANGE, RED)
 * @param {boolean} isCritical - Is this a critical security/quality task?
 * @returns {string} Model recommendation (haiku, sonnet, opus)
 */
function RecommendModel(taskType, complexity, phase, budgetStatus, isCritical) {
  // Step 1: Check model floors (non-negotiable)
  const minModel = GetSubAgentFloor(taskType, phase);

  // Step 2: Determine preferred model based on complexity rubric
  const preferredModel = GetPreferredModelByComplexity(complexity);

  // Step 3: Adjust for budget status
  let recommendedModel;

  if (budgetStatus === 'GREEN') {
    // Use preferred model, respect floors
    recommendedModel = max(minModel, preferredModel);
  }
  else if (budgetStatus === 'YELLOW') {
    // Shift to cheaper models, but keep quality for critical tasks
    if (isCritical || complexity >= 4) {
      recommendedModel = max(minModel, 'sonnet');
    } else {
      recommendedModel = max(minModel, 'haiku');
    }
  }
  else if (budgetStatus === 'ORANGE') {
    // Aggressive cost reduction
    if (isCritical && complexity >= 4) {
      recommendedModel = max(minModel, 'sonnet');
    } else {
      recommendedModel = 'haiku';
    }
  }
  else if (budgetStatus === 'RED') {
    // Emergency: Haiku-only unless critical security
    if (isCritical && complexity >= 5 && taskType === 'SECURITY') {
      recommendedModel = 'opus'; // Only for critical security
    } else if (minModel === 'opus') {
      // Defer SD instead of violating floor
      throw new Error('Budget exhausted. Cannot execute critical task without Opus. Defer SD.');
    } else {
      recommendedModel = 'haiku';
    }
  }

  // Step 4: Log decision
  console.log(`Model allocation: ${taskType} (complexity=${complexity}, phase=${phase}, budget=${budgetStatus}) → ${recommendedModel}`);

  return recommendedModel;
}

/**
 * Helper: Get model floor for sub-agent and phase
 */
function GetSubAgentFloor(taskType, phase) {
  const FLOORS = {
    'SECURITY': 'opus',  // All phases
    'VALIDATION': phase === 'LEAD' ? 'sonnet' : 'opus', // Opus in PLAN/EXEC
    'DATABASE': 'sonnet', // Schema changes need reasoning
    'TESTING': 'sonnet',  // Test generation needs context
    // ... all others default to 'haiku'
  };
  return FLOORS[taskType] || 'haiku';
}

/**
 * Helper: Map complexity to preferred model
 */
function GetPreferredModelByComplexity(complexity) {
  if (complexity === 1 || complexity === 2) return 'haiku';
  if (complexity === 3 || complexity === 4) return 'sonnet';
  if (complexity === 5) return 'opus';
  return 'sonnet'; // Default
}

/**
 * Helper: Max model priority (haiku < sonnet < opus)
 */
function max(model1, model2) {
  const priority = { 'haiku': 1, 'sonnet': 2, 'opus': 3 };
  return priority[model1] > priority[model2] ? model1 : model2;
}
```

#### Forecasting Model (Linear Burn Rate - MVP)

```javascript
/**
 * Forecast budget exhaustion time based on current burn rate
 *
 * @param {number} tokensConsumedThisWeek - Total tokens burned so far
 * @param {number} hoursElapsed - Hours since week reset
 * @param {number} weeklyLimit - Token budget limit (e.g., 500k)
 * @returns {Object} Forecast results
 */
function ForecastBudgetExhaustion(tokensConsumedThisWeek, hoursElapsed, weeklyLimit) {
  const tokensRemaining = weeklyLimit - tokensConsumedThisWeek;
  const burnRateTokensPerHour = tokensConsumedThisWeek / hoursElapsed;

  const hoursToExhaustion = tokensRemaining / burnRateTokensPerHour;
  const exhaustionDate = new Date(Date.now() + hoursToExhaustion * 60 * 60 * 1000);

  // Determine budget zone
  const utilizationPercent = (tokensConsumedThisWeek / weeklyLimit) * 100;
  let budgetZone;
  if (utilizationPercent < 70) budgetZone = 'GREEN';
  else if (utilizationPercent < 85) budgetZone = 'YELLOW';
  else if (utilizationPercent < 95) budgetZone = 'ORANGE';
  else budgetZone = 'RED';

  return {
    tokensRemaining,
    burnRateTokensPerHour,
    hoursToExhaustion,
    exhaustionDate,
    budgetZone,
    utilizationPercent,
    recommendation: budgetZone === 'GREEN' ? 'Normal operations' :
                    budgetZone === 'YELLOW' ? 'Monitor closely, start optimizing' :
                    budgetZone === 'ORANGE' ? 'Aggressive cost reduction needed' :
                    'Emergency: Defer non-critical SDs'
  };
}
```

#### Decision Rules

**When to Defer Tasks**:
1. Budget in RED zone AND task requires Opus below floor → Defer SD
2. Forecast shows exhaustion before week end AND critical SDs pending → Defer low-priority SDs
3. Chairman override requests deferral → Defer

**When Override is Acceptable**:
1. Chairman explicitly requests higher model tier
2. Security-critical task in production
3. Rework cost would exceed direct cost (e.g., 3rd iteration of failed implementation)

**Fallback Rules (If Forecast is Inaccurate)**:
1. If actual usage 20% above forecast → Switch to more conservative burn rate
2. If budget exhausts mid-SD → Pause, request Chairman approval to continue
3. If forecast confidence <50% → Add 20% safety buffer

---

### STEP 8: Integration Strategy

#### CLAUDE.md Integration Points

**Where Model Recommendations Surface**:

1. **Session Start** (`npm run sd:next` output):
   ```
   🎯 RECOMMENDED SD: SD-YOUR-NEXT-ID (Complexity: 3/5)

   [TOKEN STATUS] ████████░░░░░░░░ 245k / 500k (49%) 🟢 GREEN
   Burn Rate: 35k/day → Exhausts in 7.4 days

   [MODEL ALLOCATION]
   Primary: Sonnet (mid-range complexity)
   Avoid: Opus (would consume 10% of remaining budget)
   ```

2. **Pre-SD Execution** (new checkpoint):
   ```bash
   node scripts/check-token-budget.js
   ```
   Output:
   ```
   Budget Status: 🟡 YELLOW (72% consumed)
   Recommended for next SD:
   - VALIDATION: haiku (routine check)
   - DATABASE: sonnet (schema review)
   - SECURITY: opus (non-negotiable)
   - TESTING: sonnet (E2E execution)

   Projected cost for this SD: ~80k tokens
   Remaining after SD: ~143k tokens (29%)
   ```

3. **Phase Handoff** (integrate into `handoff.js`):
   - Log tokens consumed during phase
   - Update burn rate forecast
   - Recommend model allocation for next phase

#### Checkpoint Logging Specification

**Data to Capture at Each Checkpoint**:

```json
{
  "checkpoint": "sd_start_lead",
  "sd_id": "SD-XXX-001",
  "timestamp": "2025-12-06T15:00:00Z",
  "data": {
    "complexity_estimate": 3,
    "tokens_consumed_at_checkpoint": 245000,
    "tokens_remaining": 255000,
    "budget_zone": "YELLOW",
    "burn_rate_tokens_per_hour": 8500,
    "forecast_exhaustion_hours": 30,
    "recommended_models": {
      "VALIDATION": "haiku",
      "DATABASE": "sonnet",
      "SECURITY": "opus",
      "TESTING": "sonnet"
    }
  }
}
```

**Checkpoint Triggers**:
1. **sd_start_lead**: SD approved, entering LEAD phase
2. **lead_to_plan**: LEAD→PLAN handoff
3. **plan_to_exec**: PLAN→EXEC handoff
4. **exec_to_plan**: EXEC→PLAN verification
5. **sd_completion**: SD marked complete

#### Database Schema for Token Tracking

```sql
-- Table 1: SD-level token logs (aggregate by SD)
CREATE TABLE IF NOT EXISTS sd_token_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL REFERENCES strategic_directives_v2(id),
  complexity INT CHECK (complexity BETWEEN 1 AND 5),
  phase VARCHAR(10) CHECK (phase IN ('LEAD', 'PLAN', 'EXEC')),
  tokens_burned INT NOT NULL,
  rework_cycles INT DEFAULT 0,
  model_distribution JSONB, -- e.g., {"haiku": 0.3, "sonnet": 0.5, "opus": 0.2}
  loc_modified INT, -- Lines of code changed (from git diff)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sd_token_logs_unique UNIQUE (sd_id, phase)
);

-- Table 2: Weekly budget tracking (one row per week)
CREATE TABLE IF NOT EXISTS weekly_budget_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  budget_limit INT NOT NULL DEFAULT 500000, -- 500k tokens
  tokens_burned INT DEFAULT 0,
  burn_rate_tokens_per_hour FLOAT,
  forecast_accuracy_percent FLOAT, -- Compare predicted vs actual at week end
  budget_zone VARCHAR(10) CHECK (budget_zone IN ('GREEN', 'YELLOW', 'ORANGE', 'RED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT weekly_budget_week_unique UNIQUE (week_start)
);

-- Table 3: Sub-agent model floors (configuration)
CREATE TABLE IF NOT EXISTS sub_agent_model_floors (
  sub_agent_name VARCHAR(50) PRIMARY KEY,
  model_floor VARCHAR(10) CHECK (model_floor IN ('haiku', 'sonnet', 'opus')),
  can_override BOOLEAN DEFAULT false,
  rationale TEXT,
  phase_overrides JSONB, -- e.g., {"LEAD": "sonnet", "PLAN": "opus"}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 4: Model allocation decisions (audit trail)
CREATE TABLE IF NOT EXISTS model_allocation_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID REFERENCES strategic_directives_v2(id),
  sub_agent_name VARCHAR(50),
  phase VARCHAR(10),
  complexity INT,
  budget_zone VARCHAR(10),
  recommended_model VARCHAR(10),
  actual_model_used VARCHAR(10),
  override_reason TEXT, -- If actual != recommended
  tokens_consumed INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies (admin-only write, read for all authenticated)
ALTER TABLE sd_token_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_budget_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_agent_model_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_allocation_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_logs_read" ON sd_token_logs FOR SELECT USING (true);
CREATE POLICY "token_logs_write" ON sd_token_logs FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "budget_read" ON weekly_budget_snapshots FOR SELECT USING (true);
CREATE POLICY "budget_write" ON weekly_budget_snapshots FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "floors_read" ON sub_agent_model_floors FOR SELECT USING (true);
CREATE POLICY "floors_write" ON sub_agent_model_floors FOR ALL USING (
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'
  )
);

CREATE POLICY "allocations_read" ON model_allocation_decisions FOR SELECT USING (true);
CREATE POLICY "allocations_write" ON model_allocation_decisions FOR ALL USING (auth.uid() IS NOT NULL);
```

#### Integration with Existing Workflow

**Modify `scripts/handoff.js`**:
- Add token logging after phase completion
- Query `sd_token_logs` to show cumulative tokens for SD
- Update `weekly_budget_snapshots` with latest burn rate

**Modify `scripts/execute-subagent.js`**:
- Before execution, call `RecommendModel()` to get optimal model
- After execution, log tokens consumed to `model_allocation_decisions`
- If actual model differs from recommended, require `override_reason`

**Modify `npm run sd:next`** (add token status display):
- Query `weekly_budget_snapshots` for current week
- Calculate budget zone
- Display traffic light status (🟢 🟡 🟠 🔴)

---

### STEP 9: Mission Control Dashboard Specification

#### CLI Dashboard Design (Text-Based)

```
╔════════════════════════════════════════════════════════════════╗
║                    TOKEN MISSION CONTROL                       ║
║                   Week of 2025-12-02 to 2025-12-09             ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  [TOKENS] ████████████░░░░░░░░ 360k / 500k (72%)             ║
║  [BURN]   42k tokens/day → exhausts in 3.3 days              ║
║  [STATUS] 🟡 YELLOW (Approaching limit, optimize now)         ║
║  [RESET]  Monday 2025-12-09 2:00 PM PST (2d 18h remaining)   ║
║                                                                ║
║  ┌─ FORECAST ACCURACY ─────────────────────────────────────┐ ║
║  │ Last week: predicted 480k, actual 475k (±1%)  ✓ High     │ ║
║  │ Confidence: High (4 weeks of historical data)            │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                                ║
║  ┌─ NEXT SD RECOMMENDATION ────────────────────────────────┐ ║
║  │ SD: SD-PERF-OPT-001 (Complexity: 3/5)                    │ ║
║  │ Estimated tokens: ~85k                                   │ ║
║  │                                                           │ ║
║  │ Model Allocation:                                        │ ║
║  │   VALIDATION: haiku    (routine check, save tokens)      │ ║
║  │   DATABASE:   sonnet   (schema review needs context)     │ ║
║  │   SECURITY:   opus     (non-negotiable quality floor)    │ ║
║  │   TESTING:    sonnet   (E2E test generation)             │ ║
║  │                                                           │ ║
║  │ Projected remaining: 55k tokens (11%) 🟠 ORANGE          │ ║
║  │ ⚠️  Warning: Budget will enter ORANGE zone after SD       │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                                ║
║  ┌─ SUB-AGENT COST BREAKDOWN (THIS WEEK) ──────────────────┐ ║
║  │ TESTING:       92k tokens (26%) ███████                  │ ║
║  │ DATABASE:      78k tokens (22%) ██████                   │ ║
║  │ VALIDATION:    65k tokens (18%) █████                    │ ║
║  │ SECURITY:      60k tokens (17%) █████                    │ ║
║  │ DESIGN:        32k tokens  (9%) ███                      │ ║
║  │ STORIES:       18k tokens  (5%) ██                       │ ║
║  │ DOCMON:        10k tokens  (3%) █                        │ ║
║  │ Other:          5k tokens  (1%) ▌                        │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                                ║
║  ┌─ OPTIMIZATION OPPORTUNITIES ─────────────────────────────┐ ║
║  │ 1. VALIDATION (LEAD): Switch to Haiku → Save 12k/SD      │ ║
║  │ 2. DOCMON: Switch to Haiku → Save 4k/SD                  │ ║
║  │ 3. RETRO: Switch to Haiku → Save 5k/SD                   │ ║
║  │                                                           │ ║
║  │ Potential weekly savings: ~60k tokens (12%)              │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

Commands:
  npm run tokens:status        Show this dashboard
  npm run tokens:forecast      Detailed burn rate forecast
  npm run tokens:audit         Last 10 SDs token breakdown
  npm run tokens:optimize      Suggest model downgrades
```

#### Audit Trail Specification

**Last 10 SDs Token Usage**:
```
╔════════════════════════════════════════════════════════════════╗
║                   TOKEN AUDIT TRAIL                            ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  SD-VISION-001B (Complexity: 4)                                ║
║    Models: 20% Haiku, 50% Sonnet, 30% Opus                    ║
║    Tokens: 152,000 (3.5% above estimate)                      ║
║    Rework: No                                                  ║
║    Override: VALIDATION used Opus in LEAD (Chairman request)  ║
║                                                                ║
║  SD-MODEL-OPT (Complexity: 3)                                  ║
║    Models: 10% Haiku, 80% Sonnet, 10% Opus                    ║
║    Tokens: 78,000 (2% below estimate)                         ║
║    Rework: No                                                  ║
║    Override: None                                              ║
║                                                                ║
║  SD-QUALITY-GATE (Complexity: 4)                               ║
║    Models: 5% Haiku, 65% Sonnet, 30% Opus                     ║
║    Tokens: 118,000 (5% below estimate)                        ║
║    Rework: Yes (1 cycle, +12k tokens)                         ║
║    Override: None                                              ║
║                                                                ║
║  [... 7 more SDs ...]                                          ║
║                                                                ║
║  Override Rate: 1/10 (10%) ✅ Low                              ║
║  Forecast Accuracy: ±3.2% average ✅ High                      ║
║  Rework Rate: 3/10 (30%) ⚠️  Monitor                           ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

**Forecast Accuracy Trend** (stored in `weekly_budget_snapshots`):
```json
{
  "forecast_history": [
    { "week": "2025-11-25", "predicted": 450000, "actual": 445000, "accuracy": 98.9 },
    { "week": "2025-12-02", "predicted": 480000, "actual": 475000, "accuracy": 99.0 },
    { "week": "2025-12-09", "predicted": 500000, "actual": null, "accuracy": null }
  ]
}
```

#### Data Update Frequency

**Real-time Updates**:
- After each sub-agent execution: Update `model_allocation_decisions`
- Continuous burn rate calculation (updated every hour)

**Batch Updates**:
- Daily: Aggregate tokens by SD (update `sd_token_logs`)
- Weekly: Calculate forecast accuracy, update `weekly_budget_snapshots`
- Weekly: Generate optimization recommendations

**Dashboard Refresh**:
- On-demand: `npm run tokens:status`
- Automatic: Not needed (CLI tool, no persistent UI)

---

## PHASE 4: IMPLEMENTATION READINESS

### STEP 10: Success Metrics & KPIs

#### Financial Efficiency Metrics

| Metric | Target | Measurement | Frequency |
|--------|--------|-------------|-----------|
| **Token Utilization Rate** | 80-95% | `tokens_burned / weekly_limit` | Weekly |
| **Rework Rate by Model** | Haiku <20%, Sonnet <10%, Opus <5% | `rework_cycles / total_executions` | Weekly |
| **Cost per SD** | Trend downward | `sum(tokens_burned) / count(sds_completed)` | Monthly |
| **Model Distribution** | 40% Haiku, 40% Sonnet, 20% Opus | `count(executions_by_model) / total_executions` | Weekly |

**Token Utilization Rate**:
- **Too Low (<70%)**: Under-utilizing budget, could complete more SDs
- **Optimal (80-95%)**: Efficient use, small safety buffer
- **Too High (>95%)**: Risk of exhaustion, emergency mode

#### Development Velocity Metrics

| Metric | Target | Measurement | Frequency |
|--------|--------|-------------|-----------|
| **SDs Completed per Week** | Maintain baseline (6-8) | `count(sds_completed)` | Weekly |
| **Time to SD Completion** | No degradation | `avg(completion_date - start_date)` | Weekly |
| **Model Override Rate** | <5% | `count(overrides) / total_executions` | Weekly |
| **Budget Exhaustion Frequency** | 0 per month | `count(weeks_exhausted)` | Monthly |

**Override Rate Interpretation**:
- **<5%**: Allocation logic well-calibrated
- **5-10%**: Some tuning needed
- **>10%**: Allocation logic too strict, needs adjustment

#### Forecast Accuracy Metrics

| Metric | Target | Measurement | Frequency |
|--------|--------|-------------|-----------|
| **Burn Rate Prediction Error** | ±5-10% | `abs(predicted - actual) / actual` | Weekly |
| **Exhaustion Time Prediction** | ±6 hours | `abs(predicted_hours - actual_hours)` | Weekly |
| **Budget Zone Accuracy** | >80% | `count(correct_zone) / total_predictions` | Weekly |

**Burn Rate Prediction Error**:
- **±0-5%**: Excellent accuracy
- **±5-10%**: Good accuracy (acceptable)
- **>10%**: Poor accuracy, adjust forecasting model

#### Output Quality Metrics

| Metric | Target | Measurement | Frequency |
|--------|--------|-------------|-----------|
| **Code Review Pass Rate** | >85% | `count(approved_prs) / total_prs` | Weekly |
| **Security Issues (Opus-critical)** | 0 | `count(security_issues)` | Per SD |
| **E2E Test Pass Rate** | >95% | `count(passed_tests) / total_tests` | Per SD |
| **Rework Cycles per SD** | Trend downward | `sum(rework_cycles) / count(sds)` | Monthly |

**Quality vs. Cost Trade-off**:
- If quality metrics degrade after model downgrade → Roll back specific agents
- If quality maintained with cheaper models → Expand cost optimization

---

### STEP 11: Phase 0 MVP Definition & Risk Mitigation

#### Phase 0 MVP Specification (This Week: Days 1-5)

**Must-Have Features**:
1. **Manual Token Logging at SD Checkpoints** (5 mins per SD):
   - Chairman manually logs estimated tokens at SD start/completion
   - Store in simple spreadsheet or database INSERT
   - Fields: `sd_id`, `phase`, `tokens_estimate`, `timestamp`

2. **Linear Burn Rate Forecasting** (20 mins to build):
   - Simple formula: `burn_rate = tokens_consumed / hours_elapsed`
   - Projected exhaustion: `remaining / burn_rate`
   - Script: `node scripts/forecast-token-budget.js`

3. **Traffic-Light Status Display** (45 mins to build):
   - Green/Yellow/Orange/Red zones based on % consumed
   - CLI output before each SD execution
   - Script: `node scripts/check-token-budget.js`

4. **Basic Model Recommendation** (1 hour to build):
   - Lookup table: Complexity × Budget Zone → Model
   - No dynamic logic, just static rules
   - Output: "Recommended model for VALIDATION: haiku"

5. **CLI Output Integration** (30 mins):
   - Add token status to `npm run sd:next` output
   - Display current budget zone + burn rate

**Nice-to-Have (Defer to Week 2)**:
- Sub-agent cost breakdown visualization
- Historical comparison (vs. last week)
- Forecast accuracy tracking

**Defer to Week 2+**:
- Database schema implementation (use spreadsheet for MVP)
- Sub-agent instrumentation (auto-logging)
- Rework tracking infrastructure
- Complexity registry learning
- Dashboard web interface

#### Data Collection Starting Point

**Week 1 Approach**: Manual logging spreadsheet

| SD ID | Phase | Start Timestamp | End Timestamp | Tokens (Est.) | Model Used | Rework? |
|-------|-------|----------------|---------------|---------------|------------|---------|
| SD-VISION-001B | EXEC | 2025-12-06 10:00 | 2025-12-06 16:00 | 150,000 | Sonnet/Opus | No |
| SD-MODEL-OPT | PLAN | 2025-12-06 09:00 | 2025-12-06 12:00 | 80,000 | Sonnet | No |

**Week 2 Approach**: Database INSERT statements (manual)
```sql
INSERT INTO sd_token_logs (sd_id, phase, tokens_burned, model_distribution)
VALUES ('SD-VISION-001B', 'EXEC', 150000, '{"sonnet": 0.7, "opus": 0.3}');
```

**Week 3+ Approach**: Automatic capture from Anthropic API

---

#### Risk Register

| Risk ID | Risk Description | Likelihood | Impact | Mitigation |
|---------|------------------|------------|--------|------------|
| **R1** | Forecast is inaccurate (±20% error) | Medium | High | Start with conservative burn rate estimate, adjust weekly, manual review on Fridays |
| **R2** | Haiku rework rate higher than estimated | Medium | Medium | Track rework explicitly, fall back to Sonnet if rework rate spikes >30% |
| **R3** | Model floor policies conflict with budget | Low | High | Defer non-critical SDs instead of downgrading model floor, never compromise security |
| **R4** | System too complex, creates friction | Medium | Medium | MVP is minimal, manual logging only, no complex infrastructure this week |
| **R5** | Token counts from API unavailable | Low | Medium | Fallback to manual logging, estimate from conversation length (~4 chars per token) |
| **R6** | Weekly budget limit unknown | High | Low | Assume 500k tokens/week (standard Max plan), calibrate based on actual usage |
| **R7** | Chairman forgets to log tokens | High | Medium | Automated reminders in `handoff.js`, make logging mandatory for phase transitions |
| **R8** | Model downgrades degrade quality | Medium | High | Monitor code review pass rate, E2E test pass rate, rollback if degradation >5% |

#### Escape Hatches (Manual Overrides)

1. **Chairman Override** (highest priority):
   - Chairman can force any model for any sub-agent
   - Must log reason in `override_reason` field
   - No questions asked, just log it

2. **Budget Reserve** (safety buffer):
   - Chairman can set aside X% of budget for emergencies
   - Example: "Reserve 20% for end-of-week surprises"
   - System treats `budget_limit = actual_limit * 0.8`

3. **Disable System** (emergency exit):
   - Chairman can run `npm run tokens:disable`
   - System reverts to default model assignments (all Sonnet)
   - No forecasting, no allocation, just normal operations

4. **Manual Budget Adjustment** (if limit changes):
   - Chairman can run `npm run tokens:set-limit 750000`
   - System recalculates zones and forecasts

---

#### Immediate Action Items (Week 1)

| Action | Owner | Timeline | Effort | Priority |
|--------|-------|----------|--------|----------|
| **Set up manual token logging checkpoint** | Claude Code | Today | 30 mins | 🔴 P0 |
| **Create burn rate calculator script** | Claude Code | Today | 20 mins | 🔴 P0 |
| **Add traffic-light status to `npm run sd:next`** | Claude Code | Tomorrow | 45 mins | 🔴 P0 |
| **Implement basic model recommendation logic** | Claude Code | Tomorrow | 1 hour | 🟡 P1 |
| **Document model floors + safety policy in CLAUDE.md** | Claude Code | Tomorrow | 30 mins | 🟡 P1 |
| **Create token logging spreadsheet** | Chairman | Today | 10 mins | 🔴 P0 |
| **Define weekly budget limit** | Chairman | Today | 5 mins | 🔴 P0 |

---

## Appendix A: Model Performance Data (from Recent Commits)

**Source**: Commit bb0362a (2025-12-06 Model Optimization)

### Pass Rates by Sub-Agent and Phase (Historical)

| Sub-Agent | LEAD Pass % | PLAN Pass % | EXEC Pass % | Overall % | Model Used (Before Optimization) |
|-----------|-------------|-------------|-------------|-----------|----------------------------------|
| GITHUB | 67% | 0% | 13% | 94.8% | Opus |
| DOCMON | 83% | 100% | 13% | 59.7% | Opus |
| DATABASE | 100% | 100% | 80% | 96.9% | Opus |
| TESTING | 69% | 25% | 11% | varies | Opus |
| STORIES | 8% | 0% | 36% | 3.4% | Opus |
| RETRO | 100% | 100% | varies | 96.0% | Opus |
| SECURITY | varies | varies | varies | 25.0% | Opus |
| VALIDATION | varies | varies | varies | 18.2% | Opus |

**Key Observations**:
- **High performers on Opus** (>90%): GITHUB, DATABASE, RETRO → Safe to downgrade
- **Low performers on Opus** (<50%): STORIES, SECURITY, VALIDATION → Needs investigation (why is Opus failing?)
- **Phase-dependent**: TESTING performs well in LEAD (69%) but poorly in EXEC (11%)

**Post-Optimization Changes** (2025-12-06):
- STORIES: Opus → Sonnet (testing if Sonnet improves 3.4% pass rate)
- VALIDATION: Opus → Sonnet in LEAD, kept Opus in PLAN/EXEC
- SECURITY: Kept Opus (non-negotiable)

---

## Appendix B: Sources

### Anthropic Pricing
- [Anthropic Pricing Documentation](https://docs.claude.com/en/docs/about-claude/pricing)
- [CostGoat Claude API Calculator](https://costgoat.com/pricing/claude-api)
- [Caylent Haiku 4.5 Deep Dive](https://caylent.com/blog/claude-haiku-4-5-deep-dive-cost-capabilities-and-the-multi-agent-opportunity)
- [CalculateQuick Token Cost Calculator](https://calculatequick.com/ai/claude-token-cost-calculator/)

### Codebase References
- `/mnt/c/_EHG/EHG_Engineer/lib/sub-agent-executor.js` (lines 34-197)
- `/mnt/c/_EHG/EHG_Engineer/lib/sub-agents/*.js` (16 sub-agent files)
- Git commit `bb0362a` (Model Optimization, 2025-12-06)
- Git commit `b3ef40d` (Database Cleanup, 2025-12-06)

---

## Next Steps

**Week 1 Deliverables**:
1. ✅ This research report (completed)
2. ⏳ Manual token logging spreadsheet (Chairman to create)
3. ⏳ `scripts/forecast-token-budget.js` (MVP forecasting script)
4. ⏳ `scripts/check-token-budget.js` (traffic-light status display)
5. ⏳ Update `npm run sd:next` to show token status

**Week 2-3 Implementation**:
1. Database schema migration (`sd_token_logs`, `weekly_budget_snapshots`)
2. Automatic token capture from Anthropic API
3. Rework tracking in git commits
4. Calibrate forecasting model with actual data

**Month 2+ Enhancements**:
1. Sub-agent cost dashboard (web UI)
2. ML-based complexity prediction
3. Automated model selection (no manual checkpoints)
4. Confidence intervals for forecasts

---

**End of Report**
