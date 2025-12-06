# Stage 22: Stage Map and Dependency Graph

## Workflow Position

```
... → Stage 18 → Stage 19 → [Stage 22] → Stage 22 → Stage 22 → ...
      (Docs)    (Integration) (Context)  (Pre-Flight) (Dev Loop)
```

**Stage 22** sits in the **Pre-EXEC Preparation** phase, loading all context required for AI operations before final validation (Stage 22) and iterative development (Stages 22-23).

## Direct Dependencies

### Upstream: Stage 19 (Tri-Party Integration Verification)

**Dependency Type**: Sequential (must complete before Stage 22 starts)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:876-877 "depends_on: - 19"

**Required Outputs from Stage 19**:
1. Integration test results (which APIs work, which fail)
2. API reliability metrics (≥99% uptime validated)
3. Fallback configuration (circuit breakers tested)

**Why This Dependency Exists**:
- Context loading requires working API integrations (e.g., embeddings API from OpenAI)
- If Stage 19 fails (API unreliable), Stage 22 cannot fetch context data
- Fallback strategies (cached embeddings) depend on Stage 19 circuit breaker configuration

**Validation Check**:
```sql
-- Verify Stage 19 completion before starting Stage 22
SELECT venture_id, stage_id, completion_status
FROM stage_completions
WHERE venture_id = 'VENTURE-001'
  AND stage_id = 19
  AND completion_status = 'completed'
  AND integration_success_rate >= 90;
```

### Downstream: Stage 22 (Iterative Development Loop)

**Dependency Type**: Sequential (Stage 22 starts after Stage 22 completes)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-22.md:59 "Downstream Impact: Stages 21"

**Outputs Provided to Stage 22**:
1. Context models (loaded embeddings, knowledge graphs)
2. Burn rate metrics (validate <500ms target)
3. Quality metrics report (validate <2GB RAM usage)

**Why This Dependency Exists**:
- Stage 22 pre-flight check requires all context loaded (cannot validate readiness without complete context)
- Context loading metrics feed into Stage 22 readiness rating
- If Stage 22 fails (incomplete context), Stage 22 blocks deployment

## Parallel Execution Opportunities

**None identified** - Stage 22 is purely sequential:
- Cannot parallelize with Stage 19 (requires working APIs from Stage 19)
- Cannot parallelize with Stage 22 (Stage 22 needs Stage 22 outputs)

**Substage Parallelization**:
- Substages 20.1, 20.2, 20.3 are sequential (context preparation → optimization → validation)
- No intra-stage parallelization possible

## Recursion Relationships

### Backward Recursion (Stage 22 → Stage 19)

**Trigger**: Context loading fails due to API errors (e.g., OpenAI embeddings API returns 500 errors)

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger SPRINT-001)

**Recursion Logic**:
1. Stage 22 detects API failures during context preparation (Substage 20.1)
2. Recursion engine triggers Stage 19 re-execution (re-verify API reliability)
3. Stage 19 fixes API integration (add retry logic, circuit breaker tuning)
4. Stage 22 re-executes with working API

### Backward Recursion (Stage 22 → Stage 16)

**Trigger**: Context loading fails due to missing AI CEO framework configuration

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger SPRINT-002)

**Recursion Logic**:
1. Stage 22 detects missing context sources (no AI agent memory, no knowledge base)
2. Recursion engine triggers Stage 16 re-execution (configure AI CEO framework)
3. Stage 16 sets up context storage (vector database, agent memory)
4. Stage 22 re-executes with complete context sources

### Self-Recursion (Stage 22 → Stage 22)

**Trigger**: Context loading incomplete (context completeness <90%)

**Evidence**: Proposed in 07_recursion-blueprint.md (Trigger SPRINT-003)

**Recursion Logic**:
1. Stage 22 validation (Substage 20.3) detects incomplete context (missing documents, partial embeddings)
2. Recursion engine triggers Stage 22 self-recursion (re-execute Substage 20.1)
3. Substage 20.1 fetches missing context data
4. Stage 22 validation passes (context completeness ≥90%)

## Critical Path Analysis

**Is Stage 22 on Critical Path?**: YES

**Justification**:
- Stage 22 blocks Stage 22 (pre-flight check cannot proceed without loaded context)
- Stage 22 blocks Stage 22 (dev loop cannot start without go/no-go decision)
- Any delays in Stage 22 delay entire venture launch

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-22.md:60 "Critical Path: No" (INCORRECT, should be YES)

**Correction**: Critique mis-assessed critical path. Stage 22 is critical because:
- Pre-flight check (Stage 22) depends on context loading
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
- If multiple ventures run Stage 22 simultaneously, rate limits may block

**Mitigation**:
- Queue-based execution (1 venture at a time for Stage 22)
- Stagger Stage 22 starts (offset by 2 hours)

## Stage 22 Success Gates

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
-- Check all exit gates before allowing Stage 22 start
SELECT venture_id,
       context_completeness >= 90 AS context_loaded,
       loading_time_ms < 500 AS performance_optimized,
       validation_status = 'passed' AS validation_complete
FROM stage_22_metrics
WHERE venture_id = 'VENTURE-001';

-- All 3 must be true for Stage 22 to proceed
```

## Visualization: Stage 22 Position

```
┌─────────────────────────────────────────────────────────────┐
│  Pre-EXEC Preparation Phase (Stages 18-21)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Stage 18          Stage 19           [Stage 22]           │
│  Documentation  →  Integration     →  Context Loading      │
│  & GitHub Sync     Verification       (YOU ARE HERE)       │
│                                          ↓                  │
│                                       Stage 22              │
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
[Stage 22: Context Loading] ←─────┐ (self-recursion if incomplete)
    ↓                              │
    ├──→ Recursion Trigger SPRINT-001 → Stage 19 (API failures)
    ├──→ Recursion Trigger SPRINT-002 → Stage 16 (missing AI framework)
    ├──→ Recursion Trigger SPRINT-003 → Stage 22 (incomplete context)
    ↓
Stage 22 (Pre-Flight Check)
    ↓
Stage 22 (Dev Loop)
```

---

**Key Insight**: Stage 22 is a **critical path bottleneck** with **3 recursion triggers** (SPRINT-001, SPRINT-002, SPRINT-003). Automation level 5/5 makes this stage highly reliable (1-2 hour execution), but recursion adds 4-12 hours if context loading fails.

<!-- Generated by Claude Code Phase 9 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
