# EVA Venture Lifecycle -- Stage 9 "Exit Strategy" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 9 of a 25-stage venture lifecycle -- the final stage of THE ENGINE phase.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- no kill gates, artifact-building
- **Stages 10-12**: THE IDENTITY (Branding/Naming)
- **Stages 13-15**: BUILD -- kill gate at 13

## Pipeline Context

**What comes BEFORE Stage 9** -- Stage 8 (Business Model Canvas):
- CLI: 9 BMC blocks with text + priority + evidence per item, pass/fail validation.
- **Stage 8 triangulation consensus**: CLI will add `analysisStep` generating complete BMC from Stages 1-7 with evidence citations per item. Preserve priority (1-3) and evidence fields. Add cross-block validation warnings. Every generated item traces back to source stage.

**What Stage 9 does** -- Exit Strategy:
- Define exit thesis, pathways, target acquirers, milestones.
- Evaluate Phase 2 → Phase 3 Reality Gate (Stages 6-8 completeness check).
- This is the FINAL stage of THE ENGINE phase.
- After Stage 9, the venture moves to THE IDENTITY (naming/branding).

**What comes AFTER Stage 9** -- Stage 10 (Naming/Brand):
- CLI: Phase 3 -- THE IDENTITY begins.
- Stage 10 needs: understanding of the business model, exit strategy, and target market to inform naming decisions.

## CLI Stage 9 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-09.js`

**Input**: exit_thesis, exit_horizon_months (1-120), exit_paths[] (type, description, probability_pct), target_acquirers[] (name, rationale, fit_score 1-5, min 3), milestones[] (date, success_criteria)

**Reality Gate**: `evaluateRealityGate({ stage06, stage07, stage08 })` -- pure function checking:
- Stage 06: >= 10 risks captured
- Stage 07: >= 1 tier with non-null LTV and payback
- Stage 08: All 9 BMC blocks populated

**Key properties**:
- Exit path types are freeform strings (not enum)
- No valuation methods (no DCF, multiples, comps)
- No exit readiness checklist
- No AI generation
- No buyer type classification
- Reality Gate is explicit with blockers and required_next_actions
- `evaluateRealityGate` is pure exported function (testable)

## GUI Stage 9 Implementation (Ground Truth)

**Component**: `src/components/stages/v2/Stage9ExitStrategy.tsx` (1,043 lines)

**6 Exit Types**: acquisition, ipo, merger, strategic_sale, mbo, liquidation

**4 Buyer Types**: strategic, financial, competitor, private_equity

**4 Valuation Methods**: revenue_multiple, ebitda_multiple, dcf, comparable_transactions

**Exit Readiness Checklist**: 6 categories (financials, legal, technical, operational, governance, documentation), A-F grading

**AI Features**: assessReadiness(), generateImprovementPlan(), analyzeExitTiming(), identifyBuyers()

**Database**: exit_readiness_tracking, exit_improvement_plans, exit_opportunities, buyer_candidates (4 dedicated tables)

**4 UI tabs**: Scenarios, Valuation, Timeline, Readiness

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
| Reality Gate | Stage 6/7/8 checks | None (exit grade substitutes) |
| AI generation | None | 4 AI-powered functions |
| Database tables | None | 4 dedicated tables |

## Your Task

Analyze the gap between CLI and GUI for Stage 9, considering:

1. **Exit type enumeration**: CLI uses freeform strings for exit path types. GUI has 6 explicit types (acquisition, ipo, merger, strategic_sale, mbo, liquidation). Should the CLI use an enum for consistency and downstream parsing?

2. **Valuation methods**: The GUI supports 4 valuation methods with multiples and comparables. The CLI has none. At the venture EVALUATION stage (not execution), should the CLI include valuation estimates?

3. **Exit readiness checklist**: The GUI has a 6-category readiness checklist with A-F grading. The CLI has none. Does venture evaluation need an exit readiness assessment?

4. **Buyer type classification**: The GUI classifies buyers as strategic/financial/competitor/PE. The CLI has name + rationale + fit_score only. Does buyer classification matter at the evaluation stage?

5. **AI generation**: The GUI has 4 AI functions (readiness, plans, timing, buyers). The CLI has nothing. Should Stage 9 have an `analysisStep` for exit strategy generation?

6. **Reality Gate vs Exit Grade**: The CLI has an explicit Reality Gate checking Stages 6-8 completeness. The GUI has an exit grade (A-F). Which approach is better for the Phase 2 → Phase 3 transition?

7. **Database complexity**: The GUI has 4 dedicated tables for exit tracking. The CLI has none (stage template only). Is this level of persistence needed at the evaluation stage?

8. **Milestone richness**: CLI has date + success_criteria. GUI adds status, dependencies, and owner. What level of milestone detail serves the evaluation stage?

9. **Stage 8 consumption**: How should Stage 9 consume the BMC? Revenue Streams → exit valuation, Key Partnerships → potential acquirers, Cost Structure → valuation adjustments.

10. **Minimum viable change**: What's the smallest set of changes to make Stage 9 produce a useful exit strategy for downstream stages?

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

### 2. Exit Strategy Generation Recommendation
### 3. Exit Type Enumeration Decision
### 4. Valuation Methods Decision
### 5. Exit Readiness Decision
### 6. Reality Gate vs Exit Grade
### 7. Stage 8 → Stage 9 Consumption
### 8. CLI Superiorities (preserve these)
### 9. Recommended Stage 9 Schema
### 10. Minimum Viable Change
### 11. Cross-Stage Impact
