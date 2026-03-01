---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Skip-and-Continue Pattern for Validation Gate Failures


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Architecture](#architecture)
  - [Decision Flow](#decision-flow)
  - [Key Concepts](#key-concepts)
- [API Reference](#api-reference)
  - [`shouldSkipAndContinue(context)`](#shouldskipandcontinuecontext)
  - [`markAsBlocked(supabase, sdId, blockingInfo)`](#markasblockedsupabase-sdid-blockinginfo)
  - [`recordSkipEvent(supabase, eventData)`](#recordskipeventsupabase-eventdata)
  - [`recordAllBlockedEvent(supabase, orchestratorId, blockedChildren, correlationId)`](#recordallblockedeventsupabase-orchestratorid-blockedchildren-correlationid)
  - [`executeSkipAndContinue(params)`](#executeskipandcontinueparams)
  - [`isTransientError(errorMessage)`](#istransienterrorerrormessage)
- [Configuration](#configuration)
  - [Constants](#constants)
- [Integration](#integration)
  - [BaseExecutor Integration](#baseexecutor-integration)
- [Event Logging](#event-logging)
  - [SKIP_AND_CONTINUE Event](#skip_and_continue-event)
  - [ALL_CHILDREN_BLOCKED Event](#all_children_blocked-event)
- [Usage Example](#usage-example)
- [Console Output Format](#console-output-format)
- [Error Handling](#error-handling)
  - [Best-Effort Operations](#best-effort-operations)
  - [Fatal Operations](#fatal-operations)
- [Testing](#testing)
  - [Test Scenarios](#test-scenarios)
- [Related Documentation](#related-documentation)
- [Changelog](#changelog)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.5 (via SD-LEO-ENH-AUTO-PROCEED-001-07)
- **Last Updated**: 2026-01-25
- **Tags**: auto-proceed, handoff, validation, orchestrator, resilience

## Overview

The skip-and-continue pattern enables AUTO-PROCEED mode to handle validation gate failures gracefully by marking failed child SDs as blocked and continuing execution with the next sibling SD. This implements Discovery Decision D16 from the AUTO-PROCEED enhancement orchestrator.

**Purpose**: Prevent orchestrator-level failures when individual child SDs fail non-transient validation gates, enabling long sustainable runs.

**Location**: `scripts/modules/handoff/skip-and-continue.js`

## Architecture

### Decision Flow

```
Child SD fails validation gate
│
├─ Is AUTO-PROCEED enabled? → NO → Standard failure (pause execution)
│  └─ YES ↓
│
├─ Is this a child SD? → NO → Standard failure
│  └─ YES (has parent_sd_id) ↓
│
├─ Is error transient? → YES → Retry (up to MAX_RETRIES)
│  └─ NO ↓
│
├─ Retry count < MAX_RETRIES? → YES → Retry
│  └─ NO ↓
│
└─ TRIGGER SKIP-AND-CONTINUE:
   ├─ Mark current SD as 'blocked'
   ├─ Record SKIP_AND_CONTINUE event
   ├─ Find next ready sibling
   ├─ If all siblings blocked → Record ALL_CHILDREN_BLOCKED
   └─ Return next sibling or completion status
```

### Key Concepts

**Transient vs. Non-Transient Errors**:
- **Transient**: Network timeouts, rate limits, temporary unavailability → **Retry**
- **Non-Transient**: Missing dependencies, validation failures, schema errors → **Skip and continue**

**Blocking Status**:
- SD status updated to `blocked`
- Metadata includes: gate name, score, threshold, issues, retry count, correlation_id
- Can be unblocked later by resolving the issue

## API Reference

### `shouldSkipAndContinue(context)`

**Evaluates whether skip-and-continue should trigger.**

**Parameters**:
```javascript
{
  sd: Object,           // SD record with parent_sd_id
  gateResults: Object,  // Gate validation results
  retryCount: Number,   // Current retry attempt (default: 0)
  autoProceed: Boolean  // AUTO-PROCEED mode status
}
```

**Returns**:
```javascript
{
  shouldSkip: Boolean,  // true if should skip
  reason: String        // Explanation
}
```

**Logic**:
1. Only triggers if `autoProceed === true`
2. Only for child SDs (`sd.parent_sd_id` exists)
3. Only if gate failed (`gateResults.passed === false`)
4. Skip transient errors unless retry exhausted
5. Skip if `retryCount >= DEFAULT_MAX_RETRIES`

---

### `markAsBlocked(supabase, sdId, blockingInfo)`

**Marks an SD as blocked with failure metadata.**

**Parameters**:
```javascript
{
  gate: String,         // Gate name that failed
  score: Number,        // Final gate score
  threshold: Number,    // Required threshold
  issues: String[],     // List of validation issues
  retryCount: Number,   // Number of retries attempted
  correlationId: String // Correlation ID for tracing
}
```

**Returns**:
```javascript
{
  success: Boolean,
  error: String,        // If failed
  alreadyBlocked: Boolean // If optimistic lock detected existing block
}
```

**Database Changes**:
- Updates `strategic_directives_v2.status` → `'blocked'`
- Sets `metadata.blocked_reason`, `blocked_at`, `blocked_by_gate`, `gate_score`, etc.
- Uses optimistic locking (`updated_at` match)

---

### `recordSkipEvent(supabase, eventData)`

**Records a SKIP_AND_CONTINUE event in system_events.**

**Parameters**:
```javascript
{
  skippedSdId: String,     // SD that was skipped
  nextSiblingId: String,   // Next sibling SD (or null)
  orchestratorId: String,  // Parent orchestrator SD ID
  blockedReason: String,   // Reason for blocking
  gateThatFailed: String,  // Gate name
  correlationId: String,   // Correlation ID
  sessionId: String        // Session ID
}
```

**Returns**:
```javascript
{
  success: Boolean,
  eventId: String  // system_events.id (if successful)
}
```

**Note**: Non-fatal - continues even if event logging fails.

---

### `recordAllBlockedEvent(supabase, orchestratorId, blockedChildren, correlationId)`

**Records an ALL_CHILDREN_BLOCKED event when all siblings are blocked.**

**Parameters**:
- `orchestratorId`: Parent SD ID
- `blockedChildren`: Array of blocked child SDs
- `correlationId`: Correlation ID for tracing

**Returns**: `{ success: Boolean }`

---

### `executeSkipAndContinue(params)`

**Main entry point - orchestrates the skip-and-continue flow.**

**Parameters**:
```javascript
{
  supabase: Object,      // Supabase client
  sd: Object,            // Current SD that failed
  gateResults: Object,   // Gate validation results
  correlationId: String, // Correlation ID
  sessionId: String      // Session ID
}
```

**Returns**:
```javascript
{
  executed: Boolean,    // true if skip executed
  nextSibling: Object,  // Next sibling SD (or null)
  allBlocked: Boolean,  // true if all siblings blocked
  reason: String        // Status message
}
```

**Workflow**:
1. Mark current SD as blocked
2. Find next ready sibling (via `getNextReadyChild`)
3. Record skip event
4. If no siblings available:
   - Check if all complete (success case)
   - Check if all blocked (failure case)
5. Return next sibling or completion status

---

### `isTransientError(errorMessage)`

**Identifies recoverable errors that should be retried.**

**Parameters**: `errorMessage: String`

**Returns**: `Boolean` - true if error appears transient

**Transient Error Patterns**:
- `ETIMEDOUT`, `ECONNREFUSED`, `ECONNRESET`
- `rate limit`, `temporary`, `unavailable`, `try again`

---

## Configuration

### Constants

```javascript
const DEFAULT_MAX_RETRIES = 2;

const TRANSIENT_ERROR_PATTERNS = [
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'rate limit',
  'temporary',
  'unavailable',
  'try again'
];
```

## Integration

### BaseExecutor Integration

The skip-and-continue pattern is integrated into `scripts/modules/handoff/executors/BaseExecutor.js`:

```javascript
// In gate failure handling
if (autoProceed && sd.parent_sd_id) {
  const skipDecision = shouldSkipAndContinue({
    sd,
    gateResults,
    retryCount: 0,
    autoProceed: true
  });

  if (skipDecision.shouldSkip) {
    const result = await executeSkipAndContinue({
      supabase,
      sd,
      gateResults,
      correlationId,
      sessionId
    });

    if (result.nextSibling) {
      // Continue with next sibling
      return continueWithNextSibling(result.nextSibling);
    }
  }
}
```

## Event Logging

### SKIP_AND_CONTINUE Event

Logged to `system_events` table:

```javascript
{
  event_type: 'SKIP_AND_CONTINUE',
  sd_id: skippedSdId,
  details: {
    correlation_id: String,
    blocked_reason: String,
    gate_that_failed: String,
    next_sibling_id: String,
    orchestrator_id: String,
    session_id: String,
    timestamp: ISO8601
  }
}
```

### ALL_CHILDREN_BLOCKED Event

Logged when all siblings are blocked:

```javascript
{
  event_type: 'ALL_CHILDREN_BLOCKED',
  sd_id: orchestratorId,
  details: {
    correlation_id: String,
    blocked_children: Array<{
      id: String,
      title: String,
      blocked_reason: String
    }>,
    blocked_count: Number,
    timestamp: ISO8601
  }
}
```

## Usage Example

```javascript
import {
  shouldSkipAndContinue,
  executeSkipAndContinue,
  createSupabaseClient
} from './skip-and-continue.js';

const supabase = createSupabaseClient();

// Check if should skip
const decision = shouldSkipAndContinue({
  sd: childSD,
  gateResults: { passed: false, issues: ['Gate X failed'] },
  retryCount: 2,
  autoProceed: true
});

if (decision.shouldSkip) {
  // Execute skip-and-continue
  const result = await executeSkipAndContinue({
    supabase,
    sd: childSD,
    gateResults,
    correlationId: 'abc-123',
    sessionId: 'session-456'
  });

  if (result.nextSibling) {
    console.log('Continuing with:', result.nextSibling.id);
  } else if (result.allBlocked) {
    console.log('All children blocked');
  }
}
```

## Console Output Format

When skip-and-continue triggers:

```
🔄 SKIP-AND-CONTINUE (D16)
══════════════════════════════════════════════════
   SD: SD-XXX-001
   Title: Failed SD Title
   Failed Gate: GATE_NAME
   Score: 45/100

   ✅ SD SD-XXX-001 marked as blocked
      Gate: GATE_NAME
      Score: 45/100

   📝 SKIP_AND_CONTINUE event recorded: <event-id>

   ✅ CONTINUING TO NEXT SIBLING
   Next: SD-XXX-002
   Title: Next SD Title
══════════════════════════════════════════════════
```

## Error Handling

### Best-Effort Operations

The following operations are **non-fatal** (continue on error):
- Event recording (`recordSkipEvent`)
- Optimistic lock failures in `markAsBlocked`

### Fatal Operations

The following operations **halt execution** on error:
- SD query failures (cannot proceed without SD data)
- Sibling resolution failures (cannot determine next step)

## Testing

### Test Scenarios

1. **Transient Error with Retries Available**: Should retry, not skip
2. **Non-Transient Error, Retries Exhausted**: Should skip and continue
3. **All Siblings Blocked**: Should record ALL_CHILDREN_BLOCKED
4. **Last Sibling Fails**: Should complete orchestrator
5. **AUTO-PROCEED Disabled**: Should use standard failure handling

## Related Documentation

- [AUTO-PROCEED Discovery](discovery/auto-proceed-enhancement-discovery.md) - Decision D16
- [Handoff System](../leo/handoffs/) - Gate validation flow
- [BaseExecutor](../../scripts/modules/handoff/executors/BaseExecutor.js) - Integration point
- [System Events Schema](schema/engineer/tables/system_events.md) - Event storage

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-25 | Initial implementation (SD-LEO-ENH-AUTO-PROCEED-001-07) |

---

*Part of LEO Protocol v4.3.3 - AUTO-PROCEED Enhancement*
