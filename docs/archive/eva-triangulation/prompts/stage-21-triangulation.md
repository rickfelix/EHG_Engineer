---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 21 "Integration Testing" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 21 of a 25-stage venture lifecycle -- the **fifth stage of THE BUILD LOOP phase**.
- **Stages 1-5**: THE TRUTH -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-20)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------:|
| 1-18 | (See prior stage summaries -- Foundation through Sprint Planning complete) |
| 19 (Build Execution) | Add `analysisStep` initializing tasks 1:1 from Stage 18 sprint items. Task enrichment: priority, sd_ref, architecture_layer_ref, story_points. Issue severity/status enums + type (bug/blocker/tech_debt/risk). sprint_completion decision (complete/partial/blocked, ready_for_qa). layer_progress derived. |
| 20 (Quality Assurance) | Add `analysisStep` scoping QA from Stage 18/19. quality_decision (pass/conditional_pass/fail) replaces strict 100% boolean. Test suite type enum (unit/integration/e2e). Defect severity/status enums. task_refs for traceability. total_failures (renamed from critical_failures). open_critical_defects. uncovered_tasks derived. Stage 19 ready_for_qa gate enforced. |

**Established pattern**: Every stage from 2-20 adds an `analysisStep` that consumes prior stages. Stage 21 will follow this pattern.

**Key upstream data available to Stage 21's analysisStep**:
- **Stage 14**: Architecture layers with integration points and technologies
- **Stage 20**: quality_decision (pass/conditional_pass/fail), test suites (including type:integration), known defects, uncovered_tasks

## Pipeline Context

**What comes BEFORE Stage 21** -- Stage 20 (Quality Assurance):
- Per consensus: quality_decision with pass/conditional_pass/fail, test suites with type (unit/integration/e2e) and task_refs, known defects with severity enums, ready_for_review boolean.

**What Stage 21 does** -- Integration Testing:
- Verify that system components work together across boundaries. Test the "seams" between architecture layers.
- **Critical question**: Does Stage 21 duplicate Stage 20's integration test suites? Or does it serve a different purpose?

**What comes AFTER Stage 21** -- Stage 22 (Sprint Review):
- Stage 22 needs: comprehensive quality assessment, integration status, readiness for deployment/review.

## CLI Stage 21 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-21.js`

**Input**: integrations[] (name, source, target, status: pass/fail/skip/pending, error_message), environment (string)

**Derived**: total_integrations, passing_integrations, failing_integrations (array), pass_rate, all_passing (boolean)

**Key properties**:
- Very narrow: only integration point pass/fail (source → target)
- No analysisStep (all user-provided)
- No connection to Stage 20 QA or Stage 14 architecture
- No severity on failures (all equal weight)
- Environment is free text
- Overlaps with Stage 20's integration test suites
- No review/approval decision for Stage 22

## GUI Stage 21 Implementation (Ground Truth)

**GUI Stage 21 = "QA & UAT"** -- a full testing/acceptance platform. Test case management with 8 categories, bug tracking with severity/status, UAT feedback with sentiment tracking, automated scoring (QA 60% + UAT 40% = Overall Readiness), sign-off workflow (pending/approved/rejected), test coverage dashboard with trends.

The GUI's Stage 21 combines what the CLI splits across Stages 20-21, plus adds UAT. The CLI has no UAT concept at all.

## Your Task

Stage 21 has a fundamental identity question: is it a separate stage from Stage 20, or should it be merged? The CLI splits QA (Stage 20) from Integration Testing (Stage 21), but Stage 20 already has integration test suites.

1. **Stage 20/21 overlap resolution**: Stage 20 now has test_suites with type:integration. Stage 21 has integration points (source → target → status). Are these testing the same thing? Should Stage 21 be reconceived, merged into Stage 20, or kept separate with a clear scope distinction?

2. **What should the analysisStep generate?** If Stage 21 stays separate, what does the analysisStep derive? Stage 14 has architecture layers with integration points. Should Stage 21 auto-populate integrations from Stage 14?

3. **Review decision**: Stage 21 has no gate or decision. Should it have a review_decision (approve/conditional/reject) that gates Stage 22? Or is all_passing sufficient?

4. **Integration severity**: Failed integrations have no severity. A payment gateway failure is the same as a logging integration failure. Should integrations have priority/severity?

5. **Architecture layer reference**: Should integrations reference Stage 14 layers? (source_layer_ref, target_layer_ref instead of free-text source/target)

6. **Environment enum**: Should environment be an enum (development/staging/production) rather than free text?

7. **UAT component**: The GUI has full UAT feedback collection. Should the CLI add UAT to Stage 21? Or is UAT out of scope for a CLI-based venture lifecycle?

8. **Stage identity**: Given the overlap with Stage 20, should Stage 21 be reconceived as "Code Review / Integration Review" (reviewing the build output and integration quality) rather than "Integration Testing" (which Stage 20 already covers)?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-20).

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

### 2. Stage 20/21 Overlap Resolution
### 3. AnalysisStep Design
### 4. Review Decision
### 5. Integration Severity
### 6. Architecture Layer Reference
### 7. Environment Enum
### 8. UAT Component Decision
### 9. Stage Identity Recommendation
### 10. CLI Superiorities (preserve these)
### 11. Recommended Stage 21 Schema
### 12. Minimum Viable Change (priority-ordered)
### 13. Cross-Stage Impact
### 14. Dependency Conflicts (with Stages 1-20 decisions)
### 15. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
