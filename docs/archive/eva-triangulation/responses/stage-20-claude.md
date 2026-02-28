---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 20 "Quality Assurance" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Quality Gate Calibration](#3-quality-gate-calibration)
  - [4. Test Type Categorization](#4-test-type-categorization)
  - [5. Test-to-Requirement Traceability](#5-test-to-requirement-traceability)
  - [6. Known Defects Enhancement](#6-known-defects-enhancement)
  - [7. critical_failures Fix](#7-critical_failures-fix)
  - [8. Stage 19 Readiness Gate](#8-stage-19-readiness-gate)
  - [9. Security/Performance/Accessibility Decision](#9-securityperformanceaccessibility-decision)
  - [10. CLI Superiorities (preserve these)](#10-cli-superiorities-preserve-these)
  - [11. Recommended Stage 20 Schema](#11-recommended-stage-20-schema)
  - [12. Minimum Viable Change (Priority-Ordered)](#12-minimum-viable-change-priority-ordered)
  - [13. Cross-Stage Impact](#13-cross-stage-impact)
  - [14. Dependency Conflicts (with Stages 1-19 decisions)](#14-dependency-conflicts-with-stages-1-19-decisions)
  - [15. Contrarian Take](#15-contrarian-take)

> Independent response to the Stage 20 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| analysisStep missing | Strategy-driven iteration | None (all user-provided) | **5 Critical** | Stage 19 has tasks with success_criteria, architecture layers, and a ready_for_qa decision. Stage 20 ignores all of this -- test suites are created in a vacuum. | ADD | Stage 20 should scope QA from Stage 19's build output, not start from scratch. |
| Quality gate too strict | Compliance gate with scoring | Boolean: 100% pass + ≥60% coverage | **5 Critical** | One flaky test or one intentionally-skipped test blocks the entire venture. 100% pass rate is a known anti-pattern in real QA. | CHANGE | Replace boolean with decision-based gate (pass/conditional/fail). Allow known failures if documented as defects. |
| known_defects severity/status free text | Structured severity cards | Free text | **4 High** | Can't filter critical defects. Can't gate on "no critical defects." Stage 21 Review can't assess defect severity distribution. | CHANGE | Per established pattern: severity enum (critical/high/medium/low), status enum (open/in_progress/resolved/wontfix). |
| critical_failures misleading | N/A | Counts ALL failures | **4 High** | Misleads: 1 low-priority test failure looks the same as 1 critical failure. Downstream stages can't distinguish severity. | FIX | Rename to `total_failures`. Add `failures_by_severity` derived from defect data. |
| No test type categorization | Security/perf/accessibility tabs | No types | **3 Medium** | Can't tell if 90% coverage is all unit tests (weak) or includes integration + e2e (strong). Stage 21 Review can't assess testing breadth. | ADD | Simple type enum: unit, integration, e2e. Security/performance types are nice-to-have but not essential for venture QA. |
| No test-to-requirement traceability | Implicit in GUI workflow | No references | **3 Medium** | Can't tell which Stage 18 success criteria are covered by tests. Untested sprint items invisible. | ADD | task_ref or sprint_item_ref on test suites. Derive coverage_by_task. |
| No Stage 19 readiness gate | GUI process flow | No gate check | **4 High** | Stage 20 can start even if Stage 19 says ready_for_qa = false. The sprint_completion gate becomes meaningless. | ADD | Enforce ready_for_qa from Stage 19's sprint_completion decision. |
| No security/perf assessment | 15 security checks, 10 perf metrics, 6 a11y checks | Nothing | **2 Low** | Security and performance gaps undetected. But: the CLI is a venture lifecycle tool, not a security audit tool. | SKIP | Security/performance testing belongs in the LEO Protocol (per-SD testing), not in venture-level QA. Stage 20 tracks test results, not runs security scans. |

### 2. AnalysisStep Design

**Input (from Stages 18-19)**:
- Stage 18 sprint items with success_criteria (what to test against)
- Stage 19 tasks with architecture_layer_ref, priority, status (what was built)
- Stage 19 issues (what problems were found during build)
- Stage 19 sprint_completion decision (ready_for_qa, critical_tasks_done)

**Process (single LLM call)**:

1. **Readiness check**: Verify Stage 19's sprint_completion.ready_for_qa = true. If false, Stage 20 cannot proceed (or proceeds with explicit override + rationale).

2. **Test scope derivation**: From Stage 19's completed tasks, derive what needs testing. Each task with status = 'done' should have at least one test suite covering it. Tasks with status = 'blocked' are excluded from test scope.

3. **Test suite scaffolding**: Generate suggested test_suites from completed tasks, grouped by architecture_layer_ref. Each suite gets a suggested scope (which tasks/sprint items it should cover) and a suggested type (unit for data layer, integration for backend, e2e for frontend).

4. **Issue carry-forward**: Stage 19 issues with status = 'open' or 'in_progress' become known_defects in Stage 20. Type mapping: bug → defect, blocker → critical defect, tech_debt → deferred (not a Stage 20 concern), risk → test focus area.

**Output**: suggested_test_suites[] (advisory), carried_defects[] from Stage 19 issues, test_scope (which tasks need coverage), readiness_check result.

### 3. Quality Gate Calibration

**Replace boolean with decision-based gate.**

```javascript
quality_decision: {
  type: 'object', derived: true,
  properties: {
    decision: { type: 'enum', values: ['pass', 'conditional_pass', 'fail'] },
    rationale: { type: 'string' },
    overall_pass_rate: { type: 'number' },
    coverage_adequate: { type: 'boolean' },
    critical_defects_open: { type: 'number' },
    ready_for_review: { type: 'boolean' },
  },
}
```

**Decision logic**:
- **PASS**: overall_pass_rate ≥ 95% AND coverage_pct ≥ 60% AND critical_defects_open = 0 → ready_for_review = true
- **CONDITIONAL_PASS**: overall_pass_rate ≥ 80% AND no critical defects AND all failures documented as known_defects → ready_for_review = true (Stage 21 reviews with caveats)
- **FAIL**: overall_pass_rate < 80% OR critical_defects_open > 0 → ready_for_review = false

**Why not 100%**: In real-world development, test flakiness is endemic. Known-failing tests should be documented as defects with severity, not block the entire pipeline. A venture at 95% pass rate with all failures documented is in better shape than one that games to 100% by deleting failing tests.

### 4. Test Type Categorization

**Add type enum to test_suites.**

```javascript
test_suites[].type: {
  type: 'enum',
  values: ['unit', 'integration', 'e2e'],
}
```

Three types, not five. Security and performance testing are specialized concerns that belong in the LEO Protocol per-SD workflow, not in venture-level QA tracking.

**Why this matters**: A venture with 90% coverage from unit tests only has weak integration assurance. A venture with 70% coverage from e2e tests has strong integration assurance. Stage 21 Review needs this distinction to assess quality holistically.

### 5. Test-to-Requirement Traceability

**Add task_ref on test suites. Derive coverage_by_task.**

```javascript
test_suites[].task_refs: { type: 'array' },  // NEW: which Stage 19 tasks this suite covers

// Derived
coverage_by_task: {
  type: 'object', derived: true,
  // Maps task name → { covered: boolean, suite_refs: string[] }
  // Computed by checking which tasks appear in at least one suite's task_refs
}
uncovered_tasks: {
  type: 'array', derived: true,
  // Tasks from Stage 19 that no test suite references
}
```

**Implementation**: task_refs is advisory -- users don't have to specify. But if they do, Stage 20 can derive "which tasks have zero test coverage" and flag them. This is valuable for Stage 21 Review.

### 6. Known Defects Enhancement

**Severity and status become enums. Add references.**

```javascript
known_defects: {
  type: 'array',
  items: {
    description: { type: 'string', required: true },
    severity: { type: 'enum', values: ['critical', 'high', 'medium', 'low'], required: true },  // CHANGED
    status: { type: 'enum', values: ['open', 'in_progress', 'resolved', 'wontfix'], required: true },  // CHANGED
    test_suite_ref: { type: 'string' },  // NEW: which suite found this
    task_ref: { type: 'string' },        // NEW: which task this relates to
  },
}
```

Consistent with Stage 19's issue enum pattern. Enables:
- "No open critical defects" gate check
- Stage 21 Review can assess defect distribution
- Stage 22 Sprint Review can track quality trends

### 7. critical_failures Fix

**Rename to `total_failures`. Add `failures_by_severity`.**

```javascript
// RENAMED (was critical_failures)
total_failures: { type: 'number', derived: true },

// NEW
open_critical_defects: { type: 'number', derived: true },
// Count of known_defects where severity = 'critical' AND status in ('open', 'in_progress')

defects_by_severity: { type: 'object', derived: true },
// { critical: N, high: N, medium: N, low: N }
```

This fixes the misleading name and provides the severity breakdown that downstream stages need.

### 8. Stage 19 Readiness Gate

**Enforce ready_for_qa from Stage 19's sprint_completion.**

The analysisStep should check Stage 19's sprint_completion.ready_for_qa:
- **true** → proceed normally
- **false** → Stage 20 cannot complete. The analysisStep should flag this and explain what's blocking (critical tasks incomplete, critical issues unresolved).

This is NOT a hard gate on entering Stage 20 -- you need to be able to enter Stage 20 to see what's going on. But the quality_decision cannot be "pass" if Stage 19 wasn't ready for QA.

### 9. Security/Performance/Accessibility Decision

**Do NOT add security, performance, or accessibility assessment to Stage 20.**

The GUI's security checks, performance benchmarks, and accessibility audits are valuable but belong in a different context:
- **Security testing** happens per-SD in the LEO Protocol (the security sub-agent already handles this).
- **Performance testing** is an operational concern, not a venture lifecycle concern.
- **Accessibility** is a design/UX concern tracked in Stage 14 (Technical Architecture) and the build process.

Stage 20's scope is: "Did the sprint's test suites pass? Are there known defects? Is the build quality sufficient for review?" It's not a security audit.

**Exception**: If a user creates a test suite with type = 'e2e' that includes security or performance tests, the framework should accept it. But Stage 20 shouldn't mandate these test types.

### 10. CLI Superiorities (preserve these)

- **Test suite as data**: test_suites with numeric pass/total is clean, universal, tool-agnostic. Any CI system can produce these numbers.
- **Coverage tracking**: coverage_pct per suite is a well-understood metric.
- **Quality gate concept**: The idea of a quality gate is correct -- it just needs calibration.
- **known_defects as separate array**: Defects are cross-cutting, not suite-specific (though adding suite_ref helps traceability).
- **Minimal schema**: QA should be lightweight. The actual testing happens in the LEO Protocol, not in this template.

### 11. Recommended Stage 20 Schema

```javascript
const TEMPLATE = {
  id: 'stage-20',
  slug: 'quality-assurance',
  title: 'Quality Assurance',
  version: '2.0.0',
  schema: {
    // === Updated: test suites with type + traceability ===
    test_suites: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        type: { type: 'enum', values: ['unit', 'integration', 'e2e'] },  // NEW
        total_tests: { type: 'number', min: 0, required: true },
        passing_tests: { type: 'number', min: 0, required: true },
        coverage_pct: { type: 'number', min: 0, max: 100 },
        task_refs: { type: 'array' },  // NEW: Stage 19 tasks covered
      },
    },

    // === Updated: known defects with enums + references ===
    known_defects: {
      type: 'array',
      items: {
        description: { type: 'string', required: true },
        severity: { type: 'enum', values: ['critical', 'high', 'medium', 'low'], required: true },  // CHANGED
        status: { type: 'enum', values: ['open', 'in_progress', 'resolved', 'wontfix'], required: true },  // CHANGED
        test_suite_ref: { type: 'string' },  // NEW
        task_ref: { type: 'string' },        // NEW
      },
    },

    // === Updated derived ===
    overall_pass_rate: { type: 'number', derived: true },
    coverage_pct: { type: 'number', derived: true },
    total_tests: { type: 'number', derived: true },
    total_passing: { type: 'number', derived: true },
    total_failures: { type: 'number', derived: true },            // RENAMED from critical_failures
    open_critical_defects: { type: 'number', derived: true },      // NEW
    defects_by_severity: { type: 'object', derived: true },        // NEW

    // === NEW: test coverage by task ===
    coverage_by_task: { type: 'object', derived: true },
    uncovered_tasks: { type: 'array', derived: true },

    // === NEW: quality decision (replaces quality_gate_passed boolean) ===
    quality_decision: {
      type: 'object', derived: true,
      properties: {
        decision: { type: 'enum', values: ['pass', 'conditional_pass', 'fail'] },
        rationale: { type: 'string' },
        overall_pass_rate: { type: 'number' },
        coverage_adequate: { type: 'boolean' },
        critical_defects_open: { type: 'number' },
        ready_for_review: { type: 'boolean' },
      },
    },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 12. Minimum Viable Change (Priority-Ordered)

1. **P0: Add `analysisStep` scoping QA from Stage 19 build output**. Readiness check (ready_for_qa), test scope derivation from completed tasks, issue carry-forward from Stage 19, suggested test suites by architecture layer.

2. **P0: Replace `quality_gate_passed` boolean with `quality_decision`**. pass/conditional_pass/fail based on pass rate (≥95% pass, ≥80% conditional), coverage (≥60%), and critical defects (0 for pass). Determines ready_for_review for Stage 21.

3. **P1: Change known_defects severity/status to enums**. severity: critical/high/medium/low. status: open/in_progress/resolved/wontfix. Add test_suite_ref and task_ref.

4. **P1: Rename critical_failures to total_failures**. Add open_critical_defects and defects_by_severity derived fields. Fix the misleading name.

5. **P2: Add test suite `type` field**. unit/integration/e2e. Enables quality breadth assessment in Stage 21.

6. **P2: Add `task_refs` on test suites**. Enables coverage_by_task and uncovered_tasks derived fields. Advisory -- not required.

7. **P3: Do NOT add security/performance/accessibility** (LEO Protocol handles per-SD).
8. **P3: Do NOT add test execution automation** (Stage 20 tracks results, not runs tests).
9. **P3: Do NOT add test case management** (individual test cases belong in testing tools, not venture lifecycle).

### 13. Cross-Stage Impact

| Change | Stage 19 (Build) | Stage 21 (Review) | Stage 22 (Sprint Review) |
|--------|-----------------|------------------|------------------------|
| analysisStep from Stage 19 | Stage 19's ready_for_qa gates Stage 20 entry. Build issues carry forward. | Review receives structured QA scope. | Sprint review sees QA → build traceability. |
| quality_decision (3-way) | N/A | Review has pass/conditional/fail signal. Conditional = review with caveats. | Sprint review compares quality across sprints. |
| Test type categorization | N/A | Review can assess testing breadth (unit-only vs full stack). | Sprint review tracks testing maturity. |
| Coverage by task | Stage 19 tasks are coverage targets. | Review flags untested tasks. | Sprint review sees coverage improvement over time. |

### 14. Dependency Conflicts (with Stages 1-19 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 19 → 20 (sprint_completion → readiness) | **OK** | ready_for_qa gates Stage 20 quality_decision. Stage 19 provides the signal. |
| Stage 19 → 20 (tasks → test scope) | **OK** | Tasks with architecture_layer_ref enable per-layer test suggestions. |
| Stage 19 → 20 (issues → known_defects) | **Soft** | Stage 19 issues should seed Stage 20 known_defects. Type mapping: bug→defect, blocker→critical defect, tech_debt→excluded, risk→test focus. |
| Stage 18 → 20 (success_criteria → test targets) | **OK** | Sprint items have success_criteria that define what tests should verify. |

### 15. Contrarian Take

**Arguing AGAINST making Stage 20 consume Stage 19 data:**

1. **QA should be independent**. The whole point of QA is to be an independent verification. If Stage 20's test scope is derived from Stage 19's tasks, the QA is testing what developers said they built, not what actually needs to work. QA should define its own scope based on Stage 18 success_criteria (requirements), not Stage 19 tasks (implementation).

2. **The analysisStep creates false confidence**. Suggested test suites based on architecture layers sound rigorous but could lead teams to believe they have good coverage when they only have auto-generated scaffold names with no actual test content. A test suite named "backend-integration" with 0 tests is worse than no entry at all.

3. **Test-to-task traceability is overhead for small teams**. If a venture has 5 sprint items and 3 test suites, the mapping is obvious. task_refs adds work without adding insight until the venture has 20+ tasks. For the typical EVA venture, this is premature.

4. **What could go wrong**: Teams game the quality_decision by marking all failures as known_defects with severity:low. Pass rate drops to 85%, but all failures are "documented" so it's a conditional_pass. The gate becomes ceremonial.

**Counter-argument**: Stage 20 should scope QA from Stage 19 tasks AND Stage 18 requirements. The analysisStep scopes what to test; it doesn't replace actually running tests. And the quality_decision's conditional_pass still flags the build for extra scrutiny in Stage 21 Review -- it's not a rubber stamp. The real value is visibility: "5 of 10 tasks have zero test coverage" is actionable information regardless of team size.

**Verdict**: Keep the analysisStep but frame suggested_test_suites as advisory. The real gate is the quality_decision, which is based on actual test results, not suggested coverage. And keep task_refs optional -- don't mandate traceability for small ventures.
