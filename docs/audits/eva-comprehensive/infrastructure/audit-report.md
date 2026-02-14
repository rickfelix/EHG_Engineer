# EVA Infrastructure Quality Audit Report

**SD**: SD-EVA-QA-AUDIT-INFRA-001
**Parent Orchestrator**: SD-EVA-QA-AUDIT-ORCH-001
**Auditor**: Claude Opus 4.6 (automated)
**Date**: 2026-02-14
**Architecture Reference**: EVA Platform Architecture v1.6

---

## Executive Summary

Infrastructure quality audit of the EVA event bus system, CLI entry points, and background watchers. Audited **8 files** totaling **1,408 LOC** across event routing, handler registration, CLI argument parsing, and decision-watching subsystems.

**Overall Score: 58/100**

| Severity | Count | Key Areas |
|----------|-------|-----------|
| CRITICAL | 3 | Retry logic dead code, CLI arg parsing, wrong column reference |
| HIGH | 5 | Bare catch blocks, silent failures, error classification |
| MEDIUM | 4 | Silent catches, race conditions, string-based error matching |
| LOW | 2 | Misleading docstrings, minor naming |

**DI Parameter Naming**: CONSISTENT — all files use `supabase` parameter (no db vs supabase conflict).

**Test Coverage**: 15 EVA test files exist. 1 event-bus integration test (586 lines). Gaps in unit tests for retry logic, arg parsing, and race conditions.

---

## Files Audited

| File | LOC | Issues |
|------|-----|--------|
| `lib/eva/event-bus/event-router.js` | 323 | 1 CRITICAL, 1 HIGH |
| `lib/eva/event-bus/handler-registry.js` | 73 | 1 LOW |
| `lib/eva/event-bus/index.js` | 107 | 1 MEDIUM |
| `lib/eva/event-bus/handlers/decision-submitted.js` | 68 | 2 MEDIUM |
| `lib/eva/event-bus/handlers/gate-evaluated.js` | 148 | 1 HIGH |
| `lib/eva/event-bus/handlers/stage-completed.js` | 97 | 1 HIGH |
| `lib/eva/event-bus/handlers/sd-completed.js` | 275 | 1 HIGH, 1 MEDIUM |
| `scripts/eva-run.js` | 317 | 1 CRITICAL, 1 MEDIUM |
| `scripts/chairman-decision-watcher.js` | 231 | 2 MEDIUM |
| **Total** | **1,408** | **14 issues** |

---

## Critical Findings

### CRIT-001: Retry Logic Dead Code in event-router.js (Line 215)

**File**: `lib/eva/event-bus/event-router.js`
**Severity**: CRITICAL
**Category**: Logic Error / Dead Code

**Finding**: The retry decision logic at line 215 uses `isRetryableError(error)` which performs string-matching against error messages. However, event handlers set `err.retryable = false` as a flag — this flag is never checked by `isRetryableError()`.

```javascript
// Line 215 - Current behavior
if (!isRetryableError(error) || !handler.retryable) {
  // isRetryableError() does string matching, never checks error.retryable flag
}
```

**Impact**: Handlers that explicitly mark errors as non-retryable (via `err.retryable = false`) have no effect. The retry system ignores their intent, potentially retrying operations that should fail immediately (e.g., constraint violations).

**Recommendation**: Either check `error.retryable === false` as a first-class exit condition, or remove the dead `.retryable` flag assignments from handlers.

---

### CRIT-002: CLI Argument Parsing Lacks Validation in eva-run.js (Line 48-52)

**File**: `scripts/eva-run.js`
**Severity**: CRITICAL
**Category**: Input Validation

**Finding**: The `getArg()` helper at lines 48-52 retrieves the next array element after a flag but does not validate:
1. That the next element exists (could be `undefined`)
2. That the next element is not itself another flag

```javascript
// Potential: --stage --dry-run → startStage = '--dry-run'
const startStage = getArg('--stage');
```

