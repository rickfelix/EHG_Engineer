# Brainstorm: Stage 5/7 Financial Modeling Architecture Decision

## Metadata
- **Date**: 2026-03-15
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats)
- **Related Ventures**: All active ventures
- **Part of**: Venture Stage Integration Master Plan (Area 2 of 8)
- **Chairman Review**: 4 items reviewed, 4 accepted, 0 flagged, 0 research-needed

---

## Problem Statement

Stages 5 (Profitability Forecasting) and 7 (Revenue Architecture) produce financial data as flat advisory_data JSONB, but purpose-built tables (`financial_models`, `modeling_requests`) exist with proper schema and aren't used. Both tables are empty (0 rows). The stage pipeline doesn't read from or write to these structured tables.

This is a follow-up to the Explore-phase brainstorm (`brainstorm/2026-03-15-stage5-7-financial-modeling-integration.md`) which identified 3 options and mapped the table schemas.

## Discovery Summary

### Key Decision: Option C (Full Rewrite) → Scoped to Phase 2A

Chairman selected Option C (template-driven financial modeling) but board deliberation refined scope to **Phase 2A only** — wire Stage 5/7 to `financial_models` table + RLS fixes + DDL cleanup. Phases 2B (prediction accuracy loop) and 2C (template-driven selection) deferred until portfolio reaches 8-10 ventures.

### Architecture Decisions Made

1. **Direction**: Full rewrite selected, but scoped incrementally (Phase 2A first)
2. **Archetype source**: Derive from venture metadata (set in earlier assessment stages)
3. **Versioning**: Latest-only with audit trail via modeling_requests (one active model per venture+template_type, upsert on re-run)
4. **Scope**: Phase 2A — wire storage + DDL cleanup + RLS fixes (1 SD, ~120-150 LOC)

### CTO Discovery: 85% of Infrastructure Already Exists

The CTO's research revealed extensive existing infrastructure:
- **Financial Engine API** (`src/api/financial-engine/index.js`): 753 LOC with `calculateSaaSProjections`, `calculateMarketplaceProjections`, `calculateGenericProjections`
- **4 financial tables**: `financial_models`, `financial_projections`, `financial_scenarios`, `modeling_requests` — all deployed with full schema
- **Financial consistency contract** (`lib/eva/contracts/financial-contract.js`): 275 LOC with set/get/validate/refine
- **Stage templates**: Stage 5 (315+253 LOC) and Stage 7 (160+219 LOC) already stable at v2.0.0
- **Total existing code**: ~3,444 LOC in this domain
- **Gap**: Stages produce artifacts into `venture_artifacts` and `advisory_data` but never touch the purpose-built financial tables. This is a plumbing job.

## Analysis

### Arguments For
- Structured storage enables cross-venture financial queries (impossible with flat JSONB)
- 85% infrastructure exists — this is wiring, not greenfield
- Fixes CRITICAL RLS vulnerability on modeling_requests before tables get populated
- Cleans up technical debt (duplicate FKs, missing CHECK constraint values)
- Doesn't overcommit — deferred phases activate when portfolio reaches scale

### Arguments Against
- CFO argues even this may be premature at current portfolio size
- Without archetype-appropriate templates (Phase 2C), structured data still uses one-size-fits-all model
- Dual-write to financial_models + venture_artifacts adds a sync risk point
- Time spent on Area 2 is time not spent on Area 7 (Blueprint Planning) which unblocks pipeline throughput

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | **Forward.** Template-driven financial modeling is the structural prerequisite for EHG's core value proposition — making better kill/invest decisions across a venture portfolio. Enables cross-venture portfolio intelligence, prediction accuracy feedback loops, and archetype-appropriate financial rigor. |
| CRO | What's the blast radius if this fails? | **Moderate-high.** Kill gate fed by wrong archetype = wrong venture decisions. Tri-table desync risk. Prediction accuracy loop could create false confidence. Blast radius includes all downstream stages (5→7→8→25). |
| CTO | What do we already have? What's the real build cost? | **85% built.** Financial Engine API with 3 template-driven calculators, 4 financial tables with full schema, consistency contracts, stage templates. Build cost: 2 SDs, ~200-300 LOC of integration glue. |
| CISO | What attack surface does this create? | **CRITICAL security issues.** modeling_requests has USING(true) — completely open RLS. Financial Engine API uses service role key without authorization. venture_financial_contract has unscoped authenticated read. 8 specific vulnerabilities identified. |
| COO | Can we actually deliver this given current load? | **Yes, but phase it.** Break into 3 incremental SDs (2A/2B/2C). Phase 2A captures 60% of value. Recommend 2-wave approach for the 8-area master plan. Can run in parallel with other areas. |
| CFO | What does this cost and what's the return? | **Premature at current scale.** Break-even at 8-10 ventures. Wire Stage 5→financial_models now (1 SD, cheap). Defer prediction accuracy and template selection until portfolio justifies it. |

