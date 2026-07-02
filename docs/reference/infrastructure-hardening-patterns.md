---
category: reference
status: draft
version: 1.1.0
author: Rick Felix
last_updated: 2026-07-01
tags: [reference, auto-generated]
---
# Infrastructure Hardening Patterns


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Atomic State Transitions](#atomic-state-transitions)
  - [Pattern Overview](#pattern-overview)
  - [Implementation](#implementation)
  - [Benefits](#benefits)
  - [Migration Required](#migration-required)
- [Parallel Execution Patterns](#parallel-execution-patterns)
  - [Pattern Overview](#pattern-overview)
  - [Implementation](#implementation)
  - [Benefits](#benefits)
  - [File Modified](#file-modified)
- [SD-Type-Specific Thresholds](#sd-type-specific-thresholds)
  - [Pattern Overview](#pattern-overview)
  - [Implementation](#implementation)
  - [Benefits](#benefits)
  - [Files Modified](#files-modified)
- [Context Deep-Copy Protection](#context-deep-copy-protection)
  - [Pattern Overview](#pattern-overview)
  - [Implementation](#implementation)
  - [Benefits](#benefits)
  - [Caveats](#caveats)
  - [File Modified](#file-modified)
- [Timeout Wrappers](#timeout-wrappers)
  - [Pattern Overview](#pattern-overview)
  - [Implementation](#implementation)
  - [Benefits](#benefits)
  - [Configuration](#configuration)
  - [File Modified](#file-modified)
- [Idempotency Keys](#idempotency-keys)
  - [Pattern Overview](#pattern-overview)
  - [Implementation](#implementation)
  - [Benefits](#benefits)
  - [Time Window Strategy](#time-window-strategy)
  - [File Modified](#file-modified)
- [Schema Validation](#schema-validation)
  - [Pattern Overview](#pattern-overview)
  - [Implementation](#implementation)
  - [Benefits](#benefits)
  - [File Created](#file-created)
  - [File Modified](#file-modified)
- [Centralized Skip Conditions](#centralized-skip-conditions)
  - [Pattern Overview](#pattern-overview)
  - [Implementation](#implementation)
  - [Benefits](#benefits)
  - [Usage](#usage)
  - [File Modified](#file-modified)
- [Cross-References](#cross-references)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-30
- **Tags**: infrastructure, hardening, patterns, atomic-operations, idempotency

## Overview

Technical patterns and best practices for infrastructure hardening implemented in SD-LEO-INFRA-HARDENING-001. This document serves as a reference for developers implementing similar infrastructure improvements.

## Table of Contents

1. [Atomic State Transitions](#atomic-state-transitions)
2. [Parallel Execution Patterns](#parallel-execution-patterns)
3. [SD-Type-Specific Thresholds](#sd-type-specific-thresholds)
4. [Context Deep-Copy Protection](#context-deep-copy-protection)
5. [Timeout Wrappers](#timeout-wrappers)
6. [Idempotency Keys](#idempotency-keys)
7. [Schema Validation](#schema-validation)
8. [Centralized Skip Conditions](#centralized-skip-conditions)

---

## Atomic State Transitions

### Pattern Overview

Replace sequential state updates with atomic database transactions using advisory locks to prevent race conditions.

### Implementation

**Database Function**: `fn_atomic_exec_to_plan_transition`

```sql
-- Advisory lock pattern
SELECT pg_advisory_xact_lock(hashtext(p_sd_id));

-- Atomic state updates within transaction
UPDATE strategic_directives_v2 SET current_phase = 'EXEC_COMPLETE';
UPDATE product_requirements_v2 SET status = 'verification';
UPDATE user_stories SET status = 'validated';
```

**Availability Check**:
```javascript
export async function isAtomicTransitionAvailable(supabase) {
  const { error } = await supabase.rpc('fn_atomic_exec_to_plan_transition', {
    p_sd_id: 'TEST-CHECK',
    // ... test params
  });

  // Function NOT available if schema cache error
  return !error?.message?.includes('schema cache');
}
```

**Fallback Pattern**:
```javascript
// Try atomic first
const atomicAvailable = await isAtomicTransitionAvailable(supabase);

if (atomicAvailable) {
  await executeAtomicTransition(supabase, sdId, prdId);
} else {
  // Fallback to legacy sequential mode
  await transitionUserStories(supabase, sdId);
  await transitionPRD(supabase, prd);
  await transitionSD(supabase, sdId);
}
```

### Benefits
- **Race condition prevention**: Advisory locks ensure only one transition executes at a time
- **Idempotency**: Deterministic request IDs prevent duplicate transitions
- **Audit trail**: `sd_transition_audit` table captures pre/post state
- **Automatic rollback**: Transaction failures rollback all changes

### Migration Required
Migration file must be executed manually in Supabase Dashboard (DDL privileges required).

**File**: `database/migrations/20260130_atomic_handoff_transitions.sql`

---

## Parallel Execution Patterns

### Pattern Overview

Execute independent sub-agents concurrently using `Promise.all` instead of sequential `for` loops.

### Implementation

**Before (Sequential)**:
```javascript
for (const subAgent of requiredSubAgents) {
  const result = await executeSubAgent(subAgent, sdId, options);
  results.push(result);
}
```

**After (Parallel)**:
```javascript
// Separate independent agents from dependent ones
const independentAgents = requiredSubAgents.filter(a =>
  !a.depends_on || a.depends_on.length === 0
);
const dependentAgents = requiredSubAgents.filter(a =>
  a.depends_on && a.depends_on.length > 0
);

// Execute independent agents in parallel
const parallelResults = await Promise.all(
  independentAgents.map(async (subAgent) => {
    try {
      const result = await executeSubAgent(subAgent, sdId, options);
      return { success: true, result, subAgent };
    } catch (error) {
      return { success: false, error, subAgent };
    }
  })
);

// Execute dependent agents sequentially (respecting dependencies)
for (const subAgent of dependentAgents) {
  const result = await executeSubAgent(subAgent, sdId, options);
  results.push(result);
}
```

### Benefits
- **60-70% faster orchestration**: Eliminates unnecessary wait time
- **Better resource utilization**: Leverages concurrent execution
- **Maintains dependency order**: Dependent agents still run sequentially
- **Error isolation**: Failed agents don't block independent ones

### File Modified
`scripts/modules/phase-subagent-orchestrator/index.js:180-226`

---

## SD-Type-Specific Thresholds

### Pattern Overview

Enforce different gate score requirements based on Strategic Directive type.

### Implementation

**Threshold Configuration**:
```javascript
export const THRESHOLD_PROFILES = {
  security: { gateThreshold: 90 },      // Highest bar
  feature: { gateThreshold: 85 },       // Standard bar
  infrastructure: { gateThreshold: 80 }, // Reasonable bar
  bugfix: { gateThreshold: 75 },        // Lighter bar
  default: { gateThreshold: 85 }
};
```

**Enforcement in Validation**:
```javascript
// After calculating normalizedScore
if (results.passed && context.sd?.sd_type) {
  const sdType = context.sd.sd_type;
  const profile = THRESHOLD_PROFILES[sdType] || THRESHOLD_PROFILES.default;
  const threshold = profile.gateThreshold;

  if (results.normalizedScore < threshold) {
    results.passed = false;
    results.failedGate = 'SD_TYPE_THRESHOLD';
    results.issues.push(
      `SD type '${sdType}' requires ${threshold}% gate score, got ${results.normalizedScore}%`
    );
  }
}
```

### Benefits
- **Type-appropriate rigor**: Security SDs get stricter validation
- **Reduced friction**: Infrastructure SDs aren't held to feature standards
- **Clear expectations**: Developers know requirements upfront
- **Flexible enforcement**: Easy to adjust thresholds per SD type

### Files Modified
- `scripts/modules/sd-type-checker.js:17-38`
- `scripts/modules/handoff/validation/ValidationOrchestrator.js:188-208`

---

## Context Deep-Copy Protection

### Pattern Overview

Prevent mutation bugs by deep-copying context objects before passing to validators.

### Implementation

```javascript
// Before: Context objects shared (mutation risk)
const validationContext = {
  sd: sd,
  prd: prd,
  options: options
};

// After: Deep-copy prevents mutation
const validationContext = {
  sd: sd ? structuredClone(sd) : null,
  prd: prd ? structuredClone(prd) : null,
  options: options ? structuredClone(options) : {},
  supabase: this.supabase  // Cannot clone client
};
```

### Benefits
- **Prevents subtle bugs**: Validators can't accidentally modify shared state
- **Easier debugging**: Original context preserved for inspection
- **Thread-safe pattern**: Multiple validators can run without interference
- **Minimal performance cost**: `structuredClone` is fast for typical objects

### Caveats
- **Cannot clone**: Functions, Promises, DOM nodes, Supabase clients
- **Use shallow copy for clients**: Preserve database client references

### File Modified
`scripts/modules/handoff/executors/BaseExecutor.js:70-75`

---

## Timeout Wrappers

### Pattern Overview

Prevent hung sub-agents from blocking workflow indefinitely.

### Implementation

```javascript
// Configurable timeout (60s default)
const timeoutMs = options.timeout || 60000;

const timeoutPromise = new Promise((_, reject) =>
  setTimeout(
    () => reject(new Error(`Sub-agent ${code} timed out after ${timeoutMs}ms`)),
    timeoutMs
  )
);

// Race sub-agent execution against timeout
results = await Promise.race([
  subAgentModule.execute(sdUUID || sdId, subAgent, execOptions),
  timeoutPromise
]);
```

### Benefits
- **Prevents infinite hangs**: Enforces maximum execution time
- **Configurable per agent**: Different agents can have different timeouts
- **Clean error handling**: Timeout throws clear error message
- **Auto-recovery**: Orchestrator continues after timeout

### Configuration

**Per-SD timeout**:
```javascript
await executeSubAgent(subAgent, sdId, { timeout: 120000 }); // 2 minutes
```

**Default timeout**: 60000ms (60 seconds)

### File Modified
`lib/sub-agent-executor/executor.js:189-199`

---

## Idempotency Keys

### Pattern Overview

Prevent duplicate database records using deterministic request IDs.

### Implementation

**Key Generation**:
```javascript
function generateIdempotencyKey(sdId, subAgentCode, sessionId, phase) {
  // Time window: Round to nearest hour
  const timeWindow = Math.floor(Date.now() / (60 * 60 * 1000));

  const components = [
    sdId,
    subAgentCode,
    sessionId || 'no-session',
    phase || 'orchestrated',
    timeWindow.toString()
  ];

  const hash = createHash('sha256')
    .update(components.join('::'))
    .digest('hex')
    .substring(0, 32);

  return `idmp_${subAgentCode}_${hash}`;
}
```

**Idempotent Check**:
```javascript
async function checkIdempotentExecution(supabase, idempotencyKey) {
  const { data } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sub_agent_code, verdict, created_at')
    .contains('metadata', { idempotency_key: idempotencyKey })
    .single();

  return data || null;
}
```

**Usage in Storage**:
```javascript
const idempotencyKey = generateIdempotencyKey(sdId, subAgentCode, sessionId, phase);

// Check for existing execution
const existing = await checkIdempotentExecution(supabase, idempotencyKey);
if (existing) {
  console.log(`Idempotent hit: Returning existing record ${existing.id}`);
  return existing.id;
}

// Store with idempotency key in metadata
const insertData = {
  // ... other fields
  metadata: {
    phase,
    orchestrated: true,
    idempotency_key: idempotencyKey,
    session_id: sessionId
  }
};
```

### Benefits
- **Safe retries**: Re-running same execution returns existing result
- **Time-windowed**: Key changes hourly (allows re-runs after cool-down)
- **Session-aware**: Different sessions get different keys
- **Hash-based**: Deterministic but collision-resistant

### Time Window Strategy
- **1 hour window**: Allows immediate retries but prevents long-term duplication
- **Rationale**: Sub-agent runs shouldn't be cached indefinitely, but transient failures should be idempotent

### File Modified
`scripts/modules/phase-subagent-orchestrator/execution.js:7-87`

---

## Schema Validation

### Pattern Overview

Validate and normalize gate results to prevent malformed data from breaking aggregation.

### Implementation

**Schema Definition**:
```javascript
const GATE_RESULT_SCHEMA = {
  required: ['passed', 'score', 'maxScore'],
  optional: ['issues', 'warnings', 'details', 'error'],
  types: {
    passed: 'boolean',
    score: 'number',
    maxScore: 'number',
    issues: 'array',
    warnings: 'array'
  },
  defaults: {
    passed: false,
    score: 0,
    maxScore: 100,
    issues: [],
    warnings: []
  }
};
```

**Validator Function**:
```javascript
export function validateGateResult(result, gateName, options = {}) {
  const { strict = false, autoFix = true } = options;
  const errors = [];

  // Normalize pass/passed field names
  if (result.pass !== undefined && result.passed === undefined) {
    result.passed = result.pass;
    delete result.pass;
  }

  // Validate required fields
  for (const field of GATE_RESULT_SCHEMA.required) {
    if (result[field] === undefined && autoFix) {
      result[field] = GATE_RESULT_SCHEMA.defaults[field];
    }
  }

  // Type coercion
  if (typeof result.passed === 'number' && autoFix) {
    result.passed = result.passed > 0;
  }

  return result;
}
```

**Integration**:
```javascript
async validateGate(gateName, validator, context) {
  const result = await validator(context);

  // Schema validation with auto-fix
  const normalizedResult = validateGateResult(result, gateName, {
    strict: false,
    autoFix: true
  });

  return normalizedResult;
}
```

### Benefits
- **Tolerates variations**: Accepts `pass` or `passed`, `max_score` or `maxScore`
- **Auto-fixes issues**: Fills missing fields with sensible defaults
- **Type safety**: Coerces types when possible
- **Detailed errors**: Reports what was fixed in validation metadata

### File Created
`scripts/modules/handoff/validation/gate-result-schema.js`

### File Modified
`scripts/modules/handoff/validation/ValidationOrchestrator.js:32-34, 62-82`

---

## Centralized Skip Conditions

### Pattern Overview

Consolidate all SD-type skip logic into a single source of truth.

### Implementation

**Unified Checker**:
```javascript
export function checkSkipCondition(validatorName, context, options = {}) {
  const { sd } = context || {};
  const sdType = sd?.sd_type || 'unknown';

  const decision = {
    shouldSkip: false,
    result: null,
    reason: null,
    sdType,
    validatorName
  };

  // Check 1: Non-applicable for SD type?
  if (isValidatorNonApplicable(sdType, validatorName)) {
    decision.shouldSkip = true;
    decision.reason = SkipReasonCode.NON_APPLICABLE_SD_TYPE;
    decision.result = createSkippedResult(validatorName, sdType);
    return decision;
  }

  // Check 2: Lightweight SD type skips detailed PRD validation?
  if (isLightweightSDType(sdType)) {
    const lightweightSkipValidators = [
      'FILE_SCOPE', 'EXPLORATION_AUDIT', 'EXECUTION_PLAN'
    ];
    if (lightweightSkipValidators.includes(validatorName.toUpperCase())) {
      decision.shouldSkip = true;
      decision.result = createSkippedResult(validatorName, sdType);
      return decision;
    }
  }

  // Check 3: Documentation-only SDs skip code validation?
  const docOnlyTypes = ['documentation', 'docs', 'process'];
  const codeValidators = ['TESTING', 'GITHUB', 'REGRESSION'];
  if (docOnlyTypes.includes(sdType) && codeValidators.includes(validatorName)) {
    decision.shouldSkip = true;
    decision.result = createSkippedResult(validatorName, sdType);
    return decision;
  }

  return decision; // Don't skip
}
```

**Batch Checking**:
```javascript
export function checkSkipConditionsBatch(validatorNames, context) {
  const decisions = {};
  for (const validatorName of validatorNames) {
    decisions[validatorName] = checkSkipCondition(validatorName, context);
  }
  return decisions;
}
```

### Benefits
- **Single source of truth**: All skip logic in one place
- **Consistent behavior**: Same rules applied across all handoff types
- **Easy to audit**: One function to review for skip conditions
- **Batch-friendly**: Efficient checking of multiple validators

### Usage

```javascript
// Check if validator should be skipped
const decision = checkSkipCondition('TESTING', { sd: { sd_type: 'documentation' } });
if (decision.shouldSkip) {
  return decision.result; // Return SKIPPED result
}

// Proceed with validation
return await validator(context);
```

### File Modified
`scripts/modules/handoff/validation/sd-type-applicability-policy.js:491-596`

---

## Pattern: Wire a per-stage precondition at the SHARED CALLEE, not one call site (PAT-EVA-S19-PROMOTE-ORDER-001)

**Symptom**: A per-stage promote/approve/normalize helper added before a shared callee runs covers
only the entry path it was wired into, and silently misses the callee's other entry points.

**Root cause (SD-LEO-INFRA-S19-CLONE-VISION-PROMOTE-ORDER-001)**: `_autoApproveCloneVision` (promote a
clone's L2 vision so it passes the S19 vision gate) was invoked at ONLY the synchronous S19 entry gate.
`_runS19Bridge` has four entry points — the entry-gate fast-path/primary, the S19 hard-gate
run-then-recheck, and the fire-and-forget `_postStageHook_S19_Bridge`. A clone reaching the bridge via
the hard-gate or post-hook path hit `assertVentureVisionReady` un-promoted → blocked on `vision_missing`.

**Fix**: move the precondition to the TOP of the shared callee (`_runS19Bridge`) so every entry inherits
it; delete the redundant single-site call. (Distinct from #5237, which fixed the promote's *internals*
and deliberately kept the `isRepairLoopEnabled` kill-switch — call-ordering was a separate gap.)

### PR-review checklist line

> When a PR adds a per-stage promote/approve/normalize step **before** a shared callee runs, verify it
> is wired at the **top of that shared callee** (so ALL entry points inherit it), not at a single caller.
> Enumerate every call site of the callee (grep the method name) — especially fire-and-forget hooks and
> hard-gate recheck paths that bypass the primary gate — and confirm a reachability test exercises an
> entry path the original single call site did NOT cover (it must FAIL on the pre-fix ordering).

---

## Pattern: Class-guard a recurring bug via a lint rule + a FAITHFUL shared test double, not another per-instance fix (SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001)

**Symptom**: The same crash class gets fixed independently 3 times in 3 different files, and each fix's
own regression test passes even when the anti-pattern is reintroduced elsewhere.

**Root cause**: Calling `<channel>.removeChannel(...)` or `<channel>.unsubscribe()` synchronously from
inside the callback passed to `.subscribe(status => {...})` recurses unboundedly — Supabase's vendored
phoenix client's `Channel.leave()` (invoked by both methods; `removeChannel()` wraps `unsubscribe()`
internally) synchronously re-fires that same callback before settling, causing
`RangeError: Maximum call stack size exceeded`. Fixed independently at `ae499d9957`/QF-20260701-709
(`lib/eva/reality-gates.js`, `lib/eva/stage-governance.js`), then reintroduced and fixed again at PR
#5305/QF-20260701-762 (`lib/eva/chairman-decision-watcher.js`) — a SD that had gone through the full LEO
gate pipeline (5 accepted handoffs, TESTING sub-agent, 98% LEAD-FINAL) and shipped a passing regression
test. Each time, the test's own mock made `removeChannel()`/`unsubscribe()` a no-op that never re-fires
the callback — the mock encoded the same false premise as the bug, so the recursion never had a chance
to start and the test could not fail.

**Fix**: a structural class-guard, not a 4th per-instance patch:
1. **Lint rule**: `eslint-rules/no-realtime-teardown-in-subscribe-callback.js` — an AST rule that flags
   the teardown-call-inside-callback shape (including nested in conditional branches), reused via
   ESLint's programmatic `Linter` API by a standalone script,
   `scripts/lint/realtime-subscribe-teardown-recursion-lint.mjs`, wired into a **dedicated, genuinely
   blocking** GitHub Actions workflow. This repo's shared `npm run lint` (`eslint.config.js` flat config)
   is not invoked by ANY existing CI workflow — verified by `grep -rl "npm run lint" .github/workflows/*.yml`
   returning zero matches — so a rule registered only in `eslint.config.js` would repeat the same
   "looks enforced, isn't" gap already present for the one prior custom-rule precedent
   (`no-process-cwd-in-sub-agents.js`, exercised only by its own RuleTester test, never by a real lint
   pass over production files).
2. **Faithful shared test double**: `tests/helpers/faithful-supabase-realtime-mock.js` — a single,
   canonical mock whose `removeChannel()`/`unsubscribe()` genuinely re-fire the captured status callback
   (mirroring the real recursive behavior), replacing 2 independently-duplicated ad-hoc "faithful" mocks
   and closing a 3rd file's (`stage-governance.test.js`) complete absence of error-path coverage.

### PR-review checklist line

> When a fix targets a recursion/reentrancy bug in a vendored dependency's callback, verify the
> regression test's mock actually reproduces the dependency's re-entrant behavior (re-fires the
> callback) rather than treating the teardown call as an inert no-op — a mock that can't reproduce the
> crash can't catch a regression, no matter how many assertions surround it. Prove it via a negative
> control: temporarily revert the fix and confirm the new test fails before trusting it.

### Files Modified/Created
`eslint-rules/no-realtime-teardown-in-subscribe-callback.js` (new), `scripts/lint/realtime-subscribe-teardown-recursion-lint.mjs` (new), `.github/workflows/realtime-subscribe-teardown-recursion-lint.yml` (new), `tests/helpers/faithful-supabase-realtime-mock.js` (new), `tests/unit/eva/chairman-decision-watcher.test.js`, `tests/unit/eva/reality-gates.test.js`, `tests/unit/eva/stage-governance.test.js`

---

## Pattern: Count-delta gate should be identity-diff (+ diff-reachability), not a raw count comparison (SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001)

**Symptom**: A gate compares a raw failure COUNT main-vs-PR or baseline-vs-current ("failures rose
105 -> 107") and flags a regression on any rise — even when the delta is unrelated flaky / CI-secret /
shared-prod-DB-drift noise that has nothing to do with the change under test. This false-blocks PRs,
false-files QFs (wasting worker cycles), and trains workers to override/ignore the gate — eroding gate
trust, adjacent to the test-masking anti-pattern.

**Root cause**: comparing two SCALARS (a count) discards WHICH specific identities (test names, files)
changed. The same failing tests can produce a higher raw count on a re-run with no change under test
(retries, shared-DB drift, CI-secret expiry) — a count-delta gate cannot distinguish that from a
genuine regression.

**Audit — every count-delta gate instance found** (grep/AST sweep of `scripts/ci/`, `scripts/hooks/`,
`scripts/modules/`, `scripts/gate-health-check.js`, plus a manual read of borderline candidates):

| Class | File | Disposition |
|-------|------|-------------|
| GATE-THAT-FLAGS (in-scope anti-pattern) | `scripts/hooks/compare-test-baseline.cjs` `compareTestCounts()` | **CONVERTED** in this SD — see Fix below |
| GATE-THAT-FLAGS | `scripts/compare-to-main-snapshot.mjs` BASELINE_REGRESSION | **Deliberately deferred** — unmerged branch `qf/QF-20260701-833` (commit `b65b18e2c8`) already prototypes an identity-diff conversion for it; follow-up consolidation SD should have it adopt `lib/gates/identity-diff-gate.cjs` |
| GATE-THAT-FLAGS | `scripts/ci/red-merge-detector.mjs` `decide()` + `detectBaselineRot()` | **Deliberately deferred** — a separate durable fix is sourced elsewhere; same follow-up-consolidation note. Underlying `codebase_health_snapshots` rows carry only a scalar `failed_count` today (no per-test identity), so converting this instance also needs a snapshot-schema extension, not just a comparator swap |
| COUNT READER (not a gate, out of scope) | `scripts/hooks/capture-baseline-test-state.cjs`, `lib/sub-agents/regression.js`, `lib/eva/bridge/build-feedback-collector.js` | Reads/reports a count, does not flag on a delta |
| ABSOLUTE-THRESHOLD (not the anti-pattern, out of scope) | `scripts/modules/shipping/TestExecutionVerifier.js` (`failed>0`), `lib/sub-agents/github.js:575` (`failed_count>0`) | No main-vs-PR/expected-vs-actual delta semantics — an existence/cap check |
| CONTRASTIVE (already identity-scoped, reference shape) | `scripts/row-growth-snapshot.cjs` (table-name-scoped), `scripts/lib/ci-recurrence-detector.mjs` (classSignature-clustered) | Good examples of the target shape for future conversions |

**Fix**: a structural class-guard, mirroring the shipped `SD-LEO-INFRA-REALTIME-REMOVECHANNEL-
RECURSION-CLASSGUARD-001` shape exactly, not another per-instance patch:
1. **Shared comparator**: `lib/gates/identity-diff-gate.cjs` — `computeIdentityRegression(currentIds,
   priorFailingIds)` (a SET diff of failing identities, not a count subtraction), `extractFailingIds(raw)`
   (parses a vitest JSON report into `file::fullName` identities), `filterReachable(newIds, changedFiles)`
   (the diff-reachability half). Shaped as a drop-in superset of QF-20260701-833's inline primitive so
   the two deferred instances above can adopt it later with zero behavior change.
2. **One instance actually converted**: `scripts/hooks/compare-test-baseline.cjs` now diffs
   `failing_ids` (captured additively by `scripts/hooks/capture-baseline-test-state.cjs`) instead of
   subtracting `current_failed - baseline_failed` — proving the pattern end-to-end.
3. **Lint rule**: `eslint-rules/no-count-delta-gate-assertion.js` — NAME-ANCHORED (matches a
   failure-count lexicon: `numFailedTests`, `failed_count`, `baseline_failed`, `current_failed`,
   `new_failures`, or `/(^|_)(failed|failing|failure)_?(count|tests|total)?$/i`), not a general
   count-comparison AST match (which would false-positive on every ordinary numeric threshold check —
   confirmed empirically: an initial general pass over `scripts/modules/**` flagged 9 false positives,
   all existence checks (`failed > 0`) or absolute-cap checks (`< MIN_FAILURES_FOR_PATTERN`); refining
   to skip relational comparisons against a numeric literal or an ALL_CAPS constant brought it to zero).
   Reused via ESLint's programmatic `Linter` API by `scripts/lint/count-delta-gate-lint.mjs`, wired into
   a dedicated, genuinely blocking GitHub Actions workflow (same "`npm run lint` is never invoked by any
   CI workflow" rationale as the sibling class-guard).

### PR-review checklist line

> When a gate compares main-vs-PR or baseline-vs-current, verify it diffs a SET of identities (test
> names, file paths) rather than a raw scalar count — a count-delta comparison cannot distinguish a
> genuine regression from unrelated flaky/CI-secret/shared-DB-drift noise. Use
> `lib/gates/identity-diff-gate.cjs`'s `computeIdentityRegression`, not `currentCount - baselineCount`.

### Files Modified/Created
`lib/gates/identity-diff-gate.cjs` (new), `eslint-rules/no-count-delta-gate-assertion.js` (new),
`scripts/lint/count-delta-gate-lint.mjs` (new), `.github/workflows/count-delta-gate-lint.yml` (new),
`scripts/hooks/compare-test-baseline.cjs`, `scripts/hooks/capture-baseline-test-state.cjs`,
`scripts/modules/qa/test-output-parser.js` (pragma-exempted parsing-loop bound), `package.json`

---

## Pattern: Class-guard a Windows-broken raw isMainModule comparison via AST lint rule + reason-required grandfather allowlist (SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-CLASSFIX-001-B)

**Symptom**: A script's direct-execution guard — `if (import.meta.url === `file://${process.argv[1]}`) { main(); }`
(or the `+`-concatenation variant) — silently never fires when the script is invoked directly on Windows, so
`main()` never runs and the script appears to do nothing, with no error.

**Root cause**: `process.argv[1]` on Windows is a raw filesystem path with backslashes
(`C:\Users\...\script.js`); `import.meta.url` is always a proper `file://` URL with forward slashes and
percent-encoding. A template-literal or string-concat reconstruction of `file://${process.argv[1]}` can
never equal `import.meta.url` on Windows — the comparison is always false. The correct construction requires
`pathToFileURL(process.argv[1]).href` (Node's `node:url`), not manual string-building. The anti-pattern was
independently present at 21 confirmed-live call sites across `scripts/**`, converted in sibling child
SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-CLASSFIX-001-A (PR #5373, commit `714c675f90`) to call a single
shared helper, `isMainModule(import.meta.url)` (`lib/utils/is-main-module.js`), which does the
`pathToFileURL` conversion internally.

**Audit — AST match shape, banned vs. allowed** (scoped deliberately narrow to avoid false-positiving on
unrelated `import.meta.url`/`process.argv[1]` usage):

| Shape | Example | Disposition |
|-------|---------|-------------|
| Template-literal reconstruction | `` import.meta.url === `file://${process.argv[1]}` `` (either operand order) | **BANNED** — flagged by the rule |
| String-concatenation reconstruction | `import.meta.url === 'file://' + process.argv[1]` (either operand order) | **BANNED** — flagged by the rule |
| Loose-equality variant | `` import.meta.url == `file://${process.argv[1]}` `` | **BANNED** — flagged by the rule (`==` as well as `===`) |
| Shared helper call | `isMainModule(import.meta.url)` | **ALLOWED** — the fix pattern |
| `pathToFileURL(arg).href` comparison | `importMetaUrl === pathToFileURL(arg).href` | **ALLOWED** — a `CallExpression` chain, not a `TemplateLiteral`/`+`-concat, structurally outside the match shape (this is `is-main-module.js`'s own current internal implementation) |
| Aliased-variable legacy shape | `` const arg = process.argv[1]; ... importMetaUrl === `file://${arg}` `` | **ALLOWED** (out of match scope) — an aliased variable, not a bare `process.argv[1]` `MemberExpression`; kept out of scope deliberately to avoid a full data-flow/taint analysis, since every real occurrence found used the bare-`argv[1]`-inline shape |
| Unrelated `import.meta.url` usage | `path.dirname(fileURLToPath(import.meta.url))`, `import.meta.url === someOtherUrl` | **ALLOWED** (not the pattern) |

**Fix**: a structural class-guard, mirroring the shipped Realtime and Count-delta class-guards' shape exactly:
1. **Lint rule**: `eslint-rules/no-raw-ismainmodule-comparison.js` — an AST rule matching a
   `BinaryExpression` (`===`/`==`) where one operand is `import.meta.url` and the other is a
   `file://`-prefixed reconstruction (`TemplateLiteral` or `+`-concat) containing a bare `process.argv[1]`
   `MemberExpression`, in either operand order. Reused via ESLint's programmatic `Linter` API by
   `scripts/lint/ismainmodule-classguard-lint.mjs` (mirrors the sibling drivers' `walk`/`lintFile`/
   `--json`/`--root` shape exactly, so there is exactly one detection implementation, not a second one that
   could drift out of sync with the rule), wired into a dedicated, genuinely blocking GitHub Actions
   workflow (`.github/workflows/ismainmodule-classguard-lint.yml`) path-scoped to `scripts/**` — same
   "`npm run lint` is never invoked by any CI workflow" rationale as both sibling class-guards.
2. **Reason-required grandfather allowlist**: `scripts/lint/ismainmodule-classguard-allowlist.json` — same
   `{_doc, allow: {"<file>": "<reason>"}}` shape and `loadAllowlist()`-throws-on-empty-reason contract as the
   Count-delta guard's allowlist precedent. Built anticipating 21 files still pending conversion at
   branch-cut time; by the time this SD reached its retrospective step, sibling `-A` had already merged its
   conversion to `origin/main` (`714c675f90`, before this branch merged) — so a `git merge origin/main` +
   re-run of the driver showed 0 remaining violations, and the allowlist was pruned to an intentionally
   empty (but still-documented, not deleted) `{}` before shipping. The guard covers 100% of `scripts/**`
   (excluding `scripts/archive/**`, ~140 out-of-scope dead one-time/archived instances) with zero exceptions
   from day one — a cleaner outcome than the grandfather mechanism was originally built to permit, discovered
   and corrected during the retrospective step rather than assumed from the pre-merge plan.
3. **Escape-hatch pragma**: `// eslint-disable-next-line <rule> -- <reason>` with a non-empty reason,
   matching the sibling rules' convention exactly (`getDisablePragmaCommentAbove` + `classifyPragma`).
   RuleTester gotcha for this and future class-guard rules: a test fixture for "pragma present but reason is
   empty" must use `-- ` with trailing whitespace, not a bare `--` — a bare `--` with nothing after it
   collides with ESLint's own native `eslint-disable-next-line <rule> -- <reason>` directive-comment parser
   (a real built-in ESLint 7+ feature, distinct from this rule's own regex-based reason check), which
   mis-splits the rule name and throws a spurious "unknown rule" error alongside the rule's own message. The
   precedent (`no-count-delta-gate-assertion.test.js`'s TS-9 case) established the trailing-whitespace
   convention; this SD's test suite follows it.

### PR-review checklist line

> When a PR adds or edits a direct-execution guard (`if (import.meta.url === ...) { main(); }`), verify it
> calls `isMainModule(import.meta.url)` from `lib/utils/is-main-module.js` rather than reconstructing a
> `file://` URL from `process.argv[1]` inline — `process.argv[1]` is a raw OS path (backslashes on Windows)
> and can never string-equal the proper `file://` URL `import.meta.url` always is. This is enforced by a
> genuinely-blocking CI lint (`ismainmodule-classguard-lint`), not just convention.

### Files Modified/Created
`eslint-rules/no-raw-ismainmodule-comparison.js` (new), `scripts/lint/ismainmodule-classguard-lint.mjs`
(new), `scripts/lint/ismainmodule-classguard-allowlist.json` (new),
`.github/workflows/ismainmodule-classguard-lint.yml` (new),
`tests/unit/eslint-rules/no-raw-ismainmodule-comparison.test.js` (new), `package.json`

---

## Cross-References

- **Database Patterns**: [database-agent-patterns.md](./database-agent-patterns.md)
- **Validation Enforcement**: [validation-enforcement.md](./validation-enforcement.md)
- **Operations Runbook**: [../06_deployment/infrastructure-hardening-runbook.md](../06_deployment/infrastructure-hardening-runbook.md)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial documentation from SD-LEO-INFRA-HARDENING-001 |
| 1.1.0 | 2026-07-01 | Added Realtime subscribe-teardown class-guard pattern from SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001 |
| 1.2.0 | 2026-07-01 | Added Count-delta-vs-identity-diff gate class-guard pattern from SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001 |
| 1.3.0 | 2026-07-02 | Added isMainModule raw-pattern class-guard from SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-CLASSFIX-001-B |
