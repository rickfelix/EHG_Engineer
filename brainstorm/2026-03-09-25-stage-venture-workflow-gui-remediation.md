# Brainstorm: 25-Stage Venture Workflow GUI Remediation

## Metadata
- **Date**: 2026-03-09
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: ClarityStats, BrandForge AI, LocalizeAI (all 3 active ventures affected)
- **Related Audit**: `docs/audits/25-stage-venture-workflow-audit-2026-03-09.md`

---

## Problem Statement

The EHG venture workflow GUI renders a **generic 4-tab shell** (BuildingMode) for all 25 stages of the venture lifecycle, despite the backend producing rich, stage-specific structured data (scores, analyses, evidence, metrics, personas, financial models, risk registers, and more). A systematic audit identified **13 systemic patterns** (P1-P13) spanning all 25 stages, with 3 rated Critical, 5 rated High, and 5 rated Medium severity. The core issue is that the frontend was built without visual specifications, resulting in a uniform generic view that makes every stage look identical regardless of the radically different data each stage produces.

Additionally, the LEO Protocol lacks a wireframe gate requirement, meaning the root cause (no wireframes → generic UI) is a process gap that will recur for future UI work unless addressed at the protocol level.

## Discovery Summary

### 13 Identified Patterns

| ID | Pattern | Severity | Stages |
|----|---------|----------|--------|
| P1 | Backend data not surfaced in UI | Critical | All 25 |
| P2 | No stage-specific views | Critical | All 25 |
| P3 | Artifact content not viewable | High | All 25 |
| P4 | Naming/config drift | Critical | 7-10 (wrong), 1-6 (minor) |
| P5 | Non-functional toolbar actions | High | Venture detail |
| P6 | No historical navigation | High | Building + Operations |
| P7 | No wireframes for stage views | High | All 25 |
| P8 | LEO Protocol: No wireframe gate | Process | Protocol-wide |
| P9 | No work-type distinction | Medium | Automated stages |
| P10 | Golden Nuggets invisible | Medium | Multiple |
| P11 | Gate renderers disconnected | High | Gate stages |
| P12 | Phase transition gates missing | Medium | 9, 12 |
| P13 | Stage 10 chunk misassignment | Medium | 10 |

### Architecture Options Evaluated

| Option | Approach | Verdict |
|--------|----------|---------|
| A: Incremental Fix | Patch BuildingMode with conditionals | Rejected (unmaintainable) |
| B: Component Architecture | Stage-specific components via componentPath | **Selected** |
| C: Unified Rendering Engine | Data-driven schema-to-UI mapping | Too complex for current needs |

### Key Discovery: Three Sources of Truth

The naming problem (P4) is deeper than initially identified. Three independent systems define stage metadata:
1. **Database**: `lifecycle_stage_config` table with `stage_name`, `phase_name`, `work_type`
2. **Backend templates**: `stage-NN.js` files with `TEMPLATE.title`
3. **Frontend config**: `venture-workflow.ts` with `stageName`

These three sources are not synchronized. Any naming fix must reconcile all three and designate one as authoritative.

### Key Discovery: Missing Data Access Layer

No hook exists to fetch stage-specific structured content. `useVentureWorkflow` fetches metadata but not the `advisory_data` JSONB column where the rich stage data lives. A `useStageDisplayData` hook is a prerequisite for any stage-specific rendering.

### Key Discovery: Gate Renderer Contract Mismatch

The 7 existing gate renderers accept `DecisionRow` + `briefData` (from `chairman_decisions` table). The venture detail page has `VentureDetail` + `VentureModeResult` (from `ventures` + `venture_stage_work` tables). Reuse requires either a data adapter or renderer refactoring.

## Analysis

### Arguments For
1. **13 systemic patterns affect all 25 stages** — 3 active ventures impacted daily
2. **7 gate renderers already exist** — reuse saves 40-60% effort on those stages
3. **Backend produces rich data that is completely invisible** to users
4. **Stage naming is wrong for 4 stages** (7-10) — users see misleading labels
5. **Wireframe gap is a root cause** — fixing the protocol prevents recurrence
6. **`componentPath` config already exists** — the architecture was designed for this from day one
7. **Existing hooks fetch data that is never rendered** — `advisory_data` is already available

### Arguments Against
1. **25 stage views is a large surface area** — risk of scope creep
2. **Wireframes for all 25 stages** is a significant design effort (not code)
3. **Some backend data may not be fully populated** for all ventures at all stages
4. **Partial implementation risk** — inconsistent patchwork may be worse than uniform generic view
5. **400-LOC PR limit** means 8-12 PRs for stage components alone

## Architecture: Tradeoff Matrix

| Dimension | Weight | A: Incremental | B: Component | C: Unified Engine |
|-----------|--------|---------------|-------------|-------------------|
| Complexity | 20% | 3 | 7 | 4 |
| Maintainability | 25% | 2 | 8 | 7 |
| Performance | 20% | 5 | 8 | 7 |
| Migration effort | 15% | 8 | 6 | 3 |
| Future flexibility | 20% | 2 | 7 | 9 |
| **Weighted Total** | 100% | **3.7** | **7.3** | **6.2** |

**Decision**: Option B (Component Architecture). Option A has critical weakness in maintainability (score 2). Option C is technically elegant but requires a rendering DSL that doesn't exist.

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Three sources of truth (DB + backend + frontend) — not just a rename task
  2. Gate renderers are NOT directly reusable — `DecisionRow` vs `StageDisplayData` contract mismatch requires adapter or refactoring
  3. No data fetching architecture for stage-specific content — `advisory_data` hook doesn't exist yet
