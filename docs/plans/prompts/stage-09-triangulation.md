# EVA Venture Lifecycle -- Stage 9 "Exit Strategy" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 9 of a 25-stage venture lifecycle -- the **final stage of THE ENGINE phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- no kill gates, artifact-building
- **Stages 10-12**: THE IDENTITY (Branding/Naming)
- **Stages 13-15**: BUILD -- kill gate at 13

## Cumulative Consensus (Stages 1-8)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------|
| 1 (Venture Entry) | Add `problemStatement`, `keyAssumptions`. Wire Stage 0 synthesis output. CLI's Stage 0 is superior to GUI. |
| 2 (AI Review) | Add `analysisStep` for AI score generation. Keep Devil's Advocate as separate adversarial step. |
| 3 (Market Validation) | Add `analysisStep` for hybrid deterministic+AI scoring. 6-metric structure (superior to GUI's 3). Raise per-metric floor to 50. Hard kill gate. |
| 4 (Competitive Intel) | Add `analysisStep` for competitor enrichment. Add pricingModel, pricingTiers, competitiveIntensity. Stage 5 handoff artifact. |
| 5 (Profitability) | Add `analysisStep` for financial model generation. 25% ROI threshold with banded decision. Unit economics (CAC, LTV, churn, payback). |
| 6 (Risk Matrix) | Add `analysisStep` for risk generation (10-15 risks). 2-factor scoring (probability × consequence). Aggregate metrics. Auto-seed from Stage 5. |
| 7 (Pricing) | Add `analysisStep` consuming Stages 4-6. 6-model pricing enum. Value metrics. Competitive positioning. Preserve CLI unit economics. |
| 8 (BMC) | Add `analysisStep` generating 9-block BMC from Stages 1-7. Preserve priority (1-3) + evidence per item. Cross-block validation warnings. |

**Established pattern**: Every stage from 2-8 adds an `analysisStep` that consumes prior stages and generates structured output. Stage 9 will follow this pattern. Focus your analysis on **what the analysisStep should produce** and **what's unique about exit strategy design**, not whether an analysisStep is needed.

## Pipeline Context

**What comes BEFORE Stage 9** -- Stage 8 (BMC):
- Per consensus: 9 BMC blocks with text + priority + evidence, generated from Stages 1-7. Cross-block validation warnings.

**What Stage 9 does** -- Exit Strategy:
- Define exit thesis, pathways, target acquirers, milestones.
- Evaluate Phase 2 → Phase 3 Reality Gate (Stages 6-8 completeness check).
- This is the FINAL stage of THE ENGINE phase. It's the capstone that answers: "What's the endgame?"
- After Stage 9, the venture moves to THE IDENTITY (naming/branding).

**What comes AFTER Stage 9** -- Stage 10 (Naming/Brand):
- Phase 3 -- THE IDENTITY begins.
- Stage 10 needs: business model understanding, exit strategy, target market, and buyer audience to inform naming decisions.

## CLI Stage 9 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-09.js`

**Input**: exit_thesis, exit_horizon_months (1-120), exit_paths[] (type, description, probability_pct), target_acquirers[] (name, rationale, fit_score 1-5, min 3), milestones[] (date, success_criteria)

**Reality Gate**: `evaluateRealityGate({ stage06, stage07, stage08 })` -- pure exported function checking:
- Stage 06: >= 10 risks captured
- Stage 07: >= 1 tier with non-null LTV and payback
- Stage 08: All 9 BMC blocks populated

**Key properties**:
- Exit path types are freeform strings (not enum)
- No valuation methods (no DCF, multiples, comps)
- No exit readiness checklist
- No buyer type classification
- Reality Gate is explicit with blockers and required_next_actions
- `evaluateRealityGate` is a pure exported function (testable, no side effects)

## GUI Stage 9 Implementation (Ground Truth)

**Component**: `src/components/stages/v2/Stage9ExitStrategy.tsx` (1,043 lines)

**6 Exit Types**: acquisition, ipo, merger, strategic_sale, mbo, liquidation
**4 Buyer Types**: strategic, financial, competitor, private_equity
**4 Valuation Methods**: revenue_multiple, ebitda_multiple, dcf, comparable_transactions
**Exit Readiness Checklist**: 6 categories (financials, legal, technical, operational, governance, documentation), A-F grading
**AI Features**: assessReadiness(), generateImprovementPlan(), analyzeExitTiming(), identifyBuyers()
**Database**: 4 dedicated tables (exit_readiness_tracking, exit_improvement_plans, exit_opportunities, buyer_candidates)
**Rich scenario fields**: buyerType, targetValuation, targetMultiple, keyRequirements[], risks[], notes

## Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Exit types | Freeform string | 6 explicit enum types |
| Buyer types | None | 4 enum types |
| Valuation methods | None | 4 methods with comparable transactions |
| Target acquirers | 3 min, fit_score (1-5) | Detailed buyer DB with outreach tracking |
| Exit readiness | None | 6-category checklist, A-F grading |
| Milestones | date + criteria | date + status + dependencies + owner |
| Reality Gate | Explicit Stage 6/7/8 checks | None (exit grade substitutes) |
| AI generation | None | 4 AI-powered functions |
| Database tables | None | 4 dedicated tables |

## Your Task

Stage 9 is unique because it's the **ENGINE capstone** -- it synthesizes everything into an exit thesis. The `analysisStep` will generate exit strategy content from Stages 1-8 (this is given). Focus on the **stage-specific design questions**:

1. **What should the analysisStep produce?** The LLM will have Stages 1-8 as context. What specific exit strategy outputs should it generate? How should BMC blocks map to exit strategy components (e.g., Revenue Streams → valuation, Key Partnerships → acquirer targets)?

2. **Exit type enumeration**: Should exit paths use an enum (and which values), or stay freeform? Consider downstream parsing needs.

3. **Valuation at evaluation stage**: The GUI has 4 valuation methods. At the BLUEPRINT phase (not execution), what level of valuation is appropriate? Revenue multiples only? None? Full suite?

4. **Exit readiness: evaluation vs execution concern?** The GUI's 6-category readiness checklist (financials, legal, technical, etc.) -- is this an evaluation-stage concern or does it belong in BUILD (Stage 13+)?

5. **Reality Gate vs Exit Grade**: The CLI's Reality Gate checks Stage 6/7/8 completeness with explicit blockers and next actions. The GUI uses an A-F exit grade. Which approach is better for Phase 2 → Phase 3 transition? Can they be combined?

6. **Buyer type classification**: Should target_acquirers have a buyer_type enum? Does the distinction between strategic/financial/competitor/PE matter at evaluation stage?

7. **Stage 8 → 9 consumption**: How specifically should the BMC inform exit strategy? Map the 9 BMC blocks to exit strategy components.

8. **Milestone scope**: At evaluation, milestones are "what must happen before exit." CLI has date + success_criteria. GUI adds status/dependencies/owner. What's the right level?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions. Does Stage 9's design require changes to earlier stages (1-8) that haven't been accounted for? For example:
- Does Stage 9 need data from Stage 5 that the Stage 5 consensus didn't include?
- Does the Reality Gate need updating based on Stage 6/7/8 consensus changes?

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

### 2. AnalysisStep Design (inputs, BMC mapping, outputs)
### 3. Exit Type & Buyer Type Decisions
### 4. Valuation Approach (what level for BLUEPRINT phase?)
### 5. Exit Readiness: Include or Defer to BUILD?
### 6. Reality Gate Assessment
### 7. CLI Superiorities (preserve these)
### 8. Recommended Stage 9 Schema
### 9. Minimum Viable Change (priority-ordered)
### 10. Cross-Stage Impact
### 11. Dependency Conflicts (with Stages 1-8 decisions)
### 12. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
