---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 4 "Competitive Intel" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated (may persist as read-only dashboard). We need to identify what the CLI is missing relative to the GUI, what the CLI does better, and what minimum changes would make the CLI self-sufficient.

This is Stage 4 of a 25-stage venture lifecycle -- an information-gathering stage between two kill gates.
- **Stages 1-5**: THE TRUTH (Foundation/Validation)
- **Stages 6-10**: BLUEPRINT (Planning/Design)
- **Stages 11-15**: BUILD (Development)
- **Stages 16-20**: LAUNCH
- **Stages 21-25**: GROWTH

## Pipeline Context

**What comes BEFORE Stage 4** -- Stage 3 (Market Validation & RAT, first kill gate):
- CLI: 6 metrics (marketFit, customerNeed, momentum, revenuePotential, competitiveBarrier, executionFeasibility), kill at overall < 70 OR any < 50 (per triangulation consensus). Hard block enforcement.
- GUI: 3 dimensions (market, technical, financial), hybrid 30% deterministic + 70% GPT-4 scoring.
- **Stage 3 triangulation consensus**: CLI will produce 6 metric scores via deterministic+AI hybrid, structured competitor entities for Stage 4, formal Stage 2->3 artifact contract, MarketAssumptions Service for data acquisition.

**What Stage 4 does** -- Competitive Intelligence:
- This is NOT a kill gate. It's an evidence-gathering stage that sits between kill gates 3 and 5.
- Its purpose: produce structured competitive landscape data that informs Stage 5's profitability kill gate.
- The quality of Stage 4's output directly affects Stage 5's pricing assumptions, market size estimates, and defensibility assessment.

**What comes AFTER Stage 4** -- Stage 5 (Profitability, second kill gate):
- CLI: 3-year financial model with break-even calculation and ROI threshold
- Kill gate: ROI3Y < 0.5 OR breakEvenMonth is null (non-profitable Y1) OR breakEvenMonth > 24 months -> KILL
- Stage 5 needs: initialInvestment, year1-3 (revenue, cogs, opex) -- financial projections
- Stage 5 benefits from: competitor pricing data, market size, defensibility grade from Stage 4

## CLI Stage 4 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-04.js` -- Passive validation only

**Schema**: Array of competitor cards, each with:
- `name` (string, required, unique case-insensitive)
- `position` (string, required) -- market positioning
- `threat` (enum: H/M/L, required)
- `strengths` (array of strings, minItems: 1)
- `weaknesses` (array of strings, minItems: 1)
- `swot.strengths` (array of strings, minItems: 1)
- `swot.weaknesses` (array of strings, minItems: 1)
- `swot.opportunities` (array of strings, minItems: 1)
- `swot.threats` (array of strings, minItems: 1)

**Processing**:
- `validate(data)` -- checks competitors array structure, detects duplicate names
- `computeDerived(data)` -- no-op (returns data unchanged)
- **NO `analysisSteps`** -- template does NOT discover or research competitors
- **No scoring, no derived metrics** -- purely structural validation

**No kill gate at Stage 4.** Information-gathering only.

**Source files**:
- `lib/eva/stage-templates/stage-04.js` -- Template
- `lib/eva/eva-orchestrator.js` -- processStage() flow

## GUI Stage 4 Implementation (Ground Truth)

**Components**: `src/components/stages/Stage4CompetitiveIntelligence.tsx` (v1), `src/components/stages/v2/Stage04CompetitiveIntelligence.tsx` (v2)
**Backend**: Supabase edge function `competitive-intelligence`, 5 API endpoints at `/api/agent-execution/`

**Manual competitor entry** (per competitor): Company name, website URL, market segment, market share estimate (%), pricing model (6 options), notes, strengths, weaknesses.

**Feature comparison framework**: 6 default weighted features (user_interface, performance, pricing, integration, analytics, unique_feature). Coverage matrix: none/basic/advanced/superior per (feature, competitor).

**AI-Powered Analysis** (active agent execution):
- Backend agent discovers and analyzes competitors
- 3-second polling for progress (0-100%)
- Results across 6 tabs: Overview, Competitors, Market, Features, Pricing, SWOT
- "Skip Agent Execution" button after 10 seconds
- Fallback synthetic analysis if edge function fails
- Quality metadata: confidence_score, extraction_method, quality_issues, validation_warnings

**Scoring**:
- Differentiation Score (0-10): weighted feature coverage comparison
- Defensibility Grade (A-F): A (8+), B (6-8), C (4-6), D (2-4), F (<2)
- Market Position: Challenger (>=6), Follower (4-6), Niche Player (<4)

