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
