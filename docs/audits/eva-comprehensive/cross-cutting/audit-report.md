# EVA Cross-Cutting Consistency Audit Report

**SD**: SD-EVA-QA-AUDIT-CROSSCUT-001
**Parent Orchestrator**: SD-EVA-QA-AUDIT-ORCH-001
**Auditor**: Claude Opus 4.6 (automated)
**Date**: 2026-02-14
**Architecture Reference**: EVA Platform Architecture v1.6

---

## Executive Summary

Cross-cutting consistency audit of the EVA codebase across 119 files in `lib/eva/` and 90+ scripts. Analyzed 5 dimensions: error handling, logging, utility duplication, export patterns, and DI parameter naming.

**Overall Score: 38/100**

| Severity | Count | Key Areas |
|----------|-------|-----------|
| CRITICAL | 3 | 25x parseJSON duplication, 68 silent files (no logging), two competing error systems |
| HIGH | 3 | Silent catch blocks, 3 competing logging approaches, DI naming inconsistency |
| MEDIUM | 4 | 60+ unguarded JSON.parse calls, 28 default exports, mixed export patterns, LLM client naming |
| LOW | 1 | Log message format inconsistency |

---

## Files Audited

| Category | File Count | Scope |
|----------|-----------|-------|
| EVA Core (`lib/eva/`) | 119 | Orchestrator, event bus, services, stage templates |
| EVA Scripts (`scripts/`) | 90+ | CLI entry points, watchers, handlers |
| **Total** | **209+** | **All EVA-related modules** |

---

## Critical Findings

### CRIT-001: 25 Identical Copies of parseJSON Utility

**Severity**: CRITICAL
**Status**: NOT ADDRESSED (0%)

Every stage analysis file in `lib/eva/stage-templates/analysis-steps/` contains an identical 9-line `parseJSON()` function:

```javascript
function parseJSON(text) {
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
  }
}
```

**Affected files** (25 total):
- `stage-01-hydration.js` through `stage-25-optimization.js` (all analysis steps)

**Impact**:
- Bug fix requires updating 25 files simultaneously
- Version drift: improvements to JSON parsing in one stage don't propagate
- Maintenance cost multiplied 25x for a single utility function

**Remediation**: Extract to `lib/eva/utils/parse-json.js`, import across all stage templates.

---

### CRIT-002: 68 Files Have No Logging (57% of EVA Codebase)

**Severity**: CRITICAL
**Status**: NOT ADDRESSED (0%)

57% of EVA files (68 of 119) contain no logging whatsoever. Failures in these modules are completely invisible during production execution.

**Silent modules include**:
- `lib/eva/template-applier.js` — Complex template matching logic, zero logging
- `lib/eva/dependency-manager.js` — Graph traversal, zero logging
- `lib/eva/devils-advocate.js` — Model-based review, zero logging
- All 25 `lib/eva/stage-templates/analysis-steps/` files — LLM calls with no observability
- `lib/eva/constraint-drift-detector.js` — Uses optional `logger.info?.()` only

**Impact**:
- Production failures undetectable without code-level debugging
- No audit trail for LLM calls (input/output/latency)
- Incident response requires code reading instead of log analysis

**Remediation**: Establish mandatory logger injection pattern. All public functions must accept `logger = console` in deps.

---

### CRIT-003: Two Competing Error Systems

**Severity**: CRITICAL
**Status**: PARTIALLY ADDRESSED (5%)

Two incompatible error handling approaches coexist:

| Approach | Files | Example |
|----------|-------|---------|
| `throw new Error(message)` | 55 files (46%) | `template-applier.js:59` |
| `throw new ServiceError(code, msg, service, original)` | 1 file (1%) | `shared-services.js:55-59` |
| No error handling | 63 files (53%) | Stage templates, utilities |

**ServiceError** (defined in `shared-services.js:55-59`) provides structured context:
- Error code (`CONTEXT_LOAD_FAILED`, `VENTURE_NOT_FOUND`)
- Service name (for routing)
- Original error (for stack trace preservation)

But it's only used in **1 file** out of 119. The remaining 55 files that do throw errors use generic `new Error()`, losing all structured context.

**Impact**:
- Error monitoring cannot classify errors by code
- Root cause analysis requires full stack trace reading
- No programmatic error routing (retry vs fail-fast decisions)

