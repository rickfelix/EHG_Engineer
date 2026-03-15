# Brainstorm: 25-Stage Venture Workflow Naming Reconciliation

## Metadata
- **Date**: 2026-03-15
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats)
- **Related Ventures**: All 9 active ventures (Shortform Sage, Elysian, AdSonix, ListingLens AI, MindStack AI, CodeShift, LegacyAI, LexiGuard, Pipeline-Test)
- **Chairman Review**: 3 items reviewed, 2 accepted, 1 research-needed (resolved in-session with ground-truth verification)

---

## Problem Statement

Three independent configuration sources define the 25-stage venture workflow — `venture-workflow.ts` (app), `lifecycle_stage_config` (DB), and `stage-config.js` (engineer). ~20 of 25 stages have naming disagreements across the three sources. Component files like `Stage16SchemaFirewall.tsx` render "Financial Projections". The app's `PROMOTION_GATE_STAGES` constant is missing stage 24. Phase names diverge between DB (`THE BUILD LOOP`, `LAUNCH & LEARN`) and app (`THE_BUILD`, `THE_LAUNCH`). This creates cognitive overhead on every stage-related change and generates noise in every quality gate evaluation.

## Discovery Summary

### Chairman Decisions
1. **App `stageName` is the canonical source of truth** — DB and stage-config.js sync from it
2. **Full rename** — stageKeys, componentPaths, .tsx files, DB names all align to app stageName
3. **No migration needed** — ventures can be wiped (still in initial development phase, no production users)
4. **Gate prefixes are metadata** — names stay clean (e.g., "Financial Projections" not "Promotion Gate: Financial Projections"), gate type in separate fields
5. **App phase names win** — `THE_BUILD` and `THE_LAUNCH` over DB's `THE BUILD LOOP` and `LAUNCH & LEARN`

### Per-Stage Reconciliation Table (App stageName = Canonical)

