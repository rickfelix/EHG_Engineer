# EVA Venture Lifecycle -- Stage 3 "Market Validation & RAT" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated (may persist as read-only dashboard). We need to identify what the CLI is missing relative to the GUI, what the CLI does better, and what minimum changes would make the CLI self-sufficient.

This is Stage 3 of a 25-stage venture lifecycle -- the **first kill gate**. The stages are grouped into phases:
- **Stages 1-5**: THE TRUTH (Foundation/Validation)
- **Stages 6-10**: BLUEPRINT (Planning/Design)
- **Stages 11-15**: BUILD (Development)
- **Stages 16-20**: LAUNCH
- **Stages 21-25**: GROWTH

## Pipeline Context

**What comes BEFORE Stage 3** -- Stage 2 (AI Review):
- CLI: Passive container -- validates pre-existing critiques, computes compositeScore (0-100). No active analysis.
- GUI: Active 4-agent GPT-4 ensemble producing 5 category scores (0-10), SWOT, recommendations.
- **Stage 2 triangulation consensus**: Add single MoA (Mixture of Agents) analysisStep, produce 6 dimension scores aligned to Stage 3's metrics (0-100), add evidence packs, add provenance tracking. Stage 2 becomes a "pre-flight check" for Stage 3.

**What Stage 3 does** -- Market Validation & RAT (first KILL GATE):
- This is the most consequential stage in the early pipeline. Ventures that fail here are killed.
- The CLI's kill gate formula is deterministic: `overallScore < 70 OR any metric < 40 = KILL`.
- The question is: where do the 6 metric scores come from? Currently, nowhere (passive template).

**What comes AFTER Stage 3** -- Stage 4 (Competitive Intel):
- Expects: Competitor cards with name, position, threat level (H/M/L), strengths, weaknesses, full SWOT per competitor
- Stage 4 benefits from competitive landscape data generated during Stage 3 validation
- Stage 4 is also passive (no analysisSteps)

**What Stage 5 (Kill Gate Decision) needs**:
- Stage 5 is the second kill gate in the pipeline
- Benefits from accumulated evidence from Stages 2-4
- Devil's Advocate runs at Stage 5 (adversarial review)

## CLI Stage 3 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-03.js`

**Schema** (6 input metrics + 4 derived fields):
- `marketFit` (integer, 0-100, required)
- `customerNeed` (integer, 0-100, required)
- `momentum` (integer, 0-100, required)
- `revenuePotential` (integer, 0-100, required)
- `competitiveBarrier` (integer, 0-100, required)
- `executionFeasibility` (integer, 0-100, required)
- `overallScore` (integer, 0-100, derived -- average of 6 metrics)
- `decision` (enum: pass/kill, derived)
- `blockProgression` (boolean, derived)
- `reasons` (array of structured objects, derived -- kill gate violation details)

**Kill Gate** (`evaluateKillGate()` -- exported pure function):
- Rule 1: `overallScore < 70` -> KILL
- Rule 2: Any single metric `< 40` -> KILL
- Both rules checked independently; either triggers kill
- Kill reasons include: type, metric name, message, threshold, actual value

**Processing**:
- `validate(data)` -- checks all 6 metrics are integers 0-100
- `computeDerived(data)` -- calculates overallScore, runs evaluateKillGate()
- **NO `analysisSteps`** -- template does NOT generate metric scores
- The template is a passive validator + kill gate enforcer

**Infrastructure at Stage 3 boundary**:
- **Devil's Advocate**: GPT-4o adversarial review runs at Stage 3 (configured gate stage)
- **Decision Filter Engine**: Deterministic risk evaluation (cost, tech, score, patterns, constraint drift)
- **Chairman Preference Store**: Per-chairman thresholds can adjust gating behavior
- **Reality gates**: May apply at 3->4 boundary

**Critical observation**: The CLI Stage 3 has the kill gate formula but NO way to generate the 6 input metrics. Like Stages 1-2, it's a passive container expecting data from elsewhere.

**Source files**:
- `lib/eva/stage-templates/stage-03.js` -- Template with kill gate
- `lib/eva/eva-orchestrator.js` -- processStage() flow
- `lib/eva/decision-filter-engine.js` -- DFE applied at every stage
- `lib/eva/devils-advocate.js` -- Adversarial review at gate stages

## GUI Stage 3 Implementation (Ground Truth)

**Components**: `src/components/stages/Stage3ComprehensiveValidation.tsx` (legacy), `src/components/stages/v2/Stage03ComprehensiveValidation.tsx` (v2)
**Service**: `src/hooks/comprehensive_validation/service.ts`
**Backend**: Supabase edge function `comprehensive-validation`

Two parallel systems exist: legacy (form + AI) and v2 (read-only metrics viewer).

**Input form** (4 tabs of user-provided market data):
| Tab | Key Fields |
|-----|-----------|
| Market Analysis | TAM (USD, default $10M), Annual Growth Rate (%, default 15%), 3 Key Competitors, Problem Clarity (derived from Stage 2 score) |
| Technical Assessment | Complexity Points (0-100, default 40), Team Capability (0-2), Integration Risk (0-2), Target Stack (array) |
| Financial Modeling | Monthly Price ($, default $99), Gross Margin (%, default 80%), CAC ($, default $250), LTV Months (default 24), LTV/CAC Min Ratio (default 3x) |
| Customer Intelligence | Dynamically loaded from venture data |

**Scoring -- Hybrid approach (30% deterministic + 70% GPT-4)**:

1. **Deterministic baseline (30% weight)**: Rule-based scoring on 3 dimensions (market, technical, financial), each 1-10 scale. Example: TAM >= $1M = +3 points, Growth >= 5% = +2, Competitors <= 12 = +2, Problem Clarity 0-2.

