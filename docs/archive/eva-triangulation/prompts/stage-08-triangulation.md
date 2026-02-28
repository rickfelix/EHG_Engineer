---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 8 "Business Model Canvas" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 8 of a 25-stage venture lifecycle -- the third stage of THE ENGINE phase.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- no kill gates, artifact-building
- **Stages 10-12**: THE IDENTITY (Branding/Naming)
- **Stages 13-15**: BUILD -- kill gate at 13

## Pipeline Context

**What comes BEFORE Stage 8** -- Stage 7 (Pricing):
- CLI: Tier structure, unit economics (LTV, CAC:LTV, payback), high-churn warnings.
- **Stage 7 triangulation consensus**: CLI will add `analysisStep` for pricing generation from Stages 4-6 context, explicit `pricingModel` enum (6 values), `primaryValueMetric`/`priceAnchor`, `competitiveContext` carry-through from Stage 4, `positioningDecision` (below_market/at_market/premium). CLI's clean unit economics formulas preserved.

**What Stage 8 does** -- Business Model Canvas:
- Populate all 9 standard BMC blocks with structured content.
- This is NOT a kill gate. It's an artifact-building stage.
- The BMC synthesizes everything from Stages 1-7 into a coherent business model.

**What comes AFTER Stage 8** -- Stage 9 (Exit Strategy):
- CLI: Exit thesis, exit pathways (IPO/acquisition/merger/partnership), Reality Gate requiring Stage 6 >= 10 risks.
- Stage 9 needs: the complete BMC to inform exit strategy, particularly Revenue Streams, Cost Structure, and Key Partnerships blocks.

## CLI Stage 8 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-08.js`

**9 BMC Blocks**: customerSegments, valuePropositions, channels, customerRelationships, revenueStreams, keyResources, keyActivities, keyPartnerships, costStructure

**Each block contains**: items[] with `text` (string, required), `priority` (integer 1-3, required), `evidence` (string, optional)

**Min items**: 2 per block (except keyPartnerships: 1)

**Derived**: Static `cross_links` array pointing to Stage 6 (Cost Structure ↔ Risk mitigations) and Stage 7 (Revenue Streams ↔ Pricing tiers)

**Key properties**:
- All blocks share identical item schema (text + priority + evidence)
- Priority field (1-3) enables item ranking
- Evidence field provides traceability
- No analysisSteps -- passive container
- No completeness scoring
- No recommendations engine
- No prior stage consumption

## GUI Stage 8 Implementation (Ground Truth)

**Component**: `src/components/stages/v2/Stage8BusinessModelCanvas.tsx` (594 lines)

**9 BMC Blocks**: Same 9 blocks as CLI, but items are simple string arrays (no priority, no evidence)

**Min items**: 1-2 per block (generally lower than CLI)

**Features**: 5-column CSS grid visual layout, per-block guiding prompts (2-4 questions each), completeness scoring (0-100%), 50% minimum threshold, real-time block-specific recommendations, cross-block alignment checks, draft saving, artifact versioning

**Prior stage inputs**: Stage 6 risk, Stage 7 pricing, Phase 1 data -- all passed as props but NONE are consumed or used

**No AI generation**: Purely manual entry with static recommendation engine

**Database**: `venture_artifacts` table (artifact_type: business_model_canvas)

## Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Item structure | text + priority + evidence | string[] (text only) |
| Min items per block | 2 (1 for partnerships) | 1-2 (varies, lower) |
| Completeness scoring | None (pass/fail) | 0-100% with 50% threshold |
| Recommendations | None | Real-time block + cross-block |
| Guiding prompts | None | 2-4 per block |
| Prior stage consumption | None | Passed but unused |
| AI generation | None | None |
| Priority/ranking | Yes (1-3) | No |
| Evidence tracking | Yes | No |

## Your Task

Analyze the gap between CLI and GUI for Stage 8, considering:

1. **BMC generation**: Neither CLI nor GUI generates BMC content automatically. Both are pure manual entry. Should Stage 8 have an `analysisStep` that synthesizes Stages 1-7 data into a draft BMC? This would be the single largest improvement.

2. **Item richness (priority + evidence)**: The CLI has priority (1-3) and evidence per item. The GUI has plain text only. Which approach better serves downstream stages (particularly Stage 9 Exit Strategy)?

3. **Completeness scoring**: The GUI scores 0-100% with a 50% minimum. The CLI does pass/fail validation. Should the CLI add completeness scoring, and what threshold?

4. **Recommendations/validation**: The GUI has block-specific and cross-block recommendations. The CLI has none. What validation should the CLI add?

5. **Prior stage consumption**: The GUI passes Stage 6/7/Phase 1 data but doesn't use it. Should the CLI actually consume this data? Specifically:
   - Stage 7 pricing model + tiers → Revenue Streams block
   - Stage 6 risk mitigations → Cost Structure block
   - Stage 4 competitors → Key Resources / Channels blocks
   - Stage 1 venture description → Value Propositions / Customer Segments

6. **Guiding prompts**: The GUI provides 2-4 questions per block to guide input. Should the CLI include these in the analysisStep prompt rather than in schema?

7. **Min items threshold**: CLI requires 2 items per block (1 for partnerships). GUI requires 1-2 (lower). What's the right threshold for LLM-generated content?

8. **Cross-links vs recommendations**: The CLI has static cross_links. The GUI has dynamic recommendations. Which pattern is better?

9. **Minimum viable change**: What's the smallest set of changes to make Stage 8 produce a useful BMC for Stage 9?

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

### 2. BMC Generation Recommendation
### 3. Item Structure Decision (priority + evidence)
### 4. Completeness Scoring Decision
### 5. Prior Stage Consumption Strategy
### 6. Recommendations/Validation Design
### 7. CLI Superiorities (preserve these)
### 8. Recommended Stage 8 Schema
### 9. Minimum Viable Change
### 10. Cross-Stage Impact
