# EVA Venture Lifecycle -- Stage 19 "Build Execution" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 19 of a 25-stage venture lifecycle -- the **third stage of THE BUILD LOOP phase**.
- **Stages 1-5**: THE TRUTH -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-18)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------|
| 1-16 | (See prior stage summaries -- Foundation through Blueprint complete) |
| 17 (Pre-Build Checklist) | Add `analysisStep`. Seed items from Stages 13-16. priority (critical/high/medium/low). source_stage_ref. build_readiness (go/conditional_go/no_go). Blocker severity enum. |
| 18 (Sprint Planning) | Add `analysisStep`. Suggested items from Stage 13 "now" deliverables (advisory, not forced). phase_ref on sprint. Enriched SD Bridge with architecture_layers + technologies + suggested_assignee_role. capacity_check + sprint_budget warnings. Stage 17 readiness gate. |

**Established pattern**: Every stage from 2-18 adds an `analysisStep` that consumes prior stages. Stage 19 will follow this pattern.

**Key upstream data available to Stage 19's analysisStep**:
- **Stage 14**: Architecture layers with technologies (what's being built)
- **Stage 15**: Team members with skills, allocation (who's building)
- **Stage 18**: Sprint items with SD Bridge payloads (what to build this sprint), capacity_check, sprint_budget

## Pipeline Context

**What comes BEFORE Stage 19** -- Stage 18 (Sprint Planning):
- Per consensus: sprint items derived from roadmap, enriched SD Bridge payloads with architecture + team context, capacity/budget checks.

**What Stage 19 does** -- Build Execution:
- Execute the sprint plan. Track task progress, manage issues, monitor completion.
- **This is where CODE GETS WRITTEN.** Sprint items become tasks, tasks produce artifacts.

**What comes AFTER Stage 19** -- Stage 20 (Quality Assurance):
- Stage 20 needs: completed build artifacts, known issues, completion status, quality signals.

**Important context**: The CLI's SD Bridge means that in practice, sprint items become Strategic Directives executed by the LEO Protocol. Stage 19 is therefore a TRACKING stage -- it tracks the execution of SDs, not the execution itself.

## CLI Stage 19 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-19.js`

**Input**: tasks[] (name, status: todo/in_progress/done/blocked, assignee, sprint_item_ref), issues[] (description, severity free text, status free text)

**Derived**: total_tasks, completed_tasks, blocked_tasks, completion_pct, tasks_by_status

**Key properties**:
- Very thin task tracking schema
- sprint_item_ref exists but is optional and unvalidated
- No analysisStep (tasks are user-provided)
- No SD execution tracking
- Issue severity/status are free text
- No completion gate
- No architecture layer tracking

## GUI Stage 19 Implementation (Ground Truth)

**GUI Stage 19 = "Integration & API Layer"** -- completely different scope. The GUI builds API endpoints and integrations specifically, with strategy cards (rate limiting, error handling), iteration cycles, and decision badges (ADVANCE/REVISE/REJECT).

The GUI's scope is irrelevant to the CLI's Build Execution stage. The CLI stage is about general build tracking, not API-specific building.

## Your Task

Stage 19 is where the sprint plan becomes reality. Given that the SD Bridge means sprint items are executed as Strategic Directives by the LEO Protocol, Stage 19 is primarily a TRACKING and STATUS stage.

1. **What should the analysisStep generate?** Stage 18 has sprint items with SD Bridge payloads. Should the analysisStep decompose sprint items into tasks? Or should tasks map 1:1 to sprint items?

2. **Sprint-to-task derivation**: Should Stage 18 items automatically become Stage 19 tasks? Should sprint_item_ref be required? Should SD execution status feed back into task status?

3. **SD execution tracking**: The SD Bridge generates SD payloads. Should Stage 19 track which SDs are executing, completed, blocked? Is this a "SD status dashboard"?

4. **Issue management**: Severity and status are free text. Should they be enums? What severity and status values?

5. **Completion gate**: Should there be a minimum completion_pct before proceeding to Stage 20 (QA)? Should "no critical issues unresolved" be required?

6. **Task enrichment**: Tasks only have name/status/assignee/sprint_item_ref. Should they also have architecture_layer (from Stage 14), story_points (from Stage 18), estimated_effort?

7. **Architecture layer progress**: Should Stage 19 track which Stage 14 layers have been built? (frontend: 80%, backend: 60%, data: 100%, infra: 40%)

8. **Technical debt tracking**: Should issues with type "tech_debt" be tracked separately for Sprint Review (Stage 22)?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-18).

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

### 2. AnalysisStep Design (sprint items → tasks)
### 3. Sprint-to-Task Derivation
### 4. SD Execution Tracking Decision
### 5. Issue Management Enhancement
### 6. Completion Gate Decision
### 7. Task Enrichment
### 8. Architecture Layer Progress
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 19 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-18 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
