# Stage Architecture Remediation Plan


## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, testing, e2e

**Date**: 2025-12-29
**Version**: 3.0 (Final - Simplified Clean Slate)
**Status**: APPROVED FOR EXECUTION
**Triangulation Models**: OpenAI (GPT-5.2), Antigravity, Claude Code (Opus 4.5)

---

## Executive Summary

This document represents the **final, simplified action plan** for resolving the Stage Architecture Crisis. All existing ventures in the database are test data and can be deleted, enabling a **clean slate approach**.

**Unanimous Decision**: Option A - Align Codebase to Vision V2
**Execution Style**: Clean Slate (no legacy support needed)
**Timeline**: 3-4 weeks (simplified from 6 weeks)

---

## Critical Simplification: No Legacy Support Needed

### The Context
> All ventures in the database are test data, not production data.

### The Decision: **Clean Slate**

**Policy Decision (Record in ADR):**

1. **Delete all test ventures** from the database
2. **No dual-support needed** - single Vision V2 workflow only
3. **No Legacy Adapter needed** - delete legacy code, don't quarantine
4. **No per-venture versioning** - all ventures use V2
5. **Hard cut** to Vision V2 architecture

**Rationale**: This approach gives us:
- Maximum simplicity (no legacy code paths)
- Faster execution (no adapter complexity)
- Clean architecture from day one
- No technical debt carried forward

---

## Refinements Incorporated

### From OpenAI

| Critique | Resolution |
|----------|------------|
| Stage number mapping ambiguity | **Simplified**: Delete test data, start fresh with 1-25 |
| Two overlapping flags | **Simplified**: No flags needed - single V2 path only |
| Quarantine breaks imports | **Simplified**: Delete legacy files directly after SSOT wired |
| SSOT typing issues | Use `React.lazy()` wrapper, derive types from const array |
| Progress math ambiguity | Explicitly define: Stage 1 = 4%, Stage 25 = 100% |
| Machine-readable canonical list | Create `vision-v2-stages.json` for CI comparison |
| Timeline realism | **Simplified to 3-4 weeks** (no legacy support overhead) |

### From Antigravity

| Critique | Resolution |
|----------|------------|
| Feature flag scope | **Simplified**: No flags needed - hard cut to V2 |
| Database trigger audit | Still needed: Audit DB triggers for hardcoded stage IDs |
| "15 stage" artifact | Delete `workflowStages.ts` in Phase 1 |

---

## Architecture Decision Records (ADRs)

### ADR-001: Clean Slate Approach

**Decision**: Delete all test ventures and implement Vision V2 from scratch

**Context**: All existing ventures are test data, not production data.

**Consequences**:
- No legacy support code needed
- No dual-workflow complexity
- Simpler, faster implementation
- Clean architecture from day one

### ADR-002: Single Workflow Path

**Decision**: No feature flags - single Vision V2 workflow only

**Context**: With no production data to preserve, we don't need toggle mechanisms.

**Implementation**:
```
- Delete all legacy stage components
- Implement V2 components directly
- No fallback paths needed
```

### ADR-003: Stage Number Contract

**Decision**: Stage numbers 1-25 as defined in GENESIS_RITUAL_SPECIFICATION.md are the canonical contract.

**Context**: Vision V2 defines exactly 25 stages with specific meanings and gates.

**Consequences**:
- `venture.current_stage` stores 1-25
- Stage names match Vision V2 exactly
- Kill gates at stages 3, 5, 13, 23
- Promotion gates at stages 16, 17, 22

---

## Salvage vs Rebuild Rubric

Before migrating any stage, apply this rubric:

### Salvageable If:
- [ ] Core intent matches Vision V2 stage purpose
- [ ] Data model can be kept or migrated trivially
- [ ] UX doesn't contradict the spec
- [ ] No hidden coupling to 40-stage "chunks"
- [ ] Gate behavior matches (kill/promotion)

### Rebuild If:
- [ ] Stage purpose/name is fundamentally different
- [ ] Gate behavior is wrong or missing
- [ ] UI is designed for another workflow
- [ ] Data model is incompatible

