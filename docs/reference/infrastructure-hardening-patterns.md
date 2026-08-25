---
category: reference
status: draft
version: 1.5.0
author: Rick Felix
last_updated: 2026-08-16
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
// Configurable timeout (120s default, via SUB_AGENT_TIMEOUT_MS)
const timeoutMs = options.timeout || parseInt(process.env.SUB_AGENT_TIMEOUT_MS || '120000', 10);

const timeoutPromise = new Promise((_, reject) => {
  timeoutHandle = setTimeout(() => reject(new SubAgentTimeoutError(code, timeoutMs)), timeoutMs);
});

// Race sub-agent execution against timeout
results = await Promise.race([
  subAgentModule.execute(sdUUID || sdId, subAgent, execOptions),
  timeoutPromise
]);
clearTimeout(timeoutHandle); // cleared on BOTH the success and catch paths -- see below
```

### Benefits
- **Prevents infinite hangs**: Enforces maximum execution time
- **Configurable per agent**: Different agents can have different timeouts (or fleet-wide via `SUB_AGENT_TIMEOUT_MS`)
- **Clean error handling**: Timeout throws a named `SubAgentTimeoutError` sentinel, distinguishable from a genuine thrown error or a missing module (see "Failure Cause Discrimination" below)
- **Auto-recovery**: Orchestrator continues after timeout
- **No leaked timer**: `clearTimeout(timeoutHandle)` runs on both the success path and inside the catch block -- an earlier version only cleared it on success, leaking a pending timer on every non-timeout failure (SD-LEO-INFRA-EXECUTOR-120S-1800S-001, FR-2)

### Configuration

**Per-SD timeout**:
```javascript
await executeSubAgent(subAgent, sdId, { timeout: 120000 }); // 2 minutes
```

**Default timeout**: 120000ms (2 minutes), overridable fleet-wide via `SUB_AGENT_TIMEOUT_MS`

### File Modified
`lib/sub-agent-executor/executor.js` (timeout wrapper + failure-cause discrimination, ~lines 220-360 as of SD-LEO-INFRA-EXECUTOR-120S-1800S-001)

---

## Failure Cause Discrimination

### Pattern Overview

When the timeout-wrapped `Promise.race()` above rejects, discriminate WHY it rejected instead of collapsing every cause into one identical outcome. Before SD-LEO-INFRA-EXECUTOR-120S-1800S-001, a bare `catch {}` around the sub-agent module's dynamic `import()` treated a timeout, a genuine thrown error, and a truly-missing module file identically -- all three wrote `verdict='MANUAL_REQUIRED'` with zero trace of which one actually happened, corrupting 81 live evidence rows before the cause could be told apart.

### Implementation

```javascript
} catch (rawErr) {
  clearTimeout(timeoutHandle);
  // Normalize BEFORE any branch dereferences .message/.stack -- a non-Error rejection
  // (null/undefined/a thrown string, all legal JS) would otherwise crash inside this very
  // catch block and escape to the outer catch, which stores verdict='ERROR' (a fleet-wide
  // hard block, not the mode-gated MANUAL_REQUIRED advisory below).
  const err = rawErr instanceof Error ? rawErr : new Error(String(rawErr));

  let failureCause;
  if (err instanceof SubAgentTimeoutError) {
    failureCause = 'timeout';
  } else {
    // Module-relative resolution, NOT process.cwd()-relative and NOT error.code alone:
    // - a naive relative fs.existsSync() resolves against the wrong cwd from any caller
    //   other than the exact one it was written for
    // - ERR_MODULE_NOT_FOUND is thrown identically whether the top-level module itself is
    //   missing or one of ITS transitive dependencies is missing inside an otherwise-present
    //   module -- only checking the TOP-LEVEL module's own resolved path discriminates them
    const resolvedModulePath = fileURLToPath(new URL(modulePathSpecifier, import.meta.url));
    failureCause = fs.existsSync(resolvedModulePath) ? 'genuine_error' : 'missing_module';
  }

  // verdict stays 'MANUAL_REQUIRED' for ALL THREE causes -- a deliberate, documented,
  // zero-blast-radius scope boundary. subagent-evidence-gate.js's NON_EVIDENCE_VERDICTS
  // (which ERROR belongs to) is checked BEFORE REJECT_VERDICTS and triggers an unconditional
  // fleet-wide hard block that ignores SUBAGENT_VERDICT_MODE entirely -- routing any of these
  // three causes through verdict='ERROR' would silently convert a mode-gated advisory into
  // that hard block. metadata.failure_cause carries the real cause instead.
  results = {
    verdict: 'MANUAL_REQUIRED',
    confidence: 50,
    error: err.message,
    stack: err.stack,
    metadata: { failure_cause: failureCause },
    // ...cause-specific message/recommendations
  };
}
```

### Benefits
- **Diagnosable evidence**: `metadata.failure_cause` (`timeout` | `genuine_error` | `missing_module`) tells a reader WHY a `MANUAL_REQUIRED` row exists, without inferring it from message text
- **Zero blast radius**: the gate-facing `verdict` value is unchanged from before this pattern shipped -- no downstream handoff-blocking behavior changes
- **cwd-independent**: module-existence resolution uses `fileURLToPath(new URL(modulePathSpecifier, import.meta.url))`, correct regardless of the process's current working directory
- **Crash-safe on hostile rejections**: normalizing `rawErr` to a real `Error` before any `.message`/`.stack` access prevents a non-Error rejection from crashing inside the catch and escaping to a verdict='ERROR' outer catch

### Caveats
- **Non-Error rejections still normalized via `String(rawErr)`**: a prototype-less object or an object with a throwing `toString()` can still throw during that `String()` call -- a narrower, largely theoretical residual of the same failure mode (see PR #7490 review discussion). Not addressed; the LOC cost was judged not worth it for a case that requires an attacker to control what a sub-agent module *throws*, not just what it returns.
- **Do not add a fourth failure_cause without re-checking the gate**: any new cause must still route through `verdict='MANUAL_REQUIRED'`, or re-verify against `subagent-evidence-gate.js`'s verdict-classification ordering first.

### Historical Corruption Remediation

Rows written before this pattern shipped are marked `metadata.pre_fix_corrupted=true` by an idempotent, read-merge-write remediation script (`scripts/one-off/remediate-executor-manual-required-corruption-001.mjs`) — re-queries the live table at run time rather than a fixed row list, safe to re-run indefinitely.

### File Modified
`lib/sub-agent-executor/executor.js`, `lib/sub-agent-executor/results-storage.js` (added `error`/`stack` to `PERSISTED_ELSEWHERE`)

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

## Pattern: Sub-agent evidence rows must never hand-type Windows path literals in inline shell/JS INSERT scripts (SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001)

**Symptom**: `sub_agent_execution_results.metadata->>'repo_path'`, `metadata->>'executed_from_cwd'`, and
the separate top-level `executed_from_cwd` column intermittently contain silently-corrupted Windows
paths — some fields corrupted while sibling fields in the SAME row stay clean, proving independent
per-write typing rather than a deterministic code bug. Corrupted `repo_path` values silently fail the
`SUB_AGENT_REPO_RESOLUTION` gate's exact-match comparison against `applications.local_path`, producing
confusing gate-failure investigations (this exact bug blocked
`SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B` EXEC-TO-PLAN on 2026-07-02, requiring a
manual DB fix). A live full-table scan found 63 corrupted rows out of 34,246, dated across a multi-week
range including the day of authoring — an active, ongoing corruption class, not a historical one-off.

**Root cause**: sub-agents spawned via the Task tool are told (by `leo_protocol_sections` rows that
generate `CLAUDE_PLAN.md`'s Task-tool prompt templates) to "Store results in sub_agent_execution_results
table" with ZERO guidance on HOW — so each spawned agent freelances its own approach, and several
hand-typed inline `node -e "..."`/heredoc `INSERT` scripts containing literal Windows path strings (e.g.
`"C:\Users\rickf\..."` written directly into a JS/shell string). The literal passes through JS
string-escape parsing at PARSE TIME, before the value ever reaches the database or the canonical
`lib/sub-agents/resolve-repo.js` writer (confirmed correct and unmodified by this SD): `\U`, `\P`, `\_`,
`\E` are not recognized JS escapes, so the backslash is silently dropped while the letter survives; `\r`
IS a recognized escape and becomes a literal embedded carriage-return control byte (`0x0D`) in the stored
string. The same mechanism corrupts `\n` (embedded LF, `0x0A`) in any path containing a directory name
starting with `n` (e.g. `\node_modules`) — a related instance this SD's own trigger regex initially
missed (caught by an independent TESTING-perspective verification pass before the migration was applied;
see the Files list below for the fixed version, not a since-superseded draft).

**Fix**: prevention + repair, not a single patch:
1. **A deterministic evidence-writer CLI already exists** (`scripts/store-sub-agent-repo-evidence.js`,
   QF-20260702-679, shipped independently and reused as-is here) — it chains
   `resolveSubAgentRepo → applySubAgentRepoVerdict → storeSubAgentResults` so evidence content comes from
   `--content @<file>|-`, never an inline path literal. This SD does not reimplement it.
2. **Point the leak-vector templates at it**: `leo_protocol_sections` rows `id=290`
   (`lead_explore_integration`) and `id=291` (`plan_multi_perspective`) — the only two rows in the table
   containing the bare "Store results in sub_agent_execution_results table" phrase — now explicitly
   instruct agents to use the CLI and forbid hand-typed path literals. Regenerated via
   `node scripts/generate-claude-md-from-db.js`, verified zero-drift via `check-claude-md-drift.cjs`.
3. **DB-level BLOCKING guard** (fail-closed at the source, unlike the advisory-only
   `session_coordination_insert_lint` precedent): `trg_subagent_evidence_reject_control_chars`
   `RAISE EXCEPTION`s on any C0 control character except tab (`[\x00-\x08\x0A-\x1F]`) in
   `metadata->>'repo_path'`, `metadata->>'executed_from_cwd'`, or the top-level `executed_from_cwd`
   column — catches every producer regardless of code path, not just the ones updated in step 2.
4. **Historical backfill**: `scripts/backfill-corrupted-subagent-repo-paths.mjs` — `repo_path` is
   deterministically recovered via `sd_id → strategic_directives_v2.target_application →
   applications.local_path` (the corrupted string itself is NOT algorithmically un-corruptible —
   information is destructively lost — so recovery is a DB join, not string repair); `executed_from_cwd`
   in both locations is set to `NULL` rather than fabricated, since the exact original worktree path is
   unrecoverable. `--dry-run` by default; `--apply` required to write.

**Verification lesson**: the migration's first draft used reject-class `[\x00-\x08\x0B-\x1F]`, intending
to exclude only tab (`\x09`) — but the range skip from `\x08` to `\x0B` also silently excluded newline
(`\x0A`), undermining the "BLOCKING" guarantee for exactly the corruption pattern this SD exists to catch.
An independent TESTING-perspective verification pass (re-deriving the regex behavior live against
Postgres rather than trusting the implementer's report) caught this before the migration was applied to
production. Fixed to `[\x00-\x08\x0A-\x1F]` in both the SQL trigger and the JS `detectCorruption()`
before deployment; a regression test for the newline case was added to the test suite.

### PR-review checklist line

> When a sub-agent (or a Task-tool prompt template) needs to persist evidence to
> `sub_agent_execution_results`, verify it routes through `scripts/store-sub-agent-repo-evidence.js` or
> `lib/sub-agents/resolve-repo.js` — never a hand-typed Windows path literal inside an inline
> `node -e`/heredoc `INSERT` script. The JS string-escape parser silently corrupts backslash sequences
> before the value ever reaches the database.

### Files Modified/Created
`database/migrations/20260702_subagent_evidence_control_char_trigger.sql` (new),
`scripts/backfill-corrupted-subagent-repo-paths.mjs` (new),
`tests/database/subagent-evidence-control-char-trigger.test.js` (new),
`tests/unit/scripts/backfill-corrupted-subagent-repo-paths.test.js` (new),
`leo_protocol_sections` rows `id=290`, `id=291` (DB content update, not a file),
`CLAUDE_PLAN.md`, `CLAUDE_LEAD.md` (regenerated)

---

## Pattern: A ratchet guard's own comparison logic needs the same adversarial rigor as what it protects (SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001)

**Symptom**: A repo-wide "freeze existing debt, block only new debt" ratchet guard (a scanner + a frozen
baseline + a "live findings ⊆ baseline" subset check) shipped with a mutation/red-green meta-test that
only proved the underlying SCANNER could return a non-empty result on synthetic input — never that the
SUBSET COMPARISON deciding pass/fail could actually detect a new violation. In the guard's normal passing
state, live findings equal the baseline exactly, so the "any new finding?" filter is trivially empty
regardless of whether the comparison logic is even correct — a broken comparison and a correct one are
indistinguishable by that meta-test alone.

**Root cause**: two separate defects, both independent of the guard's core scan logic, both caught only
by adversarial review (not by the guard's own test suite as originally written):
1. **Dedup-key collision**: the baseline's dedup key (`file:line:rule`) was not unique — Babel reports a
   chained call expression's line as the start of the WHOLE fluent chain, so two genuinely different
   violations on the same table/rule (e.g. `.lt('progress', ...)` and `.select('...progress...')` both
   starting on the same source line) collided onto one baseline slot. A future, genuinely new violation
   landing on an already-baselined line would have silently passed the "no new site" check instead of
   failing it. Verified against the live, already-committed baseline: 37 recorded sites, only 36 unique
   `file:line:rule` keys.
2. **Untested comparison**: even after fixing (1), the comparison itself (`findings.filter(f =>
   !baselineKeys.has(key(f)))`) was inlined directly in the "live vs. real baseline" test — there was no
   way to exercise it with synthetic before/after data, only with the live repo tree, where it always
   either passes (nothing changed) or the test itself is what's supposed to catch a break.

**Fix**: extract the comparison into a pure, named function (`findNewViolations(liveFindings,
baselineSites)` + a `ratchetKey(site)` helper covering ALL discriminating fields — file, line, rule,
*and* method) decoupled from git/filesystem state, then write dedicated synthetic red/green tests against
it directly: exact match → `[]`; a finding on a never-baselined file/line → flagged; two different
violations sharing one file+line (the exact collision shape) → both tracked independently, a third new
one on that same line still flagged; a shrunk baseline (future cleanup) → still passes. The live-tree test
now calls this same extracted function instead of duplicating the filter inline, so a future edit to the
comparison logic is caught by the fast synthetic tests, not only by however the live tree happens to look
on any given CI run.

### PR-review checklist line

> When a PR adds a ratchet/allowlist guard (freeze existing findings, block only new ones), verify the
> ACTUAL comparison function that decides pass/fail is unit-tested against synthetic before/after data —
> not just the underlying scanner. In the guard's normal passing state, "live == baseline" is trivially
> true regardless of whether the comparison is even correct; a broken dedup key or comparison bug is
> invisible until a real regression silently passes through it. Also verify the dedup key includes every
> field that can vary independently on the same source line — a parser (or any AST-based scanner) that
> reports a *chained* call's location as the chain's start, not each individual call's own line, will
> collide two different violations onto one key unless the key also includes something that
> distinguishes them (here: the method name).

### Files Modified/Created
`scripts/lint/progress-column-lint.mjs` (new), `tests/unit/hygiene/no-bare-progress-column.test.js`
(new), `tests/unit/hygiene/progress-column-baseline.json` (new), `scripts/audit/control-seed-specs.json`
(registered a seeded-defect trial for the new guard)

---

## Pattern: A "proven safe" fix for one execution context can be actively worse in another -- measure before transplanting (SD-LEO-INFRA-STALE-INDEX-LOCK-001)

### Problem
A recurring Windows libuv `UV_HANDLE_CLOSING` assertion crash in `.husky/commit-msg`'s
`scripts/append-fleet-commit-trailer.js` left stale `.git/worktrees/<name>/index.lock` files behind
after `git commit`, blocking the next git operation in that worktree. Two prior SDs had already
shipped partial fixes for this defect *class* elsewhere in the repo (an unrelated ref'd
`setInterval` in `lib/heartbeat-manager.mjs`, fixed via `armUnrefInterval()`; detection-only stale-lock
tooling that explicitly punted on cleanup). Neither actually fixed this file's crash.

### The trap: reusing a proven pattern across execution contexts without re-measuring
The obvious fix -- replace this script's `process.exit(0)` with `process.exitCode = X; return;`,
the exact pattern `scripts/cron/index-jam-detector.mjs:158-163` already documents as fixing an
identical libuv assertion for its own Supabase client -- looked like a safe, already-validated
transplant. A live probe (a real supabase-js client pointed at a blackhole IP to force the timeout
branch deterministically) measured the opposite: the abandoned in-flight fetch, not the timer, keeps
Node's event loop open, and letting the process drain naturally instead of forcing an exit converts
an *intermittent* crash into a *deterministic ~50 second hang on every interactive `git commit`* --
because the CRON context where the pattern was proven safe tolerates an invisible 50s tail; an
interactive hook in the commit path does not. The difference is entirely about WHERE the code runs,
not what the code does, and only a live measurement caught it before it shipped.

### The actual fix: retire the dependency, don't tune it
`append-fleet-commit-trailer.js` needed exactly one string -- a fleet callsign for commit-message
attribution -- and was fetching it over the network on every single commit. The coordinator already
maintains a local, always-current cache of that exact value
(`scripts/hooks/coordination-inbox.cjs` writes `fleet-identity-<sessionId>.json` on every
`SET_IDENTITY` message). Reading that file synchronously eliminates the Supabase client, the
`Promise.race`, and the `setTimeout` guard entirely -- no async handle exists to leak, so there is
nothing left for `process.exit(0)` to force-close unsafely. The defect class is retired, not
mitigated.

### The path-resolution trap this exposed
The existing convention for locating that cache elsewhere in the repo
(`IDENTITY_DIR = path.resolve(__dirname, '../../.claude')`, used verbatim in at least two other
files) resolves relative to the *reading script's own location* -- correct only when that script is
invoked from the shared checkout. Invoked from a git worktree (as `.husky/commit-msg` always is when
committing inside one), it silently resolves to the worktree's own empty `.claude/` directory instead
of the shared root holding the real identity files -- a fail-open that reads identical to "no
identity assigned yet," making the bug invisible rather than loud. Fixed by resolving the shared root
via `git rev-parse --path-format=absolute --git-common-dir` (correct in both topologies, including
under the real `GIT_DIR`/`GIT_INDEX_FILE` env vars a commit-msg hook actually runs with -- measured,
not assumed; `CLAUDE_PROJECT_DIR` is empty in a git-hook execution context and is not a substitute).

### Verification discipline
3 rounds of prospective TESTING review, each using REAL probes against real infrastructure (not code
reading alone), each finding something the prior round missed: round 1 found the Supabase client
itself (not just the timer) was the crash source; round 2 found the "obvious" replacement fix was
actively worse; round 3 found and self-corrected a false assumption about *when* a session's callsign
becomes available, before landing on the coordinator's already-existing cache. Regression tests use
real `child_process` spawns against a disposable temp git repo plus a real `git worktree add` of it
(not a simulated worktree), so the path-resolution trap above is genuinely exercised, not merely
described. A pre-existing "idempotent, never double-stamps" test was found to be vacuous during
mutation testing -- it used a session ID with no matching identity file, so the script's fail-open
branch returned before ever reaching the double-stamp guard the test claimed to cover.

### Files Modified
`scripts/append-fleet-commit-trailer.js`, `tests/unit/append-fleet-commit-trailer.test.js`

---

## Pattern: A `fork` sub-agent that ends its own turn with "running in background, I'll check back" has not done the work -- treat it as incomplete (SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001)

**Symptom**: An Agent tool call (`subagent_type: "fork"`) was dispatched with a detailed,
multi-file security-hardening implementation task. It returned a short text response --
`tool_uses: 2`, ~30 seconds -- saying it was "running in the background" and would "check back
in ~10 minutes to merge its fix." The turn ended there. No PR existed on GitHub afterward.

**Root cause**: forks (and agents generally) only produce a result the orchestrator can act on
by returning a completed answer within their own turn -- there is no mechanism by which a fork
can autonomously "check back" into the parent conversation later. A fork that spawns background
work of its own and then ends its turn early has, from the orchestrator's perspective, simply
not done the task -- the promised follow-up never arrives, because nothing is listening for it.
This is a hallucinated capability, not a real async pattern: contrast with `Workflow`'s actual
background execution, which *does* deliver a `<task-notification>` on completion.

**Detection**: `tool_uses` far below what the task shape implies (a multi-file
implement-test-commit-push-PR task should show 20-80 tool calls, not 2) plus response text
promising a future check-in is the tell. Verify directly against the external system the agent
claimed to have changed (here, `gh pr list --repo <repo> --state all --limit 5`) rather than
trusting the response text -- the same "verify the artifact, not the narration" discipline this
document's other patterns already establish for retrospectives and test claims.

**Recovery that did NOT work**: `SendMessage({to: <the fork's agentId>, ...})` asking it to
finish the work. The response came back from a *different* agentId with "I'm a freshly-started
agent with no memory of a conversation that described [the task]" -- once a fork's turn has
ended with this failure mode, SendMessage to its ID does not reliably resume the original
context; it can produce a fresh agent that received the message as a cold-start prompt.

**Recovery that worked**: re-issue a brand-new `Agent({subagent_type: "fork", ...})` call
containing the FULL original task specification inline (not a reference to "your prior
message"), with an explicit instruction added: *"do this work synchronously and completely
within this single turn... do not end your turn early with a 'running in background, will check
back' style message -- that does not work in this environment."* This succeeded on the next
attempt (33 tool calls, real PR opened, CI green).

**Generalization**: whenever dispatching a fork/agent for implementation work (not just this
SD), a short response with disproportionately few tool calls and language implying a future
autonomous check-in is a signal to verify externally before trusting it, and to re-dispatch with
an explicit synchronous-completion instruction rather than assuming the work is merely delayed.

**Recurrence (SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001, same day)**: happened AGAIN, twice in a row,
for a plain LEAD-phase *investigation* dispatch (not implementation) -- 1 tool call each time,
both claiming to have "armed a wakeup to check back in ~N minutes." The second attempt's prompt
included the exact explicit anti-backgrounding instruction from this pattern's "Recovery that
worked" section above, verbatim, and the fork did it anyway. Two consecutive failures despite the
documented workaround being applied is itself the signal: this is not a one-off quirk to work
around per-dispatch, it is a live characteristic of the `fork` subagent_type under some
condition not yet isolated (session length? task phrasing as "investigation" rather than
"implementation"? something else). **What worked instead**: abandoning `fork` entirely for that
task and dispatching a dedicated `testing-agent` (a non-fork, non-generic subagent_type) for what
was still fundamentally a research/investigation task -- it completed correctly and
synchronously (15 tool calls, real findings) on the first attempt. Every `testing-agent` and
`security-agent` dispatch across this entire session-day completed correctly; only `fork`
exhibited this failure, and it did so 3 times total (1 in the pricing-checkout SD, 2 in this
one). **Recommendation, strengthened**: when a `fork` dispatch fails this way once, do not
simply retry `fork` with a sterner prompt -- switch to a dedicated agent type (`testing-agent`
for review/investigation work, or handle implementation directly) rather than spending a second
`fork` attempt on faith that the instruction alone will fix it. A `/signal feedback` to the
coordinator is also warranted at 2 consecutive failures, per this repo's own recurrence
threshold (gate 2x / RCA 2x / tool 3x).

### Files Modified
None (process/operational finding, not a code fix) -- captured here for future sessions
dispatching implementation forks.

---

## Pattern: A retry/backoff counter gated on the same evaluation it controls is a self-referential fixed point

**SD**: SD-LEO-INFRA-STAGE-GATE-RETRY-001

**Symptom**: A first implementation of bounded-retry-with-backoff for EVA's stage-gate
re-evaluation loop (`lib/eva/gate-retry-guard.js`) computed a "should skip this poll" decision
purely from `attemptCount` -- the number of prior gate-evaluation attempts recorded in
`eva_stage_gate_attempts`. When the guard decided to skip, the caller (`stage-execution-worker.js`
's `_processVenture`) correctly did NOT evaluate the gate that tick, so no new attempt row was
written. The next poll (~30s later) re-read the SAME `attemptCount`, computed the SAME skip
decision, and repeated forever. A prospective TESTING sub-agent review of the merged EXEC diff
caught this by literally executing the shipped `shouldSkipForBackoff()` across a simulated
sequence of poll ticks: it skipped starting at attempt 8 and never advanced past it in a
500-tick simulation. Verdict: FAIL. This was WORSE than the original unbounded-retry defect this
SD existed to fix -- the original bug at least stayed visible (a growing row count); this bug
froze a venture invisibly, with zero further DB writes and zero visibility to the SD's own
census-as-code instrument (which only flags ventures AT or PAST the ceiling -- a venture stuck
below it, forever, is invisible to both the fix and its own monitoring).

**Root cause**: the backoff mechanism's gating condition (`shouldSkip`) and its own advancing
counter (`attemptCount`) were the same variable, and the ONLY thing that advances that variable
is exactly the action `shouldSkip` suppresses. Any retry/backoff design where "we're waiting" and
"the thing that ends the wait" share a single counter, and the counter only advances when NOT
waiting, is a fixed point once the wait condition first becomes true.

**Fix**: redesigned the backoff to be WALL-CLOCK-TIME-based instead of attempt-count-based.
`getGateAttemptState()` now returns both `attemptCount` (for the hard ceiling comparison, unchanged) and
`lastAttemptAt` (the most recent attempt's timestamp). `shouldSkipForBackoff(attemptCount,
lastAttemptAt, now)` compares `now - lastAttemptAt` against an exponentially-growing required
delay. Because `now` (real elapsed time) advances on every poll regardless of whether evaluation
runs, the skip condition eventually clears even while `attemptCount` stays frozen -- the venture
proceeds, a new attempt is recorded, `attemptCount` advances, and the NEXT required delay grows
further. This breaks the fixed point: a round-2 adversarial re-review independently simulated the
corrected function over a realistic 30s-poll loop and confirmed the venture genuinely reached the
ceiling in ~5.4 simulated days (15,619 ticks), versus freezing forever under the original design.

**Generalization**: before shipping any retry/backoff/rate-limit mechanism, ask explicitly: *does
advancing past the "wait" state require the exact action the wait state is suppressing?* If yes,
the counter must be driven by something that advances independently of that action -- wall-clock
time elapsed (as here), a separate heartbeat/tick counter, or an external signal -- never the same
counter the gate itself controls. A unit test that asserts the backoff schedule's SHAPE
(delays increase) is not sufficient to catch this class of bug -- it must simulate the schedule
being DRIVEN THE SAME WAY THE REAL CALLER DRIVES IT (i.e., re-invoke the skip decision across many
simulated ticks with the counter held exactly as the real caller would hold it) to see whether it
ever un-sticks. This is the same "mutation/simulation over the shipped function beats a
unit-test-shape check" pattern used elsewhere in this doc, applied to a retry/backoff-specific
failure mode not previously catalogued here.

**Also caught in the same review** (documented briefly, not full pattern sections since they map
onto EXISTING catalogued classes in this repo): (a) `scripts/eva/census-unbounded-retry.mjs`'s
first cut used a single unbounded `.select()` against `eva_stage_gate_attempts`, silently capped
at 1000 rows by PostgREST against a real 1902-row specimen -- exactly the class
SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001's `count-truncation-diff-lint` CI check exists to
block on NEW sites; it caught a SECOND unbounded site (a `.in()`-filtered `ventures` lookup) this
SD introduced, which `.in()` alone does not satisfy (only `single()`/`maybeSingle()`/`limit(<1000)`
/`range()`/`fetchAllPaginated` are recognized bounding markers -- see
`scripts/audit/count-truncation-inventory.mjs`'s `classifyChain()`). (b) an idempotency
short-circuit (`recordGateOverride`) gated only on a decision-id match would have permanently
suppressed a retry after a transient audit-write failure, since the pre-fix code's every-poll
retry had accidentally been self-healing that exact failure mode -- fixed by gating the
short-circuit on a durable `attempt_recorded=true` stamp set only after the write actually
succeeds, not on the presence of the decision alone.

### Files Modified
`lib/eva/gate-retry-guard.js` (backoff redesign), `lib/eva/artifact-persistence-service.js`
(idempotency + attempt_recorded stamp), `scripts/eva/census-unbounded-retry.mjs` (pagination +
bounded ventures lookup), plus corresponding tests in `tests/unit/eva/`.

---

## Pattern: A fix for a recurrence must be adversarially reviewed for its OWN new failure modes, not just re-verified against the old bug

**SD**: SD-LEO-INFRA-SESSION-TICK-CLEAR-001

**Symptom**: SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 (2026-08-04) shipped a SessionStart-hosted
mechanism to release a rotated-out session's `claude_sessions` row (so its tick daemon self-exits)
on `/clear`/compaction-resume. Fully wired, but its candidate discovery depended entirely on a
`.claude/pids/tick-<session_id>.json` marker file SHARED across every daemon one session_id ever
spawns over its life. `session-tick.cjs`'s `deleteMarker()` unlinks that shared file
UNCONDITIONALLY on any exit (`cleanupAndExit`, wired to SIGINT/SIGTERM/uncaughtException) — the
FIRST sibling daemon to exit deletes the join key every surviving sibling still needs. A real
specimen (the "Solomon" seat) had its daemon become immortal until a human manually intervened.

**The fix, and the lesson**: the fix (an additive `metadata.cc_parent_pid` DB field, stamped at
every SessionStart, plus a marker-INDEPENDENT closure pass that joins on it directly) is correct
and closes the class. But across FIVE rounds of independent adversarial review on this single SD
(1 PLAN-phase prospective + 2 EXEC-phase retrospective, each followed by fixes), every round found
a REAL, NON-OBVIOUS defect that had NOTHING to do with the original marker-deletion bug:

1. **PLAN prospective**: the new DB-join query, as first designed, sat AFTER an existing
   `if (!candidateIds.length) return;` early-return — meaning it was DEAD CODE in exactly the
   marker-deleted scenario it existed to fix. (Also caught: `claude_sessions` is measured
   MULTI-HOST live — an un-scoped pid join would have introduced a NEW cross-host false-death
   vector while fixing the marker one.)
2. **EXEC retrospective (TESTING)**: a test for the hostname fail-closed guard was vacuous (its
   fixture never contained a row the guard specifically needed to exclude, so it passed whether or
   not the guard existed). A malformed row from the new query path (missing/null `session_id`)
   could have poisoned the SHARED release call, silently losing the marker-path's OWN legitimate
   releases along with it. A `parentPid` derivation wrapped a fallback chain inside the SAME
   try/catch as the primary lookup, so a thrown error skipped the fallback entirely with zero
   trace.
3. **EXEC retrospective (SECURITY)**: `parentPid` was never shape-validated — an empty string
   would pass the `undefined`/`null` check and become a "match-anything" DB-join bucket for any
   other row that also degraded to the same malformed stamp. `session_id` values reaching the
   final `.in(toCloseIds)` release call were never shape-validated either — postgrest-js escapes
   commas/parens in filter values but NOT double-quotes, demonstrated live by the reviewer as a
   filter-syntax smuggling vector.

None of these five defects were variants of the ORIGINAL bug (shared marker deletion). Each was a
new failure mode introduced by the FIX ITSELF — the natural byproduct of adding a new code path
(new query ordering, new cross-cutting scope, new untrusted-shaped inputs) to close an old one.

**Generalization**: when closing a recurrence, "does this fix the original bug" is necessary but
not sufficient review. The fix is new code with its own surface — ordering bugs (does it actually
run in the failure scenario, or only in the already-working case?), scope bugs (did closing a
narrow gap accidentally widen a boundary — host, tenant, permission — the original bug never
touched?), and input-shape bugs (does the new code path trust a value the old path never had to
handle?) are the three recurring shapes this SD's five rounds actually found. A recurrence-fix
review checklist should ask all three explicitly, not just "does the acceptance-gate scenario now
pass" — every one of these five findings would have shipped invisibly past that single check.

### Files Modified
`scripts/hooks/session-register.cjs` (stampCcParentPid, closeRotatedOutSessions PASS 2),
`tests/unit/sessions/rotation-closure-db-join.test.js` (new, 17 tests),
`tests/unit/sessions/rotation-closure-wiring.test.js` (fake updated for the new trailing
`.limit(999)`).

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
| 1.4.0 | 2026-07-02 | Added sub-agent evidence control-character corruption pattern from SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001 |
| 1.5.0 | 2026-08-16 | Added ratchet-guard comparison-logic testability pattern from SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001 |
| 1.6.0 | 2026-08-25 | Added self-referential retry/backoff fixed-point pattern from SD-LEO-INFRA-STAGE-GATE-RETRY-001 |
| 1.7.0 | 2026-08-25 | Added recurrence-fix-needs-its-own-adversarial-review pattern from SD-LEO-INFRA-SESSION-TICK-CLEAR-001 |
