---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 2 "AI Review" -- Claude Response

> Independent response to the Stage 2 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Downstream Impact (Stage 3 Kill Gate) | Verdict |
|-----|---------|---------|--------------------------------------|---------|
| Active AI analysis generation | 4-agent GPT-4 ensemble auto-triggered on entry | Nothing -- passive container validates pre-existing data | **Critical** -- Stage 3 needs structured scores for 6 metrics; without active analysis, there's nothing to score | CLOSE |
| Category score breakdown | 5 categories (quality, viability, originality, market, feasibility) | Flat composite score only | **High** -- Stage 3 has 6 metrics; category breakdown provides structured input for scoring | CLOSE (but realign categories to Stage 3 metrics) |
| Recommendation logic | Threshold-based (fast-track/advance/revise/reject) | None | **Low** -- Decision Filter Engine + Stage 3 kill gate already provide gating. Stage 2 recommendation is redundant. | ELIMINATE (rely on existing gating infrastructure) |
| SWOT analysis (strengths/weaknesses/opportunities/risks) | Full SWOT with max 3 items each | Critiques have strengths + risks only | **Medium** -- Opportunities and weaknesses inform Stage 4 competitive intel and Stage 5 kill hypotheses | ADAPT (keep strengths/risks from existing schema, add weaknesses) |
| Actionable suggestions (immediate + strategic) | Max 3 immediate + 3 strategic suggestions | Nothing | **Low** -- Nice for human review but not consumed by any downstream stage programmatically | ELIMINATE (human-facing UX, not pipeline data) |
| Chairman override at Stage 2 | Full support via `chairman_overrides` table | Chairman Preference Store exists but not Stage 2 specific | **Medium** -- Chairman should be able to override any stage's outcome | ADAPT (wire existing Chairman Preference Store to Stage 2) |
| Confidence score | Derived (0.7 + score*0.025, max 0.95) | Nothing | **None** -- The formula is trivially derived from overall score, adds no information | ELIMINATE (derived metric with no independent signal) |
| Agent analysis text summaries | 4 perspective-specific summaries (2-3 sentences each) | Critique summaries (1 per model) | **Low** -- Text summaries are for human consumption, not downstream computation | ADAPT (keep single comprehensive summary per critique) |
| Multi-agent perspectives | 4 named agents with distinct focus areas | Single flat critique structure | **Medium** -- Multiple perspectives reduce blind spots in analysis | ADAPT (see Architecture Recommendation) |
| Non-deterministic scoring | Category scores randomized (min=4, max=10) | N/A (no scoring) | **Negative** -- Randomization undermines reproducibility. CLI should NOT replicate this. | ELIMINATE (use deterministic scoring) |

### 2. Architecture Recommendation

**Decision: Structured LLM analysis steps via `analysisSteps`, NOT multi-agent ensemble.**

**Justification**:

The GUI's 4-agent approach has a fundamental problem: all 4 agents use GPT-4 with different prompts. This is prompt engineering disguised as multi-agent architecture. The CLI can achieve the same analytical coverage more efficiently.

**Recommended approach**:

1. **Define 3 `analysisSteps` in the `venture_stage_templates` DB record for Stage 2**:
   - `market_analysis` -- Market sizing, customer need assessment, competitive positioning
   - `technical_feasibility` -- Architecture complexity, build cost, execution risk
   - `strategic_fit` -- Portfolio alignment, chairman preference match, moat viability