### Application to Current Stages:

| Stage | Vision V2 Name | Verdict | Rationale |
|-------|----------------|---------|-----------|
| 1 | Draft Idea Review | **SALVAGE** | Stage1DraftIdea.tsx matches intent |
| 2 | AI Multi-Model Critique | **SALVAGE** | Stage2AIReview.tsx matches intent |
| 3-10 | Various | **AUDIT** | Need formal rubric check |
| 11 | Go-to-Market Strategy | **REBUILD** | Neither duplicate matches |
| 12 | Sales & Success Logic | **REBUILD** | Neither duplicate matches |
| 13 | Tech Stack Interrogation | **REBUILD** | Neither duplicate matches; KILL GATE |
| 14 | Data Model & Architecture | **REBUILD** | Neither duplicate matches |
| 15 | Epic & User Story Breakdown | **REBUILD** | Neither duplicate matches |
| 16 | Schema Firewall | **REBUILD** | Current is "AICEOAgent"; PROMOTION GATE |
| 17 | Environment Config | **REBUILD** | Current is "GTMStrategy"; PROMOTION GATE |
| 18 | MVP Development Loop | **REBUILD** | Current is "DocumentationSync" |
| 19 | Integration & API Layer | **REBUILD** | Current is "IntegrationVerification" |
| 20 | Security & Performance | **REBUILD** | Current is "ContextLoading" |
| 21 | QA & UAT | **REBUILD** | Neither duplicate matches |
| 22 | Deployment | **REBUILD** | Neither duplicate matches; PROMOTION GATE |
| 23 | Production Launch | **REBUILD** | Neither duplicate matches; KILL GATE |
| 24 | Analytics & Feedback | **SALVAGE** | Stage24GrowthMetrics close match |
| 25 | Optimization & Scale | **SALVAGE** | Stage25ScalePlanning matches |

---

## Simplified Implementation Phases

### Phase 0: Audit & Clean Database (Days 1-2)

**Goal**: Understand current state and clear test data

#### Tasks:
- [ ] **Delete all test ventures from database**
  ```sql
  -- Clear test data
  TRUNCATE TABLE venture_stage_data CASCADE;
  TRUNCATE TABLE ventures CASCADE;
  ```
- [ ] **Audit database triggers for hardcoded stage IDs**
  - Search all Supabase edge functions
  - Search all database triggers and functions
  - Document any `IF stage_id = X` logic
- [ ] **Audit backend API for stage-specific logic**
  - Search server code for stage constants
  - Document gate enforcement logic
- [ ] Generate stage mapping report:
  - Stage number → component file(s) → routes
- [ ] Apply salvage rubric to stages 1-10, 24-25

**Checkpoint**: Database clean; audit complete; salvage decisions made

---

### Phase 1: SSOT Foundation + Delete Legacy (Days 3-5)

**Goal**: Single source of truth exists, legacy code deleted

#### Tasks:
- [ ] Create `/src/config/venture-workflow.ts` with SSOT
- [ ] Create `/src/config/vision-v2-stages.json` (machine-readable canonical)
- [ ] **Delete `src/types/workflowStages.ts`** (the "15 stages" artifact)
- [ ] Create new `src/types/workflow.types.ts` derived from SSOT
- [ ] Refactor all `totalStages` references to use SSOT constant
- [ ] Eliminate all "40" AND "15" references in UI components
- [ ] **Delete all duplicate/legacy stage files** (not quarantine - delete):
  ```
  Stage1Enhanced.tsx, Stage2VentureResearch.tsx,
  Stage11MVPDevelopment.tsx, Stage11StrategicNaming.tsx,
  Stage12AdaptiveNaming.tsx, Stage12TechnicalImplementation.tsx,
  ... (all duplicates listed in appendix)
  ```
- [ ] Add CI check: `npm run audit:stages` fails if hardcoded counts detected

**Checkpoint**:
- `npm run audit:stages` passes
- All legacy files deleted
- No "40" or "15" in codebase

