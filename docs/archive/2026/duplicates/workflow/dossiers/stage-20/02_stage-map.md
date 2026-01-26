<!-- ARCHIVED: 2026-01-26T16:26:36.462Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-20\02_stage-map.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 20: Stage Map and Dependency Graph


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

## Workflow Position

```
... → Stage 18 → Stage 19 → [Stage 20] → Stage 21 → Stage 22 → ...
      (Docs)    (Integration) (Context)  (Pre-Flight) (Dev Loop)
```

**Stage 20** sits in the **Pre-EXEC Preparation** phase, loading all context required for AI operations before final validation (Stage 21) and iterative development (Stages 22-23).

## Direct Dependencies

### Upstream: Stage 19 (Tri-Party Integration Verification)

**Dependency Type**: Sequential (must complete before Stage 20 starts)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:876-877 "depends_on: - 19"

**Required Outputs from Stage 19**:
1. Integration test results (which APIs work, which fail)
2. API reliability metrics (≥99% uptime validated)
3. Fallback configuration (circuit breakers tested)

**Why This Dependency Exists**:
- Context loading requires working API integrations (e.g., embeddings API from OpenAI)
- If Stage 19 fails (API unreliable), Stage 20 cannot fetch context data
- Fallback strategies (cached embeddings) depend on Stage 19 circuit breaker configuration

**Validation Check**:
```sql
-- Verify Stage 19 completion before starting Stage 20
SELECT venture_id, stage_id, completion_status
FROM stage_completions
WHERE venture_id = 'VENTURE-001'
  AND stage_id = 19
  AND completion_status = 'completed'
  AND integration_success_rate >= 90;
```

### Downstream: Stage 21 (Final Pre-Flight Check)

**Dependency Type**: Sequential (Stage 21 starts after Stage 20 completes)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-20.md:59 "Downstream Impact: Stages 21"

**Outputs Provided to Stage 21**:
1. Context models (loaded embeddings, knowledge graphs)
2. Loading performance metrics (validate <500ms target)
3. Memory efficiency report (validate <2GB RAM usage)

**Why This Dependency Exists**:
- Stage 21 pre-flight check requires all context loaded (cannot validate readiness without complete context)
- Context loading metrics feed into Stage 21 readiness rating
- If Stage 20 fails (incomplete context), Stage 21 blocks deployment

## Parallel Execution Opportunities

**None identified** - Stage 20 is purely sequential:
- Cannot parallelize with Stage 19 (requires working APIs from Stage 19)
- Cannot parallelize with Stage 21 (Stage 21 needs Stage 20 outputs)

**Substage Parallelization**:
- Substages 20.1, 20.2, 20.3 are sequential (context preparation → optimization → validation)
- No intra-stage parallelization possible

## Recursion Relationships

### Backward Recursion (Stage 20 → Stage 19)

**Trigger**: Context loading fails due to API errors (e.g., OpenAI embeddings API returns 500 errors)

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger CONTEXT-001)

**Recursion Logic**:
1. Stage 20 detects API failures during context preparation (Substage 20.1)
2. Recursion engine triggers Stage 19 re-execution (re-verify API reliability)
3. Stage 19 fixes API integration (add retry logic, circuit breaker tuning)
4. Stage 20 re-executes with working API

### Backward Recursion (Stage 20 → Stage 16)

**Trigger**: Context loading fails due to missing AI CEO framework configuration

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger CONTEXT-002)

**Recursion Logic**:
1. Stage 20 detects missing context sources (no AI agent memory, no knowledge base)
2. Recursion engine triggers Stage 16 re-execution (configure AI CEO framework)
3. Stage 16 sets up context storage (vector database, agent memory)
4. Stage 20 re-executes with complete context sources

### Self-Recursion (Stage 20 → Stage 20)

**Trigger**: Context loading incomplete (context completeness <90%)

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger CONTEXT-003)

**Recursion Logic**:
1. Stage 20 validation (Substage 20.3) detects incomplete context (missing documents, partial embeddings)
2. Recursion engine triggers Stage 20 self-recursion (re-execute Substage 20.1)
3. Substage 20.1 fetches missing context data
4. Stage 20 validation passes (context completeness ≥90%)

## Critical Path Analysis

**Is Stage 20 on Critical Path?**: YES

**Justification**:
- Stage 20 blocks Stage 21 (pre-flight check cannot proceed without loaded context)
- Stage 21 blocks Stage 22 (dev loop cannot start without go/no-go decision)
- Any delays in Stage 20 delay entire venture launch

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-20.md:60 "Critical Path: No" (INCORRECT, should be YES)

**Correction**: Critique mis-assessed critical path. Stage 20 is critical because:
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
- If multiple ventures run Stage 20 simultaneously, rate limits may block

**Mitigation**:
- Queue-based execution (1 venture at a time for Stage 20)
- Stagger Stage 20 starts (offset by 2 hours)

## Stage 20 Success Gates

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
FROM stage_20_metrics
WHERE venture_id = 'VENTURE-001';

-- All 3 must be true for Stage 21 to proceed
```

## Visualization: Stage 20 Position

```
┌─────────────────────────────────────────────────────────────┐
│  Pre-EXEC Preparation Phase (Stages 18-21)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Stage 18          Stage 19           [Stage 20]           │
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
[Stage 20: Context Loading] ←─────┐ (self-recursion if incomplete)
    ↓                              │
    ├──→ Recursion Trigger CONTEXT-001 → Stage 19 (API failures)
    ├──→ Recursion Trigger CONTEXT-002 → Stage 16 (missing AI framework)
    ├──→ Recursion Trigger CONTEXT-003 → Stage 20 (incomplete context)
    ↓
Stage 21 (Pre-Flight Check)
    ↓
Stage 22 (Dev Loop)
```

---

**Key Insight**: Stage 20 is a **critical path bottleneck** with **3 recursion triggers** (CONTEXT-001, CONTEXT-002, CONTEXT-003). Automation level 5/5 makes this stage highly reliable (1-2 hour execution), but recursion adds 4-12 hours if context loading fails.

<!-- Generated by Claude Code Phase 9 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
