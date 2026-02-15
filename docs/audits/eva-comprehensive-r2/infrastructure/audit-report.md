# EVA Infrastructure Quality Audit Report — Round 2

**SD**: SD-EVA-QA-AUDIT-R2-INFRA-001
**Parent Orchestrator**: SD-EVA-QA-AUDIT-R2-ORCH-001
**R1 Baseline**: SD-EVA-QA-AUDIT-INFRA-001 (Score: 58/100)
**Auditor**: Claude Opus 4.6 (automated)
**Date**: 2026-02-14
**Architecture Reference**: EVA Platform Architecture v1.6

---

## Executive Summary

Round 2 audit of EVA infrastructure components verifying remediation of 14 R1 findings across the event bus system, CLI dispatcher, and chairman decision watcher. Audited **9 files** totaling **~1,470 LOC**.

**Overall Score: 75/100** (+17 from R1 baseline of 58/100)

| Metric | R1 | R2 | Delta |
|--------|-----|-----|-------|
| Architecture alignment | 15/20 | 16/20 | +1 |
| Code quality | 10/25 | 18/25 | +8 |
| Error handling | 8/25 | 16/25 | +8 |
| Test coverage | 10/15 | 10/15 | 0 |
| DI consistency | 15/15 | 15/15 | 0 |
| **Overall** | **58/100** | **75/100** | **+17** |

### R1 Finding Remediation Summary

| Status | Count | Findings |
|--------|-------|----------|
| FIXED | 10 | CRIT-002, CRIT-003, HIGH-001, HIGH-002, HIGH-003, HIGH-005, MED-002, MED-003, MED-004, LOW-001 |
| PARTIALLY FIXED | 2 | CRIT-001, LOW-002 |
| NOT FIXED | 2 | HIGH-004, MED-001 |
| REGRESSED | 0 | — |

---

## Files Audited

| File | LOC | R1 Issues | R2 Status |
|------|-----|-----------|-----------|
| `lib/eva/event-bus/event-router.js` | 332 | CRIT-001, HIGH-001 | 1 PARTIALLY FIXED, 1 FIXED |
| `lib/eva/event-bus/handler-registry.js` | 74 | LOW-001 | FIXED |
| `lib/eva/event-bus/index.js` | 108 | MED-001 | NOT FIXED |
| `lib/eva/event-bus/handlers/decision-submitted.js` | 69 | CRIT-003, MED-002 | BOTH FIXED |
| `lib/eva/event-bus/handlers/gate-evaluated.js` | 149 | HIGH-002 | FIXED |
| `lib/eva/event-bus/handlers/stage-completed.js` | 98 | HIGH-003 | FIXED |
| `lib/eva/event-bus/handlers/sd-completed.js` | 276 | HIGH-004, HIGH-005 | 1 NOT FIXED, 1 FIXED |
| `scripts/eva-run.js` | 320 | CRIT-002, MED-003 | BOTH FIXED |
| `lib/eva/chairman-decision-watcher.js` | 233 | MED-004, LOW-002 | 1 FIXED, 1 PARTIALLY FIXED |
| **Total** | **~1,470** | **14 issues** | **10 FIXED, 2 PARTIAL, 2 OPEN** |

---

## R1 Finding Verification

### CRIT-001: Retry Logic Dead Code — PARTIALLY FIXED

**File**: `lib/eva/event-bus/event-router.js` (Lines 122-134, 221)
**R1 Finding**: `isRetryableError()` uses string matching; handler `err.retryable = false` flags are never checked.

**R2 Status**: The `isRetryableError()` function (lines 122-134) still performs string-matching only and does not check `error.retryable`. However, line 221 now checks `handler.retryable === false` from the handler registry, which provides handler-level (not error-level) retryability control.

**Evidence**:
- Line 122-134: `isRetryableError()` matches against `timeout`, `econnreset`, `503`, etc. — no `error.retryable` check
- Line 221: `if (!isRetryableError(error) || handler.retryable === false)` — checks registry flag, not error flag
- Lines 28-29 in `decision-submitted.js`: `err.retryable = false; throw err;` — flag set but never read
- Line 133: Default `return true` (unknown errors treated as retryable) — aggressive default unchanged

**Assessment**: The registry-level `handler.retryable` check at line 221 provides coarse-grained control, but per-error `retryable` flags set by handlers remain dead code. String matching covers most practical cases (lines 126-131 handle not found, validation, invalid as non-retryable). Residual risk: handlers cannot override retryability for specific error instances.

**Verdict**: PARTIALLY FIXED — functional for most cases but dead code remains.

---

### CRIT-002: CLI Argument Parsing — FIXED