---

### Phase 2: Create V2 Stage Shells + Router (Days 6-8)

**Goal**: Application compiles with 25 V2 stage shells

#### Tasks:
- [ ] Create shell components for all 25 stages with Vision V2 names:
  ```
  /src/components/stages/v2/
  ├── Stage01DraftIdea.tsx
  ├── Stage02AICritique.tsx
  ├── Stage03MarketValidation.tsx
  ...
  └── Stage25Scale.tsx
  ```
- [ ] Update router to load stages via SSOT registry
- [ ] Application compiles and navigates stages 1-25

**Checkpoint**: Can navigate all 25 stages in browser (shells render)

---

### Phase 3: Implement Safe Stages (Days 9-13)

**Goal**: Stages 1-10, 24-25 fully functional

#### Tasks:
For each salvageable stage:
- [ ] Copy logic from deleted legacy file (from git history if needed)
- [ ] Adapt to V2 naming and types
- [ ] Verify: loads, saves, validates correctly
- [ ] Unit tests for stage

**Stages to implement**:
| Stage | Vision V2 Name | Source |
|-------|----------------|--------|
| 1 | Draft Idea Review | Stage1DraftIdea.tsx |
| 2 | AI Multi-Model Critique | Stage2AIReview.tsx |
| 3 | Market Validation | Stage3ComprehensiveValidation.tsx |
| 4 | Competitive Intelligence | Stage4CompetitiveIntelligence.tsx |
| 5 | Profitability Forecasting | Stage5ProfitabilityForecasting.tsx |
| 6 | Risk Evaluation | Stage6RiskEvaluation.tsx |
| 7 | Pricing Strategy | (rebuild - was stage 15) |
| 8 | Business Model Canvas | Stage8ProblemDecomposition.tsx |
| 9 | Exit-Oriented Design | Stage9GapAnalysis.tsx (rename) |
| 10 | Strategic Naming | Stage10TechnicalReview.tsx (partial) |
| 24 | Analytics & Feedback | Stage24GrowthMetricsOptimization.tsx |
| 25 | Optimization & Scale | Stage25ScalePlanning.tsx |

**Checkpoint**: Stages 1-10, 24-25 pass E2E golden path test

---

### Phase 4: Rebuild Crisis Zone (Days 14-23)

**Goal**: Stages 11-23 rebuilt to Vision V2 spec with correct gate logic

#### Per-Stage Process:
1. Design UI/UX based on Vision V2 purpose
2. Implement data model and validation
3. Implement gate logic (kill/promotion) if applicable
4. Salvage reusable UI components from git history
5. Unit tests for stage

#### Stages to rebuild (with gates):
| Stage | Name | Gate |
|-------|------|------|
| 11 | Go-to-Market Strategy | - |
| 12 | Sales & Success Logic | - |
| 13 | Tech Stack Interrogation | **KILL GATE** |
| 14 | Data Model & Architecture | - |
| 15 | Epic & User Story Breakdown | - |
| 16 | Schema Firewall | **PROMOTION GATE** |
| 17 | Environment Config | **PROMOTION GATE** |
| 18 | MVP Development Loop | - |
| 19 | Integration & API Layer | - |
| 20 | Security & Performance | - |
| 21 | QA & UAT | - |
| 22 | Deployment | **PROMOTION GATE** |
| 23 | Production Launch | **KILL GATE** |

**Checkpoint**: All 25 stages pass E2E golden path test

---

### Phase 5: Governance & Polish (Days 24-26)

**Goal**: CI governance in place, documentation complete

#### Tasks:
- [ ] Add permanent CI governance:
  - Stage audit test (25 stages, correct names)
  - No hardcoded counts lint rule
  - Vision V2 compliance check against JSON
- [ ] E2E test: full venture lifecycle stages 1-25
- [ ] Document architecture in ADR
- [ ] Update CLAUDE.md with new stage structure

**Checkpoint**:
- All CI checks pass
- E2E golden path complete
- Documentation updated

---

## SSOT Architecture (Corrected)