**Remediation**: Adopt ServiceError as the standard. Create error catalog with codes for all EVA subsystems.

---

## High-Severity Findings

### HIGH-001: Silent Catch Blocks (12+ Files)

**Severity**: HIGH

12+ files contain catch blocks that swallow exceptions without logging:

- `lib/eva/stage-zero/synthesis/virality.js` — Empty catch blocks
- `lib/eva/event-bus/handlers/gate-evaluated.js:130,145` — Bare catches (also in INFRA audit)
- `lib/eva/event-bus/handlers/stage-completed.js:81,94` — Bare catches
- `lib/eva/event-bus/handlers/sd-completed.js:219` — `.catch(() => {})` on audit logging

**Impact**: Errors that should trigger alerts or retries are silently discarded.

**Remediation**: Minimum standard: all catch blocks must call `logger.error()` or `console.error()`.

---

### HIGH-002: Three Competing Logging Approaches

**Severity**: HIGH

| Approach | Files | Location |
|----------|-------|----------|
| No logging | 68 (57%) | Stage templates, utilities, managers |
| `console.log/warn/error` | 8 (7%) | Event bus handlers only |
| Injected `logger` parameter | 41 (34%) | Modern services (orchestrator, shared-services) |
| OrchestratorTracer (structured) | 2 (2%) | eva-orchestrator.js, observability.js |

**No central log format standard**. Event bus uses `[EventRouter] Handler...` prefix, constraint drift uses `[ConstraintDrift]`, observability uses `[Tracer]` — all different casing/structure.

**Impact**: Log aggregation impossible. Cannot filter by subsystem reliably.

**Remediation**: Define standard: injected logger with `[Subsystem]` prefix format. Migrate console.log calls.

---

### HIGH-003: DI Parameter Naming Inconsistency (`db` vs `supabase`)

**Severity**: HIGH

90% of EVA files use `supabase` as the DI parameter name. 6 files use `db` instead:

| File | Parameter | Should Be |
|------|-----------|-----------|
| `constraint-drift-detector.js:47` | `db` | `supabase` |
| `constraint-drift-detector.js:182` | `db` (internal) | `supabase` |
| `constraint-drift-detector.js:200` | `db` (internal) | `supabase` |
| `orchestrator-state-machine.js` | mixed | `supabase` |
| `reality-gates.js` | mixed | `supabase` |
| `saga-coordinator.js` | mixed | `supabase` |

**Additional concern**: All 25 stage templates use `client` for the LLM client, same generic name as potential Supabase references. Should be `llmClient` for disambiguation.

**Impact**: Copy-paste errors when moving code between modules. Confusion for new contributors.

**Remediation**: Rename `db` → `supabase` in 6 files. Rename LLM `client` → `llmClient` in 25 stage templates.

---

## Medium-Severity Findings

### MED-001: 60+ Unguarded JSON.parse Calls

**Severity**: MEDIUM

Beyond the 25 `parseJSON()` copies, 60+ locations call `JSON.parse()` directly without error handling wrappers:

- `lib/eva/stage-templates/stage-01.js` through `stage-25.js` — Direct calls
- `lib/eva/shared-services.js` — Direct calls
- `lib/eva/venture-monitor.js` — Direct calls

**Impact**: Malformed JSON from LLM responses or database causes unhandled exceptions.

---

### MED-002: 28 Files Use Default Exports

**Severity**: MEDIUM

While 77 files (65%) use named exports (standard), 28 files (23%) use `export default`:

- `lib/eva/decision-filter-engine.js` — `export default function evaluateDecision(...)`
- `lib/eva/chairman-preference-store.js` — Both default AND named exports (anti-pattern)
- `lib/eva/venture-context-manager.js` — `export default class VentureContextManager`

**Impact**: Inconsistent import syntax (`import { fn }` vs `import fn`). Tree-shaking less effective.

---

### MED-003: Mixed Default + Named Exports

**Severity**: MEDIUM

5+ files export both a default export and named exports from the same module:

- `lib/eva/chairman-preference-store.js` — `export default class` + `export async function`

**Impact**: Callers confused about which import syntax to use. Public API unclear.

---

### MED-004: No Centralized Utility Library

**Severity**: MEDIUM