**File**: `scripts/eva-run.js` (Lines 48-54)
**R1 Finding**: `getArg()` did not validate next element existence or flag collision.

**R2 Status**: Fully remediated.

**Evidence**:
```javascript
// Lines 48-54 — R2 implementation
function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  if (next === undefined || next.startsWith('--')) return undefined;
  return next;
}
```

Both failure modes (missing value, flag collision) are now handled.

---

### CRIT-003: Wrong Column Reference — FIXED

**File**: `lib/eva/event-bus/handlers/decision-submitted.js` (Line 22)
**R1 Finding**: Query used `stage` column which does not exist.

**R2 Status**: Line 22 now uses `.select('id, status, venture_id, lifecycle_stage')` — correct column name.

---

### HIGH-001: Failure Reason Classification — FIXED

**File**: `lib/eva/event-bus/event-router.js` (Lines 191, 217-218, 236-243)
**R1 Finding**: Only tracked last error; root cause lost.

**R2 Status**: Lines 191 and 217-218 track both `firstError` and `lastError`. Line 242 passes `originalErrorMessage: firstError?.message` to DLQ. Line 252 records original error in ledger metadata.

---

### HIGH-002: Bare Catch Blocks in gate-evaluated.js — FIXED

**File**: `lib/eva/event-bus/handlers/gate-evaluated.js`
**R1 Finding**: Two bare catch blocks silently swallowed errors.

**R2 Status**: Redesigned with `findNextStage()` function using documented catch blocks: `catch { /* table may not exist */ }`. The comments explain the intentional error suppression (tables may not exist in all deployments). Architecture-aware approach.

---

### HIGH-003: Bare Catch Blocks in stage-completed.js — FIXED

**File**: `lib/eva/event-bus/handlers/stage-completed.js`
**R1 Finding**: Same pattern as HIGH-002.

**R2 Status**: Redesigned with `findStages()` function using documented catch blocks at lines 81 and 94. Same pattern as HIGH-002 fix — intentional suppression with comments.

---

### HIGH-004: Silent Audit Logging Failure — NOT FIXED

**File**: `lib/eva/event-bus/handlers/sd-completed.js` (Line 219)
**R1 Finding**: `.then(() => {}).catch(() => {})` silently swallows audit logging errors.

**R2 Status**: Line 219 unchanged: `.then(() => {}).catch(() => {});` — still "best-effort" audit logging with zero error visibility.

**Impact**: Audit trail gaps remain invisible. No monitoring hook for audit write failures.

**Recommendation**: At minimum add `console.warn('[SdCompleted] Audit log write failed:', err.message)` in the catch block.

---

### HIGH-005: String-Based Error Matching — FIXED

**File**: `lib/eva/event-bus/handlers/sd-completed.js` (Line 82)
**R1 Finding**: Used string matching for duplicate detection.

**R2 Status**: Line 82 now uses `insertError.code !== '23505'` — PostgreSQL error code comparison instead of string matching.

---

### MED-001: Silent isEventBusEnabled() — NOT FIXED

**File**: `lib/eva/event-bus/index.js` (Line 37)
**R1 Finding**: `catch { return false; }` silently disables event bus on config errors.

**R2 Status**: Unchanged. Still `catch { return false; }` with no logging. Configuration errors (network issues, RLS failures) silently disable the entire event bus with no diagnostic output.

**Recommendation**: Add `console.warn('[EventBus] Config check failed, bus disabled:', err.message)`.

---

### MED-002: Missing .single() Error Handling — FIXED

**File**: `lib/eva/event-bus/handlers/decision-submitted.js` (Lines 26-30)
**R1 Finding**: Missing error handling on `.single()` query.

**R2 Status**: Line 26 checks `if (decisionError || !decision)` — handles both query error and null result with descriptive error messages.

---

### MED-003: Missing ventureId Propagation — FIXED

**File**: `scripts/eva-run.js` (Line 204)
**R1 Finding**: `orchestratorRun()` called without ventureId.

**R2 Status**: Line 204: `results = await orchestratorRun({ ventureId, options }, { supabase });` — ventureId is properly passed.

---

### MED-004: Race Condition Duplicate Polling — FIXED

**File**: `lib/eva/chairman-decision-watcher.js` (Line 109)
**R1 Finding**: Duplicate polling mechanisms could fire simultaneously.

**R2 Status**: Line 109 adds guard: `if (pollingTimer || resolved) return;` — prevents duplicate polling initiation. Line 131-135 includes 5-second delay before polling starts alongside Realtime subscription, allowing subscription time to connect.

---

### LOW-001: Misleading Docstring — FIXED

**File**: `lib/eva/event-bus/handler-registry.js`
**R1 Finding**: `getRegistryCounts()` JSDoc inaccurate.