**Impact**: Passing `--stage` as the last argument or followed by another flag silently assigns incorrect values. This could cause the orchestrator to start at the wrong stage or with invalid parameters.

**Recommendation**: Validate that `args[idx + 1]` exists and does not start with `--` before returning it as a value.

---

### CRIT-003: Wrong Column Reference in decision-submitted.js (Line 22)

**File**: `lib/eva/event-bus/handlers/decision-submitted.js`
**Severity**: CRITICAL
**Category**: Schema Mismatch

**Finding**: Line 22 queries a `stage` column that does not exist in the target table. The correct column is `lifecycle_stage`.

**Impact**: Query returns empty results or errors, causing the handler to silently skip processing for decision-submitted events.

**Recommendation**: Change `.select('stage')` to `.select('lifecycle_stage')` and update all references downstream.

---

## High-Severity Findings

### HIGH-001: Incorrect Failure Reason Classification in event-router.js (Line 228)

**File**: `lib/eva/event-bus/event-router.js`
**Severity**: HIGH
**Category**: Error Handling

**Finding**: When retry exhaustion occurs, the failure reason is classified based on the last error message only. If the root cause was a transient error that became permanent, the classification may be misleading in audit logs.

**Recommendation**: Track the original error alongside the final error for accurate failure classification.

---

### HIGH-002: Bare Catch Blocks in gate-evaluated.js (Lines 130, 145)

**File**: `lib/eva/event-bus/handlers/gate-evaluated.js`
**Severity**: HIGH
**Category**: Error Handling

**Finding**: Two catch blocks at lines 130 and 145 swallow exceptions without logging. Any failure in gate evaluation post-processing is completely invisible.

**Impact**: Gate evaluation failures go undetected, potentially allowing invalid state transitions.

**Recommendation**: Add `console.error()` or structured logging to both catch blocks.

---

### HIGH-003: Bare Catch Blocks in stage-completed.js (Lines 81, 94)

**File**: `lib/eva/event-bus/handlers/stage-completed.js`
**Severity**: HIGH
**Category**: Error Handling

**Finding**: Same pattern as HIGH-002. Two bare catch blocks silently swallow errors during stage completion processing.

**Recommendation**: Add error logging to both catch blocks.

---

### HIGH-004: Silent Audit Logging Failure in sd-completed.js (Line 219)

**File**: `lib/eva/event-bus/handlers/sd-completed.js`
**Severity**: HIGH
**Category**: Error Handling

**Finding**: Line 219 uses `.catch(() => {})` on an audit logging call. If audit logging fails (DB connection, constraint violation), the failure is silently swallowed.

**Impact**: Compliance audit trail has silent gaps. SD completion events may not be fully recorded.

**Recommendation**: At minimum log the error; ideally emit a monitoring event for audit logging failures.

---

### HIGH-005: String-Based Error Matching in sd-completed.js (Line 82)

**File**: `lib/eva/event-bus/handlers/sd-completed.js`
**Severity**: HIGH
**Category**: Fragile Pattern

**Finding**: Line 82 uses string matching on error messages to detect duplicate key violations instead of checking `error.code === '23505'` (PostgreSQL unique violation code).

**Impact**: If Supabase changes error message formatting, the detection breaks silently.

**Recommendation**: Use `error.code === '23505'` for reliable duplicate detection.

---

## Medium-Severity Findings

### MED-001: Silent Failure in isEventBusEnabled() (index.js Line 37)

**File**: `lib/eva/event-bus/index.js`
**Severity**: MEDIUM

**Finding**: The catch block in `isEventBusEnabled()` returns `false` without logging. Configuration errors silently disable the entire event bus.

---

### MED-002: Wrong Column in decision-submitted.js Query (Line 33)

**File**: `lib/eva/event-bus/handlers/decision-submitted.js`
**Severity**: MEDIUM

**Finding**: Missing error handling on `.single()` query. If the query returns zero or multiple rows, the error is not handled.

