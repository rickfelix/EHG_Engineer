# EVA Venture Lifecycle -- Stage 6 "Risk Matrix" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated (may persist as read-only dashboard). We need to identify what the CLI is missing relative to the GUI, what the CLI does better, and what minimum changes would make the CLI self-sufficient.

This is Stage 6 of a 25-stage venture lifecycle -- the first stage of the BLUEPRINT phase ("THE ENGINE").
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- includes kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- no kill gates, artifact-building
- **Stages 10-12**: THE IDENTITY (Branding/Naming)
- **Stages 13-15**: BUILD (Development) -- kill gate at 13
- **Stages 16-20**: LAUNCH
- **Stages 21-25**: GROWTH

## Pipeline Context

**What comes BEFORE Stage 6** -- Stage 5 (Profitability, second kill gate):
- CLI: 3-year financial model, ROI/break-even kill gate, hard block enforcement.
- GUI: AI-powered profitability forecasting, unit economics, scenario analysis, recursion to Stage 3 on fail.
- **Stage 5 triangulation consensus**: CLI will add `analysisStep` for LLM financial model generation, 25% ROI threshold with banded decision, unit economics as derived fields (CAC, LTV, LTV:CAC, payback, churn, gross margin), lightweight scenario spread (pessimistic/optimistic), Stage 4 `stage5Handoff` consumption. Kill behavior: hard block with `remediationRoute` metadata. No recursion.
- **Key**: Any venture reaching Stage 6 has passed BOTH kill gates (Stage 3 viability + Stage 5 profitability). The venture is validated as viable and financially promising.

**What Stage 6 does** -- Risk Matrix:
- This is NOT a kill gate. It's the first artifact-building stage after validation.
- Its purpose: identify, classify, score, and plan mitigations for all venture risks.
- Risk data informs all subsequent stages, especially Stage 9 (Exit Strategy) which has a "Reality Gate" that checks Stage 6 captured >= 10 risks.

**What comes AFTER Stage 6** -- Stage 7 (Pricing):
- CLI: Pricing tier structure with unit economics (CAC, LTV, payback, churn). Handles zero-churn edge case.
- GUI: Pricing strategy with 7 pricing models, tier structure, competitor analysis, value metrics, projections.
- Stage 7 needs: risk context to inform pricing decisions (e.g., "high market risk" → conservative pricing, "low competitive risk" → premium pricing possible).

## CLI Stage 6 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-06.js` -- Active `computeDerived()`

**Risk Categories** (6): Market, Product, Technical, Legal/Compliance, Financial, Operational

**Risk Schema** (per risk item):
- `id` (string, required) -- unique identifier
- `category` (enum, required) -- one of 6 categories
- `description` (string, minLength: 10, required)
- `severity` (integer 1-5, required)
- `probability` (integer 1-5, required)
- `impact` (integer 1-5, required)
- `score` (derived: severity × probability × impact, 1-125 range)
- `mitigation` (string, minLength: 10, required) -- mitigation plan
- `owner` (string, required) -- risk owner
- `status` (enum: open/mitigated/accepted/closed, required)
- `review_date` (string, required) -- scheduled review
- `residual_severity` (integer 1-5, optional) -- post-mitigation
- `residual_probability` (integer 1-5, optional) -- post-mitigation
- `residual_impact` (integer 1-5, optional) -- post-mitigation
- `residual_score` (derived: residual severity × probability × impact, optional)

**Processing**:
- `validate(data)`: Validates risks array (minItems: 1), all required fields per risk, enum values, integer ranges, optional residual fields
- `computeDerived(data)`: Computes `score` and `residual_score` per risk
- **No `analysisSteps`** -- risks must be provided externally
- **No aggregate metrics** -- no overall risk score, no risk distribution summary
- **No kill gate** -- information-gathering only

**Source files**:
- `lib/eva/stage-templates/stage-06.js` -- Template

## GUI Stage 6 Implementation (Ground Truth)

**Component**: `src/components/stages/v2/Stage06RiskEvaluation.tsx` (223 lines)
**Config**: `src/config/venture-workflow.ts` (Stage 6: "Risk Evaluation", gateType: 'none')
**Artifact**: `risk_matrix` type in `venture_artifacts` table