### File: `/src/config/venture-workflow.ts`

```typescript
import { lazy, LazyExoticComponent, ComponentType } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// VENTURE WORKFLOW - SINGLE SOURCE OF TRUTH
// Version: GENESIS-V2.0.0
// Source: GENESIS_RITUAL_SPECIFICATION.md (Contract of Pain)
// ═══════════════════════════════════════════════════════════════════════════

export const WORKFLOW_VERSION = 'GENESIS-V2.0.0' as const;

// Explicit stage number array for type derivation
export const STAGE_NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25
] as const;

export const TOTAL_STAGES = 25 as const;

export type StageNumber = typeof STAGE_NUMBERS[number];
export type GateType = 'kill' | 'promotion' | null;
export type WorkflowPhase =
  | 'THE_TRUTH'
  | 'THE_ENGINE'
  | 'THE_IDENTITY'
  | 'THE_BLUEPRINT'
  | 'THE_BUILD'
  | 'LAUNCH_LEARN';

export interface StageDefinition {
  readonly number: StageNumber;
  readonly id: string;
  readonly name: string;
  readonly phase: WorkflowPhase;
  readonly gateType: GateType;
  readonly component: LazyExoticComponent<ComponentType<unknown>>;
}

export const WORKFLOW_STAGES: Record<StageNumber, StageDefinition> = {
  1: {
    number: 1,
    id: 'draft_idea_review',
    name: 'Draft Idea Review',
    phase: 'THE_TRUTH',
    gateType: null,
    component: lazy(() => import('@/components/stages/v2/Stage01DraftIdea')),
  },
  2: {
    number: 2,
    id: 'ai_multi_model_critique',
    name: 'AI Multi-Model Critique',
    phase: 'THE_TRUTH',
    gateType: null,
    component: lazy(() => import('@/components/stages/v2/Stage02AICritique')),
  },
  3: {
    number: 3,
    id: 'market_validation',
    name: 'Market Validation',
    phase: 'THE_TRUTH',
    gateType: 'kill',
    component: lazy(() => import('@/components/stages/v2/Stage03MarketValidation')),
  },
  // ... stages 4-22 ...
  23: {
    number: 23,
    id: 'production_launch',
    name: 'Production Launch',
    phase: 'LAUNCH_LEARN',
    gateType: 'kill',
    component: lazy(() => import('@/components/stages/v2/Stage23ProductionLaunch')),
  },
  24: {
    number: 24,
    id: 'analytics_feedback',
    name: 'Analytics & Feedback',
    phase: 'LAUNCH_LEARN',
    gateType: null,
    component: lazy(() => import('@/components/stages/v2/Stage24Analytics')),
  },
  25: {
    number: 25,
    id: 'optimization_scale',
    name: 'Optimization & Scale',
    phase: 'LAUNCH_LEARN',
    gateType: null,
    component: lazy(() => import('@/components/stages/v2/Stage25Scale')),
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// DERIVED UTILITIES - Use these, never hardcode values
// ═══════════════════════════════════════════════════════════════════════════

export const getStageCount = (): number => TOTAL_STAGES;

export const getStage = (n: StageNumber): StageDefinition => WORKFLOW_STAGES[n];

export const getStageName = (n: StageNumber): string => WORKFLOW_STAGES[n].name;

/**
 * Progress calculation:
 * Stage 1 = 4% (1/25)
 * Stage 25 = 100% (25/25)
 */
export const getStageProgress = (current: StageNumber): number =>
  (current / TOTAL_STAGES) * 100;

export const isKillGate = (n: StageNumber): boolean =>
  WORKFLOW_STAGES[n].gateType === 'kill';

export const isPromotionGate = (n: StageNumber): boolean =>
  WORKFLOW_STAGES[n].gateType === 'promotion';

export const getKillGateStages = (): StageNumber[] =>
  STAGE_NUMBERS.filter(n => isKillGate(n));

export const getPromotionGateStages = (): StageNumber[] =>
  STAGE_NUMBERS.filter(n => isPromotionGate(n));

// Gate summary for reference
export const KILL_GATES: readonly StageNumber[] = [3, 5, 13, 23] as const;
export const PROMOTION_GATES: readonly StageNumber[] = [16, 17, 22] as const;
```

