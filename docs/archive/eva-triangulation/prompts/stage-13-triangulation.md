---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 13 "Product Roadmap" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 13 of a 25-stage venture lifecycle -- the **first stage of THE BLUEPRINT phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT (Product/Architecture/Resources/Financials) -- **kill gate at 13**
- **Stages 17-22**: THE BUILD LOOP
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-12)

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

**Established pattern**: Every stage from 2-12 adds an `analysisStep` that consumes prior stages and generates structured output. Stage 13 will follow this pattern. Focus on **what the analysisStep should produce** and **what's unique about a Product Roadmap at the BLUEPRINT phase**.

## Pipeline Context

**What comes BEFORE Stage 13** -- Stage 12 (Sales Logic) + Reality Gate:
- Per consensus: sales_model (6-value enum), deal stages with mapped_funnel_stage, funnel stages with conversion_rate_estimate, customer journey with trigger + touchpoint_type, avg_deal_size. Reality Gate validates Phase 3→4 transition including Economy Check (funnel volume × conversion × price ≥ revenue target).

**What Stage 13 does** -- Product Roadmap:
- First stage of THE BLUEPRINT phase. Phase transition already cleared by Stage 12 Reality Gate.
- Define the product vision, milestones, deliverables, and timeline.
- **Kill Gate**: Blocks progression if roadmap is insufficient (< 3 milestones, missing deliverables, < 3 months timeline).
- This is the "what are we BUILDING and when?" stage.

**What comes AFTER Stage 13** -- Stage 14 (Technical Architecture):
- Stage 14 needs: product roadmap (features, priorities, timeline) to inform architecture decisions.

## CLI Stage 13 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-13.js`

**Input**: vision_statement (string, min 20 chars), milestones[] (min 3: name, date, deliverables[], dependencies[]), phases[] (min 1: name, start_date, end_date)

**Derived**: timeline_months (from earliest/latest milestone dates), milestone_count, decision (pass/kill), blockProgression, reasons[]

**Kill Gate**: Deterministic. Kill if < 3 milestones, any milestone missing deliverables, or timeline < 3 months.

**Key properties**:
- Clean milestone/phase structure
- Deterministic kill gate as pure exported function
- Date-based timeline computation
- No analysisStep (all user-provided)
- No feature prioritization (no priority on milestones/deliverables)
- No resource estimation (no effort, team size, cost)
- No connection to prior stages (Identity data doesn't inform roadmap)
- No dependency graph (just flat array)
- Deliverables are untyped strings (no feature/epic/story taxonomy)

## GUI Stage 13 Implementation (Ground Truth)

**No GUI Stage 13 component exists.** The GUI was only built through Stage 12.

The GUI's original design planned stages 13-16 as a developer-centric flow (Tech Stack Interrogation → Data Model → Epic/Story Breakdown → Schema Completeness). This is completely different from the CLI's business-centric flow (Product Roadmap → Technical Architecture → Resource Planning → Financial Projections). The CLI mapping is authoritative.

## Your Task

Stage 13 is unique because it's the **BLUEPRINT opener** and the venture's **first kill gate after passing Identity**. The venture has a validated business case (Stages 1-5), operating model (6-9), and market identity (10-12). Now it must prove it has a credible product plan. The CLI template is notably bare compared to earlier stages -- this is the main challenge.

1. **What should the analysisStep produce?** The LLM has 12 stages of validated venture data. What specific product roadmap outputs should it generate? How does the sales model, GTM plan, pricing, and brand inform product milestones?

2. **Milestone structure**: CLI has basic name/date/deliverables/dependencies. What's missing for a credible product roadmap? Should deliverables be typed (feature, integration, infrastructure)? Should milestones have priority, effort, or risk?

3. **Feature prioritization**: CLI has none. Should the roadmap include a prioritization framework? If so, what's appropriate at BLUEPRINT phase -- full RICE/MoSCoW or something lighter?

4. **Dependency management**: CLI has a flat dependencies array per milestone. Is this sufficient? Should there be a proper DAG (directed acyclic graph) or is that over-engineering at this phase?

5. **Sales model → roadmap alignment**: Stage 12 consensus established a sales_model (self-serve, enterprise, etc.). How should this influence the roadmap? Self-serve needs onboarding/activation features; enterprise needs admin/security/compliance.

6. **Kill Gate assessment**: Current gate checks milestone count (≥3), deliverable presence, and timeline (≥3 months). Is this rigorous enough for a BLUEPRINT kill gate? What would make a roadmap truly "insufficient"?

7. **Phase structure**: CLI has separate phases (name, start_date, end_date) alongside milestones. Is this redundant? Should phases group milestones, or are they independent?

8. **Resource/effort estimation**: CLI has none. At BLUEPRINT phase, should milestones include effort estimates (person-weeks, team size)? Or is that Stage 15's job?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions. Does Stage 13's design require changes to earlier stages (1-12)?

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
### 3. Milestone Structure Decision
### 4. Feature Prioritization Decision
### 5. Dependency Management Decision
### 6. Sales Model → Roadmap Alignment
### 7. Kill Gate Enhancement
### 8. Phase Structure Decision
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 13 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-12 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
