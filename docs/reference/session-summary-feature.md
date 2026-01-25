# Session Summary Feature

## Metadata
- **Category**: Infrastructure
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-ENH-AUTO-PROCEED-001-08
- **Last Updated**: 2026-01-25
- **Tags**: infrastructure, orchestrator, auto-proceed, reporting

## Overview

The Session Summary feature automatically generates comprehensive reports at orchestrator completion, providing detailed insights into SDs processed, their status, and any issues encountered during execution.

**Implemented in**: SD-LEO-ENH-AUTO-PROCEED-001-08
**Part of**: AUTO-PROCEED Enhancement Orchestrator (SD-LEO-ENH-AUTO-PROCEED-001)

## Purpose

At the completion of an orchestrator session, this feature:
1. Collects lifecycle events for all SDs processed
2. Generates structured JSON output with schema versioning
3. Creates human-readable digest for quick review
4. Redacts sensitive data (API keys, passwords, tokens)
5. Provides performance metrics and issue reporting

## Module Structure

```
scripts/modules/session-summary/
├── index.js                    # Main exports and generateAndEmitSummary()
├── SessionEventCollector.js    # Event collection and tracking
├── SummaryGenerator.js         # JSON schema compilation and digest generation
└── secret-redactor.js          # Pattern-based secret redaction
```

## Core Components

### 1. SessionEventCollector

**Purpose**: Tracks SD lifecycle events during orchestrator execution.

**Key Methods**:
- `recordSdQueued(sd_id, metadata)` - Record SD added to queue
- `recordSdStarted(sd_id)` - Record SD execution start (increments attempt_count)
- `recordSdTerminal(sd_id, status, errorInfo)` - Record terminal state (SUCCESS/FAILED/CANCELLED)
- `recordIssue(severity, code, message, metadata)` - Record issues encountered
- `getSnapshot()` - Generate immutable snapshot of collected data
- `complete()` - Mark session complete and capture end timestamp

**Invariants**:
- Negative durations are prevented
- Terminal status set exactly once per SD
- attempt_count increments on each `recordSdStarted()` call

### 2. SummaryGenerator

**Purpose**: Compiles collected events into versioned JSON schema and human-readable digest.

**Configuration**:
- `SCHEMA_VERSION`: `1.0` (current)
- `COMPILATION_TIMEOUT_MS`: `500ms`
- `MAX_DIGEST_LINES`: `60`

**Output Structure**:
```json
{
  "report_type": "session_summary",
  "schema_version": "1.0",
  "session_id": "session-123",
  "orchestrator_version": "1.0.0",
  "start_timestamp": "2026-01-25T20:00:00.000Z",
  "end_timestamp": "2026-01-25T20:30:00.000Z",
  "duration_ms": 1800000,
  "total_sds": 15,
  "sd_counts_by_status": {
    "SUCCESS": 12,
    "FAILED": 2,
    "CANCELLED": 1
  },
  "overall_status": "SUCCESS",
  "sds": [
    {
      "sd_id": "SD-001",
      "title": "Example SD",
      "final_status": "SUCCESS",
      "queued_at": "...",
      "start_timestamp": "...",
      "end_timestamp": "...",
      "duration_ms": 300000,
      "attempt_count": 1,
      "category": "feature",
      "priority": "high"
    }
  ],
  "issues": [
    {
      "severity": "ERROR",
      "issue_code": "SD_FAILED",
      "message": "Validation failed",
      "sd_id": "SD-002",
      "first_occurrence": "...",
      "last_occurrence": "...",
      "occurrences_count": 1,
      "correlation_ids": ["corr-123"]
    }
  ],
  "report_generation_time_ms": 45
}
```

**Degraded Summary Fallback**:
If compilation exceeds 500ms timeout, a degraded summary is emitted with minimal data and `degraded: true` flag.

### 3. SecretRedactor

**Purpose**: Pattern-based detection and redaction of sensitive data.

**Patterns Detected**:
- API keys (`api_key=`, `APIKEY=`)
- Bearer tokens (`Authorization: Bearer`)
- Basic auth (`Authorization: Basic`)
- Passwords (`password=`, `passwd=`)
- Database connection strings (`postgres://`, `mysql://`, `mongodb://`)
- AWS credentials (access keys)
- Supabase keys (service role, anon)
- JWTs (eyJ... pattern with 50+ char segments)
- Private keys (`-----BEGIN PRIVATE KEY-----`)
- GitHub tokens (`ghp_`, `gho_`)
- OpenAI/Anthropic keys (`sk-`, `sk-ant-`)

**Usage**:
```javascript
import { redactSecrets, redactObject, containsSecrets } from './secret-redactor.js';

// String redaction
const safe = redactSecrets('api_key=super_secret_123'); // → 'api_key=[REDACTED]'

// Deep object redaction
const safeObj = redactObject({
  message: 'Failed with password=hunter2',
  data: { token: 'Bearer eyJhbGc...' }
});
// → { message: 'Failed with password=[REDACTED]', data: { token: 'Bearer [REDACTED]' } }

// Detection
const hasSecrets = containsSecrets('postgres://user:pass@host/db'); // → true
```

## Integration Point

The session summary is generated in `scripts/modules/handoff/orchestrator-completion-hook.js`:

