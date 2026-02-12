# Stage 20 "Quality Assurance" -- OpenAI Response (GPT 5.3)

> Independent response to the Stage 20 triangulation prompt.
> Respondent: OpenAI (GPT 5.3)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| `analysisStep` for QA scope | Different stage scope (security/perf checklist) | None (manual test_suites input) | **5 Critical** | Stage 21 gets inconsistent QA evidence; missing coverage intent | Add `analysisStep` that derives QA scope from Stage 18/19 | Keep it as **scope generation**, not auto-fabricated fake test results |
| Quality gate model | N/A (different paradigm) | Boolean gate: 100% pass + >=60% coverage | **5 Critical** | Over-fails healthy builds or encourages gaming | Replace with decision enum (`pass/conditional_pass/fail`) + calibrated thresholds | Avoid too many knobs; keep defaults opinionated |
| Test type categorization | Explicit domains (security/perf/accessibility) | No type field | **4 High** | Stage 21 cannot reason by risk profile | Add `type` enum (`unit/integration/e2e/[optional]nonfunctional`) | Don't force all teams to run every type every sprint |
| Traceability to requirements/tasks | Checklist item-level structure | None | **5 Critical** | Cannot prove "built item X is validated" | Add references to Stage 18 item IDs and Stage 19 task IDs | Keep links lightweight (arrays of refs), not full test management system |
| known_defects normalization | Structured checklist statuses | Free-text severity/status | **4 High** | No reliable triage; bad rollups to Stage 21 | Reuse Stage 19 enums for severity/status + add defect type | Don't duplicate Stage 19 issue tracker; link instead |
| `critical_failures` metric correctness | N/A | Misnamed (counts all failures) | **4 High** | Misleading risk signal to reviewers | Split metrics: `total_failures` + `critical_failure_count` | Rename may break consumers; provide backward-compatible alias one release |
| Stage 19 readiness gating | N/A | Not enforced | **5 Critical** | QA can run on unready builds; noisy, wasted effort | Enforce `sprint_completion.ready_for_qa` precondition | Allow explicit override with rationale for emergency QA |
| Security/perf/accessibility in Stage 20 | Extensive | Minimal test-suite QA | **3 Medium** | Potential blind spot for nonfunctional risks | Add as optional `nonfunctional_checks` block or test types, not full GUI parity | Full GUI parity here is scope creep; better as policy-driven optional checks |

### 2. AnalysisStep Design (Stage 19 build output -> QA scope)

Generate a **QA plan scaffold**, not synthetic results:

- **Inputs**:
  - Stage 18 sprint items + `success_criteria`
  - Stage 19 task execution state, issues, `architecture_layer_ref`, `ready_for_qa`
- **Outputs**:
  - `qa_scope_items[]`: each maps sprint/task refs -> required validation intent
  - `recommended_test_suites[]` (names, target type, linked refs, minimum evidence required)
  - `coverage_targets` (overall + by test type defaults)
  - `risk_focus` from open high/critical issues and weak layers
- **Principle**: Stage 20 remains evidence-driven; users/tools still provide actual test outcomes.

### 3. Quality Gate Calibration

Use decision model:

- `pass`: all mandatory thresholds met
- `conditional_pass`: core quality acceptable, non-blocking gaps with explicit follow-ups
- `fail`: blocking thresholds missed

**Recommended defaults**:
- Unit pass rate >= 95%
- Integration >= 90%
- E2E >= 85%
- Overall weighted pass >= 92%
- Coverage >= 70% overall (raise from 60), with floor on critical modules if available
- Hard fail if unresolved critical defects exceed threshold (e.g., >0 unless waived)

### 4. Test Type Categorization

Yes, add `type` on `test_suites`. It directly improves Stage 21 review quality and avoids mixing flaky E2E with deterministic unit signals.

**Suggested enum**:
- `unit`
- `integration`
- `e2e`
- `nonfunctional_security` (optional)
- `nonfunctional_performance` (optional)
- `nonfunctional_accessibility` (optional)

### 5. Test-to-Requirement Traceability

Add lightweight refs:

- `test_suite.requirement_refs[]` -> Stage 18 sprint item IDs
- `test_suite.task_refs[]` -> Stage 19 task IDs

**Derived in Stage 20**:
- `covered_task_count`, `uncovered_task_count`
- `coverage_by_layer`
- `uncovered_high_priority_tasks[]`