| Stage | Canonical Name (App) | Current DB Name | Current stage-config Name | stageKey (Current → New) | Component File (Current → New) |
|:-----:|---------------------|----------------|--------------------------|-------------------------|-------------------------------|
| 1 | Draft Idea | Idea Capture | Idea Capture | draft-idea (ok) | Stage1DraftIdea.tsx (ok) |
| 2 | AI Review | Idea Analysis | Idea Analysis | ai-review (ok) | Stage2AIReview.tsx (ok) |
| 3 | Comprehensive Validation | Kill Gate | Kill Gate: Comprehensive Validation | comprehensive-validation (ok) | Stage3ComprehensiveValidation.tsx (ok) |
| 4 | Competitive Intelligence | Competitive Landscape | Competitive Intelligence | competitive-intelligence (ok) | Stage4CompetitiveIntelligence.tsx (ok) |
| 5 | Profitability Forecasting | Kill Gate (Financial) | Kill Gate: Profitability Forecasting | profitability-forecasting (ok) | Stage5ProfitabilityForecasting.tsx (ok) |
| 6 | Risk Evaluation | Risk Assessment | Risk Evaluation | risk-evaluation (ok) | Stage6RiskEvaluation.tsx (ok) |
| 7 | Revenue Architecture | Revenue Architecture | Revenue Architecture | revenue-architecture (ok) | Stage7RevenueArchitecture.tsx (ok) |
| 8 | Business Model Canvas | Business Model Canvas | Business Model Canvas | business-model-canvas (ok) | Stage8BusinessModelCanvas.tsx (ok) |
| 9 | Exit Strategy | Exit Strategy | Exit Strategy | exit-strategy (ok) | Stage9ExitStrategy.tsx (ok) |
| 10 | Customer & Brand Foundation | Naming/Brand | Customer & Brand Foundation | customer-brand-foundation (ok) | Stage10CustomerBrand.tsx (ok) |
| 11 | Naming & Visual Identity | GTM Strategy | GTM Strategy | gtm-strategy → naming-visual-identity | Stage11GtmStrategy.tsx → Stage11NamingVisualIdentity.tsx |
| 12 | GTM & Sales Strategy | Sales Identity | Sales & Success Logic | sales-success-logic → gtm-sales-strategy | Stage12SalesSuccessLogic.tsx → Stage12GtmSalesStrategy.tsx |
| 13 | Product Roadmap | Product Roadmap | Kill Gate: Tech Stack Interrogation | tech-stack-interrogation → product-roadmap | Stage13TechStackInterrogation.tsx → Stage13ProductRoadmap.tsx |
| 14 | Technical Architecture | Technical Architecture | Data Model Architecture | data-model-architecture → technical-architecture | Stage14DataModelArchitecture.tsx → Stage14TechnicalArchitecture.tsx |
| 15 | Risk Register | Resource Planning | Epic & User Story Breakdown | epic-user-story-breakdown → risk-register | Stage15EpicUserStoryBreakdown.tsx → Stage15RiskRegister.tsx |
| 16 | Financial Projections | Financial Projections | Promotion Gate: Schema Firewall | schema-firewall → financial-projections | Stage16SchemaFirewall.tsx → Stage16FinancialProjections.tsx |
| 17 | Build Readiness | Pre-Build Checklist | Promotion Gate: Environment Config | environment-config → build-readiness | Stage17EnvironmentConfig.tsx → Stage17BuildReadiness.tsx |
| 18 | Sprint Planning | Sprint Planning | MVP Development Loop | mvp-development-loop → sprint-planning | Stage18MvpDevelopmentLoop.tsx → Stage18SprintPlanning.tsx |
| 19 | Build Execution | Build Execution | Integration & API Layer | integration-api-layer → build-execution | Stage19IntegrationApiLayer.tsx → Stage19BuildExecution.tsx |
| 20 | Quality Assurance | Quality Assurance | Security & Performance | security-performance → quality-assurance | Stage20SecurityPerformance.tsx → Stage20QualityAssurance.tsx |
| 21 | Build Review & Integration Testing | Build Review | QA & UAT | qa-uat → build-review | Stage21QaUat.tsx → Stage21BuildReview.tsx |
| 22 | Release Readiness | Release Readiness | Promotion Gate: Deployment | deployment → release-readiness | Stage22Deployment.tsx → Stage22ReleaseReadiness.tsx |
| 23 | Marketing Preparation | Launch Execution | Kill Gate: Production Launch | production-launch → marketing-preparation | Stage23ProductionLaunch.tsx → Stage23MarketingPreparation.tsx |
| 24 | Launch Readiness | Metrics & Learning | Growth Metrics & Optimization | analytics-feedback → launch-readiness | Stage24GrowthMetricsOptimization.tsx → Stage24LaunchReadiness.tsx |
| 25 | Launch Execution | Venture Review | Scale Planning & Venture Review | optimization-scale → launch-execution | Stage25ScalePlanning.tsx → Stage25LaunchExecution.tsx |

### Phase Reconciliation

| Phase # | App Chunk (Canonical) | DB phase_name (Current) | Action |
|:-------:|----------------------|------------------------|--------|
| 1 | THE_TRUTH | THE TRUTH | Update DB: remove space or standardize format |
| 2 | THE_ENGINE | THE ENGINE | Update DB: remove space or standardize format |
| 3 | THE_IDENTITY | THE IDENTITY | Update DB: remove space or standardize format |
| 4 | THE_BLUEPRINT | THE BLUEPRINT | Update DB: remove space or standardize format |
| 5 | THE_BUILD | THE BUILD LOOP | Update DB: rename to THE BUILD (or THE_BUILD) |
| 6 | THE_LAUNCH | LAUNCH & LEARN | Update DB: rename to THE LAUNCH (or THE_LAUNCH) |

### Gate Type Reconciliation

| Stage | App gateType | stage-config gateType | DB workType | Bug? |
|:-----:|-------------|----------------------|-------------|------|
| 24 | promotion | promotion | sd_required | App PROMOTION_GATE_STAGES=[16,17,22] missing 24 |

Fix: Add 24 to PROMOTION_GATE_STAGES constant.

## Analysis

### Arguments For
- **Unanimous board approval** — all 6 seats agree this is forward movement
- **Cheapest possible timing** — dev phase, no users, ventures can be wiped (CSO, CFO)
- **Eliminates a 3x cognitive multiplier** on all future stage work (CFO: 30-40% reduction in per-stage implementation time)
- **Quality gate noise reduction** — triangulation reports flagging this as systemic will stop generating false-positive noise
- **Non-linear tech debt** — each new stage/venture added increases the compounding cost of not fixing this (CFO)