**R2 Status**: Documentation accurately describes `Map<string, number>` return type with 1-per-type values.

---

### LOW-002: Constraint Check Specificity — PARTIALLY FIXED

**File**: `lib/eva/chairman-decision-watcher.js` (Line 213)
**R1 Finding**: 23505 check doesn't verify which constraint was violated.

**R2 Status**: Line 213 uses `error.code === '23505'` (correct error code) but still doesn't specify constraint name. However, in context only one unique constraint exists on the target table, making specificity unnecessary.

**Verdict**: PARTIALLY FIXED — technically still generic but contextually adequate.

---

## New Findings (R2)

### NEW-001: Cross-Platform ESM Entry Point Applied

**File**: `scripts/eva-run.js` (Lines 307-308)
**Severity**: INFO (Positive)

**Finding**: The Windows ESM entry point fix has been applied:
```javascript
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
```

This addresses the Windows path comparison issue documented in the project memory (165 scripts affected).

---

### NEW-002: Aggressive Default in isRetryableError()

**File**: `lib/eva/event-bus/event-router.js` (Line 133)
**Severity**: MEDIUM

**Finding**: `isRetryableError()` returns `true` by default for unrecognized errors. This means any new error type introduced by Supabase, Node.js, or application code will be retried 3 times before reaching the DLQ, even if the error is deterministic.

**Impact**: Increases latency for novel permanent errors (3 retries with exponential backoff before DLQ routing).

**Recommendation**: Consider inverting the default to `false` (fail-fast) with an explicit allowlist of retryable patterns.

---

## Architecture Alignment

### Event Bus Design vs Architecture v1.6

| Aspect | Architecture Spec | R1 Status | R2 Status | Change |
|--------|------------------|-----------|-----------|--------|
| Event routing | Central router with handler registry | Aligned | Aligned | — |
| Retry logic | Configurable per-handler | **GAP** (flag ignored) | Partial (registry-level control) | Improved |
| Error propagation | Structured error codes | **GAP** (string + bare catches) | Mixed (codes used, documented catches) | Improved |
| Audit trail | Complete event logging | **GAP** (silent failures) | **GAP** (HIGH-004 still open) | Unchanged |
| DI consistency | Uniform parameter naming | Aligned | Aligned | — |

### Test Coverage Assessment

| Component | R1 Status | R2 Status | Change |
|-----------|-----------|-----------|--------|
| Event router | Integration test only | Integration test only | Unchanged |
| Handler registry | Integration test | Integration test | Unchanged |
| Event handlers | Partial | Partial | Unchanged |
| eva-run.js | No tests | No tests | Unchanged |
| Chairman watcher | No tests | No tests | Unchanged |

**Note**: Test coverage did not improve between R1 and R2. This is the primary area holding back the overall score.

---

## Recommendations Summary

### Remaining from R1 (Still Open)

1. **HIGH-004**: Add error logging to audit write catch block in `sd-completed.js` line 219
2. **MED-001**: Add logging to `isEventBusEnabled()` silent catch in `index.js` line 37
3. **CRIT-001 (partial)**: Consider checking `error.retryable` flag in `isRetryableError()` or remove dead flag assignments from handlers

### New Recommendations (R2)

4. **NEW-002**: Consider inverting `isRetryableError()` default from `true` to `false` for fail-fast behavior
5. **Test coverage**: Add unit tests for event router retry logic, CLI argument parsing, and chairman watcher race condition scenarios

---

## Score Breakdown

| Category | R1 Score | R2 Score | Delta | Notes |
|----------|----------|----------|-------|-------|
| Architecture alignment | 15/20 | 16/20 | +1 | Retry logic now has registry-level control |
| Code quality | 10/25 | 18/25 | +8 | CRIT-002, CRIT-003, HIGH-005 all fixed; ESM fix applied |
| Error handling | 8/25 | 16/25 | +8 | HIGH-001/002/003 fixed; HIGH-004, MED-001 still open |
| Test coverage | 10/15 | 10/15 | 0 | No new tests observed |
| DI consistency | 15/15 | 15/15 | 0 | All files use `supabase` parameter consistently |

**Overall: 75/100** (R1: 58/100, Delta: +17)

---

## Conclusion

Significant improvement from R1 baseline. All 3 CRITICAL findings have been addressed (2 fully, 1 partially). The majority of HIGH-severity error handling issues have been remediated through redesigned catch blocks with documentation. The two remaining open issues (HIGH-004: silent audit logging, MED-001: silent event bus disable) are both low-effort fixes requiring only a `console.warn()` addition. Test coverage remains the primary gap — no new tests were added between R1 and R2, leaving the same blind spots in CLI argument parsing, retry edge cases, and race condition scenarios.