### File: `/src/config/vision-v2-stages.json`

```json
{
  "version": "GENESIS-V2.0.0",
  "source": "docs/vision/GENESIS_RITUAL_SPECIFICATION.md",
  "totalStages": 25,
  "stages": [
    { "number": 1, "id": "draft_idea_review", "name": "Draft Idea Review", "phase": "THE_TRUTH", "gateType": null },
    { "number": 2, "id": "ai_multi_model_critique", "name": "AI Multi-Model Critique", "phase": "THE_TRUTH", "gateType": null },
    { "number": 3, "id": "market_validation", "name": "Market Validation", "phase": "THE_TRUTH", "gateType": "kill" },
    { "number": 4, "id": "competitive_intelligence", "name": "Competitive Intelligence", "phase": "THE_TRUTH", "gateType": null },
    { "number": 5, "id": "profitability_forecasting", "name": "Profitability Forecasting", "phase": "THE_TRUTH", "gateType": "kill" },
    { "number": 6, "id": "risk_evaluation", "name": "Risk Evaluation", "phase": "THE_ENGINE", "gateType": null },
    { "number": 7, "id": "pricing_strategy", "name": "Pricing Strategy", "phase": "THE_ENGINE", "gateType": null },
    { "number": 8, "id": "business_model_canvas", "name": "Business Model Canvas", "phase": "THE_ENGINE", "gateType": null },
    { "number": 9, "id": "exit_oriented_design", "name": "Exit-Oriented Design", "phase": "THE_ENGINE", "gateType": null },
    { "number": 10, "id": "strategic_naming", "name": "Strategic Naming", "phase": "THE_IDENTITY", "gateType": null },
    { "number": 11, "id": "go_to_market_strategy", "name": "Go-to-Market Strategy", "phase": "THE_IDENTITY", "gateType": null },
    { "number": 12, "id": "sales_success_logic", "name": "Sales & Success Logic", "phase": "THE_IDENTITY", "gateType": null },
    { "number": 13, "id": "tech_stack_interrogation", "name": "Tech Stack Interrogation", "phase": "THE_BLUEPRINT", "gateType": "kill" },
    { "number": 14, "id": "data_model_architecture", "name": "Data Model & Architecture", "phase": "THE_BLUEPRINT", "gateType": null },
    { "number": 15, "id": "epic_user_story_breakdown", "name": "Epic & User Story Breakdown", "phase": "THE_BLUEPRINT", "gateType": null },
    { "number": 16, "id": "schema_firewall", "name": "Schema Firewall", "phase": "THE_BLUEPRINT", "gateType": "promotion" },
    { "number": 17, "id": "environment_config", "name": "Environment Config", "phase": "THE_BUILD", "gateType": "promotion" },
    { "number": 18, "id": "mvp_development_loop", "name": "MVP Development Loop", "phase": "THE_BUILD", "gateType": null },
    { "number": 19, "id": "integration_api_layer", "name": "Integration & API Layer", "phase": "THE_BUILD", "gateType": null },
    { "number": 20, "id": "security_performance", "name": "Security & Performance", "phase": "THE_BUILD", "gateType": null },
    { "number": 21, "id": "qa_uat", "name": "QA & UAT", "phase": "LAUNCH_LEARN", "gateType": null },
    { "number": 22, "id": "deployment", "name": "Deployment", "phase": "LAUNCH_LEARN", "gateType": "promotion" },
    { "number": 23, "id": "production_launch", "name": "Production Launch", "phase": "LAUNCH_LEARN", "gateType": "kill" },
    { "number": 24, "id": "analytics_feedback", "name": "Analytics & Feedback", "phase": "LAUNCH_LEARN", "gateType": null },
    { "number": 25, "id": "optimization_scale", "name": "Optimization & Scale", "phase": "LAUNCH_LEARN", "gateType": null }
  ]
}
```

