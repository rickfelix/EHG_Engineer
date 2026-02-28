---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 2 "AI Review" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing relative to the GUI, what the CLI does better, and what minimum changes would make the CLI self-sufficient.

This is Stage 2 of a 25-stage venture lifecycle. The stages are grouped into phases:
- **Stages 1-5**: THE TRUTH (Foundation/Validation)
- **Stages 6-10**: BLUEPRINT (Planning/Design)
- **Stages 11-15**: BUILD (Development)
- **Stages 16-20**: LAUNCH
- **Stages 21-25**: GROWTH

## Pipeline Context

**What comes BEFORE Stage 2** -- Stage 1 (Draft Idea):
- CLI: 3 required fields (description, valueProp, targetMarket). Passive validation only. Produces `idea_brief` artifact. Has rich Stage 0 synthesis upstream (8 modules: problem-reframing, moat-architecture, archetypes, build-cost-estimation, time-horizon, chairman-constraints, cross-reference, portfolio-evaluation) but Stage 0->1 data pipeline is not yet wired.
- GUI: 12+ fields including Problem Statement, Category, Key Assumptions, Tags, Strategic Focus Areas, Venture Archetype. Has "Enhance with AI" button.
- **Stage 1 triangulation consensus**: Add problemStatement (required), keyAssumptions (optional), wire Stage 0 output, add archetype field, add provenance tracking.

**What comes AFTER Stage 2** -- Stage 3 (Market Validation & RAT):
- 6 validation metrics: marketFit, customerNeed, momentum, revenuePotential, competitiveBarrier, executionFeasibility (each 0-100)
- **KILL GATE**: overall < 70 OR any single metric < 40 -> KILL the venture
- Stage 3 needs structured market/customer/competitive data to score these 6 metrics
- Stage 3 is purely deterministic -- it computes scores and applies the kill gate formula

**What Stage 4 (Competitive Intel) needs**:
- Detailed competitive landscape analysis
- Market positioning data
- Competitor identification

## CLI Stage 2 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-02.js` -- Passive validation only

**Schema**:
- `critiques` (array, minItems: 1) -- each critique contains:
  - `model` (string, required) -- which AI model produced this critique
  - `summary` (string, minLength: 20, required) -- critique summary
  - `strengths` (array of strings, minItems: 1, required) -- venture strengths identified
  - `risks` (array of strings, minItems: 1, required) -- venture risks identified
  - `score` (integer, 0-100, required) -- overall score from this model
- `compositeScore` (integer, 0-100, derived) -- `Math.round(average of all critique scores)`

**Processing**:
- `validate(data)` -- checks critiques array structure and constraints
- `computeDerived(data)` -- calculates compositeScore as simple average
- **NO `analysisSteps`** -- the template does NOT generate any AI analysis
- The template is a "dumb container" -- it expects critiques to already exist

**Infrastructure applied to all stages** (including Stage 2):
- Decision Filter Engine: deterministic risk evaluation (cost, tech, score, patterns, constraint drift)
- Devil's Advocate: GPT-4o adversarial review (but only at specific gates: stages 3, 5, 13, 23)
- Chairman Preference Store: per-chairman, per-venture thresholds
- Stage gates + reality gates
- Idempotent artifact persistence

**Critical gap**: The CLI Stage 2 has **zero active analysis capability**. It validates and averages scores from critiques that must come from elsewhere. There is no LLM call, no agent architecture, no research step.

**Score scale**: 0-100 (integer)

**DB override mechanism**: The `venture_stage_templates` database table CAN override the local JS template and add `analysisSteps` that would generate critiques. But the base JS template has none defined.

## GUI Stage 2 Implementation (Ground Truth)

**Component**: `src/components/stages/Stage2AIReview.tsx` + `src/hooks/useAIReviewService.ts`
**Backend**: Supabase edge function `ai-review/index.ts`

**4-Agent ensemble** (all actually use GPT-4 backend regardless of display names):
| Agent | Display Name | Focus |
|-------|-------------|-------|
| LEAD | Strategic Lead | Market positioning, competitive landscape, strategic differentiation |
| PLAN | Tactical Planner | Resource requirements, timeline feasibility, technical complexity, risk factors |
| EXEC | Technical Executor | Architecture requirements, development complexity, scalability, integration |
| EVA | Quality Orchestrator | Synthesizes all agent outputs, identifies opportunities and risks |

