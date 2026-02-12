# EVA Venture Lifecycle -- Stage 22 "Release Readiness" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 22 of a 25-stage venture lifecycle -- the **last stage of THE BUILD LOOP phase**. This stage contains the Phase 5→6 Promotion Gate (BUILD LOOP → LAUNCH & LEARN).
- **Stages 1-5**: THE TRUTH -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-21)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------:|
| 1-18 | (See prior stage summaries -- Foundation through Sprint Planning complete) |
| 19 (Build Execution) | analysisStep 1:1 from Stage 18 items. sprint_completion (complete/partial/blocked). ready_for_qa. layer_progress. sd_execution_summary. |
| 20 (Quality Assurance) | analysisStep from Stage 18/19. quality_decision (pass/conditional_pass/fail) replacing 100% boolean. Test type enum. Defect enums. task_refs. total_failures. |
| 21 (Build Review) | Reconceived from "Integration Testing." analysisStep from Stage 14/20. Integration verification (verified/failed/untested) from Stage 14 layers. review_decision (approve/conditional/reject). Lightweight optional UAT. Environment enum. |

**Established pattern**: Every stage from 2-21 adds an `analysisStep`. Stage 22 will follow this pattern.

**Critical context**: Stage 22's promotion gate currently references the OLD Stage 20/21 contracts (quality_gate_passed boolean and all_passing). These must be updated to use quality_decision and review_decision per consensus.

## Pipeline Context

**What comes BEFORE Stage 22** -- Stage 21 (Build Review):
- Per consensus: review_decision (approve/conditional/reject), integration verification from Stage 14, quality assessment summarizing Stage 20, optional UAT summary, ready_for_sprint_review boolean.

**What Stage 22 does** -- Release Readiness:
- The final checkpoint before LAUNCH & LEARN. Sprint review, release approval, and Phase 5→6 promotion gate.

**What comes AFTER Stage 22** -- Stage 23 (first LAUNCH & LEARN stage):
- Stage 23 needs: confirmed release readiness, promotion gate passed, sprint summary, known issues, deployment plan.

## CLI Stage 22 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-22.js`

**Input**: release_items[] (name, category free text, status: pending/approved/rejected, approver), release_notes (min 10 chars), target_date

**Derived**: total_items, approved_items, all_approved, promotion_gate (Phase 5→6 evaluation checking Stages 17-22)

**evaluatePromotionGate()**: Pure function checking:
- Stage 17: all categories present, readiness ≥ 80%
- Stage 18: ≥ 1 sprint item
- Stage 19: completion ≥ 80%, no blocked tasks
- Stage 20: quality_gate_passed (100% pass -- NOW STALE)
- Stage 21: all_passing (NOW STALE)
- Stage 22: all release items approved

**Key properties**:
- No analysisStep
- Promotion gate is the critical feature (BUILD LOOP exit)
- Gate references stale Stages 20/21 contracts
- Release item category is free text
- No sprint review/retrospective
- No deployment configuration

## GUI Stage 22 Implementation (Ground Truth)

**GUI Stage 22 = "Deployment"** -- a full deployment execution platform. 14 pre-deployment checks across 4 categories (prerequisites, infrastructure, operations, communication), deployment configuration (blue-green/rolling/canary/recreate), 8-step deployment execution workflow, chairman approval, post-deployment documentation.

The GUI focuses on actual deployment mechanics. This is too operational for a venture lifecycle tool -- deployment details vary by technology stack.

## Your Task

Stage 22 is the final BUILD LOOP stage with the Phase 5→6 Promotion Gate. It must summarize the sprint, assess release readiness, and gate the transition to LAUNCH & LEARN.

1. **What should the analysisStep generate?** Stage 22 has the entire BUILD LOOP (17-21) behind it. Should the analysisStep generate a sprint summary? A release readiness assessment? What data should it synthesize?

2. **Promotion gate update**: The gate must be updated from the stale boolean checks to use the new decision-based contracts from Stages 19-21. What should the updated gate logic be?

3. **Sprint review / retrospective**: Stage 22 is the last BUILD LOOP stage. Should it include a retrospective component? What went well, what didn't, velocity/story points delivered, quality metrics?

4. **Release item categories**: Should category be an enum? What categories? (infrastructure, code, documentation, operations, communication?)

5. **Release decision**: Should Stage 22 have a release_decision (release/hold/cancel) in addition to the promotion gate? The gate checks structural completion; the decision is the human judgment.

6. **Sprint summary**: Should Stage 22 derive a sprint summary from Stages 18-21? (planned vs completed items, story points delivered, quality metrics, key achievements, known issues)

7. **Deployment readiness vs release readiness**: The GUI has detailed deployment checks (infrastructure, DNS, SSL, rollback plan). Should the CLI add any deployment readiness? Or is that out of scope?

8. **target_date validation**: Currently a free string. Should it be a date format? Is target_date even the right field (should it be release_date or sprint_end_date)?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-21).

## Gap Importance Rubric

| Score | Label | Criteria |
|-------|-------|----------|
| 5 | **Critical** | Without closing this gap, the stage cannot function or produces incorrect downstream decisions |
| 4 | **High** | Significantly degrades downstream stage quality |
| 3 | **Medium** | Improves quality but the stage can function without it |
| 2 | **Low** | Nice to have; minimal impact on pipeline correctness |
| 1 | **Cosmetic** | UX or presentation concern with no analytical impact |

**For each gap, also challenge**: Does this gap truly need to be closed, or does the CLI's existing infrastructure already addresses it differently?

## Output Format

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |

### 2. AnalysisStep Design (BUILD LOOP synthesis)
### 3. Promotion Gate Update
### 4. Sprint Review / Retrospective
### 5. Release Item Categories
### 6. Release Decision
### 7. Sprint Summary
### 8. Deployment Readiness Decision
### 9. target_date Fix
### 10. CLI Superiorities (preserve these)
### 11. Recommended Stage 22 Schema
### 12. Minimum Viable Change (priority-ordered)
### 13. Cross-Stage Impact
### 14. Dependency Conflicts (with Stages 1-21 decisions)
### 15. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
