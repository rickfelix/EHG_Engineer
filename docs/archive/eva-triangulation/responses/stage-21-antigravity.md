---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 21 "Integration Testing" -- AntiGravity Response (Google Gemini)

> Independent response to the Stage 21 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Analysis Step | N/A (GUI flows differently) | None (User manual entry) | **5 Critical** | User must manually re-enter integration points defined in Stage 14. | ADD | Can we just rely on users? No, creates drift between Arch (Stg 14) and Testing (Stg 21). |
| UAT / Acceptance | Full UAT module with feedback & scoring | None | **4 High** | "User" voice is missing from "Release Readiness". | ADD (Simplified) | Is UAT a "CLI" thing? Yes, capturing "approvals" or "feedback" is valid data even in CLI. |
| Integration Source | Implicit in architecture | Free text source/target | **3 Medium** | Hard to trace failures back to Stage 14 layers. | REFINE | Strict layer references might be too rigid for micro-integrations. |
| Severity/Priority | Bug tracking with severity | Binary pass/fail | **4 High** | A minor logging failure blocks release (Stage 22 gate) same as Payment failure. | ADD | Complex severity enums might be overkill. Just critical vs non-critical? |
| Environment | Configurable environments | Free text string | **2 Low** | Typing "prod" vs "production" causes inconsistency. | ENUM | Specific environments vary by venture. |
| Review Decision | Sign-off workflow | None (Derived all_passing) | **3 Medium** | No human "override" for non-critical failures. | ADD | If all tests pass, do we need manual approval? Yes, for verifying coverage quality. |
| Test Evidence | Screenshots, logs, traces | error_message string | **2 Low** | Hard to debug without context. | KEEP | CLI shouldn't store blobs. Links/references are enough. |

### 2. Stage 20/21 Overlap Resolution

**The Conflict**:
- Stage 20 (QA): Validates correctness of code/features (Unit, Component, E2E).
- Stage 21 (Integrations): Validates connectivity and contracts between Architecture Layers (defined in Stage 14).

**Resolution**: Keep Separate, but Narrow Stage 21.
- Stage 20 focuses on Test Suites (coverage, pass rates).
- Stage 21 focuses on Architecture Seams (Stage 14 Integration Points).
- Stage 21 should NOT be a generic "Integration Test" bucket (which belongs in Stage 20). It should specifically verify the integration_points array from Stage 14.

**Identity**: Stage 21 is "Architecture Verification" or "System Connectivity", whereas Stage 20 is "Code Quality".

### 3. AnalysisStep Design

The analysisStep should be the bridge from Architecture (Stage 14) to Testing (Stage 21).

**Inputs**:
- stage14.integration_points: The intended connections (e.g., "Frontend -> API", "API -> Database").
- stage20.test_suites: Look for suites tagged type: integration.

**Logic**:
- **Import Integrations**: For each integration_point in Stage 14, create a pending integration record in Stage 21.
- **Map Layers**: Preserve source_layer and target_layer refs.
- **Heuristic Status**: If Stage 20 has a passing test suite named similarly to the integration, hint it might be passing, but leave as pending for explicit confirmation.

### 4. Review Decision

**Recommendation**: Add review_decision (approve/reject/conditional). Stage 21 creates a hard gate for Stage 22. If a non-critical integration fails, the team needs a way to "Conditionally Pass" the stage.

**Gate**: Stage 22 should check stage21.review_decision === 'approved' || 'conditional_pass', NOT just all_passing.

### 5. Integration Severity

**Recommendation**: Add criticality enum (critical, normal, low). Stage 22 blocks on any failure is too brittle.

**Implementation**: Derived critical_failures count. Gate: Downstream (Stage 22) can choose to block only on critical_failures > 0.

### 6. Architecture Layer Reference

**Recommendation**: Strictly Link. Use source_layer_ref and target_layer_ref instead of free text. Value must match keys in stage14.layers. Trace failures to architectural impact.

### 7. Environment Enum

**Recommendation**: Keep Free Text (with suggestion). Every venture has weird env names. Enforcing an enum is too restrictive. Compromise: Validate it's a non-empty string.

### 8. UAT Component Decision

**Recommendation**: Add Minimal UAT. The CLI entirely misses the "User" part of the Build Loop.

**Implementation**: Add a simple uat_feedback array: user (string), verdict (pass/fail), notes (string). Gate: Require at least one UAT entry if uat_required flag is set (optional).

### 9. Stage Identity Recommendation

**Recommendation**: Rename to "Integration & Acceptance".
- Stage 20: "Did we build the thing right?" (Engineering Standard)
- Stage 21: "Does it work in the system?" (Architecture Standard) & "Does the user want it?" (Product Standard).

### 10. CLI Superiorities

- **Focus**: The CLI forces specific focus on Architecture Integrations (Stage 14 linkage) which the GUI's generic "Test Case" bucket often loses.
- **Speed**: Binary status checks are faster to parse than complex scoring algorithms.

### 11. Recommended Stage 21 Schema

```javascript
schema: {
  integrations: {
    type: 'array',
    items: {
      name: { type: 'string' },
      stage14_ref: { type: 'string' },
      source_layer_ref: { type: 'string' },
      target_layer_ref: { type: 'string' },
      criticality: { type: 'enum', values: ['high', 'medium', 'low'] },
      status: { type: 'enum', values: ['pass', 'fail', 'skipped', 'pending'] },
      evidence: { type: 'string' }
    }
  },
  uat_feedback: {
    type: 'array',
    items: {
      session_id: { type: 'string' },
      tester: { type: 'string' },
      scenario: { type: 'string' },
      status: { type: 'enum', values: ['pass', 'fail'] },
      comments: { type: 'string' }
    }
  },
  review_decision: { type: 'enum', values: ['approved', 'conditional_pass', 'rejected'] },
  decision_rationale: { type: 'string' },
  total_critical_failures: { type: 'number', derived: true },
  ready_for_release: { type: 'boolean', derived: true }
}
```

### 12. Minimum Viable Change (Priority Ordered)

1. **Add analysisStep**: Auto-populate integrations from stage14.integration_points.
2. **Add criticality to Integrations**: Distinguish blocking vs non-blocking failures.
3. **Add review_decision**: Allow human override for "Conditional Pass" to unblock Stage 22.
4. **Add Layer Refs**: Change source/target to reference Stage 14 layers.
5. **Add Basic UAT**: Simple list of tester sign-offs.

### 13. Cross-Stage Impact

- **Stage 14 (Arch)**: Becomes the "Source of Truth" for Stage 21 tests. If Stage 14 is empty, Stage 21 starts empty (risk).
- **Stage 22 (Release)**: Needs to update gate logic. Instead of stage21.all_passing, check stage21.ready_for_release.

### 14. Dependency Conflicts

- **Stage 20**: Explicitly excluding generic integration status from Stage 20 output to avoid duplication. Stage 20 keeps "Test Suites" (the code). Stage 21 keeps "Integrations" (the architecture).

### 15. Contrarian Take

**Argument**: Merge Stage 21 into Stage 22. "Integration Testing" and "UAT" are just evidence for "Release Readiness." Why a whole separate stage?

**Counter**: The "Build Loop" (17-22) is iterative. Stage 21 is the "System Verify" step. Stage 22 is the "Business Sign-off". Merging them makes Stage 22 too operational/noisy. Keeping them separate helps distinct personas (System Architect vs Product Owner).
