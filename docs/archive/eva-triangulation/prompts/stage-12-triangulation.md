# EVA Venture Lifecycle -- Stage 12 "Sales Logic" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 12 of a 25-stage venture lifecycle -- the **final stage of THE IDENTITY phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- no kill gates
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13

## Cumulative Consensus (Stages 1-11)

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

**Established pattern**: Every stage from 2-11 adds an `analysisStep` that consumes prior stages and generates structured output. Stage 12 will follow this pattern. Focus on **what the analysisStep should produce** and **what's unique about sales logic design**.

## Pipeline Context

**What comes BEFORE Stage 12** -- Stage 11 (Go-To-Market):
- Per consensus: 3 market tiers with personas/pain_points, 8 channels with types/budgets/target_cac, funnel assumptions, coherence warnings.

**What Stage 12 does** -- Sales Logic:
- Final stage of THE IDENTITY phase. Phase transition from IDENTITY to BLUEPRINT.
- Define sales model, deal pipeline, funnel metrics, and customer journey.
- **Reality Gate**: Phase 3→4 transition check (Stages 10-12 completeness).
- This is the "how do we SELL to the customers we're reaching?" stage.

**What comes AFTER Stage 12** -- Stage 13 (Product Roadmap):
- Phase 4: THE BLUEPRINT begins.
- Stage 13 needs: complete Identity profile (name, GTM, sales process) to inform product roadmap prioritization.

## CLI Stage 12 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-12.js`

**Input**: sales_model (6-value enum: self-serve, inside-sales, enterprise, hybrid, marketplace, channel), sales_cycle_days, deal_stages[] (min 3: name, description, avg_duration_days), funnel_stages[] (min 4: name, metric, target_value), customer_journey[] (min 5: step, funnel_stage, touchpoint)

**Derived**: reality_gate (Phase 3→4 check: Stage 10 >=5 candidates, Stage 11 3 tiers + 8 channels, Stage 12 >=4 funnel stages + >=5 journey steps)

**Key properties**:
- 6-value sales_model enum (forces explicit model choice)
- Deal stages separate from funnel stages (pipeline vs metrics)
- Customer journey maps to funnel stages (traceability)
- Reality Gate is a pure exported function
- No conversion rates per stage
- No LTV/CAC/deal size tracking
- No success metrics with frequency/owner

## GUI Stage 12 Implementation (Ground Truth)

**Component**: `Stage12SalesSuccessLogic.tsx` (active per SSOT)

**Features**:
- 5 default pipeline stages (Lead → Qualified → Demo/Trial → Proposal → Closed Won) with conversion rates, time-in-stage, actions
- Success metrics: name, target, frequency (daily/weekly/monthly/quarterly), owner
- Customer journey milestones: stage, milestone, triggerAction, successCriteria
- Key metrics: salesCycle, avgDealSize, targetLtv, targetCac, LTV:CAC ratio
- No sales model enum
- No Reality Gate

## Your Task

Stage 12 is unique because it's both the **IDENTITY capstone** (answering "how do we sell?") AND the **Phase 3→4 transition gate**. The `analysisStep` will generate sales logic from Stages 1-11 (this is given). Focus on the **stage-specific design questions**:

1. **What should the analysisStep produce?** The LLM has the full venture context including GTM channels, pricing model, unit economics, and brand. What specific sales outputs should it generate?

2. **Sales model selection**: CLI has 6 options (self-serve through channel). How should the LLM select the right model? What prior stage data drives this choice?

3. **Deal stages vs funnel stages**: CLI separates these (deal = pipeline progression, funnel = metric tracking). The GUI merges them into pipeline stages with conversion rates. Which approach is better?

4. **Conversion rates**: GUI has per-stage conversion rates. CLI has none (just funnel metrics). Should conversion rates be added to deal stages?

5. **Sales metrics (deal size, LTV, CAC)**: CLI tracks these only through funnel target_values. The GUI has explicit fields. At IDENTITY phase, what metrics belong here vs what's already captured in Stage 5/7/11?

6. **Customer journey structure**: CLI maps journey steps to funnel stages with touchpoints. GUI has milestone-based journey with triggers and success criteria. What's the right model?

7. **Reality Gate assessment**: CLI's Reality Gate checks Phase 3→4 completeness (Stages 10-12). Is this the right scope? Should the gate be enhanced given all the new consensus additions (brand decision, channel coherence, etc.)?

8. **Stage 11 → 12 consumption**: How should GTM channels inform sales logic? Does channel_type (paid/organic/etc.) affect the sales model? Do personas/pain_points from tiers drive deal stage design?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions. Does Stage 12's design require changes to earlier stages (1-11)?

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
### 3. Sales Model Selection Logic
### 4. Deal Stages vs Funnel Stages Decision
### 5. Conversion Rates Decision
### 6. Sales Metrics Decision
### 7. Customer Journey Design
### 8. Reality Gate Enhancement
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 12 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-11 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
