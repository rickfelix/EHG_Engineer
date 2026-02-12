# EVA Venture Lifecycle -- Stage 23 "Launch Execution" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 23 of a 25-stage venture lifecycle -- the **first stage of LAUNCH & LEARN** and contains a **Kill Gate** (Go/No-Go decision).
- **Stages 1-5**: THE TRUTH -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-22)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------:|
| 1-18 | (See prior stage summaries -- Foundation through Sprint Planning complete) |
| 19 (Build Execution) | analysisStep 1:1 from Stage 18 items. sprint_completion (complete/partial/blocked). ready_for_qa. layer_progress. sd_execution_summary. |
| 20 (Quality Assurance) | analysisStep from Stage 18/19. quality_decision (pass/conditional_pass/fail) replacing 100% boolean. Test type enum. Defect enums. task_refs. total_failures. |
| 21 (Build Review) | Reconceived from "Integration Testing." analysisStep from Stage 14/20. Integration verification (verified/failed/untested) from Stage 14 layers. review_decision (approve/conditional/reject). Lightweight optional UAT. Environment enum. |
| 22 (Release Readiness) | analysisStep synthesizing BUILD LOOP (17-21). release_decision (release/hold/cancel). sprint_summary derived. sprint_retrospective. Category enum. target_date validated. Promotion gate updated to use decision-based contracts with warnings for conditional states. |

**Established pattern**: Every stage from 2-22 adds an `analysisStep`. Stage 23 will follow this pattern.

**Critical context**: Stage 22's promotion gate must pass AND release_decision must be "release" for Phase 5→6 transition. Stage 23 receives a clean "release packet" from Stage 22 including sprint_summary, known issues (from retrospective), and confirmed release readiness.

## Pipeline Context

**What comes BEFORE Stage 23** -- Stage 22 (Release Readiness):
- Per consensus: promotion_gate (pass/fail with warnings), release_decision (release/hold/cancel with rationale), sprint_summary (planned vs delivered, quality, integration, key issues), sprint_retrospective (went_well, went_poorly, action_items), release_items with category enum.

**What Stage 23 does** -- Launch Execution:
- The Go/No-Go kill gate. Decides whether to launch or kill the venture at this point.
- This is the THIRD kill gate in the pipeline (after Stage 3 Market Validation and Stage 5 Profitability).

**What comes AFTER Stage 23** -- Stage 24 (Metrics & Learning):
- Stage 24 needs: launch status (did we launch?), launch configuration, success criteria, post-launch metrics targets, any issues from launch.

## CLI Stage 23 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-23.js`

**Input**: go_decision (go/no-go), incident_response_plan (text), monitoring_setup (text), rollback_plan (text), launch_tasks[] (name, status free text, owner), launch_date (free text string)

**Derived**: decision (pass/kill), blockProgression (boolean), reasons[]

**evaluateKillGate()**: Pure function checking:
- go_decision must be "go"
- If go: incident_response_plan, monitoring_setup, rollback_plan must each exist and be ≥10 chars
- Kill = any missing plan when go_decision is "go", OR go_decision is "no-go"
- Pass = go_decision is "go" AND all 3 plans present

**Key properties**:
- No analysisStep
- Kill gate is presence-based only (not quality-assessed)
- launch_tasks status is free text (not enum)
- launch_date is free text (no ISO validation)
- No launch type (soft/beta/hard/GA)
- No success criteria or launch metrics
- No post-launch plan beyond text fields
- No stakeholder approval mechanism

## GUI Stage 23 Implementation (Ground Truth)

**GUI Stage 23 = "Production Launch"** -- comprehensive launch orchestration.

**12 Launch Criteria** across 4 categories (Technical, Quality, Operations, Business), each with weight (1-5), met/not-met status, blocker flag. Weighted score must reach ≥80%.

**5 Launch Metrics**: DAU, Conversion Rate, Error Rate, Uptime SLA, CSAT -- each with target/current/status (on_track/at_risk/blocked).

**Launch Configuration**: launchDate (datetime), launchTime, launchType (soft/beta/hard/GA), launchAudience, marketingReady, supportReady.

**Operational Plans**: rollbackTriggers, successCriteria, postLaunchPlan, launchNotes.

**Chairman Approval**: Required for GO decision.

**Kill Gate**: weighted score ≥80% + no unresolved blockers + chairman approval.

## Your Task

Stage 23 is the first LAUNCH & LEARN stage with the Go/No-Go Kill Gate. It confirms readiness to launch and captures operational preparedness.

1. **What should the analysisStep generate?** Stage 23 has Stage 22's "release packet" (promotion gate result, release decision, sprint summary, retrospective). Should the analysisStep generate a launch readiness brief? Should it synthesize the entire venture journey (Stages 1-22)?

2. **Kill gate enhancement**: The current kill gate is presence-based (are the 3 plans written?). Should it be more sophisticated? The GUI uses weighted scoring. What's the right model for a CLI venture tool? Should the kill gate consume Stage 22's promotion gate result?

3. **Launch type**: The GUI has soft/beta/hard/GA launch types. Should the CLI add a launch_type enum? Does the launch type affect kill gate thresholds?

4. **Launch tasks**: Currently free-text status. Should status be an enum (pending/in_progress/done/blocked)? Should tasks map to any prior stage data?

5. **Success criteria and launch metrics**: The GUI tracks 5 target metrics. Should the CLI capture success criteria that Stage 24 (Metrics & Learning) can measure against? What metrics are venture-appropriate (vs operational)?

6. **Post-launch plan**: The GUI has postLaunchPlan, rollbackTriggers, successCriteria as structured fields. The CLI has 3 unstructured text fields. What structure is needed?

7. **Stakeholder approval**: The GUI requires Chairman approval for GO. Should the CLI have any approval mechanism beyond go_decision?

8. **launch_date validation**: Currently free text. Should it be ISO date? Should it capture actual launch timestamp vs planned date?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-22).

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

### 2. AnalysisStep Design (Launch readiness synthesis)
### 3. Kill Gate Enhancement
### 4. Launch Type
### 5. Launch Tasks
### 6. Success Criteria & Launch Metrics
### 7. Post-Launch Plan
### 8. Stakeholder Approval
### 9. launch_date Fix
### 10. CLI Superiorities (preserve these)
### 11. Recommended Stage 23 Schema
### 12. Minimum Viable Change (priority-ordered)
### 13. Cross-Stage Impact
### 14. Dependency Conflicts (with Stages 1-22 decisions)
### 15. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