---

## Database Schema Changes

```sql
-- Clean slate: Delete all test ventures
TRUNCATE TABLE venture_stage_data CASCADE;
TRUNCATE TABLE ventures CASCADE;

-- No schema changes needed for workflow versioning (single V2 path)
-- Ventures table already has current_stage (INTEGER 1-25)

-- Optional: Add constraint to enforce valid stage numbers
ALTER TABLE ventures
ADD CONSTRAINT chk_valid_stage
CHECK (current_stage >= 1 AND current_stage <= 25);

-- Comment for documentation
COMMENT ON CONSTRAINT chk_valid_stage ON ventures IS
  'Enforces Vision V2 stage numbers 1-25';
```

---

## Timeline Summary

| Phase | Days | Duration | Key Deliverable |
|-------|------|----------|-----------------|
| 0 | 1-2 | 2 days | Audit complete, test data deleted |
| 1 | 3-5 | 3 days | SSOT exists, legacy files deleted |
| 2 | 6-8 | 3 days | V2 shells created, router wired |
| 3 | 9-13 | 5 days | Safe stages (1-10, 24-25) implemented |
| 4 | 14-23 | 10 days | Crisis zone (11-23) rebuilt |
| 5 | 24-26 | 3 days | Governance, testing, documentation |

**Total: 26 working days (~4 weeks)**

*Timeline reduced from 6 weeks due to:*
- *No legacy adapter needed*
- *No dual-support complexity*
- *No data migration required*
- *Delete instead of quarantine*

---

## Risk Register (Simplified)

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| Hidden DB trigger coupling | Medium | High | Phase 0 audit; document all triggers | TBD |
| Backend API stage logic | Medium | High | Phase 0 audit; update in parallel | TBD |
| Timeline slip on 11-23 | Medium | Medium | Parallelize; add engineer if behind | TBD |
| Genesis Ritual deadline risk | Low | Critical | Complete Phase 4 by Jan 31; 2-week buffer | TBD |
| Type errors during rebuild | Medium | Low | Use `any` temporarily in shells, tighten later | TBD |

*Risks removed (no longer applicable):*
- ~~Ventures mid-workflow confusion~~ - No production ventures exist
- ~~Data loss during migration~~ - No data to migrate
- ~~Legacy/V2 flag drift~~ - No dual-support needed

---

## Success Criteria

### Must Have (Definition of Done)
- [ ] All 25 stages load and function correctly
- [ ] SSOT drives all stage displays and routing
- [ ] Zero hardcoded stage counts in codebase (no "40", "15", or magic numbers)
- [ ] All kill gates (3, 5, 13, 23) enforce correctly
- [ ] All promotion gates (16, 17, 22) enforce correctly
- [ ] All legacy/duplicate stage files deleted
- [ ] CI governance prevents regression
- [ ] E2E test passes for full venture lifecycle

### Nice to Have
- [ ] Performance benchmarks met (stage load < 500ms)
- [ ] Unit tests for all 25 stages
- [ ] Stage documentation in Storybook

---

## First Week Execution Checklist

### Day 1
- [ ] Approve this document as official ADR
- [ ] **Delete all test ventures from database**
- [ ] Generate stage → file → route mapping
- [ ] Begin database trigger audit

### Day 2
- [ ] Complete database trigger audit
- [ ] Complete backend API audit
- [ ] Apply salvage rubric to stages 1-10, 24-25
- [ ] Document salvage decisions
- [ ] **Phase 0 Complete**

### Day 3
- [ ] Create `/src/config/venture-workflow.ts` (SSOT)
- [ ] Create `/src/config/vision-v2-stages.json`
- [ ] **Delete `/src/types/workflowStages.ts`**

### Day 4
- [ ] Create `/src/types/workflow.types.ts` derived from SSOT
- [ ] Refactor all `totalStages` to use SSOT constant
- [ ] Eliminate all "40" and "15" references

