---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 21: Stage Map and Dependency Graph


## Table of Contents

- [Workflow Position](#workflow-position)
- [Direct Dependencies](#direct-dependencies)
  - [Upstream: Stage 19 (Tri-Party Integration Verification)](#upstream-stage-19-tri-party-integration-verification)
  - [Downstream: Stage 21 (Final Pre-Flight Check)](#downstream-stage-21-final-pre-flight-check)
- [Parallel Execution Opportunities](#parallel-execution-opportunities)
- [Recursion Relationships](#recursion-relationships)
  - [Backward Recursion (Stage 21 → Stage 19)](#backward-recursion-stage-21-stage-19)
  - [Backward Recursion (Stage 21 → Stage 16)](#backward-recursion-stage-21-stage-16)
  - [Self-Recursion (Stage 21 → Stage 21)](#self-recursion-stage-21-stage-21)
- [Critical Path Analysis](#critical-path-analysis)
- [Stage Timing](#stage-timing)
- [Cross-Venture Dependencies](#cross-venture-dependencies)
- [Stage 21 Success Gates](#stage-21-success-gates)
  - [Entry Gates](#entry-gates)
  - [Exit Gates](#exit-gates)
- [Visualization: Stage 21 Position](#visualization-stage-21-position)
- [Dependency Diagram](#dependency-diagram)

## Workflow Position

```
... → Stage 18 → Stage 19 → [Stage 21] → Stage 21 → Stage 22 → ...
      (Docs)    (Integration) (Context)  (Pre-Flight) (Dev Loop)
```

**Stage 21** sits in the **Pre-EXEC Preparation** phase, loading all context required for AI operations before final validation (Stage 21) and iterative development (Stages 22-23).

## Direct Dependencies

### Upstream: Stage 19 (Tri-Party Integration Verification)

**Dependency Type**: Sequential (must complete before Stage 21 starts)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:876-877 "depends_on: - 19"

**Required Outputs from Stage 19**:
1. Integration test results (which APIs work, which fail)
2. API reliability metrics (≥99% uptime validated)
3. Fallback configuration (circuit breakers tested)

**Why This Dependency Exists**:
- Context loading requires working API integrations (e.g., embeddings API from OpenAI)
- If Stage 19 fails (API unreliable), Stage 21 cannot fetch context data
- Fallback strategies (cached embeddings) depend on Stage 19 circuit breaker configuration

**Validation Check**:
```sql
-- Verify Stage 19 completion before starting Stage 21
SELECT venture_id, stage_id, completion_status
FROM stage_completions
WHERE venture_id = 'VENTURE-001'
  AND stage_id = 19
  AND completion_status = 'completed'
  AND integration_success_rate >= 90;
```

### Downstream: Stage 21 (Final Pre-Flight Check)

**Dependency Type**: Sequential (Stage 21 starts after Stage 21 completes)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-21.md:59 "Downstream Impact: Stages 21"

**Outputs Provided to Stage 21**:
1. Context models (loaded embeddings, knowledge graphs)
2. Risk score metrics (validate <500ms target)
3. Readiness rating report (validate <2GB RAM usage)

**Why This Dependency Exists**:
- Stage 21 pre-flight check requires all context loaded (cannot validate readiness without complete context)
- Context loading metrics feed into Stage 21 readiness rating
- If Stage 21 fails (incomplete context), Stage 21 blocks deployment

## Parallel Execution Opportunities

**None identified** - Stage 21 is purely sequential:
- Cannot parallelize with Stage 19 (requires working APIs from Stage 19)
- Cannot parallelize with Stage 21 (Stage 21 needs Stage 21 outputs)

**Substage Parallelization**:
- Substages 20.1, 20.2, 20.3 are sequential (context preparation → optimization → validation)
- No intra-stage parallelization possible

## Recursion Relationships

### Backward Recursion (Stage 21 → Stage 19)

**Trigger**: Context loading fails due to API errors (e.g., OpenAI embeddings API returns 500 errors)

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger PREFLIGHT-001)

**Recursion Logic**:
1. Stage 21 detects API failures during context preparation (Substage 20.1)
2. Recursion engine triggers Stage 19 re-execution (re-verify API reliability)
3. Stage 19 fixes API integration (add retry logic, circuit breaker tuning)
4. Stage 21 re-executes with working API

### Backward Recursion (Stage 21 → Stage 16)

**Trigger**: Context loading fails due to missing AI CEO framework configuration

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger PREFLIGHT-002)

**Recursion Logic**:
1. Stage 21 detects missing context sources (no AI agent memory, no knowledge base)
2. Recursion engine triggers Stage 16 re-execution (configure AI CEO framework)
3. Stage 16 sets up context storage (vector database, agent memory)
4. Stage 21 re-executes with complete context sources

### Self-Recursion (Stage 21 → Stage 21)

**Trigger**: Context loading incomplete (context completeness <90%)

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger PREFLIGHT-003)

**Recursion Logic**:
1. Stage 21 validation (Substage 20.3) detects incomplete context (missing documents, partial embeddings)
2. Recursion engine triggers Stage 21 self-recursion (re-execute Substage 20.1)
3. Substage 20.1 fetches missing context data
4. Stage 21 validation passes (context completeness ≥90%)

## Critical Path Analysis

**Is Stage 21 on Critical Path?**: YES

**Justification**:
- Stage 21 blocks Stage 21 (pre-flight check cannot proceed without loaded context)
- Stage 21 blocks Stage 22 (dev loop cannot start without go/no-go decision)
- Any delays in Stage 21 delay entire venture launch

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-21.md:60 "Critical Path: No" (INCORRECT, should be YES)

**Correction**: Critique mis-assessed critical path. Stage 21 is critical because:
- Pre-flight check (Stage 21) depends on context loading
- No workarounds exist (cannot skip context loading for AI ventures)

## Stage Timing

**Expected Duration** (based on automation level 5/5):
- **Substage 20.1** (Context Preparation): 30-60 minutes (fetch data, create embeddings)
- **Substage 20.2** (Loading Optimization): 15-30 minutes (configure caching, indexes)
- **Substage 20.3** (Validation & Testing): 15-30 minutes (validate completeness, test performance)
- **Total**: 1-2 hours (fully automated)

**Manual Execution Time** (if automation fails): 6-12 hours

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:917-918 "progression_mode: Manual → Assisted → Auto (suggested)"

## Cross-Venture Dependencies

**Shared Infrastructure**:
- Vector database cluster (Pinecone/Weaviate shared across ventures)
- Embeddings API (OpenAI API key shared, rate limits apply)
- Context storage (S3 bucket for context snapshots)

**Potential Bottlenecks**:
- Embeddings API rate limits (max 3000 req/min for OpenAI)
- Vector database write capacity (max 1000 inserts/sec for Pinecone)
- If multiple ventures run Stage 21 simultaneously, rate limits may block

**Mitigation**:
- Queue-based execution (1 venture at a time for Stage 21)
- Stagger Stage 21 starts (offset by 2 hours)

## Stage 21 Success Gates

### Entry Gates
1. **Data prepared** (from Stage 19, integration verification complete)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:892 "Data prepared"
2. **Models trained** (embeddings models available)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:893 "Models trained"

### Exit Gates
1. **Context loaded** (all context sources ingested)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:895 "Context loaded"
2. **Performance optimized** (loading time <500ms target)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:896 "Performance optimized"
3. **Validation complete** (context completeness ≥90%)
   - Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:897 "Validation complete"

**Exit Gate Validation Query**:
```sql
-- Check all exit gates before allowing Stage 21 start
SELECT venture_id,
       context_completeness >= 90 AS context_loaded,
       loading_time_ms < 500 AS performance_optimized,
       validation_status = 'passed' AS validation_complete
FROM stage_21_metrics
WHERE venture_id = 'VENTURE-001';

-- All 3 must be true for Stage 21 to proceed
```

## Visualization: Stage 21 Position

```
┌─────────────────────────────────────────────────────────────┐
│  Pre-EXEC Preparation Phase (Stages 18-21)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Stage 18          Stage 19           [Stage 21]           │
│  Documentation  →  Integration     →  Context Loading      │
│  & GitHub Sync     Verification       (YOU ARE HERE)       │
│                                          ↓                  │
│                                       Stage 21              │
│                                       Pre-Flight Check      │
│                                          ↓                  │
│                                       Stage 22              │
│                                       Dev Loop              │
└─────────────────────────────────────────────────────────────┘
```

## Dependency Diagram

```
Stage 16 (AI CEO Framework)
    ↓ (provides AI agent architecture)
    ↓
Stage 19 (Integration Verification)
    ↓ (provides working APIs)
    ↓
[Stage 21: Context Loading] ←─────┐ (self-recursion if incomplete)
    ↓                              │
    ├──→ Recursion Trigger PREFLIGHT-001 → Stage 19 (API failures)
    ├──→ Recursion Trigger PREFLIGHT-002 → Stage 16 (missing AI framework)
    ├──→ Recursion Trigger PREFLIGHT-003 → Stage 21 (incomplete context)
    ↓
Stage 21 (Pre-Flight Check)
    ↓
Stage 22 (Dev Loop)
```

---

**Key Insight**: Stage 21 is a **critical path bottleneck** with **3 recursion triggers** (PREFLIGHT-001, PREFLIGHT-002, PREFLIGHT-003). Automation level 5/5 makes this stage highly reliable (1-2 hour execution), but recursion adds 4-12 hours if context loading fails.

<!-- Generated by Claude Code Phase 9 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