- **Assumptions at Risk**:
  1. `componentPath` config "works" — the referenced component files don't exist (zero created)
  2. The 25-stage model is stable — if stages change, hardcoded components need updating
  3. 8 children can be parallelized — more coupling exists than the dependency table suggests
- **Worst Case**: Partial implementation creates three rendering paths (generic + gate + stage-specific), resulting in an inconsistent patchwork harder to maintain than the current uniform shell. Wireframe child (H) becomes permanent bottleneck blocking the most important work (B).

### Visionary
- **Opportunities**:
  1. **Epistemic Dashboard** — surfacing Four Buckets, Assumptions vs Reality, Crew Tournament creates a real-time knowledge quality map unprecedented in venture management
  2. **Lifecycle-to-LEO Bridge Visibility** — Stage 18's SD bridge creates end-to-end traceability from idea to deployed code
  3. **Composable Stage Renderer Protocol** — 25 renderers with standard contracts become reusable primitives for portfolio views, investor reports, AI briefings
- **Synergies**: Design-as-Competitive-Advantage vision (wireframes as first entries in pattern library), Universal Planning Completeness (wireframe gate enforcement), EVA Intake Redesign (design complexity classification), Cross-Venture Learning (display surface for portfolio intelligence)
- **Upside Scenario**: Chairman transforms from process governor to epistemic governor, venture factory becomes measurable/optimizable, wireframe protocol gate prevents the entire class of problem from recurring

### Pragmatist
- **Feasibility**: 5/10 (Moderate) — significant existing scaffolding reduces difficulty
- **Resource Requirements**: 1 developer + Claude Code, 3-4 weeks for Option B, ~2,500-3,500 net new LOC, minimal backend changes
- **Constraints**:
  1. Data bridge problem is the real blocker — `advisory_data` vs `briefData` contract mismatch
  2. Only 3 active ventures, likely in early stages — stages 11-25 may lack test data
  3. 400-LOC PR limit extends calendar time (8-12 PRs for components alone)
- **Recommended Path**: Start with data adapter hook (`useStageDisplayData`), then router skeleton, then stage components in priority order matching active venture positions

### Synthesis
- **Consensus Points**: Option B is correct. Data adapter is a missing prerequisite. Three-source naming reconciliation needed. Gate renderers need refactoring, not just re-mounting.
- **Tension Points**: Wireframes-first vs data-first sequencing. Partial implementation risk vs. full scope commitment. Golden Nuggets priority.
- **Composite Risk**: Medium-High (large scope mitigated by existing scaffolding)

## Revised SD Structure (Incorporating Team Insights)

The original 8-child plan is refined based on team analysis:

### Phase 1 Orchestrator: Foundation (4 children, parallelizable)

| Child | Patterns | Scope | Est. LOC |
|-------|----------|-------|----------|
| 1A: Source of Truth Reconciliation | P4, P13 | Reconcile DB + backend + frontend naming; designate canonical source | ~150 |
| 1B: Stage Data Adapter | (prerequisite for P1, P2) | `useStageDisplayData` hook normalizing `advisory_data` + `briefData` + artifacts | ~200 |
| 1C: Artifact Content Viewer | P3 | Render artifact content inline in ArtifactsTab | ~200 |
| 1D: Toolbar Cleanup | P5 | Remove or implement Share/Edit/Settings | ~80 |

### Phase 2 Orchestrator: Rendering (5 children, sequenced)

| Child | Patterns | Scope | Depends On | Est. LOC |
|-------|----------|-------|------------|----------|
| 2A: Wireframes for 25 Stages | P7 | Visual specs for every stage view | None | ~design |
| 2B: StageContentRouter + BuildingMode Integration | P1, P2, P9 | Lazy-load stage components via componentPath, work-type badges | 1A, 1B | ~250 |
| 2C: Gate Renderer Unification | P11 | Refactor gate renderers to accept both DecisionRow and StageDisplayData | 1B | ~300 |
| 2D: Stage Components (Stages 1-12) | P1 | 12 stage-specific renderers | 2A, 2B | ~800 |
| 2E: Stage Components (Stages 13-25) | P1 | 13 stage-specific renderers + pipeline terminus | 2A, 2B, 2C | ~900 |

### Phase 3: Navigation + Advanced Features

| Child | Patterns | Scope | Depends On | Est. LOC |
|-------|----------|-------|------------|----------|
| 3A: Stage History Navigation | P6 | Clickable timeline + operations drill-back | Phase 2 | ~300 |
| 3B: Golden Nuggets UI | P10, P12 | Four Buckets, Assumptions vs Reality, phase transition gates | Phase 2 | ~400 |

### Separate Protocol SD

| SD | Pattern | Scope |
|----|---------|-------|
| LEO Protocol: Wireframe Gate | P8 | Wireframe as required PLAN artifact + wireframe validation as EXEC QA gate |

## Open Questions
1. Should wireframes be ASCII/Excalidraw mockups in markdown, or Figma/design tool exports?
2. What is the canonical source of truth for stage names — database, backend templates, or `stages_v2.yaml`?
3. Should the StageContentRouter live as a new tab or replace the existing generic tabs?
4. How to handle stages 11-25 with no production data for QA validation?

## Suggested Next Steps
1. Register vision document in EVA
2. Register architecture plan in EVA
3. Create orchestrator SD via `/leo create` with the Phase 1/2/3 structure
4. Create separate protocol SD for wireframe gate (P8)
5. Begin execution with Phase 1 children (all parallelizable)