```javascript
import { generateAndEmitSummary, createCollector } from '../session-summary/index.js';

export async function generateSessionSummary(supabase, orchestratorId, correlationId, sessionStatus = 'SUCCESS') {
  // Create collector
  const collector = createCollector(correlationId, {
    orchestratorVersion: '1.0.0'
  });

  // Fetch and record children SDs
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('parent_sd_id', orchestratorId);

  for (const sd of children) {
    collector.recordSdQueued(sd.id, {
      title: sd.title,
      category: sd.category,
      priority: sd.priority
    });

    if (sd.status === 'completed') {
      collector.recordSdStarted(sd.id);
      collector.recordSdTerminal(sd.id, 'SUCCESS');
    } else if (sd.status === 'failed') {
      collector.recordSdStarted(sd.id);
      collector.recordSdTerminal(sd.id, 'FAILED');
    }
  }

  // Generate summary
  const result = await generateAndEmitSummary(collector, {
    emitLog: true,
    emitDigest: true
  });

  return result;
}
```

## Performance Targets

| Metric | Target | Measured |
|--------|--------|----------|
| Average generation time | <200ms | ✅ Achieved for 500 SDs |
| Compilation timeout | 500ms | ✅ With fallback |
| Memory footprint | Reasonable | ✅ No leaks detected |

## Test Coverage

### Unit Tests (82 total)
**Location**: `tests/unit/session-summary/`

- **secret-redactor.test.js**: Pattern validation for all secret types
- **SessionEventCollector.test.js**: Lifecycle tracking, invariants, aggregation
- **SummaryGenerator.test.js**: Schema validation, timeout behavior, fallback

### E2E Tests (45 total)
**Location**: `tests/e2e/session-summary.test.js`

Tests across 3 projects (EHG, Agent Platform, EHG Engineer) covering:
- US-001: JSON structure with report_type and schema_version
- US-002: SD list with final_status and timestamps
- US-003: Issues array for failures
- US-004: Secret redaction in all outputs
- US-005: Performance benchmark (500 SDs + 200 issues)

**All tests passing**: ✅ 127/127

## Usage Example

```javascript
import { createCollector, generateAndEmitSummary } from './scripts/modules/session-summary/index.js';

// Create collector at orchestrator start
const collector = createCollector('session-abc123', {
  orchestratorVersion: '4.3.3'
});

// During execution, record events
collector.recordSdQueued('SD-001', { title: 'Feature A' });
collector.recordSdStarted('SD-001');
collector.recordSdTerminal('SD-001', 'SUCCESS');

collector.recordSdQueued('SD-002', { title: 'Feature B' });
collector.recordSdStarted('SD-002');
collector.recordIssue('ERROR', 'VALIDATION_FAILED', 'Schema invalid', { sd_id: 'SD-002' });
collector.recordSdTerminal('SD-002', 'FAILED', {
  errorClass: 'ValidationError',
  errorMessage: 'Schema invalid'
});

// At completion
collector.complete();
const result = await generateAndEmitSummary(collector, {
  emitLog: true,   // Write to log file
  emitDigest: true // Output human-readable digest
});

console.log('Summary JSON:', result.json);
console.log('Digest:\n', result.digest);
```

## Schema Evolution

The `schema_version` field enables future schema changes without breaking consumers:

**Current**: `1.0`
**Future**: `1.1` might add `parent_orchestrator_id`, `git_commit_hash`, etc.

Consumers should:
1. Check `schema_version` field
2. Parse known fields
3. Ignore unknown fields (forward compatibility)

## Related Documentation

- [AUTO-PROCEED Protocol](../leo/protocol/v4.3.3-auto-proceed-enhancement.md) - Parent orchestrator
- [Discovery Document](../discovery/auto-proceed-enhancement-discovery.md) - Requirements analysis
- [Orchestrator Completion Hook](../reference/orchestrator-hooks.md) - Integration point
- [Secret Redaction Patterns](../security/secret-redaction-patterns.md) - Security best practices

## Troubleshooting

### Issue: Summary generation timing out

**Symptom**: `degraded: true` flag in output
**Cause**: Compilation exceeded 500ms timeout
**Solution**: This is expected for very large sessions (>1000 SDs). Degraded summary still provides essential data.

### Issue: Secrets not being redacted

**Symptom**: Sensitive data visible in output
**Cause**: Pattern not recognized by redactor
**Solution**: Add new pattern to `SECRET_PATTERNS` in `secret-redactor.js` and update tests.

### Issue: Negative durations

**Symptom**: `duration_ms` shows negative value
**Cause**: Clock skew or timestamps from different sources
**Solution**: Collector prevents negative durations internally. If seen, check timestamp source consistency.

## Version History

### 1.0.0 (2026-01-25)
- Initial implementation
- JSON schema v1.0 with report_type and schema_version
- SessionEventCollector with lifecycle tracking
- SummaryGenerator with 500ms timeout and fallback
- SecretRedactor with 10+ pattern types
- 127 tests (82 unit, 45 E2E) all passing
- Performance target met: <200ms avg for 500 SDs

---

*Last Updated: 2026-01-25*
*Maintained by: Infrastructure Team*
*Related SD: SD-LEO-ENH-AUTO-PROCEED-001-08*
