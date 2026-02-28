---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 10 "Naming / Brand" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 10 of a 25-stage venture lifecycle -- the **first stage of THE IDENTITY phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- no kill gates, artifact-building
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- no kill gates
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13

## Cumulative Consensus (Stages 1-9)

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
| 9 (Exit Strategy) | Add `analysisStep` consuming Stages 1-8. 5-type exit enum (acquisition, ipo, merger, mbo, liquidation). 4-type buyer enum. Revenue multiple valuation with low/base/high range. PRESERVE Reality Gate. ELIMINATE exit readiness checklist (defer to BUILD). |

**Established pattern**: Every stage from 2-9 adds an `analysisStep` that consumes prior stages and generates structured output. Stage 10 will follow this pattern. Focus your analysis on **what the analysisStep should produce** and **what's unique about naming/brand design**, not whether an analysisStep is needed.

## Pipeline Context

**What comes BEFORE Stage 10** -- Stage 9 (Exit Strategy):
- Per consensus: exit thesis, 5-type exit paths, buyer-typed acquirers, revenue multiple valuation range, Reality Gate pass/fail.
- Stage 9 is the ENGINE capstone. THE ENGINE phase (6-9) is complete.

**What Stage 10 does** -- Naming / Brand:
- First stage of THE IDENTITY phase. Phase transition from THE ENGINE to THE IDENTITY.
- Define brand genome (archetype, values, tone, audience, differentiators).
- Generate and score name candidates (min 5) against weighted criteria.
- This is where the venture gets its NAME. Everything before this was anonymous analysis.

**What comes AFTER Stage 10** -- Stage 11 (Go-To-Market):
- Stage 11 needs: venture name, brand positioning, target audience, and tone to inform GTM messaging and channel selection.

## CRITICAL: Stage Mapping Divergence

**The CLI and GUI have DIFFERENT Stage 10 content.**

| System | Stage 10 Name | Stage 10 Content |
|--------|--------------|-----------------|
| CLI | Naming / Brand | Brand genome + name candidates with weighted scoring |
| GUI | Technical Review | Technical feasibility (6 categories, 19 rules, 10 artifacts) + brand narrative + naming output |

The GUI's Stage 10 combines **technical review** (architecture, security, scalability assessment) with **brand narrative** (vision, mission, cultural style). The CLI's Stage 10 is purely **naming/brand**.

This is NOT a gap to close -- it's a design divergence. The technical review content in the GUI's Stage 10 belongs in THE BLUEPRINT phase (Stages 13-16), specifically Stage 14 (Technical Architecture). The CLI's separation is correct: IDENTITY phase should be about identity, not technical assessment.

**Your analysis should treat the CLI's stage scope as authoritative.** Evaluate what the GUI's brand/naming features could contribute to the CLI's naming focus, but DO NOT recommend importing the GUI's technical review into Stage 10.

## CLI Stage 10 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-10.js`

**Input**: brandGenome (archetype, values[], tone, audience, differentiators[]), scoringCriteria[] (name, weight -- weights sum to 100), candidates[] (name, rationale, scores{} per criterion)

**Derived**: candidates[].weighted_score, ranked_candidates (sorted by score)

**Key properties**:
- Minimum 5 candidates required
- Scoring weights must sum to exactly 100
- Each candidate scored 0-100 per criterion
- Brand genome has 5 keys: archetype, values, tone, audience, differentiators
- No AI generation (brand genome, criteria, candidates all user-provided)
- No domain availability checking
- No trademark checking
- No visual identity (colors, fonts, design style)

## GUI Stage 10 Brand/Naming Features (Ground Truth)

**Relevant components**: `Stage10Narrative.tsx`, `Stage10Viewer.tsx`

**Brand Narrative** (Stage10Narrative.tsx):
- Vision statement (min 20 chars), mission statement (min 20 chars)
- Value proposition, target audience, market position
- Brand voice, strategic narrative (AI-generatable)
- Key messages[], differentiators[]
- 5 cultural design styles with color palettes and characteristics

**Naming Output** (Stage10Viewer.tsx):
- Name candidates with: score (0-100), domain availability, trademark status (available/pending/conflict/unknown), pros/cons
- Visual identity: colors, fonts, visual style
- Brand guidelines by category with rationale
- Composite score, confidence, unified decision (ADVANCE/REVISE/REJECT)

**GUI Technical Review features are OUT OF SCOPE for this analysis.** They belong in Stage 14.

## Your Task

Stage 10 is unique because it's the **first naming stage** -- the venture gets its name here. The `analysisStep` will generate brand identity and name candidates from Stages 1-9 (this is given). Focus on the **stage-specific design questions**:

1. **What should the analysisStep produce?** The LLM will have Stages 1-9 as context (especially exit strategy buyer types, BMC value propositions, and market validation data). What specific naming/brand outputs should it generate? How should prior stages inform brand archetype, tone, and name candidates?

2. **Brand genome structure**: The CLI has 5 keys (archetype, values, tone, audience, differentiators). The GUI has a richer narrative model (vision, mission, brand voice, cultural style, key messages). What's the right structure for IDENTITY phase? Should brand genome be expanded?

3. **Name candidate generation**: CLI requires 5+ user-provided candidates. With an analysisStep, the LLM can generate candidates. What should the generation criteria be? How many candidates? What metadata per candidate beyond name + rationale + scores?

4. **Domain and trademark checking**: The GUI checks domain availability and trademark status. At the IDENTITY phase, how important is this? Can it be deferred? Is it even possible in a CLI context?

5. **Visual identity at naming stage**: The GUI includes cultural design styles (5 presets with color palettes). Is visual identity an IDENTITY-phase concern or a BUILD-phase concern? Should brand genome include visual direction?

6. **Scoring criteria flexibility**: The CLI lets users define any criteria with custom weights. The GUI uses predefined metrics (domain availability, trademark status, etc.). Should there be default criteria, or keep fully flexible?

7. **Stage 9 → 10 consumption**: How specifically should exit strategy inform naming? If the exit target is "acquisition by enterprise," does that change the brand? If "IPO," does the name need to be more market-facing?

8. **Decision output**: The GUI has ADVANCE/REVISE/REJECT. The CLI just ranks candidates. Should Stage 10 have a decision gate or just ranking?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions. Does Stage 10's design require changes to earlier stages (1-9) that haven't been accounted for? For example:
- Does Stage 10 need brand-related data from Stage 1 that wasn't included?
- Does the Exit Strategy buyer_type from Stage 9 need to flow into naming?

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
### 3. Brand Genome Structure Decision
### 4. Name Candidate Generation Design
### 5. Domain & Trademark: Include or Defer?
### 6. Visual Identity: Include or Defer?
### 7. Scoring Criteria Design
### 8. Stage 9 → 10 Consumption Mapping
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 10 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-9 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