**Risk Data Structure**:
- `id` (string) -- unique identifier
- `name` (string) -- risk name (CLI doesn't have this)
- `description` (string) -- risk description
- `category` (enum: market/financial/technical/operational) -- 4 categories
- `severity` (enum: high/medium/low) -- qualitative
- `probability` (number 0-100%) -- percentage
- `impact` (number 0-100%) -- percentage
- `mitigation` (string) -- mitigation strategy

**Risk Scoring**: probability × impact (2-factor, 0-10000 range)

**Pre-populated Sample Risks** (4):
- Market Adoption Risk (severity: high)
- Funding Gap (severity: medium)
- Technical Complexity (severity: medium)
- Team Scaling (severity: low)

**UI Features**:
- Overall Risk Assessment card with score badge
- Risk category grid (4 columns) showing count by category
- Accordion with detailed risk cards
- High-risk warning alert

**Database**: Writes to `venture_artifacts` (versioned), `ventures.metadata.risks`

**No kill gate**, no completion threshold beyond manual submission.

## Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Risk categories | 6 (Market, Product, Technical, Legal/Compliance, Financial, Operational) | 4 (market, financial, technical, operational) |
| Scoring model | 3-factor (severity × probability × impact, 1-125) | 2-factor (probability × impact, 0-10000) |
| Severity scale | Integer 1-5 (quantitative) | high/medium/low (qualitative) |
| Probability scale | Integer 1-5 | 0-100% |
| Impact scale | Integer 1-5 | 0-100% |
| Residual risk | Yes (post-mitigation scoring) | No |
| Risk lifecycle | open/mitigated/accepted/closed | No |
| Mitigation owner | Required field | No |
| Review date | Required field | No |
| Risk generation | None (passive) | None (manual with sample risks) |
| Overall assessment | None | Aggregate score badge |
| Artifact versioning | No | Yes |
| Name field | No | Yes |

## Your Task

Analyze the gap between CLI and GUI for Stage 6, considering:

1. **Risk generation**: Neither CLI nor GUI generates risks automatically -- both require external input. For a CLI-native workflow, should Stage 6 have an `analysisStep` that generates risks from the venture description + Stages 1-5 output? Or is manual risk input acceptable?

2. **Scoring model**: The CLI uses a 3-factor model (severity × probability × impact = 1-125), the GUI uses 2-factor (probability × impact). The CLI's model is more granular but harder for an LLM to generate consistent 3-factor scores. Which is better for an autonomous pipeline?

3. **Risk categories**: CLI has 6 (adds Product, Legal/Compliance to GUI's 4). Are 6 categories the right number? Too many? Should the CLI's categories be preserved?

4. **Residual risk**: The CLI tracks post-mitigation residual risk (re-scoring after mitigations). The GUI doesn't. Is this valuable at the venture evaluation stage, or is it premature (the venture hasn't been built yet)?

5. **Aggregate metrics**: The CLI has no aggregate risk assessment. Should it produce an overall risk score, risk distribution summary, or top-risk-factor for downstream stages?

6. **Stage 5 -> Stage 6 pipeline**: Stage 5's financial model reveals financial risks. Should Stage 6 automatically seed some risks from Stage 5's output (e.g., "high churn risk" if Stage 5 churn > 10%, "narrow margin risk" if gross margin < 40%)?

7. **Stage 9 dependency**: The CLI's Stage 9 (Exit Strategy) has a "Reality Gate" requiring Stage 6 to have captured >= 10 risks. Does this minimum threshold make sense? Should it be higher or lower?

8. **Minimum viable change**: What's the smallest set of changes to make Stage 6 produce a useful risk matrix that informs downstream stages?

## Gap Importance Rubric

**For each gap identified, score its closure importance using this rubric:**

| Score | Label | Criteria |
|-------|-------|----------|
| 5 | **Critical** | Without closing this gap, the stage cannot function or produces incorrect downstream decisions |
| 4 | **High** | Significantly degrades downstream stage quality |
| 3 | **Medium** | Improves quality but the stage can function without it |
| 2 | **Low** | Nice to have; minimal impact on pipeline correctness |
| 1 | **Cosmetic** | UX or presentation concern with no analytical impact |

**For each gap, also challenge**: Does this gap truly need to be closed, or does the CLI's existing infrastructure already address it differently?

## Output Format

Please structure your response as:

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict (CLOSE / ADAPT / ELIMINATE) | Challenge |

### 2. Risk Generation Recommendation
- Whether and how risks should be auto-generated
- Data sources and pipeline

### 3. Scoring Model Decision
- Which scoring model to use
- How to produce consistent scores in an autonomous pipeline

### 4. Aggregate Metrics Recommendation
- Whether Stage 6 needs aggregate risk signals
- What metrics to produce for downstream consumption

### 5. Stage 5 -> Stage 6 Pipeline
- How to consume Stage 5 financial output for risk seeding
- What automatic risk detection is appropriate

### 6. CLI Superiorities (preserve these)
- List with brief justification

### 7. Recommended Stage 6 Schema
- The ideal Stage 6 schema for a CLI-native workflow

### 8. Minimum Viable Change
- Specific, actionable changes ranked by priority

### 9. Cross-Stage Impact
- How changes affect Stage 7 (Pricing), Stage 9 (Exit Strategy), and broader pipeline