**Trigger**: Auto-triggers on component mount. No button click required -- entering Stage 2 immediately starts AI analysis.

**Output**:
- `overallScore` (0-10 decimal) -- average of 5 category scores
- `categoryScores`: quality, viability, originality, market, feasibility (each 0-10)
- `recommendation`: advance (>=7.0), revise (>=5.0), reject (<5.0), fast-track (>=8.5)
- `confidence` (0-1) -- derived from overall score
- `agentAnalysis`: 4 text summaries (one per agent, 2-3 sentences each)
- `llmInsights`: strengths (max 3), weaknesses (max 3), opportunities (max 3), risks (max 3), suggestions.immediate (max 3), suggestions.strategic (max 3)

**Chairman override**: Dedicated `chairman_overrides` table. Override any recommendation with rationale, optional voice note + transcript.

**Category score range**: min=4, max=10 with randomization. **Not purely deterministic.**

**Database**: Results stored in `ai_reviews` table with full persistence (scores, analysis, model info, processing time).

## Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Analysis generation | None (passive container) | Active (4-agent GPT-4 ensemble) |
| Score scale | 0-100 integer | 0-10 decimal |
| Score categories | None (flat composite) | 5 categories (quality, viability, originality, market, feasibility) |
| Recommendation logic | None | Threshold-based (fast-track/advance/revise/reject) |
| SWOT analysis | None | Full (strengths, weaknesses, opportunities, risks) |
| Actionable suggestions | None | Immediate + strategic (max 3 each) |
| Chairman override | Not at Stage 2 level | Full support (rationale, voice notes) |
| Determinism | N/A (no analysis) | Non-deterministic (randomized scores, LLM variability) |

## Your Task

Analyze the gap between CLI and GUI for Stage 2, considering:

1. **Gap identification**: The CLI has zero active analysis capability at Stage 2 -- it's the biggest gap across all stages so far. For each specific capability the GUI has, assess whether it matters for downstream stages (especially Stage 3's kill gate).

2. **Architecture decision -- single model vs multi-agent**: The GUI uses a 4-agent ensemble (all GPT-4), producing 4 perspective-specific summaries. But the CLI already has a Devil's Advocate (GPT-4o adversarial review) in its infrastructure. Should the CLI replicate the multi-agent approach, use a single comprehensive LLM call, leverage Devil's Advocate differently, or take another approach entirely?

3. **Score scale reconciliation**: The CLI uses 0-100 integer scale; the GUI uses 0-10 decimal. Stage 3 (kill gate) expects 0-100 integers. Which scale should the CLI adopt, and how should this affect the critique schema?

4. **Category score structure**: The GUI has 5 categories (quality, viability, originality, market, feasibility). Stage 3 has 6 metrics (marketFit, customerNeed, momentum, revenuePotential, competitiveBarrier, executionFeasibility). Should Stage 2 categories align with Stage 3 metrics? What's the right category structure?

5. **Recommendation logic**: The GUI produces advance/revise/reject/fast-track based on hardcoded score thresholds. Should the CLI add this, or does the Decision Filter Engine + Stage 3 kill gate already serve this purpose?

6. **Determinism vs AI variability**: The GUI's category scores use randomization (min=4, max=10). The CLI's philosophy is deterministic computation. How should the CLI handle the inherent non-determinism of LLM analysis while maintaining reproducibility?

7. **Minimum viable change**: What's the smallest set of changes to give the CLI active analysis capability at Stage 2 that feeds Stage 3's kill gate effectively?

## Output Format

Please structure your response as:

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Downstream Impact (Stage 3 Kill Gate) | Verdict (CLOSE / ADAPT / ELIMINATE) |

### 2. Architecture Recommendation
- Single model vs multi-agent decision with justification
- How to leverage existing CLI infrastructure (Devil's Advocate, Decision Filter Engine)

### 3. Score Scale & Category Alignment
- Recommended score scale
- Recommended category structure and its relationship to Stage 3's 6 metrics

### 4. CLI Superiorities (preserve these)
- List with brief justification

### 5. Recommended Stage 2 Schema
- The ideal Stage 2 schema for a CLI-native workflow

### 6. Minimum Viable Change
- Specific, actionable changes ranked by priority

### 7. Cross-Stage Impact
- How these changes affect Stage 3 kill gate, Stage 4 competitive intel, and Stage 5 kill gate
