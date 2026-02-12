# EVA Venture Lifecycle -- Stage 25 "Venture Review" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 25 of a 25-stage venture lifecycle -- the **FINAL stage of the entire lifecycle**. This is where the venture journey concludes with a comprehensive review and decision about the venture's future.
- **Stages 1-5**: THE TRUTH -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-24)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------:|
| 1-22 | (See prior stage summaries -- Foundation through Release Readiness complete) |
| 23 (Launch Execution) | analysisStep synthesizing Stage 22 release packet. Kill gate with upstream validation. launch_type enum. success_criteria as Stage 24 contract. planned/actual_launch_date. rollback_triggers. |
| 24 (Metrics & Learning) | analysisStep evaluating launch success. AARRR framework (5 categories). success_criteria_evaluation mapping Stage 23 criteria to actual metrics. Learning categories enum. Funnels with conversion rates. Launch type context for metric interpretation. |

**Established pattern**: Every stage from 2-24 adds an `analysisStep`. Stage 25 will follow this pattern.

**Critical context**: Stage 25 is the FINAL stage. It should provide a comprehensive review of the entire 25-stage venture journey. It has access to every prior stage's data. The most important output is the **venture decision**: what happens next (continue, pivot, expand, sunset)?

## Pipeline Context

**What comes BEFORE Stage 25** -- Stage 24 (Metrics & Learning):
- Per consensus: AARRR metrics with success criteria evaluation, launch scorecard, learnings with categories, funnels with conversion rates.

**What Stage 25 does** -- Venture Review:
- The capstone. Reviews the entire venture lifecycle, detects vision drift from Stage 1, captures initiatives across 5 categories, and defines next steps.

**What comes AFTER Stage 25** -- Nothing (or next iteration):
- Stage 25 is terminal. However, a venture may loop back (new BUILD LOOP sprint) or transition to ongoing operations.

## CLI Stage 25 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-25.js`

**Input**: review_summary (string, min 20 chars), initiatives object (5 categories -- product/market/technical/financial/team -- each with title/status free text/outcome), current_vision (string, min 10 chars), drift_justification (string, optional), next_steps[] (action, owner, timeline free text)

**Derived**: total_initiatives, all_categories_reviewed, drift_detected, drift_check (word overlap vs Stage 1 vision)

**detectDrift()**: Pure function comparing current_vision vs Stage 1 (venture_name + elevator_pitch):
- Tokenizes both into words >3 chars
- Calculates word overlap ratio
- drift_detected = true if overlap < 30%
- Returns rationale with overlap percentage

**Key properties**:
- No analysisStep
- Drift detection is word-overlap (not semantic analysis)
- Initiative status is free text (not enum)
- next_steps timeline is free text (not date)
- No connection to Stage 24 metrics (was the launch successful?)
- No overall venture health score
- No venture decision (continue/pivot/kill/exit) -- arguably the MOST IMPORTANT missing output
- No comparison against financial projections (Stage 5 or 16)
- 5 review categories (product/market/technical/financial/team) are reasonable

## GUI Stage 25 Implementation (Ground Truth)

**GUI Stage 25 = "Optimization & Scale"** -- fundamentally different focus (forward-looking strategic planning vs CLI's retrospective review).

**Scale Readiness Assessment**: 4 dimensions (Infrastructure, Team, Operations, Financial) scored. Overall readiness.

**Scaling Areas**: Infrastructure (capacity, timeline, investment), Team (headcount, hires, skill gaps), Operations (maturity, automation, compliance).

**Growth Projections**: 3 scenarios (conservative/base/optimistic), revenue stream evolution, resource planning, capacity planning.

**Market Expansion**: Geographic expansion (regions, regulatory), product expansion, market penetration strategy.

**Scale Challenges**: Bottlenecks, scaling risks, success metrics (ARR, customer count, team size, market penetration).

**Stage25Viewer.tsx**: Final review across all 25 stages with pass/fail, handoff items, unified decision (ADVANCE/REVISE/REJECT), confidence score, composite score.

## Your Task

Stage 25 is the FINAL stage of the entire venture lifecycle. It must provide a definitive assessment of the venture's journey and a clear decision about its future.

1. **What should the analysisStep generate?** Stage 25 has the ENTIRE venture history (Stages 1-24). Should the analysisStep generate a comprehensive venture health assessment? A comparison of original projections vs actuals? A recommendation for the venture decision?

2. **Venture decision**: The most glaring omission. Should Stage 25 have a venture_decision (continue/pivot/expand/sunset/exit)? This is arguably the single most important output of the entire 25-stage lifecycle. How should this decision relate to the drift detection?

3. **Drift detection enhancement**: The current word-overlap approach is simplistic. Should drift detection be enhanced? Should it use semantic comparison? Or is word overlap sufficient given that the analysisStep can provide richer analysis?

4. **Initiative status**: Currently free text. Should it be an enum (planned/in_progress/completed/abandoned)? Should initiatives reference prior stage data?

5. **Financial comparison**: Stage 5 has profitability projections. Stage 16 has financial projections. Stage 24 has revenue metrics. Should Stage 25 compare projected vs actual financials?

6. **Venture health score**: The GUI's viewer has a composite score. Should the CLI derive an overall venture health score? What dimensions should it cover?

7. **Next steps timeline**: Currently free text. Should it be a structured date or timeframe? Should next steps have priorities?

8. **Scale planning**: The GUI focuses on scaling. Should Stage 25 include any forward-looking elements (expansion plans, scale readiness)? Or should it remain purely retrospective?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-24).

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

### 2. AnalysisStep Design (Venture capstone synthesis)
### 3. Venture Decision
### 4. Drift Detection Enhancement
### 5. Initiative Status
### 6. Financial Comparison (Projected vs Actual)
### 7. Venture Health Score
### 8. Next Steps Enhancement
### 9. Scale Planning
### 10. CLI Superiorities (preserve these)
### 11. Recommended Stage 25 Schema
### 12. Minimum Viable Change (priority-ordered)
### 13. Cross-Stage Impact
### 14. Dependency Conflicts (with Stages 1-24 decisions)
### 15. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