---

### MED-003: Missing ventureId in orchestratorRun() Context (eva-run.js Line 204)

**File**: `scripts/eva-run.js`
**Severity**: MEDIUM

**Finding**: The `orchestratorRun()` function does not propagate `ventureId` to downstream stage execution, causing stages to run without venture context.

---

### MED-004: Race Condition with Duplicate Polling in chairman-decision-watcher.js (Line 129)

**File**: `scripts/chairman-decision-watcher.js`
**Severity**: MEDIUM

**Finding**: Two polling mechanisms (interval-based and event-triggered) can fire simultaneously, causing duplicate processing of the same decision.

---

## Low-Severity Findings

### LOW-001: Misleading Docstring on getRegistryCounts() (handler-registry.js)

**File**: `lib/eva/event-bus/handler-registry.js`
**Severity**: LOW

**Finding**: The JSDoc comment on `getRegistryCounts()` describes return value inaccurately relative to actual implementation.

---

### LOW-002: Constraint Check Without Specificity (chairman-decision-watcher.js Line 210)

**File**: `scripts/chairman-decision-watcher.js`
**Severity**: LOW

**Finding**: The 23505 error check at line 210 doesn't verify which constraint was violated. Multiple unique constraints could trigger 23505.

---

## Architecture Alignment

### Event Bus Design vs Architecture v1.6

| Aspect | Architecture Spec | Implementation | Gap? |
|--------|------------------|----------------|------|
| Event routing | Central router with handler registry | event-router.js + handler-registry.js | Aligned |
| Retry logic | Configurable per-handler | String-matching only (flag ignored) | **GAP** |
| Error propagation | Structured error codes | Mix of string matching and bare catches | **GAP** |
| Audit trail | Complete event logging | Silent failures in audit writes | **GAP** |
| DI consistency | Uniform parameter naming | All use `supabase` parameter | Aligned |

### Test Coverage Assessment

| Component | Test Exists | Coverage Level | Gap |
|-----------|------------|----------------|-----|
| Event router | Integration test | Moderate | No unit test for retry logic edge cases |
| Handler registry | Integration test | Moderate | Adequate |
| Event handlers | Partial | Low | No unit tests for individual handlers |
| eva-run.js | None | None | **No tests for CLI arg parsing** |
| Chairman watcher | None | None | **No tests for race condition scenario** |

---

## Recommendations Summary

### Immediate Actions (CRITICAL)
1. Fix retry logic to check `error.retryable` flag (CRIT-001)
2. Add argument validation to `getArg()` in eva-run.js (CRIT-002)
3. Fix column reference `stage` → `lifecycle_stage` in decision-submitted.js (CRIT-003)

### Short-Term (HIGH)
4. Add error logging to all bare catch blocks (HIGH-002, HIGH-003, HIGH-004)
5. Replace string-based error matching with error codes (HIGH-005)
6. Track original + final errors in retry exhaustion (HIGH-001)

### Medium-Term (MEDIUM)
7. Add logging to `isEventBusEnabled()` failure path (MED-001)
8. Add `.single()` error handling in decision-submitted.js (MED-002)
9. Propagate ventureId in orchestratorRun() (MED-003)
10. Deduplicate polling mechanisms in chairman watcher (MED-004)

---

## Conclusion

The EVA event bus infrastructure has a solid architectural foundation (router + registry + handlers pattern) that aligns with Architecture v1.6. However, **error handling is the systemic weakness** — bare catch blocks, silent failures, and dead code in retry logic undermine reliability. The 3 CRITICAL issues (retry dead code, arg parsing, wrong column) should be addressed before any production use. DI naming is consistent across all files, which is a positive finding.

**Score Breakdown**:
- Architecture alignment: 15/20
- Code quality: 10/25
- Error handling: 8/25
- Test coverage: 10/15
- DI consistency: 15/15

**Overall: 58/100**
