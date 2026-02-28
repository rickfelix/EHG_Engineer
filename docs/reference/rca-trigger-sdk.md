---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# RCA Trigger SDK - API Reference


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Trigger Types](#trigger-types)
- [Classification Categories](#classification-categories)
- [Core Functions](#core-functions)
  - [buildTriggerEvent(params)](#buildtriggereventparams)
  - [buildHandoffContext(params)](#buildhandoffcontextparams)
  - [buildGateContext(params)](#buildgatecontextparams)
  - [buildApiContext(params)](#buildapicontextparams)
  - [buildMigrationContext(params)](#buildmigrationcontextparams)
  - [buildStateMismatchContext(params)](#buildstatemismatchcontextparams)
  - [triggerRCAOnFailure(triggerEvent)](#triggerrcaonfailuretriggerevent)
- [Utility Functions](#utility-functions)
  - [redactSecrets(text)](#redactsecretstext)
  - [truncateContext(text, maxChars = 20000)](#truncatecontexttext-maxchars-20000)
  - [generateFingerprint(triggerType, errorSignature, module)](#generatefingerprinttriggertype-errorsignature-module)
  - [checkRateLimit(fingerprint)](#checkratelimitfingerprint)
- [Auto-Classification](#auto-classification)
- [Integration Patterns](#integration-patterns)
  - [Handoff Failure Hook](#handoff-failure-hook)
  - [Gate Validation Hook](#gate-validation-hook)
  - [API Adapter Hook](#api-adapter-hook)
- [Best Practices](#best-practices)
  - [DO](#do)
  - [DON'T](#dont)
- [Testing](#testing)
- [Database Schema](#database-schema)
  - [rca_auto_trigger_config](#rca_auto_trigger_config)
  - [v_rca_auto_trigger_summary](#v_rca_auto_trigger_summary)
- [Migration](#migration)
- [Related Documentation](#related-documentation)

**Strategic Directive**: SD-LEO-ENH-ENHANCE-RCA-SUB-001
**Version**: 1.0
**Last Updated**: 2026-02-07

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-02-07
- **Tags**: rca, trigger-sdk, api-reference, auto-trigger, fire-and-forget

## Overview

The RCA Trigger SDK provides a unified, fire-and-forget API for automatically triggering Root Cause Analysis from failure points across the LEO Protocol codebase.

**Key Features**:
- **8 Trigger Types**: Handoff failures, gate validation failures, API errors, migrations, etc.
- **8 Classification Categories**: Automatic error classification (encoding, infrastructure, etc.)
- **Fingerprint Deduplication**: Prevents duplicate RCRs for the same root cause
- **Rate Limiting**: Prevents runaway trigger storms (max 3 per fingerprint per 60s)
- **Secret Redaction**: Automatic removal of API keys, tokens, and env vars
- **Context Truncation**: Limits context to 20k chars to prevent token exhaustion
- **Non-blocking**: Never throws errors - safe to call in catch blocks

## Installation

```javascript
// Fire-and-forget convenience function (recommended)
import { triggerRCAOnFailure } from './lib/rca/index.js';

// Full SDK access (advanced usage)
import {
  buildTriggerEvent,
  buildHandoffContext,
  buildGateContext,
  buildApiContext,
  TRIGGER_TYPES,
  CLASSIFICATIONS
} from './lib/rca/trigger-sdk.js';
```

## Quick Start

```javascript
import { triggerRCAOnFailure, buildHandoffContext } from './lib/rca/index.js';

// In a handoff failure handler
try {
  // ... handoff execution code ...
} catch (error) {
  // Fire-and-forget RCA trigger (never throws)
  await triggerRCAOnFailure(buildHandoffContext({
    command: 'handoff.js execute',
    args: 'LEAD-TO-PLAN SD-TEST-001',
    exitCode: 1,
    sdId: 'SD-TEST-001',
    handoffType: 'LEAD-TO-PLAN',
    stderr: error.message
  }));

  // Continue with normal error handling
  throw error;
}
```

## Trigger Types

```javascript
import { TRIGGER_TYPES } from './lib/rca/trigger-sdk.js';

TRIGGER_TYPES.HANDOFF_FAILURE              // 'handoff_failure'
TRIGGER_TYPES.GATE_VALIDATION_FAILURE      // 'gate_validation_failure'
TRIGGER_TYPES.API_FAILURE                  // 'api_failure'
TRIGGER_TYPES.MIGRATION_FAILURE            // 'migration_failure'
TRIGGER_TYPES.SCRIPT_CRASH                 // 'script_crash'
TRIGGER_TYPES.TEST_FAILURE_RETRY_EXHAUSTED // 'test_failure_retry_exhausted'
TRIGGER_TYPES.PRD_VALIDATION_FAILURE       // 'prd_validation_failure'
TRIGGER_TYPES.STATE_MISMATCH               // 'state_mismatch'
```

## Classification Categories

```javascript
import { CLASSIFICATIONS } from './lib/rca/trigger-sdk.js';

CLASSIFICATIONS.CODE_BUG           // 'code_bug'
CLASSIFICATIONS.PROCESS_ISSUE      // 'process_issue'
CLASSIFICATIONS.INFRASTRUCTURE     // 'infrastructure'
CLASSIFICATIONS.DATA_QUALITY       // 'data_quality'
CLASSIFICATIONS.ENCODING           // 'encoding'
CLASSIFICATIONS.CROSS_CUTTING      // 'cross_cutting'
CLASSIFICATIONS.PROTOCOL_PROCESS   // 'protocol_process'
CLASSIFICATIONS.CONFIGURATION      // 'configuration'
```

## Core Functions

### buildTriggerEvent(params)

Creates a standardized TriggerEvent with automatic classification and fingerprinting.

**Parameters**:
```typescript
{
  triggerType: string,      // One of TRIGGER_TYPES
  errorMessage: string,     // Error message or summary
  errorStack?: string,      // Stack trace (will be redacted)
  sdId?: string,            // Strategic Directive ID
  module?: string,          // Script/module that triggered
  context?: Object,         // Additional context (will be redacted/truncated)
  stdout?: string,          // Process stdout (last 10k chars)
  stderr?: string,          // Process stderr (last 10k chars)
  exitCode?: number         // Process exit code
}
```

**Returns**: TriggerEvent object with:
```typescript
{
  trigger_type: string,
  fingerprint: string,           // 16-char hex SHA-256
  timestamp: string,             // ISO 8601
  sd_id: string | null,
  module: string,
  error_message: string,         // Redacted
  error_stack: string,           // Redacted + truncated
  exit_code: number | null,
  classification: string,        // Auto-classified
  classification_confidence: number,  // 0.0 - 1.0
  context: Object,               // Sanitized
  stdout: string | null,         // Redacted + truncated
  stderr: string | null,         // Redacted + truncated
  git_sha: string,
  working_directory: string
}
```

**Example**:
```javascript
const event = buildTriggerEvent({
  triggerType: TRIGGER_TYPES.HANDOFF_FAILURE,
  errorMessage: 'Gate validation failed',
  sdId: 'SD-TEST-001',
  module: 'handoff.js',
  exitCode: 1
});

console.log(event.fingerprint); // "a3b5c7d9e1f2a4b6"
console.log(event.classification); // "protocol_process"
```

### buildHandoffContext(params)

Helper for building handoff failure contexts.

**Parameters**:
```typescript
{
  command: string,        // e.g., 'handoff.js execute'
  args: string,           // e.g., 'LEAD-TO-PLAN SD-TEST-001'
  exitCode: number,
  sdId: string,
  handoffType: string,    // e.g., 'LEAD-TO-PLAN'
  stderr: string
}
```

**Returns**: TriggerEvent (same as buildTriggerEvent)

**Example**:
```javascript
const event = buildHandoffContext({
  command: 'handoff.js execute',
  args: 'LEAD-TO-PLAN SD-TEST-001',
  exitCode: 1,
  sdId: 'SD-TEST-001',
  handoffType: 'LEAD-TO-PLAN',
  stderr: 'SMOKE_TEST_SPECIFICATION validation failed'
});
```

### buildGateContext(params)

Helper for building gate validation failure contexts.

**Parameters**:
```typescript
{
  gateName: string,       // e.g., 'SMOKE_TEST_SPECIFICATION'
  score: number,          // Actual score
  threshold: number,      // Required threshold
  breakdown?: Object,     // Score breakdown details
  sdId: string,
  handoffType: string
}
```

**Returns**: TriggerEvent (same as buildTriggerEvent)

**Example**:
```javascript
const event = buildGateContext({
  gateName: 'SMOKE_TEST_SPECIFICATION',
  score: 0,
  threshold: 100,
  sdId: 'SD-TEST-001',
  handoffType: 'LEAD-TO-PLAN',
  breakdown: { reasons: ['Missing smoke test scenario'] }
});
```

### buildApiContext(params)

Helper for building API/LLM failure contexts.

**Parameters**:
```typescript
{
  provider: string,         // 'anthropic', 'openai', 'google', 'ollama'
  model: string,            // e.g., 'claude-sonnet-4-20250514'
  endpoint?: string,        // API endpoint (will be redacted)
  httpStatus?: number,      // HTTP status code
  errorCode?: string,       // Error code (e.g., 'TIMEOUT')
  errorMessage: string,     // Error message
  requestSummary?: string   // Request context (will be redacted)
}
```

**Returns**: TriggerEvent (same as buildTriggerEvent)

**Example**:
```javascript
const event = buildApiContext({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  httpStatus: 400,
  errorMessage: 'invalid high surrogate in string'
});

console.log(event.classification); // "encoding"
```

### buildMigrationContext(params)

Helper for building migration failure contexts.

**Parameters**:
```typescript
{
  migrationFile: string,  // e.g., '20260207_test.sql'
  errorMessage: string,
  errorStack?: string,
  sdId?: string
}
```

**Example**:
```javascript
const event = buildMigrationContext({
  migrationFile: '20260207_test.sql',
  errorMessage: 'relation already exists',
  sdId: 'SD-TEST-001'
});
```

### buildStateMismatchContext(params)

Helper for building state mismatch contexts.

**Parameters**:
```typescript
{
  entityType: string,  // e.g., 'SD', 'PRD'
  entityId: string,    // Entity identifier
  dbState: string,     // State in database
  gitState: string,    // State in git
  sdId?: string
}
```

**Example**:
```javascript
const event = buildStateMismatchContext({
  entityType: 'SD',
  entityId: 'SD-TEST-001',
  dbState: 'completed',
  gitState: 'in_progress',
  sdId: 'SD-TEST-001'
});
```

### triggerRCAOnFailure(triggerEvent)

Fire-and-forget function that persists TriggerEvent and invokes RCA sub-agent.

**Parameters**:
- `triggerEvent`: TriggerEvent object (from build functions above)

**Returns**: Promise<Object>
```typescript
{
  success: boolean,
  suppressed?: boolean,      // True if rate limited
  rcrId?: string,            // Created RCR ID
  recurrence?: boolean,      // True if matched existing fingerprint
  error?: string             // Error message if failed (non-blocking)
}
```

**Behavior**:
- **Never throws** - Errors are caught and logged internally
- Safe to call in catch blocks
- Rate limiting: Max 3 triggers per fingerprint per 60s window
- Deduplication: Matching fingerprint → increment recurrence count instead of creating new RCR
- Non-blocking: RCA sub-agent invoked asynchronously

**Example**:
```javascript
import { triggerRCAOnFailure, buildApiContext } from './lib/rca/index.js';

// In API adapter error handler
catch (error) {
  // Fire-and-forget (never throws)
  await triggerRCAOnFailure(buildApiContext({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    errorMessage: error.message
  }));

  // Re-throw original error
  throw error;
}
```

## Utility Functions

### redactSecrets(text)

Redacts API keys, JWT tokens, and environment variables from text.

**Patterns Redacted**:
- API keys: `api_key: sk-...`
- JWT tokens: `eyJ...`
- Authorization headers: `Authorization: Bearer ...`
- Environment variables: `SUPABASE_SERVICE_ROLE_KEY=...`

**Example**:
```javascript
import { redactSecrets } from './lib/rca/trigger-sdk.js';

const text = 'Using api_key: sk-test-fake-key-for-unit-test-only';
console.log(redactSecrets(text)); // "Using api_key: [REDACTED]"
```

### truncateContext(text, maxChars = 20000)

Truncates text to max characters, preserving first and last portions.

**Example**:
```javascript
import { truncateContext } from './lib/rca/trigger-sdk.js';

const long = 'x'.repeat(30000);
const truncated = truncateContext(long, 1000);
console.log(truncated.includes('truncated')); // true
```

### generateFingerprint(triggerType, errorSignature, module)

Generates deterministic fingerprint for deduplication.

**Normalization**:
- UUIDs → `<UUID>`
- Timestamps → `<TIMESTAMP>`
- Line/column numbers → `<N>`
- File paths → `<FILE>`

**Example**:
```javascript
import { generateFingerprint } from './lib/rca/trigger-sdk.js';

const fp1 = generateFingerprint('handoff_failure', 'Gate XYZ failed', 'handoff.js');
const fp2 = generateFingerprint('handoff_failure', 'Gate XYZ failed', 'handoff.js');
console.log(fp1 === fp2); // true (consistent hashing)
```

### checkRateLimit(fingerprint)

Checks if fingerprint is within rate limit.

**Returns**: boolean (true if within limit, false if suppressed)

**Example**:
```javascript
import { checkRateLimit } from './lib/rca/trigger-sdk.js';

const fp = 'abc123';
console.log(checkRateLimit(fp)); // true (first request)
console.log(checkRateLimit(fp)); // true (2nd request)
console.log(checkRateLimit(fp)); // true (3rd request)
console.log(checkRateLimit(fp)); // false (4th request - blocked)
```

## Auto-Classification

The SDK automatically classifies errors based on pattern matching:

| Category | Keywords |
|----------|----------|
| **encoding** | surrogate, unicode, utf-8, serialization, invalid json |
| **data_quality** | invalid data, corrupt, malformed, parse error |
| **configuration** | env var, config, missing key, process.env, .env |
| **infrastructure** | timeout, ECONNREFUSED, ENOTFOUND, network, database connection |
| **protocol_process** | handoff, gate fail, validation fail, phase transition, workflow |
| **code_bug** | Default if no other patterns match |

**Confidence Scoring**:
- 2+ patterns matched → 90% confidence (capped)
- 1 pattern matched → 50% confidence
- No patterns matched → 30% confidence (default: code_bug)

## Integration Patterns

### Handoff Failure Hook

**Location**: `scripts/modules/handoff/cli/cli-main.js`

```javascript
if (!result.success && command === 'execute') {
  try {
    const { triggerRCAOnFailure, buildHandoffContext } =
      await import('../../../../lib/rca/index.js');
    await triggerRCAOnFailure(buildHandoffContext({
      command: `handoff.js ${command}`,
      args: args.join(' '),
      exitCode: 1,
      sdId,
      handoffType,
      stderr: result.message || result.reasonCode || 'Unknown failure'
    }));
  } catch { /* Never block handoff failure */ }
}
```

### Gate Validation Hook

**Location**: `scripts/modules/handoff/executors/BaseExecutor.js`

```javascript
if (gateScore < gateThreshold) {
  try {
    const { triggerRCAOnFailure, buildGateContext } =
      await import('../../../lib/rca/index.js');
    await triggerRCAOnFailure(buildGateContext({
      gateName: gate.name,
      score: gateScore,
      threshold: gateThreshold,
      sdId: this.sdId,
      handoffType: this.handoffType,
      breakdown: gateResult.breakdown
    }));
  } catch { /* Never block gate validation */ }

  // Continue with normal failure handling
  return ResultBuilder.gateFailure(/* ... */);
}
```

### API Adapter Hook

**Location**: `lib/sub-agents/vetting/provider-adapters.js`

```javascript
async function triggerAPIFailureRCA(provider, model, errorMessage) {
  try {
    const { triggerRCAOnFailure, buildApiContext } =
      await import('../../rca/index.js');
    await triggerRCAOnFailure(buildApiContext({
      provider,
      model,
      errorMessage,
      errorCode: errorMessage?.includes('TIMEOUT') ? 'TIMEOUT' : undefined,
      httpStatus: parseInt(errorMessage?.match(/error (\d+)/)?.[1]) || undefined
    }));
  } catch { /* RCA trigger should never crash the caller */ }
}

// In adapter catch block (after retry exhaustion)
catch (error) {
  triggerAPIFailureRCA('anthropic', model, lastError?.message);
  throw new Error(`Anthropic call failed after ${MAX_RETRIES + 1} attempts`);
}
```

## Best Practices

### DO

✅ **Use fire-and-forget API** - `triggerRCAOnFailure()` never throws
```javascript
await triggerRCAOnFailure(buildHandoffContext({ /* ... */ }));
throw error; // Always continue with normal error handling
```

✅ **Call from catch blocks** - Safe because it never throws
```javascript
catch (error) {
  await triggerRCAOnFailure(buildApiContext({ /* ... */ }));
  throw error;
}
```

✅ **Provide rich context** - More context = better classification
```javascript
buildHandoffContext({
  command: 'handoff.js execute',
  args: 'LEAD-TO-PLAN SD-TEST-001',
  exitCode: 1,
  sdId: 'SD-TEST-001',
  handoffType: 'LEAD-TO-PLAN',
  stderr: fullErrorOutput // Include full stderr for pattern matching
});
```

✅ **Let auto-classification work** - SDK handles classification automatically

### DON'T

❌ **Don't wrap in try/catch** - Already safe, no need
```javascript
// BAD
try {
  await triggerRCAOnFailure(/* ... */);
} catch { /* Unnecessary */ }

// GOOD
await triggerRCAOnFailure(/* ... */);
```

❌ **Don't manually create RCRs** - Use SDK for consistency
```javascript
// BAD
supabase.from('root_cause_reports').insert({ /* ... */ });

// GOOD
await triggerRCAOnFailure(buildTriggerEvent({ /* ... */ }));
```

❌ **Don't suppress errors before triggering** - Full stack trace helps classification
```javascript
// BAD
const sanitized = error.message.split('\n')[0];
await triggerRCAOnFailure(buildApiContext({ errorMessage: sanitized }));

// GOOD
await triggerRCAOnFailure(buildApiContext({ errorMessage: error.stack || error.message }));
```

❌ **Don't skip context objects** - Empty objects still trigger, but with low confidence
```javascript
// BAD
buildHandoffContext({
  command: 'handoff.js',
  exitCode: 1
  // Missing: args, sdId, handoffType, stderr
});

// GOOD
buildHandoffContext({
  command: 'handoff.js execute',
  args: 'LEAD-TO-PLAN SD-TEST-001',
  exitCode: 1,
  sdId: 'SD-TEST-001',
  handoffType: 'LEAD-TO-PLAN',
  stderr: fullStderr
});
```

## Testing

**Unit tests**: `tests/unit/rca-trigger-sdk.test.js` (28 tests)

Run with:
```bash
npm test tests/unit/rca-trigger-sdk.test.js
```

**Test coverage**:
- ✅ TRIGGER_TYPES and CLASSIFICATIONS constants
- ✅ redactSecrets() for API keys, JWT tokens, env vars
- ✅ truncateContext() for long strings
- ✅ generateFingerprint() consistency and normalization
- ✅ checkRateLimit() rate limiting behavior
- ✅ buildTriggerEvent() auto-classification (encoding, infrastructure, protocol)
- ✅ buildHandoffContext(), buildGateContext(), buildApiContext() helpers
- ✅ buildMigrationContext(), buildStateMismatchContext() helpers

## Database Schema

### rca_auto_trigger_config

Per-trigger-type configuration table.

**Columns**:
- `trigger_type` (text, PK) - One of TRIGGER_TYPES
- `enabled` (boolean) - Feature flag
- `rate_limit_per_minute` (int) - Max triggers per minute
- `rate_limit_per_hour` (int) - Max triggers per hour
- `classification_rules` (jsonb) - Custom classification patterns
- `created_at`, `updated_at` (timestamps)

**Example**:
```sql
INSERT INTO rca_auto_trigger_config (trigger_type, enabled, rate_limit_per_minute, rate_limit_per_hour)
VALUES ('handoff_failure', true, 10, 100);
```

### v_rca_auto_trigger_summary

Analytics view showing trigger counts and classifications.

**Columns**:
- `trigger_type` (text)
- `total_triggers` (bigint)
- `unique_fingerprints` (bigint)
- `classifications` (jsonb) - Count per classification category
- `latest_trigger_at` (timestamp)
- `oldest_trigger_at` (timestamp)

**Example**:
```sql
SELECT * FROM v_rca_auto_trigger_summary
WHERE trigger_type = 'api_failure'
ORDER BY total_triggers DESC;
```

## Migration

**File**: `database/migrations/20260207_rca_auto_trigger_enhancements.sql`

**Changes**:
1. Extended `trigger_source` CHECK constraint with 7 new values
2. Extended `root_cause_category` CHECK constraint with 5 new values
3. Created `rca_auto_trigger_config` table
4. Created `v_rca_auto_trigger_summary` view

**Apply with**:
```bash
# Via DATABASE sub-agent (recommended)
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
# In prompt: "Execute the migration file: database/migrations/20260207_rca_auto_trigger_enhancements.sql"

# Or via psql directly
psql $SUPABASE_POOLER_URL -f database/migrations/20260207_rca_auto_trigger_enhancements.sql
```

## Related Documentation

- **RCA Operator Guide**: `docs/reference/root-cause-agent.md`
- **RCA Sub-Agent**: `.claude/agents/rca-agent.md`
- **Multi-Expert Collaboration**: `docs/reference/rca-multi-expert-collaboration.md`

---

**Document Version**: 1.0
**Last Updated**: 2026-02-07
**Maintained By**: LEO Protocol Team
**Feedback**: Report issues to RCA sub-agent or create SD for improvements
