<!-- Archived from: brainstorm/2026-03-06-vision-page-capability-integration.md -->
<!-- SD Key: SD-LEO-FEAT-VISION-PAGE-CAPABILITY-001 -->
<!-- Archived at: 2026-03-06T20:13:28.879Z -->

# Brainstorm: Vision Page Capability Integration

## Metadata
- **Date**: 2026-03-06
- **Domain**: UI / Architecture
- **Phase**: Pre-SD
- **Mode**: Conversational (User-Driven)
- **Outcome Classification**: Ready for SD
- **Related SD**: SD-LEO-INFRA-CAPABILITY-ACTIVATION-001 (completed — activated infrastructure)

---

## Problem Statement
The Capability Registry page (`/chairman/capabilities`) now shows data from all 4 unified sources (196 capabilities), but the data quality is poor and the standalone page doesn't serve the user's actual goal. The real need: capabilities should help the Chairman understand what reusable business capabilities exist and how they strengthen venture evaluation at Stage 0.

### Root Problems Identified
1. **Data noise**: 142 sd_capabilities are internal implementation artifacts (rca-agent, pre-commit-validation) with maturity_score=0. Not business capabilities.
2. **agent_skills are metadata-only**: 10 Anthropic demo repo registrations. Not runnable, not integrated, zero usage.
3. **venture_capabilities are process artifacts**: 29 entries describing internal infrastructure, not reusable business capabilities.
4. **agent_registry duplication**: Two `executive` entries both list `market_research` in capabilities array; `unnest()` creates duplicate rows.
5. **Standalone page is wrong context**: Capabilities are informational reference data for the Chairman, not a primary navigation destination.

### What Already Works
Stage 0 already integrates capability leverage:
- `discovery-mode.js` injects capability context from `v_capability_ledger` into 4 discovery strategies
- `portfolio-evaluation.js` has explicit `capability_building` dimension (0-10)
- `moat-architecture.js` has `agent_consumability` moat type
- **The architecture is sound — the data feeding it needs curation.**

## User Decisions

### 1. Approach: Curate What We Have
- **Selected**: Curate existing tables (not create new ones)
- **Rationale**: The 4-source unified view architecture is correct. The problem is data quality, not schema.
- **Fully automated**: No manual curation — automated classification/filtering only.

### 2. Display Strategy: Smart Grouping
- **Selected**: Business categories expanded, internal categories collapsed
- **Rationale**: Shows business-meaningful capabilities prominently (Research & Discovery, AI Agents, Financial Analysis, Content & Media) while keeping internal infrastructure accessible but de-emphasized.

### 3. Page Location: Tab on Vision Route
- **Selected**: Two tabs on `/chairman/vision` — "Alignment" (current VisionDashboard) + "Capabilities" (new smart-grouped view)
- **Rationale**: Capabilities are informational reference data that contextualizes the vision. Future capabilities could become part of vision planning.
- **Consequence**: Remove or redirect standalone `/chairman/capabilities` route.

### 4. Tab Layout
```
+--------------------------------------------------------------+
|  Vision                                                       |
|  +--------------+ +---------------+                           |
|  | Alignment    | | Capabilities  |                           |
|  +--------------+ +---------------+                           |
+--------------------------------------------------------------+
|                                                               |
|  [Tab content renders here]                                   |
|                                                               |
|  Alignment tab: VisionScoreCard, DimensionBreakdownPanel,     |
|    VisionTrendChart, DimensionTrendChart, CorrectiveSDsTable  |
|                                                               |
|  Capabilities tab: Smart-grouped view                         |
|    > Research & Discovery (expanded)                          |
|      - market_research (agent_registry)                       |
|      - trend_analysis (sd_capability)                         |
|    > AI Agents (expanded)                                     |
|      - code_generation (agent_skill)                          |
|    > Platform Infrastructure (collapsed)                      |
|      142 items                                                |
|    > Process Tooling (collapsed)                              |
|      29 items                                                 |
+--------------------------------------------------------------+
```

## Analysis

### Arguments For
1. Capabilities on the Vision page creates natural context — "what we can do" alongside "where we're going"
2. Smart grouping surfaces signal (business capabilities) and suppresses noise (internal tooling)
3. Automated classification means zero maintenance burden
4. Removing standalone page reduces navigation clutter
5. Stage 0 already consumes capability data — this just improves the human view

### Arguments Against
1. Smart grouping requires a classification heuristic that may miscategorize capabilities
2. Collapsing internal capabilities may hide important context about platform maturity
3. Two tabs on Vision page increases component complexity
4. Capability data quality issues remain in Stage 0 consumption (separate concern)

## Implementation Scope

### Frontend (EHG repo)
1. Add tab navigation to `VisionAlignmentPage.tsx`
2. Create `CapabilitiesTab` component with smart grouping
3. Update `useCapabilityRegistry` hook to support grouping by business category
4. Remove or redirect `/chairman/capabilities` route
5. Fix agent_registry duplication (deduplicate in hook)

### Backend (EHG_Engineer repo)
6. Add automated capability classification (business vs internal) — could be view-level or hook-level
7. Fix agent_registry duplicate entries (two `executive` entries with `market_research`)

## Suggested Next Steps
1. Create SD for implementation
2. Execution order: Backend fixes first (dedup, classification) -> Frontend tab integration
3. Estimated scope: ~100-150 LOC frontend, ~50 LOC backend