**Edge cases**: Blue Ocean (0 competitors), Partial extraction (raw text with warning)

**Persona mapping**: Links Stage 3 customer personas to competitors with fit scores

**Database**: Writes to `competitors`, `feature_coverage`, `market_defense_strategies`, `agent_executions`

**Stage 5 feed**: Passes competitive data to Stage 5 for pricing, market size, CAC/LTV

**Source files**:
- `EHG/src/components/stages/Stage4CompetitiveIntelligence.tsx`
- `EHG/src/components/stages/v2/Stage04CompetitiveIntelligence.tsx`
- `EHG/supabase/functions/competitive-intelligence/index.ts`

## Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Competitor discovery | None (passive) | Active AI agent + manual entry |
| Competitor attributes | name, position, threat, strengths, weaknesses, SWOT | name, URL, segment, share, pricing model, notes, strengths, weaknesses |
| Feature comparison | None | 6 weighted features, coverage matrix (none/basic/advanced/superior) |
| Scoring | None | Differentiation (0-10), Defensibility (A-F), Market Position |
| AI research | None | Edge function with agent execution, polling, fallback |
| Persona integration | None | Links Stage 3 personas to competitors |
| Stage 5 feed | None | Competitive data -> pricing/market/CAC/LTV assumptions |
| Edge cases | None | Blue Ocean, Partial extraction handled |
| Quality tracking | None | Confidence score, extraction method, quality issues |

## Your Task

Analyze the gap between CLI and GUI for Stage 4, considering:

1. **Gap identification**: The CLI validates competitor card structure but can't discover competitors. The GUI has active AI research + manual entry + feature comparison. For each gap, assess downstream impact on Stage 5's profitability kill gate.

2. **Competitor discovery**: How should the CLI discover and research competitors? Via an analysisStep that calls an LLM with search? Via Stage 3's MarketAssumptions data? Via Stage 0's cross-reference module? Consider that the CLI already has competitor data in Stage 3's output per our triangulation consensus.

3. **Feature comparison framework**: The GUI's weighted feature matrix is interesting but complex. Does the CLI need this for Stage 5's financial model, or is threat-level classification (H/M/L) sufficient?

4. **Scoring**: The GUI produces differentiation (0-10), defensibility (A-F), market position. The CLI produces nothing. Does Stage 5's kill gate (ROI/break-even) actually need these scores?

5. **Schema richness**: The CLI has SWOT per competitor but lacks URL, market share, pricing model. Which additional fields matter for Stage 5?

6. **Stage 3 -> Stage 4 pipeline**: Per Stage 3 consensus, Stage 3 will output structured competitor entities. How much of Stage 4's work is already done by Stage 3?

7. **Minimum viable change**: What's the smallest set of changes to make Stage 4 produce useful competitive intelligence that feeds Stage 5's profitability model?

## Gap Importance Rubric

**For each gap identified, score its closure importance using this rubric:**

| Score | Label | Criteria |
|-------|-------|----------|
| 5 | **Critical** | Without closing this gap, the stage cannot function or produces incorrect downstream decisions |
| 4 | **High** | Significantly degrades downstream stage quality |
| 3 | **Medium** | Improves quality but the stage can function without it |
| 2 | **Low** | Nice to have; minimal impact on pipeline correctness |
| 1 | **Cosmetic** | UX or presentation concern with no analytical impact |

**For each gap, also challenge**: Does this gap truly need to be closed, or does the CLI's existing infrastructure (Stage 0 synthesis, Stage 3 competitor output, Devil's Advocate) already address it differently?

## Output Format

Please structure your response as:

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact (Stage 5 Kill Gate) | Verdict (CLOSE / ADAPT / ELIMINATE) | Challenge |

### 2. Competitor Discovery Recommendation
- How the CLI should discover and research competitors
- Data sources and pipeline

### 3. Feature Comparison Decision
- Whether the CLI needs a feature matrix
- What level of competitive comparison serves Stage 5

### 4. Scoring Recommendation
- Which scores (if any) Stage 4 should produce
- How they feed into Stage 5's financial model

### 5. Stage 3 -> Stage 4 Pipeline
- How to consume Stage 3's competitor entities
- What additional research Stage 4 should add

### 6. CLI Superiorities (preserve these)
- List with brief justification

### 7. Recommended Stage 4 Schema
- The ideal Stage 4 schema for a CLI-native workflow

### 8. Minimum Viable Change
- Specific, actionable changes ranked by priority

### 9. Cross-Stage Impact
- How these changes affect Stage 5 kill gate and broader pipeline