### Day 5
- [ ] **Delete all duplicate/legacy stage files**
- [ ] Add CI checks (`npm run audit:stages`)
- [ ] Verify build compiles (may have broken imports)
- [ ] **Phase 1 Complete**

---

## Appendix: Files to Delete

### Types to Delete (Phase 1)
```
/src/types/workflowStages.ts  # "15 stages" artifact - DELETE, replace with workflow.types.ts
```

### Duplicate Stage Files to Delete (Phase 1)
```
# Stage 1 duplicate
/src/components/stages/Stage1Enhanced.tsx

# Stage 2 duplicate
/src/components/stages/Stage2VentureResearch.tsx

# Stage 11 duplicates (BOTH - neither matches V2)
/src/components/stages/Stage11MVPDevelopment.tsx
/src/components/stages/Stage11StrategicNaming.tsx

# Stage 12 duplicates (BOTH - neither matches V2)
/src/components/stages/Stage12AdaptiveNaming.tsx
/src/components/stages/Stage12TechnicalImplementation.tsx

# Stage 13 duplicates (BOTH - neither matches V2)
/src/components/stages/Stage13ExitOrientedDesign.tsx
/src/components/stages/Stage13IntegrationTesting.tsx

# Stage 14 duplicates (BOTH - neither matches V2)
/src/components/stages/Stage14DevelopmentPreparation.tsx
/src/components/stages/Stage14QualityAssurance.tsx

# Stage 15 duplicates (BOTH - neither matches V2)
/src/components/stages/Stage15DeploymentPreparation.tsx
/src/components/stages/Stage15PricingStrategy.tsx
/src/components/stages/Stage15PricingStrategy.tsx.backup  # Also delete backup

# Stage 21 duplicates (BOTH - neither matches V2)
/src/components/stages/Stage21LaunchPreparation.tsx
/src/components/stages/Stage21PreFlightCheck.tsx

# Stage 22 duplicates (BOTH - neither matches V2)
/src/components/stages/Stage22GoToMarketExecution.tsx
/src/components/stages/Stage22IterativeDevelopmentLoop.tsx

# Stage 23 duplicates (BOTH - neither matches V2)
/src/components/stages/Stage23ContinuousFeedbackLoops.tsx
/src/components/stages/Stage23CustomerAcquisition.tsx

# Stage 24 duplicate
/src/components/stages/Stage24MVPEngineIteration.tsx

# Stage 25 duplicate
/src/components/stages/Stage25QualityAssurance.tsx
```

### Files to Keep (Salvageable)
```
# Keep and rename/adapt these for V2
/src/components/stages/Stage1DraftIdea.tsx      → Stage01DraftIdea.tsx
/src/components/stages/Stage2AIReview.tsx       → Stage02AICritique.tsx
/src/components/stages/Stage3ComprehensiveValidation.tsx → Stage03MarketValidation.tsx
/src/components/stages/Stage4CompetitiveIntelligence.tsx → Stage04CompetitiveIntel.tsx
/src/components/stages/Stage5ProfitabilityForecasting.tsx → Stage05Profitability.tsx
/src/components/stages/Stage6RiskEvaluation.tsx → Stage06RiskEval.tsx
/src/components/stages/Stage8ProblemDecomposition.tsx → Stage08BMC.tsx
/src/components/stages/Stage9GapAnalysis.tsx    → Stage09ExitDesign.tsx
/src/components/stages/Stage10TechnicalReview.tsx → Stage10StrategicNaming.tsx
/src/components/stages/Stage24GrowthMetricsOptimization.tsx → Stage24Analytics.tsx
/src/components/stages/Stage25ScalePlanning.tsx → Stage25Scale.tsx
```

**Total files to delete: 23**
**Total files to keep/adapt: 11**
**Files to create from scratch: 14** (stages 7, 11-23 minus salvageable)

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Technical Lead | | | |
| Product Owner | | | |
| Engineering | | | |

---

*Document Version: 2.0*
*Last Updated: 2025-12-29*
*Triangulation Models: OpenAI, Antigravity, Claude Code*
*Next Review: After Phase 1 completion*
