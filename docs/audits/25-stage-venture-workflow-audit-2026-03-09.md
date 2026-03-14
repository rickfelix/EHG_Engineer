# 25-Stage Venture Workflow GUI Audit

## Metadata
- **Date**: 2026-03-09
- **Auditor**: Chairman + Claude (collaborative stage-by-stage evaluation)
- **Scope**: All 25 stages + Stage 0 (Explore Opportunities) — spec vs. GUI implementation
- **App**: EHG (rickfelix/ehg) — Chairman V3 venture detail pages
- **Backend**: EHG_Engineer — lib/eva/stage-templates/stage-01.js through stage-25.js

## Executive Summary

Systematic audit comparing backend stage specifications against frontend GUI implementation across all 25 stages of the venture workflow. The audit revealed **13 patterns** — most are systemic (affecting all stages) rather than stage-specific. The core issue is that the venture detail page renders a **generic shell** (BuildingMode) for all 25 stages, despite the backend producing rich, stage-specific structured data.

**Key stat**: 7 stage-specific gate renderers already exist in the Decisions inbox but are not surfaced in the venture detail page.

---

## Pattern Catalog

| ID | Pattern | Severity | Description | Stages Affected |
|----|---------|----------|-------------|-----------------|
| P1 | Backend data not surfaced in UI | Critical | Rich structured data exists in backend (scores, analyses, evidence, metrics); UI shows generic shells | All 25 |
| P2 | No stage-specific views | Critical | componentPath config exists in venture-workflow.ts but is never loaded; every stage renders identical BuildingMode | All 25 |
| P3 | Artifact content not viewable | High | ArtifactsTab shows metadata (title, type, date) but never renders artifact content | All 25 |
| P4 | Naming/config drift | Critical | Frontend venture-workflow.ts has wrong names for stages 7-10 (e.g., Stage 10 says "Technical Review" but backend does "Customer & Brand Foundation") | 7, 8, 9, 10 (critical); 1-6 (minor) |
| P5 | Non-functional toolbar actions | High | Share, Edit, Settings buttons have no onClick handlers; only Intelligence works | Venture detail page |
| P6 | No historical navigation | High | Can't view previous stage data after advancing; operations mode has no drill-back into stage content | Building mode + Operations mode |
| P7 | No wireframes for stage views | High | 25 stages built without visual specs; root cause of P2 | All 25 |
| P8 | LEO Protocol: No wireframe gate | Process | PLAN phase doesn't require wireframes; no QA/QC validation against wireframes exists | Protocol-wide |
| P9 | No work-type distinction | Medium | Automated stages (automated_check) look identical to manual stages; user can't tell what needs action vs. what runs automatically | 2, 3, 5, and others |
| P10 | Golden Nuggets invisible | Medium | 4 Golden Nuggets (Assumptions vs Reality, Token Budget Profiles, Four Buckets, Crew Tournament) have zero UI presence | 2, 3, 5, 6, 11, 16, 23-25 |
| P11 | Gate renderers disconnected | High | 7 stage-specific renderers (Stage0, 5, 10, 13, 22, 23, 25) exist in Decisions inbox but not in venture detail | Gate stages |
| P12 | Phase transition gates missing | Medium | Reality Gates at stages 9 (Phase 2→3) and 12 (Phase 3→4 dual-gate) have no UI representation | 9, 12 |
| P13 | Stage 10 chunk misassignment | Medium | Frontend SSOT puts Stage 10 in "validation" chunk; canonically it's THE_IDENTITY phase | 10 |

---

## Stage-by-Stage Findings

### Stage 0: Explore Opportunities

**Route**: `/chairman/opportunities`
**Components**: 12 components in `chairman-v3/opportunities/`