2. **Each analysisStep produces a structured JSON artifact** with:
   - Narrative summary (for human review)
   - Numeric scores on defined dimensions (for Stage 3 consumption)
   - Identified strengths and risks (for Devil's Advocate input)

3. **Leverage existing CLI infrastructure**:
   - **Decision Filter Engine** already evaluates cost, tech, score, patterns -- use it to validate analysisStep outputs
   - **Devil's Advocate** (GPT-4o) provides adversarial review -- run it on Stage 2's combined analysis to challenge the scores
   - **Chairman Preference Store** -- apply preference-weighted scoring adjustments

4. **LLM client factory integration**: Use `getLLMClient({ purpose: 'stage-analysis', phase: 'stage-02' })` to route through the existing factory, which enables local LLM for classification and cloud for analysis.

**Why NOT multi-agent**: The CLI's `processStage()` flow already has an `analysisSteps` execution loop. Adding steps to the DB template is the natural extension point. Multi-agent orchestration would require new infrastructure for something the analysisSteps pattern already handles.

### 3. Score Scale & Category Alignment

**Recommended score scale: 0-100 integer** (CLI native).

The GUI's 0-10 decimal scale with min=4 floor creates artificial compression (range is really 4-10, not 0-10). The CLI's 0-100 integer scale:
- Matches Stage 3's expected input format (0-100)
- Avoids lossy decimal-to-integer conversion
- Provides more granularity for deterministic thresholding
- Aligns with the existing critique schema

**Recommended category alignment with Stage 3**:

Stage 3 has 6 metrics. Stage 2 should produce preliminary scores for these same dimensions so there's a direct data pipeline:

| Stage 2 Analysis Dimension | Maps to Stage 3 Metric | Source analysisStep |
|---------------------------|----------------------|-------------------|
| Market opportunity assessment | `marketFit` | market_analysis |
| Customer pain severity | `customerNeed` | market_analysis |
| Market timing / trend alignment | `momentum` | market_analysis |
| Revenue model viability | `revenuePotential` | strategic_fit |
| Defensibility / moat strength | `competitiveBarrier` | strategic_fit |
| Technical/operational execution risk | `executionFeasibility` | technical_feasibility |

This means Stage 2 produces **preliminary 0-100 scores for the same 6 dimensions** that Stage 3 evaluates. Stage 3 then refines/validates these with its own deterministic formula and applies the kill gate.

**Why this is better than the GUI's categories**: The GUI's 5 categories (quality, viability, originality, market, feasibility) don't map cleanly to Stage 3's 6 metrics. "Originality" has no Stage 3 equivalent. "Quality" is vague. Aligning Stage 2 categories to Stage 3 metrics creates a clean data pipeline.

### 4. CLI Superiorities (preserve these)

- **Decision Filter Engine** -- Deterministic risk evaluation at every stage boundary. The GUI has nothing comparable. This replaces the need for a recommendation enum (advance/revise/reject/fast-track).
- **Devil's Advocate** -- GPT-4o adversarial review challenges analysis outputs. The GUI's 4-agent ensemble lacks adversarial tension -- all agents are constructive.
- **Chairman Preference Store** -- Per-chairman, per-venture scoring thresholds enable personalized gating. The GUI's chairman override is reactive (manual override after the fact); the CLI's is proactive (preferences shape analysis).
- **Deterministic compositeScore** -- `Math.round(sum / count)` is reproducible. The GUI's randomized category scores are not.
- **analysisSteps DB override** -- The `venture_stage_templates` table can customize Stage 2 analysis per-venture-type without code changes. The GUI's edge function is a monolithic, one-size-fits-all implementation.
- **Artifact persistence with idempotency keys** -- Prevents duplicate analysis runs. The GUI can create multiple `ai_reviews` records for the same idea.
- **Stage gate infrastructure** -- Formal gates between stages with fail-closed default. The GUI has soft pass/fail only.

### 5. Recommended Stage 2 Schema

```javascript
const TEMPLATE = {
  id: 'stage-02',
  slug: 'ai-review',
  title: 'AI Review',
  version: '2.0.0',
  schema: {
    // Analysis outputs (one per analysisStep)
    analyses: {
      type: 'array',
      minItems: 1,
      items: {
        stepId: { type: 'string', required: true },       // e.g., 'market_analysis'
        model: { type: 'string', required: true },         // LLM model used
        summary: { type: 'string', minLength: 50, required: true },
        strengths: { type: 'array', minItems: 1, items: { type: 'string' } },
        risks: { type: 'array', minItems: 1, items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },  // NEW
        dimensionScores: {                                  // NEW: structured scores
          type: 'object',
          properties: {
            marketFit: { type: 'integer', min: 0, max: 100 },
            customerNeed: { type: 'integer', min: 0, max: 100 },
            momentum: { type: 'integer', min: 0, max: 100 },
            revenuePotential: { type: 'integer', min: 0, max: 100 },
            competitiveBarrier: { type: 'integer', min: 0, max: 100 },
            executionFeasibility: { type: 'integer', min: 0, max: 100 },
          },
        },
        score: { type: 'integer', min: 0, max: 100, required: true },
      },
    },
    // Derived fields
    compositeScore: { type: 'integer', min: 0, max: 100, derived: true },
    dimensionAverages: {                                    // NEW: per-dimension averages
      type: 'object', derived: true,
      properties: {
        marketFit: { type: 'integer', min: 0, max: 100 },
        customerNeed: { type: 'integer', min: 0, max: 100 },
        momentum: { type: 'integer', min: 0, max: 100 },
        revenuePotential: { type: 'integer', min: 0, max: 100 },
        competitiveBarrier: { type: 'integer', min: 0, max: 100 },
        executionFeasibility: { type: 'integer', min: 0, max: 100 },
      },
    },
  },
};
```

**Key changes from v1.0.0**:
1. Renamed `critiques` to `analyses` (reflects active generation, not passive storage)
2. Added `stepId` to link each analysis to its `analysisStep`
3. Added `weaknesses` array (was absent, but GUI captured it)
4. Added `dimensionScores` per analysis -- structured scores aligned to Stage 3's 6 metrics
5. Added `dimensionAverages` as derived -- cross-analysis averages per dimension
6. Kept `compositeScore` for backward compatibility
7. Kept 0-100 integer scale throughout

**Backward compatibility**: The v1 `critiques` structure is a subset of v2 `analyses`. A migration function can rename the field and add default values for new fields.

### 6. Minimum Viable Change

Ranked by priority:

1. **P0: Add 3 `analysisSteps` to Stage 2 DB template** -- Insert into `venture_stage_templates` for lifecycle_stage=2 with steps: `market_analysis`, `technical_feasibility`, `strategic_fit`. Each step defines an LLM prompt that receives the venture brief and Stage 1 output, and produces structured JSON output matching the `analyses[]` schema above. This is the critical change -- without it, Stage 2 generates nothing.

2. **P0: Implement `dimensionScores` in analysisStep prompts** -- Each analysisStep prompt must instruct the LLM to produce scores on the Stage 3 dimension(s) it covers. The market_analysis step scores `marketFit`, `customerNeed`, `momentum`. The technical_feasibility step scores `executionFeasibility`. The strategic_fit step scores `revenuePotential`, `competitiveBarrier`.

3. **P1: Update Stage 2 template to v2 schema** -- Extend `stage-02.js` with the schema above. Update `computeDerived()` to calculate both `compositeScore` and `dimensionAverages`.

4. **P1: Wire Devil's Advocate to challenge Stage 2 output** -- After the 3 analysisSteps complete, run Devil's Advocate on the combined analysis. This provides adversarial tension the GUI's ensemble lacks.

5. **P2: Add `weaknesses` to critique schema** -- The existing schema has `strengths` and `risks` but not `weaknesses`. Add it for completeness.

6. **P3: Do NOT add recommendation enum** -- The Decision Filter Engine + Stage 3 kill gate already provide gating. Adding advance/revise/reject/fast-track would duplicate existing infrastructure.

7. **P3: Do NOT add confidence score** -- It's a trivially derived metric (formula: `0.7 + score * 0.0025`) that adds no independent signal.

### 7. Cross-Stage Impact

| Change | Stage 3 (Market Validation Kill Gate) | Stage 4 (Competitive Intel) | Stage 5 (Kill Gate) |
|--------|--------------------------------------|----------------------------|-------------------|
| Add 3 analysisSteps | **Critical enabler** -- Stage 3 gets structured dimension scores instead of having to infer from unstructured text. Each metric gets a preliminary score from Stage 2. | market_analysis output provides competitive landscape context and competitor identification | strategic_fit output provides moat assessment that informs kill/continue |
| dimensionScores aligned to Stage 3 | **Direct pipeline** -- Stage 3 can consume Stage 2's preliminary scores as starting points, then refine with its own validation data | Dimension scores provide quantified context for competitor comparison | Dimension scores carry forward for trend analysis |
| Devil's Advocate on Stage 2 | Adversarial challenges catch inflated scores BEFORE the kill gate -- reduces false positives (ventures that pass Stage 2 but fail Stage 3) | Adversarial critique identifies competitive blind spots | Challenges to risk assessment inform kill decision |
| weaknesses field | Weaknesses map to specific metric vulnerabilities -- Stage 3 can weight low-confidence dimensions more conservatively | Weaknesses inform where competitive analysis should focus | Weakness patterns inform kill decision rationale |

**Stage 3 kill gate specifically**: The biggest impact is the `dimensionScores` alignment. Currently there is NO data pipeline from Stage 2 to Stage 3 -- the Stage 3 metrics must be generated from scratch. With this change, Stage 2 produces preliminary scores on exactly the same 6 dimensions, giving Stage 3 a structured foundation to validate against rather than starting from zero. This directly improves the quality and speed of the kill gate evaluation.

**Score scale note**: By keeping 0-100 integer throughout, Stage 2 output feeds directly into Stage 3's schema with zero conversion. The GUI's 0-10 decimal scale would require multiplication and rounding at the boundary.