### Key Tensions
- **Scope**: CSO wants full template-driven modeling (strategic value) vs CFO says defer most (premature ROI)
- **Prediction accuracy**: CSO sees compounding advantage vs CFO says statistically meaningless below 20 ventures
- **Archetype selection**: CSO sees key differentiator vs CRO sees single point of failure with no error signal

### Board Consensus
1. Phase 2A first — wire storage, fix RLS, clean up DDL (all 6 seats agree)
2. Security must be fixed before populating tables (CISO, accepted by all)
3. Defer prediction accuracy loop until "actual_outcome" has a business definition (CFO, CRO)
4. Defer template selection until portfolio reaches scale (CFO, COO)

### Expertise Gaps Identified
- **CSO**: Key financial metrics (gross_margin, ltv_cac_ratio) should potentially be promoted to first-class columns on financial_models to enable portfolio queries without JSONB path queries
- **CRO**: Archetype selection method (rule-based vs model-based) affects risk profile materially
- **CISO**: Live RLS policy verification needed via direct DB audit
- **CFO**: "actual_outcome" for prediction accuracy has no business definition yet

## Phase 2A SD Scope (Decided)

1. **DDL cleanup**: Drop duplicate FKs on financial_models.company_id (and financial_projections, financial_scenarios)
2. **CHECK constraint**: Add `profitability_forecast` and `revenue_architecture` to modeling_requests.request_type
3. **Unique constraint**: Add `UNIQUE(venture_id, template_type)` on financial_models for upsert
4. **RLS fix**: Replace modeling_requests USING(true) with proper venture-scoped policies
5. **Stage 5 integration**: Write P&L model to financial_models after analysis, write artifact ref to venture_artifacts
6. **Stage 7 integration**: Write pricing model to financial_models after analysis, write artifact ref to venture_artifacts

### Key Integration Points (from CTO)
- Modify `analyzeStage05` in `lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js`
- Modify `analyzeStage07` in `lib/eva/stage-templates/analysis-steps/stage-07-revenue-architecture.js`
- Use `persistArtifact()` pattern from `lib/eva/stage-execution-engine.js`
- Application-level write (not trigger) — financial_models.id needed in artifact metadata

## Deferred Phases

### Phase 2B: modeling_requests Pipeline (deferred until actual_outcome defined)
- Stage 5 creates `profitability_forecast` request, Stage 7 creates `revenue_architecture` request
- Prediction accuracy tracking: projections → actual_outcome → prediction_accuracy
- **Blocker**: No business definition of "actual_outcome" for pre-revenue ventures

### Phase 2C: Template-Driven Model Selection (deferred until 8-10 ventures)
- Map venture archetype → template_type → calculation engine
- Use existing Financial Engine API calculators (already implemented)
- Kill gate uses archetype-appropriate thresholds
- **Blocker**: Portfolio too small for archetype-specific differences to affect decisions

## Open Questions
- Should key metrics (gross_margin, ltv_cac_ratio, break_even_month) be promoted to first-class columns? (CSO expertise gap)
- What defines "actual_outcome" for pre-revenue ventures? (CFO expertise gap)
- Is archetype selection rule-based (from venture metadata) or model-based (AI inference)? (CRO expertise gap)

## Suggested Next Steps
- Create vision document and architecture plan
- Generate 1 SD for Phase 2A scope
- Execute through LEO LEAD → PLAN → EXEC