| # | Category | Finding | Severity |
|---|----------|---------|----------|
| 1 | Decision Signals | No capability alignment score on blueprint cards | Medium |
| 2 | Decision Signals | No portfolio synergy score on blueprint cards | Medium |
| 3 | Decision Signals | No stage-of-death prediction (backend exists, UI doesn't render) | Medium |
| 4 | Decision Signals | No counterfactual summary (backend exists, UI doesn't render) | Medium |
| 5 | Decision Signals | No blueprint detail view (`/chairman/opportunities/:id`) | High |
| 6 | Decision Signals | No blueprint comparison view | Low |
| 7 | Nursery | No trigger countdown on nursery items | Medium |
| 8 | Nursery | No trigger conditions displayed (backend has the data) | Medium |
| 9 | Nursery | No maturity level shown (seed/sprout/ready) | Low |
| 10 | Blueprint Creation | No UI path to generate blueprints — depends entirely on CLI pipeline | High |
| 11 | UX | No sorting/filtering of blueprints | Medium |
| 12 | UX | No page-level description or onboarding context | Low |

### Stage 1: Idea Capture (Draft Idea)

**Backend schema**: 9 fields (description, problemStatement, valueProp, targetMarket, archetype, keyAssumptions, moatStrategy, successCriteria, sourceProvenance)
**Exit gates**: Title validated, description validated, category assigned, problem_statement populated, chairman intent captured
**Artifact**: idea_brief

| # | Finding | Severity |
|---|---------|----------|
| 1 | No stage-specific component loaded (P2) | Critical |
| 2 | None of 9 backend schema fields displayed (P1) | Critical |
| 3 | Share, Edit, Settings toolbar buttons non-functional (P5) | High |
| 4 | No way to view previous stage data after advancing (P6) | High |
| 5 | Operations mode has no drill-back into stage content (P6) | High |
| 6 | Artifact content not viewable (P3) | High |
| 7 | Exit gate completion status not visible | High |
| 8 | Idea quality score and validation completeness metrics not displayed | Medium |
| 9 | sourceProvenance (Stage 0 → 1 lineage) not shown | Low |

### Stage 2: Idea Analysis (AI Multi-Model Critique)

**Backend schema**: 3 analysis perspectives (strategic, technical, tactical), 7 pre-scores (0-100), 7 evidence domains, compositeScore, provenance
**Work type**: automated_check (MoA multi-persona)
**Golden Nugget**: Assumptions vs Reality — creates Assumption Set V1

| # | Finding | Severity |
|---|---------|----------|
| 1 | 7 pre-scores not displayed (P1) — core value of this stage | Critical |
| 2 | 3 analysis perspectives not rendered (P1) | Critical |
| 3 | 7 evidence domains not viewable (P1) | High |
| 4 | compositeScore not shown (P1) | High |
| 5 | Assumption Set V1 creation not surfaced (P10) | Medium |
| 6 | No audit trail / provenance (P1) | Low |
| 7 | No visual distinction for automated stage (P9) | Medium |

### Stages 3-25: Summary (patterns apply uniformly)

All stages share P1, P2, P3, P7. Stage-specific notable gaps:

| Stage | Unique Backend Data Not Surfaced | Special Notes |
|-------|--------------------------------|---------------|
| 3 | 3-way gate (PASS/REVISE/KILL), hybrid scoring, Four Buckets | REVISE loops back to Stage 2; KillGateRenderer exists but only in Decisions |
| 4 | Competitor entities, SWOT, pricing models, threat levels | Feeds Stage 5 handoff |
| 5 | Unit economics, banded ROI, CONDITIONAL_PASS | Stage5Renderer exists in Decisions only |
| 6 | Risk register (category, severity, probability, impact, mitigations) | Four Buckets Golden Nugget |
| 7 | Pricing tiers, billing periods, LTV/CAC/payback formulas | **Frontend calls it "Comprehensive Planning" — wrong name** |
| 8 | 9 BMC blocks with items, priorities, evidence | **Frontend calls it "Problem Decomposition" — wrong name** |
| 9 | Exit thesis, target acquirers, Phase 2→3 Reality Gate | **Frontend calls it "Gap Analysis" — wrong name**; P12 |
| 10 | Customer personas (min 3), brand genome, naming candidates, Chairman gate | **Frontend calls it "Technical Review" — completely wrong**; P13; Stage10Renderer in Decisions |
| 11 | Naming strategy, visual identity, personaFit scores, Crew Tournament | Golden Nugget P10 |
| 12 | GTM tiers, channels (min 8), sales model, Phase 3→4 dual-gate | P12 dual-gate |
| 13 | Product roadmap, milestones, kill gate | Stage13Renderer exists in Decisions only |
| 14 | 5 architecture layers, security, data entities, integrations | |
| 15 | Risk register v2, resource planning, budget coherence | |
| 16 | Financial projections, runway, burn rate, P&L, Phase 4→5 Promotion Gate | Four Buckets Golden Nugget; PromotionGateRenderer in Decisions |
| 17 | Pre-build checklist (5 categories), readiness decision | |
| 18 | Sprint items, backlog, **Lifecycle-to-SD Bridge** (generates SD drafts) | Creates actual SDs from sprint items |
| 19 | Task tracking, issue tracking, sprint completion | |
| 20 | Test suites, coverage (min 60%), defect tracking, quality decision | Compliance gate |
| 21 | Integration tests per boundary, review decision | |
| 22 | Release checklist, approval tracking, Phase 5→6 Promotion Gate | Stage22Renderer in Decisions only |
| 23 | Marketing items (min 3), SDs via lifecycle-sd-bridge | Stage23Renderer in Decisions only |
| 24 | Go/no-go checklist, Chairman decision | LaunchGateRenderer in Decisions only |
| 25 | Distribution channels, operations handoff, pipeline terminus | Stage25Renderer in Decisions only |

---

## Chairman Observations (Direct Feedback)

1. **Non-functional toolbar**: Share, Edit, Settings, Intelligence buttons at top — only Intelligence works. Question: do we even need Share/Edit/Settings?
2. **No stage history**: After a venture advances past Stage 1, there's no way to go back and see what was captured.
3. **Operations mode**: A completed venture should show an operations-type view (health, revenue, agents, risk) with ability to drill back into individual stage history — not the same 25-stage building view.
4. **Wireframes needed**: Both for fixing the current 25 stages AND as a formal process step in the venture lifecycle for future ventures.
5. **Wireframe QA/QC**: Validation against wireframes should be a quality gate.
6. **Blueprint creation gap**: The Explore page consumes blueprints but has no UI path to create/generate them.

---

## Existing Gate Renderers (Reuse Opportunity)

These components exist in `ehg/src/components/chairman-v3/gates/` and render stage-specific data — but ONLY in the Decisions inbox:

| File | Stage | Data Rendered |
|------|-------|--------------|
| Stage0Renderer.tsx | 0 | Routing context (problem, solution, synergy) |
| Stage5Renderer.tsx | 5 | Unit economics, ROI bands, health threshold, EVA recommendation |
| Stage10Renderer.tsx | 10 | Brand genome, naming candidates, narrative, naming strategy |
| Stage13Renderer.tsx | 13 | Vision statement, milestones, roadmap items, health score |
| Stage22Renderer.tsx | 22 | Release readiness |
| Stage23Renderer.tsx | 23 | Launch preparation |
| Stage25Renderer.tsx | 25 | Distribution channels |
| KillGateRenderer.tsx | 3 | Generic health display |
| PromotionGateRenderer.tsx | 16 | Promotion gate |
| LaunchGateRenderer.tsx | 24 | Launch gate |
| GenericGateRenderer.tsx | fallback | Generic gate display |

---

## Frontend Config vs. Canonical Naming (Full Mismatch Table)

| Stage | venture-workflow.ts (Frontend) | stage-XX.js (Backend) | stages_v2.yaml (Canonical) | Match? |
|-------|-------------------------------|----------------------|---------------------------|--------|
| 1 | Draft Idea | Idea Capture | Idea Capture | Partial |
| 2 | AI Review | Idea Analysis | Idea Analysis | Partial |
| 3 | Comprehensive Validation | Individual Validation | Kill Gate | Partial |
| 4 | Competitive Intelligence | Competitive Intel | Competitive Landscape | Partial |
| 5 | Profitability Forecasting | Profitability Kill Gate | Kill Gate (Financial) | Partial |
| 6 | Risk Evaluation | Risk Assessment | Risk Assessment | Partial |
| 7 | **Comprehensive Planning** | **Revenue Architecture** | **Revenue Architecture** | **WRONG** |
| 8 | **Problem Decomposition** | **Business Model Canvas** | **Business Model Canvas** | **WRONG** |
| 9 | **Gap Analysis** | **Exit Strategy** | **Exit Strategy** | **WRONG** |
| 10 | **Technical Review** | **Customer & Brand Foundation** | **Customer & Brand Foundation** | **WRONG** |
| 11 | Go-to-Market Strategy | Naming & Visual Identity | Naming & Visual Identity | Partial |
| 12 | Sales & Success Logic | GTM & Sales Strategy | GTM & Sales Strategy | Partial |
| 13-25 | Generally aligned | — | — | OK |

---

## Recommended SD Structure

### Orchestrator: SD-VENTURE-WORKFLOW-GUI-AUDIT-REMEDIATION-001

| Child | Pattern(s) | Scope | Prerequisite |
|-------|-----------|-------|--------------|
| A: Fix naming & config | P4, P13 | Update venture-workflow.ts to match canonical names/phases | None |
| B: Stage content rendering system | P1, P2, P9 | Architecture for loading stage-specific views with work-type distinction | H (wireframes) |
| C: Reuse gate renderers in venture detail | P11 | Surface existing gate renderers inside BuildingMode | A |
| D: Artifact content viewer | P3 | Render artifact content inline | None |
| E: Stage history navigation | P6 | Clickable timeline stages + operations drill-back | B |
| F: Toolbar cleanup | P5 | Remove or implement Share/Edit/Settings | None |
| G: Golden Nuggets UI | P10, P12 | Surface all 4 Golden Nuggets + phase transition gates | B |
| H: Wireframes for all 25 stages | P7 | Visual specs for every stage view | None (do first) |

### Separate Protocol SD

| SD | Pattern | Scope |
|----|---------|-------|
| LEO Protocol: Wireframe Gate | P8 | Add wireframe as required PLAN artifact + wireframe validation as EXEC QA gate |

---

## Audit Process (For Future Runs)

1. **Load stage spec**: stages_v2.yaml + stage-NN.js + stage-NN doc
2. **Load actual UI**: component code + venture-workflow.ts config
3. **Auto-audit against pattern catalog**: Check each known pattern ID
4. **Chairman review**: Direct observations and feedback
5. **Update pattern catalog**: New patterns get IDs; resolved patterns get marked
6. **Score**: Patterns resolved vs. open per stage; delta from previous audit

---

*Audit conducted 2026-03-09. Next audit recommended after Child SDs A, B, C complete.*
