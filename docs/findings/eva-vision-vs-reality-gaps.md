# EVA Vision vs Reality — Gap Analysis

Analysis date: 2026-02-15
Vision document: EVA v4.7
Source analysis: lib/eva/**/*.js

## Methodology
Compared vision document features against actual source code implementation.

## Findings

### 1. Immutable Stage Versioning
- **Vision says**: Each stage artifact carries a version number; new artifacts "supersede previous" rather than overwrite
- **What code does**: `persistArtifacts()` sets `is_current: true` on new artifacts but never sets old artifacts to `is_current: false`. No version numbering exists.
- **Severity**: Medium — data integrity risk as old and new artifacts both appear "current"
- **Recommendation**: Implement — add version numbering and `is_current=false` update on prior artifacts

### 2. Pivot Re-Entry
- **Vision says**: When Stage 25 outputs `pivot`, the venture should re-enter at an earlier stage
- **What code does**: Stage 25 `computeDerived()` can set `ventureDecision.decision='pivot'` but no re-entry mechanism routes the venture back to an earlier stage
- **Severity**: High — pivots are detected but not actionable
- **Recommendation**: Implement — add stage re-entry logic in orchestrator for pivot decisions

### 3. Reality Gate Failure Recovery
- **Vision says**: Reality gates that fail should retry 3 times, then auto-kill the venture
- **What code does**: `evaluateRealityGate()` returns pass/fail; orchestrator marks BLOCKED but has no retry or auto-kill logic
- **Severity**: Medium — ventures can get stuck in BLOCKED state indefinitely
- **Recommendation**: Implement — add retry counter and escalation to kill/sunset

### 4. Venture Exit/Shutdown Workflow
- **Vision says**: Complete shutdown sequence when a venture is killed (archive artifacts, notify stakeholders, generate post-mortem)
- **What code does**: Decision types for 'sunset' and 'exit' exist in Stage 25 VENTURE_DECISIONS enum but no shutdown sequence implementation
- **Severity**: Low — ventures can be manually cleaned up
- **Recommendation**: Defer — implement when venture volume increases

### 5. Web-Grounded Analysis Steps
- **Vision says**: Certain analysis steps should perform live web searches and URL fetches for market data
- **What code does**: No `httpClient` or `webSearch` calls in any analysis step. The orchestrator accepts `httpClient` as a dep but only passes it to reality gates.
- **Severity**: Low — analysis quality may be stale but is functional
- **Recommendation**: Defer — would require significant LLM prompt changes

### 6. Conditional Outcome Resolution
- **Vision says**: Decisions with conditional outcomes should be tracked and resolved when conditions are met
- **What code does**: Chairman decisions are approve/reject only. No conditional outcome or follow-up tracking system.
- **Severity**: Medium — conditional decisions require manual tracking
- **Recommendation**: Implement — add conditional_outcome field and resolution tracking

### 7. Advisory Notification Service
- **Vision says**: Chairman should receive email digests and real-time notifications for pending decisions
- **What code does**: `ChairmanPreferenceStore` stores notification preferences but no email/digest delivery service exists
- **Severity**: Low — decisions are made via CLI commands
- **Recommendation**: Defer — implement with UI/notification infrastructure

### 8. Constraint Drift Detector
- **Vision says**: Continuous monitoring for constraint violations between stages (budget drift, timeline drift)
- **What code does**: Only Stage 25's `detectDrift()` compares vision text. The DFE trigger checks single-stage constraints but no cross-stage drift detection mechanism.
- **Severity**: Medium — constraints can drift unnoticed between stages 2-24
- **Recommendation**: Implement — add periodic constraint checks in orchestrator loop