### Arguments Against
- **2-3 hours opportunity cost** vs. shipping features (COO: fits one SD at 200-300 LOC delta)
- **Hidden references risk** — live DB may have triggers/functions with hardcoded stage name strings not tracked in migration files (CISO expertise gap)
- **App stageNames may themselves be incorrect** — if the DB disagreed on ~8 names, are we canonizing wrong names?
- **Split-brain risk** if deploy is partial — DB updated but app not yet deployed (CISO: atomic deploy required)

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 9/10 | Current: 3 sources x 20 mismatches = constant cognitive overhead on every stage touch. Future: single SSOT with generated downstream configs. |
| Value Addition | 8/10 | Direct: eliminates naming bugs, fixes PROMOTION_GATE_STAGES bug, cleans gate evaluation. Compound: enables build-time generator preventing all future drift. |
| Risk Profile | 3/10 | Low risk. Dev phase, no users, ventures wipeable. Primary risk (partial application) mitigated by atomic deploy. |
| **Decision** | **Implement** | (9 + 8) = 17 > 3 * 2 = 6. Clear implement. |

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | **Forward.** Three disagreeing naming systems is a structural integrity problem. Window is open and closing — every venture added increases blast radius. Scope it as mechanical rename, no "while we're in here" additions. |
| CRO | What's the blast radius if this fails? | **Containable.** Silent failures from Supabase name mismatches are the primary risk. Requires automated post-rename reconciliation test. Full grep of app repo needed before execution. |
| CTO | What do we already have? What's the real build cost? | **~200-300 LOC across 2 repos + 25 DB rows.** Recommends automated generator to prevent future drift. Fix PROMOTION_GATE_STAGES bug in same SD. App has internal contradiction (stageKey != stageName). |
| CISO | What attack surface does this create? | **Low, but partial application is the real threat.** FK registry has 6 RESTRICT-policy tables blocking naive venture delete. No RLS references stage names by string. Needs pg_catalog audit of live DB. Pre-wipe snapshot recommended. |
| COO | Can we actually deliver this given current load? | **Yes, single SD, 2-3 hours.** No fleet-wide pause needed. Low impact on parallel sessions — stage config is read-only reference data. Merge Engineer changes before proving-companion work. |
| CFO | What does this cost and what's the return? | **~$5-8 token cost, half-day capacity. 30-40% reduction in per-stage implementation time going forward.** Cost of NOT doing this: 15-20% drag on all stage-related work indefinitely. Timing is optimal — 5-10x cheaper now vs. post-launch. |

### Expertise Gaps Flagged
- **CRO**: App repo (`ehg`) needs full grep for hardcoded stage references in components, hooks, test fixtures before execution
- **CISO**: Live DB may have triggers/functions with stage name string literals not tracked in migration files — needs `pg_catalog` query

### Round 2: Key Tensions
- **CTO vs COO on automation**: CTO wants build-time generator; COO says rename is mechanical. Resolution: generator is ~1 hour extra and eliminates entire drift category — include it.
- **CISO on wipe audit trail**: Wants pg_dump before wipe. CFO agrees — low-cost insurance. Resolution: include pre-wipe snapshot.

### Judiciary Verdict
- **Board Consensus**: Unanimous approve. Execute now as single Tier 3 SD.
- **Key Tensions**: Generator automation (resolved: include it) and wipe audit trail (resolved: include snapshot).
- **Recommendation**: Single SD with 4 deliverables: (1) reconciliation rename, (2) build-time generator, (3) pre-wipe DB snapshot, (4) post-rename cross-source assertion test.
- **Escalation**: No — full consensus, no chairman override needed.

## Open Questions
1. Should the DB `phase_name` format use underscores (`THE_BUILD`) or spaces (`THE BUILD`)? App uses underscores in TypeScript types; DB currently uses spaces.
2. Are there any analytics events or external integrations that reference stage names or stageKeys that would break?
3. The DB has `advisory_enabled` on stages 3, 5, and 16. Should this be represented in the app config and stage-config.js?

## Suggested Next Steps
1. **Create SD** for the full reconciliation (Tier 3, ~200-300 LOC)
2. SD should include: rename script, build-time generator, pre-wipe snapshot, post-rename assertion test
3. Execute in sequence: grep audit → DB snapshot → DB migration → app renames → engineer config sync → assertion test
4. Fix PROMOTION_GATE_STAGES bug as part of same SD
