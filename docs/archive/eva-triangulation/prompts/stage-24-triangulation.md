---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 24 "Metrics & Learning" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 24 of a 25-stage venture lifecycle -- the **second stage of LAUNCH & LEARN**.
- **Stages 1-5**: THE TRUTH -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-23)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------:|
| 1-22 | (See prior stage summaries -- Foundation through Release Readiness complete) |
| 23 (Launch Execution) | analysisStep synthesizing Stage 22 release packet into launch readiness brief. Kill gate enhanced with upstream validation (Stage 22 promotion gate + release_decision). launch_type enum (soft_launch/beta/general_availability). success_criteria as contract with Stage 24. launch_tasks status enum. planned_launch_date + actual_launch_date. rollback_triggers structured. |

**Established pattern**: Every stage from 2-23 adds an `analysisStep`. Stage 24 will follow this pattern.

**Critical context**: Stage 23 defines `success_criteria` (metric, target, measurement_window, priority) that Stage 24 should measure against. Stage 23 also provides `launch_type` (soft_launch/beta/GA) which affects metric interpretation.

## Pipeline Context

**What comes BEFORE Stage 24** -- Stage 23 (Launch Execution):
- Per consensus: kill gate with upstream validation, launch_type, success_criteria[], planned/actual_launch_date, rollback_triggers, launch tasks with status enum.

**What Stage 24 does** -- Metrics & Learning:
- Post-launch measurement using AARRR framework. Captures what happened, what was learned.

**What comes AFTER Stage 24** -- Stage 25 (Venture Review):
- Stage 25 needs: metric results (on/off target), learnings, venture health assessment, evidence for continue/pivot/kill decision.

## CLI Stage 24 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-24.js`

**Input**: aarrr object (5 categories -- acquisition/activation/retention/revenue/referral -- each with metrics[name, value, target, trend_window_days]), funnels[] (name, steps[]), learnings[] (insight, action, category free text)

**Derived**: total_metrics, categories_complete, funnel_count, metrics_on_target, metrics_below_target

**Key properties**:
- No analysisStep
- AARRR framework is well-chosen for venture metrics
- No connection to Stage 23's success criteria
- Learning category is free text (not enum)
- trend_window_days exists but isn't used in derivation
- Funnel steps are untyped
- Single snapshot (no time series or trend data)
- No launch type context for metric interpretation

## GUI Stage 24 Implementation (Ground Truth)

**GUI Stage 24 = "Analytics & Feedback" / "Growth Metrics & Optimization"** -- a comprehensive growth operations dashboard.

**AARRR Pirate Metrics** (same framework as CLI): Acquisition (MAU, CAC), Activation (activation rate, time to first value), Retention (WAU, churn), Revenue (MRR, ARPU), Referral (NPS, referral rate). Progress bars showing target progress.

**Growth Dashboard**: MAU, user growth rate, revenue growth rate, NRR, gross margin, cohort analysis (retention rates by month, revenue per user, LTV).

**Optimization Tools**: A/B testing platform (active experiments, velocity, success rate), data analytics quality score, performance improvements (baseline vs current).

**Customer Lifecycle**: Journey mapping (Awareness → Trial → Adoption → Expansion) with touchpoints, retention strategies with implementation status, expansion opportunities with revenue potential.

**Growth Levers**: Viral mechanics (viral coefficient, k-factor), scalable acquisition channels, product-led growth metrics (feature adoption, activation rate, expansion revenue).

## Your Task

Stage 24 captures post-launch metrics and learnings. It should measure what Stage 23 set out to achieve and feed forward into Stage 25's venture review.

1. **What should the analysisStep generate?** Stage 24 has Stage 23's success criteria and launch context. Should the analysisStep evaluate success criteria against AARRR metrics? Generate a "launch scorecard"?

2. **Success criteria evaluation**: Stage 23 (per consensus) defines success_criteria[metric, target, measurement_window]. Should Stage 24 explicitly map AARRR metrics to these criteria and compute a "success rate"?

3. **Learning categories**: Currently free text. Should category be an enum? What categories are venture-appropriate? Should learnings reference specific AARRR categories?

4. **Funnels**: Currently name + untyped steps. Should funnel steps have conversion rates? Should funnels map to AARRR categories (e.g., acquisition funnel, activation funnel)?

5. **Trend data**: trend_window_days exists but is unused. Should Stage 24 track metric trends? Or is a single snapshot sufficient for a venture lifecycle tool (vs an operational dashboard)?

6. **Launch type context**: Stage 23 provides launch_type (soft_launch/beta/GA). Should metric targets or evaluation adjust based on launch type?

7. **Growth metrics**: The GUI has extensive growth metrics (MAU, NRR, cohort analysis, viral coefficient). Should the CLI add any growth-specific metrics beyond AARRR? Or does AARRR already cover this?

8. **Experimentation**: The GUI tracks A/B tests. Should the CLI capture experiment results? Or is experimentation an operational concern?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-23).

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

### 2. AnalysisStep Design (Post-launch evaluation)
### 3. Success Criteria Evaluation
### 4. Learning Categories
### 5. Funnels
### 6. Trend Data
### 7. Launch Type Context
### 8. Growth Metrics
### 9. Experimentation
### 10. CLI Superiorities (preserve these)
### 11. Recommended Stage 24 Schema
### 12. Minimum Viable Change (priority-ordered)
### 13. Cross-Stage Impact
### 14. Dependency Conflicts (with Stages 1-23 decisions)
### 15. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