2. **AI enhancement (70% weight)**: GPT-4 call (temperature 0.3) returns enhanced 1-10 scores, rationales, blockers, recommendations per dimension. Max 1500 tokens.

3. **Fusion**: `final_score = (baseline * 0.30) + (ai_score * 0.70)`

**Output**: 3 dimensions (market, technical, financial) each with score (1-10), pass/fail, rationale, blockers (max 5), recommendations (max 5). Overall = average of 3.

**Kill gate (GUI)**: `overall >= 7 AND each dimension >= 6` -> advance. `overall >= 5` -> revise. `< 5` -> reject. Chairman can override.

**Stage 2 consumption**: Weak -- only `problemClarity = Math.min(2, reviewData.overallScore / 5)`. No structured data pipeline.

**Score scale**: 1-10 per dimension

**Database**: Writes to `validations`, `validation_reports`, optionally `chairman_overrides`.

**Source files**:
- `EHG/src/components/stages/Stage3ComprehensiveValidation.tsx`
- `EHG/src/components/stages/v2/Stage03ComprehensiveValidation.tsx`
- `EHG/src/hooks/comprehensive_validation/service.ts`
- `EHG/supabase/functions/comprehensive-validation/index.ts`

## Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Metric generation | None (passive) | Active (30% deterministic + 70% GPT-4) |
| Metric count | 6 (marketFit, customerNeed, momentum, revenuePotential, competitiveBarrier, executionFeasibility) | 3 dimensions (market, technical, financial) |
| Score scale | 0-100 integer | 1-10 per dimension |
| Kill gate formula | overall < 70 OR any < 40 | overall >= 7 AND each >= 6 |
| Kill gate enforcement | Hard block (blockProgression=true) | Soft (chairman can override) |
| Market data input | None | Form with TAM, growth, competitors, financial KPIs |
| Stage 2 consumption | None | Weak (only problemClarity from overall score) |
| Deterministic component | Kill gate formula only | 30% of scoring is rule-based |
| AI component | Devil's Advocate at gate boundary | 70% of scoring via GPT-4 |
| Chairman governance | DFE + Preference Store (proactive) | Override with rationale + voice notes (reactive) |

## Your Task

Analyze the gap between CLI and GUI for Stage 3, considering:

1. **Gap identification**: The CLI has the kill gate formula but no way to generate input metrics. The GUI collects market data via forms and uses a hybrid deterministic+AI scoring approach. For each gap, assess downstream impact.

2. **Metric granularity**: The CLI has 6 metrics; the GUI has 3 dimensions. Which is more appropriate for a kill gate? Should the CLI keep its 6-metric structure, adopt the GUI's 3-dimension approach, or use both?

3. **Score generation architecture**: The GUI's hybrid approach (30% deterministic + 70% AI) is interesting. Should the CLI adopt a similar hybrid, go fully deterministic, go fully AI, or take another approach? Consider that the CLI already has Devil's Advocate for adversarial challenge.

4. **Market data input**: The GUI collects TAM, growth rate, competitors, financial KPIs via forms. The CLI has no equivalent. How should the CLI acquire this data? From Stage 0 synthesis? From an analysisStep? From a chairman questionnaire?

5. **Kill gate comparison**: CLI kills at `<70 overall OR <40 any metric`. GUI advances at `>=7 AND >=6 each`. These are different thresholds on different scales. Which approach is better for "The Truth" phase?

6. **Stage 2 -> Stage 3 pipeline**: If Stage 2 is updated per our triangulation consensus (producing 6 dimension scores aligned to Stage 3 metrics), how should Stage 3 consume and validate those preliminary scores?

7. **Minimum viable change**: What's the smallest set of changes to make Stage 3's kill gate effective given the data it receives from an improved Stage 2?

## Gap Importance Rubric

**For each gap identified, score its closure importance using this rubric:**

| Score | Label | Criteria |
|-------|-------|----------|
| 5 | **Critical** | Without closing this gap, the stage cannot function or produces incorrect kill/pass decisions |
| 4 | **High** | Significantly degrades kill gate accuracy or downstream stage quality |
| 3 | **Medium** | Improves quality but the stage can function without it |
| 2 | **Low** | Nice to have; minimal impact on pipeline correctness |
| 1 | **Cosmetic** | UX or presentation concern with no analytical impact |

**For each gap, also challenge**: Does this gap truly need to be closed, or does the CLI's existing infrastructure (Devil's Advocate, Decision Filter Engine, Chairman Preference Store, Stage 0 synthesis) already address it differently?

## Output Format

Please structure your response as:

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict (CLOSE / ADAPT / ELIMINATE) | Challenge |

### 2. Metric Structure Recommendation
- 6-metric vs 3-dimension vs hybrid decision
- Justification from a kill gate accuracy perspective

### 3. Score Generation Architecture
- How should the CLI generate the 6 metric scores?
- Deterministic vs AI vs hybrid approach
- How to leverage Devil's Advocate and Decision Filter Engine

### 4. Market Data Acquisition
- How the CLI should acquire TAM, competitors, financial KPIs
- Where in the pipeline this data should originate

### 5. Kill Gate Comparison & Recommendation
- CLI vs GUI kill gate formula analysis
- Recommended thresholds for CLI

### 6. Stage 2 -> Stage 3 Pipeline
- How to consume Stage 2's preliminary dimension scores
- Validation/refinement approach

### 7. CLI Superiorities (preserve these)
- List with brief justification

### 8. Minimum Viable Change
- Specific, actionable changes ranked by priority

### 9. Cross-Stage Impact
- How these changes affect Stage 4, Stage 5, and the broader pipeline