This gives Stage 21 clear "what shipped vs what validated" visibility.

### 6. Known Defects Enhancement

Normalize with Stage 19-compatible enums:

- `severity`: `critical/high/medium/low`
- `status`: `open/in_progress/resolved/deferred`
- `type`: `bug/blocker/tech_debt/risk`

**Add links**:
- `related_task_ref`
- `related_test_suite_ref`
- `discovered_in_test_type`

This keeps consistency across Build -> QA -> Review.

### 7. `critical_failures` Fix

Current behavior is incorrect naming.

**Change to**:
- `total_failures` = sum of all failed tests
- `critical_failure_count` = failed tests linked to critical severity defects or critical test suites
- Optional `blocking_failure_count` for gate logic

**Backward compatibility**: Keep `critical_failures` temporarily as alias to `total_failures` with deprecation note.

### 8. Stage 19 Readiness Gate

**Enforce**:
- If `ready_for_qa = false` -> Stage 20 should return `status: blocked` with reasons pulled from Stage 19.
- **Support explicit override**:
  - `force_qa: true`
  - `force_qa_reason`
  - `approved_by`

This preserves rigor while allowing urgent workflows.

### 9. Security/Performance/Accessibility Decision

Do **not** port GUI's full checklist into Stage 20 core.

**Best path**:
- Keep Stage 20 core as test-suite QA.
- Add optional nonfunctional suites/types and policy hooks.
- If org needs strict security/perf gating, configure via policy layer, not hardcoded GUI parity.

### 10. CLI Superiorities (preserve these)

- Lean, automation-friendly structure
- Explicit numeric test metrics
- Simple integration with CI pipelines
- Faster operator input vs GUI checklist overhead
- Better fit with LEO SD execution artifacts

### 11. Recommended Stage 20 Schema

- `analysisStep`:
  - `qa_scope_items[]`
  - `recommended_test_suites[]`
  - `traceability_map[]`
  - `coverage_targets`
- `test_suites[]`:
  - `name`, `type`, `total_tests`, `passing_tests`, `coverage_pct`
  - `requirement_refs[]`, `task_refs[]`
- `known_defects[]`:
  - `description`, `severity`, `status`, `type`
  - `related_task_ref`, `related_test_suite_ref`
- `quality_gate`:
  - `decision` (`pass/conditional_pass/fail`)
  - `reasons[]`
  - `thresholds_used`
- **Derived**:
  - `overall_pass_rate`, `coverage_pct`
  - `total_failures`, `critical_failure_count`
  - `traceability_coverage_pct`
  - `uncovered_high_priority_tasks[]`

### 12. Minimum Viable Change (priority-ordered)

1. Enforce Stage 19 readiness gate (`ready_for_qa`) with blocked outcome.
2. Replace boolean gate with `decision` enum and calibrated defaults.
3. Add `type` to `test_suites`.
4. Normalize `known_defects` severity/status/type enums to match Stage 19.
5. Fix `critical_failures` metric naming/splitting.
6. Add lightweight traceability refs (`requirement_refs`, `task_refs`).
7. Add `analysisStep` to generate QA scope scaffold from Stage 18/19.

### 13. Cross-Stage Impact

- **Upstream (18/19):** stronger expectation for stable IDs and clean task metadata.
- **Downstream (21):** materially better review quality via traceability, defect normalization, and calibrated gate decisions.
- **Pipeline health:** fewer false fails from rigid 100% rule; clearer risk communication.

### 14. Dependency Conflicts (with Stages 1-19 decisions)

No hard conflicts if implemented carefully. Key alignment points:

- Matches established pattern: Stage 20 adds `analysisStep` (consistent with Stages 2-19).
- Uses Stage 19 enums/issue model rather than inventing new incompatible vocabulary.
- Consumes Stage 18 success criteria and Stage 19 readiness exactly as intended.
- Potential conflict to avoid: making Stage 20 duplicate full LEO execution tracking (should remain lightweight aggregation/validation).

### 15. Contrarian Take

Most obvious recommendation is "add full traceability + typed suites + calibrated multi-threshold gates now."
Risk: this can over-engineer Stage 20 into a mini test-management platform, slowing adoption and reducing data quality (teams may fill fields perfunctorily).

Safer contrarian approach:
- First ship only: readiness gate + decision enum + defect normalization + renamed failure metrics.
- Add traceability and advanced type thresholds one iteration later after observing real usage friction.