EVA has no `lib/eva/utils/` directory. Shared utilities are either:
- Duplicated across files (parseJSON x25)
- Inline in unrelated modules (`round2()` in `cross-venture-learning.js`)
- Missing entirely (no date formatting, no Supabase query helpers)

**Remediation**: Create `lib/eva/utils/` with: `parse-json.js`, `error-factory.js`, `logger-factory.js`.

---

## Low-Severity Findings

### LOW-001: Log Message Format Inconsistency

**Severity**: LOW

Files that do log use inconsistent prefix formats:
- `[EventRouter]` — PascalCase
- `[ConstraintDrift]` — PascalCase
- `[SdCompleted]` — PascalCase
- `[Tracer]` — PascalCase (but shorter)

All PascalCase, but no length/naming convention established.

---

## Cross-Reference with Phase Audit Findings

This cross-cutting audit corroborates and extends findings from phase-specific audits:

| Phase Audit | Finding | Cross-Cutting Confirmation |
|-------------|---------|---------------------------|
| INFRA (58/100) | CRIT-001: Retry logic dead code | Confirmed: `error.retryable` flag never checked due to error system inconsistency |
| INFRA (58/100) | HIGH-002/003: Bare catch blocks | Confirmed: 12+ files total, systemic pattern not limited to event bus |
| INFRA (58/100) | HIGH-005: String-based error matching | Confirmed: No error code system; ServiceError exists but unused |
| DBSCHEMA (42/100) | CRIT-001: Missing per-stage tables | Cross-cutting: Stage data stored as JSONB parsed by 25 `parseJSON` copies |
| DBSCHEMA (42/100) | HIGH-001: RLS `USING (TRUE)` | Cross-cutting: No role validation in code either |

---

## Architecture Alignment

| Aspect | Architecture v1.6 Spec | Implementation | Gap? |
|--------|----------------------|----------------|------|
| Error handling | Structured error codes | 2 systems, 95% generic | **CRITICAL GAP** |
| Logging | Observable, structured | 57% silent, 3 approaches | **CRITICAL GAP** |
| Utility management | DRY, centralized | 25 duplicates, no utils/ | **CRITICAL GAP** |
| Export consistency | Uniform ESM | 77% named, 23% default | **MEDIUM GAP** |
| DI naming | `supabase` standard | 6 files use `db` | **HIGH GAP** |

---

## Recommendations Summary

### Immediate (P0)
1. Extract `parseJSON()` to `lib/eva/utils/parse-json.js` (CRIT-001)
2. Establish logging standard: mandatory `logger` injection (CRIT-002)
3. Adopt ServiceError as the sole error class (CRIT-003)

### Short-Term (P1)
4. Add error logging to all silent catch blocks (HIGH-001)
5. Migrate `console.log` calls to injected logger (HIGH-002)
6. Rename `db` → `supabase` in 6 inconsistent files (HIGH-003)

### Medium-Term (P2)
7. Wrap all 60+ direct `JSON.parse()` calls (MED-001)
8. Convert 28 default exports to named exports (MED-002)
9. Create `lib/eva/utils/` with shared utilities (MED-004)
10. Standardize log message prefix format (LOW-001)

---

## Score Breakdown

| Category | Score | Max |
|----------|-------|-----|
| Error handling consistency | 5 | 25 |
| Logging consistency | 5 | 25 |
| Utility duplication (DRY) | 5 | 20 |
| Export pattern consistency | 13 | 15 |
| DI naming consistency | 10 | 15 |
| **Overall** | **38** | **100** |

---

## Conclusion

The EVA codebase has **severe cross-cutting consistency issues** that amplify the findings from individual phase audits. The three critical gaps — 25 duplicated utility functions, 57% of files with no logging, and two competing error systems — represent systemic patterns that affect every EVA subsystem. These issues make debugging, monitoring, and maintenance significantly harder than necessary.

The 6 files with `db` vs `supabase` naming and the 28 default exports are smaller issues but contribute to cognitive load for contributors. The absence of a centralized `lib/eva/utils/` directory is the root cause of the parseJSON duplication and should be the first structural fix.

**Positive findings**: Pure ESM codebase (no CJS), majority named exports (65%), and consistent `supabase` naming in 90% of files provide a solid foundation to build upon.
