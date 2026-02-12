# Stage 20 "Quality Assurance" -- AntiGravity Response (Google Gemini)

> Independent response to the Stage 20 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Analysis Step | (Implicit Context) | None | **5 Critical** | Stage 20 starts blank; users must manually define what to test, ignoring Stage 18/19 context. | ADD | Is this just "filling in the blanks" or actual analysis? It's critical for traceability. |
| Quality Gate | Nuanced (likely) | Strict 100% Pass | **5 Critical** | A single flaky test blocks the entire venture progress. Unusable in real world. | RELAX | If we relax it, do we allow bad code? No, we handle it via "Conditional Pass". |
| Traceability | (Likely via IDs) | None | **4 High** | Cannot verify if specific Sprint Items (Stage 18) were actually tested. | ADD | Is linking tests to tasks over-engineering? No, it's the definition of QA. |
| Test Categorization | Security/Perf/Access. | Generic "Suites" | **3 Medium** | Hard to see what kind of testing was done (only Unit? vs E2E?). | ADD | Do we need complex types? Just a simple enum type on the suite is enough. |
| Defect Structure | Structured | Free-text | **3 Medium** | Cannot programmatically gate based on defect severity (e.g. "Blocker" vs "Minor"). | FIX | Free text is easier for humans? Yes, but breaks the automated gate logic. |
| Scope of QA | Sec/Perf/Access. | Functional Only | **2 Low** | CLI ignores non-functional requirements defined in GUI. | DEFER | Stage 20 in CLI is "Test Execution". Sec/Perf can be specific Test Suites types. |

### 2. AnalysisStep Design

The analysisStep should bridge Stage 19 (Build) and Stage 18 (Sprint) into Stage 20 (QA).

**Input**:
- Stage 19 tasks (filtering for status: done).
- Stage 19 sprint_completion (to verify readiness).
- Stage 18 items (via sprint_item_ref in tasks) to retrieve success_criteria and priority.

**Logic**:
- **Readiness Check**: If Stage 19 ready_for_qa is false, warn or block.
- **Scope Generation**: grouped by Architecture Layer (from Stage 19 context if available) or simply by Sprint Item.
- **Draft Test Plan**: Generate a recommended_test_suites list based on the types of work done (e.g. if Backend tasks -> API Tests; Frontend tasks -> E2E/Component Tests).

**Output ID**: test_plan (new section in analysis).
- Lists sprint_items that need verification.
- Lists success_criteria for each.
- Suggests test_strategies (Unit, E2E, Manual).

### 3. Quality Gate Calibration

The current 100% pass rate is a blocker.

**New Logic**:
- critical_defects == 0 (Blocks release).
- pass_rate >= 95% (Standard).
- coverage >= 60% (Keep existing).

**Decision Enum**: pass | conditional_pass | fail.
- **Pass**: All green.
- **Conditional**: Pass rate < 100% but > threshold, AND no critical defects. (Requires "Release Notes" or "Waiver").
- **Fail**: Critical defects OR low pass rate OR low coverage.

### 4. Test Type Categorization

Add type to test_suites.

**Enum**: ['unit', 'integration', 'e2e', 'performance', 'security', 'manual'].

**Benefit**: Allows Stage 21 (Integration) and Stage 25 (Launch) to see breadth of testing.

### 5. Test-to-Requirement Traceability

Add covers_refs array to test_suites.

**Content**: ID strings matching sprint_item_ref from Stage 19/18.
**derived.untested_items**: List of Stage 18 items that are NOT covered by any test suite.

### 6. Known Defects Enhancement

Align with Stage 19 Issue schemas but arguably stricter.

- **Enum Severity**: ['critical', 'high', 'medium', 'low'].
- **Enum Status**: ['open', 'investigating', 'resolved', 'waived'].
- **Logic update**: critical_failures derived field MUST only count severity: critical defects + test failures. Currently critical_failures counts any test failure as critical, which is wrong.

