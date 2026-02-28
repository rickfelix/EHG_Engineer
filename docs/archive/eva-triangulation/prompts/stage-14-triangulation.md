---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 14 "Technical Architecture" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 14 of a 25-stage venture lifecycle -- the **second stage of THE BLUEPRINT phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT (Product/Architecture/Resources/Financials) -- kill gate at 13
- **Stages 17-22**: THE BUILD LOOP
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-13)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------|
| 1 (Venture Entry) | Add `problemStatement`, `keyAssumptions`. Wire Stage 0 synthesis output. |
| 2 (AI Review) | Add `analysisStep` for AI score generation. Keep Devil's Advocate. |
| 3 (Market Validation) | Add `analysisStep` for hybrid scoring. 6-metric structure. Per-metric floor 50. Hard kill gate. |
| 4 (Competitive Intel) | Add `analysisStep` for competitor enrichment. pricingModel, competitiveIntensity. |
| 5 (Profitability) | Add `analysisStep` for financial model. 25% ROI threshold. Unit economics (CAC, LTV, churn, payback). |
| 6 (Risk Matrix) | Add `analysisStep` for risk generation. 2-factor scoring. Auto-seed from Stage 5. |
| 7 (Pricing) | Add `analysisStep` consuming Stages 4-6. 6-model pricing enum. Value metrics. |
| 8 (BMC) | Add `analysisStep` generating 9-block BMC. Priority + evidence per item. |
| 9 (Exit Strategy) | Add `analysisStep`. 5-type exit enum. 4-type buyer enum. Revenue multiple valuation range. PRESERVE Reality Gate. |
| 10 (Naming/Brand) | Add `analysisStep` for brand genome + name candidates. Narrative extension. naming_strategy enum. Decision object with working_title. |
| 11 (Go-To-Market) | Add `analysisStep`. Keep exactly 3 tiers + 8 channels (allow $0 budget). channel_type enum. persona + pain_points. target_cac. Coherence warnings (CAC vs LTV). |
| 12 (Sales Logic) | Add `analysisStep`. Keep 6-value sales_model enum. Keep deal/funnel separation. conversion_rate_estimate on funnel_stages. mapped_funnel_stage on deal_stages. trigger + touchpoint_type on journey. avg_deal_size. Economy Check in Reality Gate. |
| 13 (Product Roadmap) | Add `analysisStep`. now/next/later priority on milestones. Typed deliverables (feature/infrastructure/integration/content). Milestone type (release/validation/infrastructure/compliance). phase_ref + goal on phases. outcomes[] linking to Stage 3/5. Enhanced kill gate with density + coherence checks. |

**Established pattern**: Every stage from 2-13 adds an `analysisStep` that consumes prior stages and generates structured output. Stage 14 will follow this pattern.

## Pipeline Context

**What comes BEFORE Stage 14** -- Stage 13 (Product Roadmap):
- Per consensus: vision_statement, milestones with typed deliverables (feature/infrastructure/integration/content), priority (now/next/later), phase_ref, outcomes[]. Kill gate ensures milestone quality.

**What Stage 14 does** -- Technical Architecture:
- Define the technology stack, architecture layers, integration points, and constraints.
- This is the "what technologies do we USE and how do they fit together?" stage.

**What comes AFTER Stage 14** -- Stage 15 (Resource Planning):
- Stage 15 needs: architecture decisions (technology choices, component count, complexity) to estimate team composition and resource requirements.

## CLI Stage 14 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-14.js`

**Input**: architecture_summary (string, min 20 chars), layers (object with 4 required layers: frontend/backend/data/infra, each with technology, components[], rationale), integration_points[] (min 1: name, source_layer, target_layer, protocol), constraints[] (optional: name, description)

**Derived**: layer_count, total_components, all_layers_defined

**Key properties**:
- Fixed 4-layer model (frontend, backend, data, infra)
- Technology + rationale per layer
- Components per layer
- Integration points with protocols
- No analysisStep
- No kill gate
- No connection to Stage 13 product roadmap
- No security/compliance architecture
- No scalability/performance considerations
- No cost implications of technology choices

## GUI Stage 14 Implementation (Ground Truth)

**Component**: `Stage14DataModelArchitecture.tsx` + `Stage14ERDBuilder.tsx`

**Scope**: GUI Stage 14 is a **data model builder** (entities, fields, relationships, data flows), NOT a general technical architecture template. It is narrower but deeper than the CLI.

**Features**:
- Entity builder with typed fields, primary keys, foreign keys, RLS policies
- Relationship modeling (one-to-one, one-to-many, many-to-many)
- Data flow definitions (source, destination, frequency)
- Visual ERD builder
- Database choice
- Architecture notes (free text)

**Key difference**: GUI focuses exclusively on the data layer. CLI covers all 4 layers but lacks data modeling depth.

## Your Task

Stage 14 sits between the product roadmap (what to build) and resource planning (who builds it). It must translate product features into technical decisions. The CLI template is generic -- the same 4 layers regardless of venture type.

1. **What should the analysisStep produce?** The LLM has the product roadmap (typed deliverables, priorities) and the full venture context. What specific architecture outputs should it generate?

2. **4-layer model**: CLI mandates frontend/backend/data/infra. Is this the right decomposition? What about security, DevOps/CI-CD, monitoring, mobile? Should layers be dynamic based on the product roadmap?

3. **Stage 13 → 14 consumption**: How should product roadmap deliverables inform architecture? A "feature" deliverable needs application architecture. An "infrastructure" deliverable needs DevOps. An "integration" deliverable needs API design. Should deliverable types map to architecture layers?

4. **Data modeling depth**: GUI has entity/field/relationship modeling. CLI has nothing at the data level beyond "data layer technology + components." Should Stage 14 include data model design? Or is that implementation detail?

5. **Security/compliance architecture**: Stage 12's sales_model might require enterprise security (SSO, RBAC, audit logs). Should Stage 14 include security architecture? Or is the 4-layer model sufficient?

6. **Integration points**: CLI has source/target layer + protocol. Is this sufficient? Should integration points connect to Stage 13 integration-type deliverables?

7. **Technology constraints**: CLI has generic constraints. Should these be categorized (performance, security, compliance, budget)?

8. **Scalability considerations**: Neither CLI nor GUI addresses scalability architecture. At BLUEPRINT phase, should the architecture include scaling strategy (horizontal/vertical, caching, CDN)?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions. Does Stage 14's design require changes to earlier stages (1-13)?

## Gap Importance Rubric

| Score | Label | Criteria |
|-------|-------|----------|
| 5 | **Critical** | Without closing this gap, the stage cannot function or produces incorrect downstream decisions |
| 4 | **High** | Significantly degrades downstream stage quality |
| 3 | **Medium** | Improves quality but the stage can function without it |
| 2 | **Low** | Nice to have; minimal impact on pipeline correctness |
| 1 | **Cosmetic** | UX or presentation concern with no analytical impact |

**For each gap, also challenge**: Does this gap truly need to be closed, or does the CLI's existing infrastructure already address it differently?

## Output Format

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |

### 2. AnalysisStep Design (inputs, prior stage mapping, outputs)
### 3. Layer Model Decision
### 4. Stage 13 → 14 Consumption Mapping
### 5. Data Modeling Depth Decision
### 6. Security/Compliance Architecture Decision
### 7. Integration Points Enhancement
### 8. Constraint Categorization Decision
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 14 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-13 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
