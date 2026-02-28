---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 11 "Go-To-Market" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 11 of a 25-stage venture lifecycle -- the **second stage of THE IDENTITY phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- no kill gates, artifact-building
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- no kill gates
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13

## Cumulative Consensus (Stages 1-10)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------|
| 1 (Venture Entry) | Add `problemStatement`, `keyAssumptions`. Wire Stage 0 synthesis output. CLI's Stage 0 is superior to GUI. |
| 2 (AI Review) | Add `analysisStep` for AI score generation. Keep Devil's Advocate as separate adversarial step. |
| 3 (Market Validation) | Add `analysisStep` for hybrid deterministic+AI scoring. 6-metric structure (superior to GUI's 3). Raise per-metric floor to 50. Hard kill gate. |
| 4 (Competitive Intel) | Add `analysisStep` for competitor enrichment. Add pricingModel, pricingTiers, competitiveIntensity. Stage 5 handoff artifact. |
| 5 (Profitability) | Add `analysisStep` for financial model generation. 25% ROI threshold with banded decision. Unit economics (CAC, LTV, churn, payback). |
| 6 (Risk Matrix) | Add `analysisStep` for risk generation (10-15 risks). 2-factor scoring (probability x consequence). Aggregate metrics. Auto-seed from Stage 5. |
| 7 (Pricing) | Add `analysisStep` consuming Stages 4-6. 6-model pricing enum. Value metrics. Competitive positioning. Preserve CLI unit economics. |
| 8 (BMC) | Add `analysisStep` generating 9-block BMC from Stages 1-7. Preserve priority (1-3) + evidence per item. Cross-block validation warnings. |
| 9 (Exit Strategy) | Add `analysisStep` consuming Stages 1-8. 5-type exit enum. 4-type buyer enum. Revenue multiple valuation range. PRESERVE Reality Gate. ELIMINATE exit readiness. |
| 10 (Naming/Brand) | Add `analysisStep` generating brand genome + name candidates. Narrative extension (vision/mission/voice). naming_strategy enum. Availability placeholders. Decision object with working_title. CLI stage scope correct (GUI mixes in technical review). |

**Established pattern**: Every stage from 2-10 adds an `analysisStep` that consumes prior stages and generates structured output. Stage 11 will follow this pattern. Focus your analysis on **what the analysisStep should produce** and **what's unique about GTM planning**, not whether an analysisStep is needed.

## Pipeline Context

**What comes BEFORE Stage 11** -- Stage 10 (Naming/Brand):
- Per consensus: brand genome (archetype, values, tone, audience, differentiators + narrative extension), named venture (selected candidate with working_title option), scoring criteria.
- The venture now HAS a name and brand identity.

**What Stage 11 does** -- Go-To-Market:
- Define target market tiers (TAM/SAM/SOM).
- Allocate acquisition channels with budgets and CAC.
- Build launch timeline with milestones.
- This is the "how do we reach customers?" stage.

**What comes AFTER Stage 11** -- Stage 12 (Sales Logic):
- Stage 12 needs: GTM channels, target segments, pricing context, and brand positioning to define sales process, conversion funnels, and sales team requirements.

## CLI Stage 11 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-11.js`

**Input**: tiers[] (exactly 3: name, description, TAM, SAM, SOM), channels[] (exactly 8: name, monthly_budget, expected_cac, primary_kpi), launch_timeline[] (milestone, date, owner)

**Derived**: total_monthly_budget, avg_cac

**12 predefined channel names**: Organic Search, Paid Search, Social Media, Content Marketing, Email Marketing, Partnerships, Events, Direct Sales, Referrals, PR/Media, Influencer Marketing, Community

**Key properties**:
- Exactly 3 tiers required (forces prioritization)
- Exactly 8 channels required (forces breadth)
- Per-channel budget + CAC + KPI
- No channel type classification
- No segment personas or pain points
- No conversion rate estimates
- No GTM metrics beyond budget/CAC

## GUI Stage 11 Implementation (Ground Truth)

**Component**: `Stage11GtmStrategy.tsx` (active per SSOT)

**Input**: Target markets (name, size, priority, characteristics), acquisition channels (channel, strategy, budget, expectedCac, selected), launch timeline (milestone, targetDate, status), launch date, gtmApproach

**Output viewer** (Stage11Viewer.tsx -- richer schema):
- Marketing channels with: type (paid/organic/earned/owned), priority (primary/secondary/experimental), budget_allocation_pct, expected_reach, tactics[]
- Target segments with: persona, pain_points[], acquisition_channels[], estimated_conversion_pct
- GTM metrics: total_marketing_budget, expected_leads_first_quarter, target_conversion_rate, expected_customers_year_one, cac_target
- Decision: ADVANCE / REVISE / REJECT

## Your Task

Stage 11 is unique because it bridges **identity to execution** -- the named venture now needs a market entry plan. The `analysisStep` will generate GTM strategy from Stages 1-10 (this is given). Focus on the **stage-specific design questions**:

1. **What should the analysisStep produce?** The LLM will have the full venture context (Stages 1-10) including the brand identity, pricing model, unit economics, competitive landscape, and exit strategy. What specific GTM outputs should it generate?

2. **Fixed counts (3 tiers, 8 channels) vs flexible**: CLI requires exactly 3 tiers and 8 channels. Is this rigidity a feature (forces discipline) or a limitation? Should it be relaxed?

3. **Channel classification**: The GUI classifies channels as paid/organic/earned/owned. Does this classification add analytical value or is it cosmetic at the IDENTITY phase?

4. **Segment depth**: CLI tiers have name + description + TAM/SAM/SOM. GUI adds persona, pain_points[], estimated_conversion_pct. What level of segment detail is appropriate?

5. **GTM metrics**: CLI only derives total_budget and avg_cac. The GUI has leads, conversion rate, year-one customers. What metrics matter at the IDENTITY phase vs BUILD?

6. **Stage 10 → 11 consumption**: How should the brand identity inform GTM? Does the brand archetype/tone determine channel selection? Does the exit strategy buyer_type affect channel mix?

7. **Launch timeline richness**: CLI has milestone + date + owner. GUI adds status, objectives[], success_metrics[]. What's appropriate for evaluation vs execution?

8. **Budget-to-pricing coherence**: Stage 7 has pricing/unit economics, Stage 11 has channel budgets/CAC. Should there be a cross-validation check (e.g., CAC < LTV from Stage 7)?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions. Does Stage 11's design require changes to earlier stages (1-10) that haven't been accounted for?

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
### 3. Fixed Counts vs Flexible Decision
### 4. Channel Classification Decision
### 5. Segment Depth Decision
### 6. GTM Metrics Decision
### 7. Stage 10 → 11 Consumption Mapping
### 8. Budget-Pricing Coherence Check
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 11 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-10 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