### 7. critical_failures Fix

Refactor critical_failures.

- **Current**: total_tests - total_passing (Every failing test is "critical").
- **Proposed**: count(tests_failed) + count(defects where severity=critical).
- **Rename**: total_failures vs blocking_failures.

### 8. Stage 19 Readiness Gate

- **Enforcement**: Stage 20 analysisStep should Throw/Warn if Stage 19 is not ready_for_qa.
- **Override**: User can force-proceed, but the analysis note will log "Entered QA despite Build indicating not ready."

### 9. Security/Performance/Accessibility

**Decision**: Do not build separate schemas/engines for these (like the GUI).

**Solution**: Treat them as Test Suite Types.
- User adds a suite: `{ name: 'Lighthouse Audit', type: 'performance', passing_tests: 90, total_tests: 100 }`.
- User adds a suite: `{ name: 'OWASP Zap Scan', type: 'security', passing_tests: 1, total_tests: 1 }`.

**Why**: Keeps schema simple while capturing the data.

### 10. CLI Superiorities

- **Unified Model**: By treating Performance/Security as just "Tests", the CLI calculates a unified Quality Score, whereas GUI siloed them.
- **Pipeline Integration**: The CLI explicitly links Tests to Sprint Items (Traceability), which the GUI often hand-waved.

### 11. Recommended Stage 20 Schema

```javascript
schema: {
  test_suites: {
    items: {
      name: { type: 'string' },
      type: { type: 'enum', values: ['unit', 'integration', 'e2e', 'performance', 'security', 'manual'] }, // NEW
      covers_refs: { type: 'array', items: { type: 'string' } }, // NEW: Traceability
      total_tests: { type: 'number' },
      passing_tests: { type: 'number' },
      coverage_pct: { type: 'number' }
    }
  },
  known_defects: {
    items: {
      description: { type: 'string' },
      severity: { type: 'enum', values: ['critical', 'high', 'medium', 'low'] }, // FIX
      status: { type: 'enum', values: ['open', 'resolved', 'waived'] }, // FIX
      associated_suite_ref: { type: 'string' } // NEW
    }
  },
  // Derived
  quality_gate_status: { type: 'enum', values: ['pass', 'conditional_pass', 'fail'] }, // REPLACES boolean
  untested_item_refs: { type: 'array' } // NEW
}
```

### 12. Minimum Viable Change

1. **Add analysisStep**: Critical to link back to Stage 18/19.
2. **Fix Quality Gate**: Change boolean quality_gate_passed to enum status and relax logic (allow failures if not critical).
3. **Standardize Enums**: Fix known_defects severity to match standard enums.
4. **Add Test Types**: Simple string enum field.

### 13. Cross-Stage Impact

- **Stage 19**: Becomes the "Requirements" provider for Stage 20.
- **Stage 21**: Receives a conditional_pass signal. Needs to decide if it accepts conditional builds (likely YES for dev/staging, NO for prod).

### 14. Dependency Conflicts

- **Stage 19 Issue Types**: Ensure Stage 20 Defect Severity matches Stage 19 Issue Severity (Build Breakers vs QA Defects). They should likely share the PRIORITY_VALUES or similar.

### 15. Contrarian Take

**"The 100% Gate is actually correct."**

Argument: In a Continuous Deployment (CD) world, any failing test should stop the line. Relaxing it to "Conditional Pass" encourages "Rotting Test Suites" where 95% is "Good Enough" and the remaining 5% are ignored forever.

Counter: This is Stage 20 of a Venture Builder. We are in early stages (Build Loop). We are not Google yet. Speed > Perfection. 100% verified is strict, but 100% passing tests might be false precision if tests are bad.

Middle Ground: Keep the defaults strict, but allow the User to override via a manual_override_reason field if they must proceed with failures. Don't bake looseness into the code; bake in "explicit risk acceptance."
