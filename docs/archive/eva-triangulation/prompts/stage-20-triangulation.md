# EVA Venture Lifecycle -- Stage 20 "Quality Assurance" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 20 of a 25-stage venture lifecycle -- the **fourth stage of THE BUILD LOOP phase**.
- **Stages 1-5**: THE TRUTH -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-19)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------:|
| 1-16 | (See prior stage summaries -- Foundation through Blueprint complete) |
| 17 (Pre-Build Checklist) | Add `analysisStep`. Seed items from Stages 13-16. priority (critical/high/medium/low). source_stage_ref. build_readiness (go/conditional_go/no_go). Blocker severity enum. |
| 18 (Sprint Planning) | Add `analysisStep`. Suggested items from Stage 13 "now" deliverables (advisory, not forced). phase_ref on sprint. Enriched SD Bridge with architecture_layers + technologies + suggested_assignee_role. capacity_check + sprint_budget warnings. Stage 17 readiness gate. |
| 19 (Build Execution) | Add `analysisStep` initializing tasks 1:1 from Stage 18 sprint items. Task enrichment: priority, sd_ref, architecture_layer_ref, story_points. Issue severity/status enums + type (bug/blocker/tech_debt/risk). sprint_completion decision (complete/partial/blocked, ready_for_qa). layer_progress derived. sd_execution_summary derived. Stage 19 as lightweight venture-level aggregation, not duplicating LEO SD tracking. |

**Established pattern**: Every stage from 2-19 adds an `analysisStep` that consumes prior stages. Stage 20 will follow this pattern.

**Key upstream data available to Stage 20's analysisStep**:
- **Stage 18**: Sprint items with success_criteria (what to test against)
- **Stage 19**: Completed tasks, issues (with severity/type), sprint_completion decision (ready_for_qa), layer_progress, sd_execution_summary

## Pipeline Context

**What comes BEFORE Stage 20** -- Stage 19 (Build Execution):
- Per consensus: tasks with status/priority/architecture_layer_ref, issues with severity enum + type, sprint_completion decision, layer_progress per architecture layer, ready_for_qa boolean.

**What Stage 20 does** -- Quality Assurance:
- Verify the build output meets quality standards. Run tests, measure coverage, identify defects.
- **Stage 19's sprint_completion.ready_for_qa gates entry to Stage 20.**

**What comes AFTER Stage 20** -- Stage 21 (Code Review / Integration Review):
- Stage 21 needs: quality assessment results, known defects with severity, pass/fail determination, coverage metrics.

## CLI Stage 20 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-20.js`

**Input**: test_suites[] (name, total_tests, passing_tests, coverage_pct), known_defects[] (description, severity free text, status free text)

**Derived**: overall_pass_rate, coverage_pct (avg), critical_failures (misleadingly = ALL failures), total_tests, total_passing, quality_gate_passed (100% pass + ≥60% coverage)

**Key properties**:
- Very strict quality gate: requires 100% pass rate (one flaky test blocks everything)
- No analysisStep (test suites are user-provided)
- known_defects severity/status are free text
- critical_failures counts ALL failures, not just critical-severity ones
- No connection to Stage 19 tasks or sprint items
- No test type categorization (unit, integration, e2e)
- No test-to-requirement traceability
- MIN_COVERAGE_PCT = 60 (hardcoded)

## GUI Stage 20 Implementation (Ground Truth)

**GUI Stage 20 = "Security & Performance"** -- completely different scope. The GUI does security checks (15 items: auth, authorization, data protection, input validation, infrastructure, logging), performance metrics (10 items with specific targets like LCP ≤2.5s), and accessibility (WCAG 2.1 AA).

The GUI's QA scope is irrelevant to the CLI's Quality Assurance stage. Security and performance hardening are important but are NOT what the CLI's Stage 20 is about.

## Your Task

Stage 20 receives Stage 19's build output and must assess quality. The build was executed via Strategic Directives in the LEO Protocol. Stage 20 validates the results.

1. **What should the analysisStep generate?** Stage 19 has tasks with architecture_layer_ref, sprint items with success_criteria (from Stage 18). Should the analysisStep generate test suite scaffolding from these? Or just scope what needs testing?

2. **Quality gate calibration**: 100% pass rate is unrealistic. What should the threshold be? Should different test types (unit, integration, e2e) have different thresholds? Should the gate be a decision (pass/conditional_pass/fail) rather than a boolean?

3. **Test type categorization**: Should test_suites have a `type` field (unit, integration, e2e, security, performance)? Does this help Stage 21 review or is it over-engineering?

4. **Test-to-requirement traceability**: Should test suites reference Stage 18 sprint items or Stage 19 tasks? Can Stage 20 tell "which tasks are covered by tests" vs "which tasks have no test coverage"?

5. **known_defects enhancement**: Severity and status are free text (same issue as Stage 19). Should they use the same enums? Should defects reference specific tasks or test suites?

6. **critical_failures fix**: Currently counts ALL failures as "critical." Should this be renamed? Should critical failures be filtered by defect severity?

7. **Stage 19 readiness gate**: Stage 19 now has sprint_completion.ready_for_qa. Should Stage 20 enforce this? What if ready_for_qa = false?

8. **Security/performance/accessibility**: The GUI has extensive security checks and performance benchmarks. Should the CLI add any of this? Or is the CLI's scope correctly limited to test-suite-based QA?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-19).

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

### 2. AnalysisStep Design (Stage 19 build output → QA scope)
### 3. Quality Gate Calibration
### 4. Test Type Categorization
### 5. Test-to-Requirement Traceability
### 6. Known Defects Enhancement
### 7. critical_failures Fix
### 8. Stage 19 Readiness Gate
### 9. Security/Performance/Accessibility Decision
### 10. CLI Superiorities (preserve these)
### 11. Recommended Stage 20 Schema
### 12. Minimum Viable Change (priority-ordered)
### 13. Cross-Stage Impact
### 14. Dependency Conflicts (with Stages 1-19 decisions)
### 15. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
