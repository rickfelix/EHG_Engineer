# Handoff Resolution Lifecycle Pattern

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude (Infrastructure Agent)
- **Last Updated**: 2026-02-09
- **Tags**: handoff, resolution-tracking, lifecycle, database-design
- **SD**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-018
- **Pattern**: PAT-AUTO-e74d3e36

## Overview

This pattern documents the addition of resolution lifecycle tracking to the `sd_phase_handoffs` table, allowing failed handoffs to be marked as resolved independently of their original status. This prevents permanently blocked SDs caused by unresolved failure records.

## Problem Statement

### Original Issue

The `transition-readiness` gate queries `sd_phase_handoffs` for previous REJECTED handoffs to block retries when known issues haven't been fixed:

```javascript
const { data: previousHandoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', sd.id)
  .eq('handoff_type', 'LEAD-TO-PLAN')
  .in('status', ['rejected', 'failed', 'blocked']);
```

**Problem**: Once a handoff is rejected, the record persists with `status='rejected'` forever. Even after fixing the issue and successfully retrying, the old rejection continues to block future transitions.

**Impact**: SDs become permanently blocked, requiring manual database intervention or workarounds.

### Root Cause (5-Whys Analysis)

**Why were SDs permanently blocked?**
→ Transition-readiness gate checked ALL rejected handoffs, not just unresolved ones

**Why did it check all rejections?**
→ No mechanism existed to mark a rejection as resolved

**Why was there no resolution mechanism?**
→ Original schema design didn't anticipate retry workflows

**Why not anticipated?**
→ Early protocol versions had simpler handoff workflows (fewer retries)

**Why did retries increase?**
→ Stricter quality gates introduced in v4.3.x increased rejection rate

## Solution: Resolution Lifecycle Tracking

### Database Schema Changes

**Migration**: `database/migrations/20260209_handoff_resolution_tracking.sql`

```sql
-- Add resolution tracking columns to sd_phase_handoffs
ALTER TABLE sd_phase_handoffs
ADD COLUMN resolved_at TIMESTAMPTZ,
ADD COLUMN resolution_type TEXT,
ADD COLUMN resolution_notes TEXT;

-- Add CHECK constraint for resolution types
ALTER TABLE sd_phase_handoffs
ADD CONSTRAINT chk_resolution_type_valid
CHECK (
  resolution_type IS NULL OR
  resolution_type IN (
    'retry_succeeded',
    'obsolete',
    'escalated_to_sd',
    'manual_override'
  )
);

-- Add partial index for efficient unresolved-only queries
-- This index only includes rows where resolved_at IS NULL (active failures)
CREATE INDEX idx_sd_phase_handoffs_unresolved
ON sd_phase_handoffs (sd_id, handoff_type, status)
WHERE resolved_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN sd_phase_handoffs.resolved_at IS
'Timestamp when this handoff failure was resolved. NULL = still blocking.';
COMMENT ON COLUMN sd_phase_handoffs.resolution_type IS
'How this failure was resolved: retry_succeeded, obsolete, escalated_to_sd, manual_override';
COMMENT ON COLUMN sd_phase_handoffs.resolution_notes IS
'Detailed notes on how/why this failure was resolved (for audit trail)';
```

### Resolution Lifecycle States

```
┌─────────────────┐
│ Handoff Created │
│ status=pending  │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ Handoff Fails       │
│ status=rejected     │◄────────┐
│ resolved_at=NULL    │         │
└────────┬────────────┘         │
         │                      │
         ├─── Issue Fixed ──────┤
         │                      │
         ▼                      │
┌─────────────────────┐         │
│ Retry Succeeds      │         │
│ status=accepted     │    (no change)
│ (new handoff rec)   │         │
└────────┬────────────┘         │
         │                      │
         ▼                      │
┌─────────────────────┐         │
│ Mark Original as    │         │
│ Resolved            │─────────┘
│ resolved_at=NOW()   │
│ type=retry_succeeded│
└─────────────────────┘
```

### Resolution Types

| Type | When Used | Who Marks | Example |
|------|-----------|-----------|---------|
| `retry_succeeded` | Handoff retried and passed after fixes | System (handoff executor) | "Fixed terminal identity bug, retry passed at 97%" |
| `obsolete` | Issue no longer relevant (SD cancelled, approach changed) | System or Human | "SD cancelled, abandoning this handoff" |
| `escalated_to_sd` | Created dedicated SD to address root cause | System (via `/learn` or manual SD creation) | "Created SD-LEARN-FIX-XXX to fix underlying issue" |
| `manual_override` | Human decided to mark as resolved (rare) | Human (database admin) | "Approved by team lead despite rejection" |

### Updated Gate Query

**File**: `scripts/modules/handoff/executors/lead-to-plan/gates/transition-readiness.js`

```javascript
// Before (checked all rejections, including resolved)
const { data: previousHandoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', sd.id)
  .eq('handoff_type', 'LEAD-TO-PLAN')
  .in('status', ['rejected', 'failed', 'blocked']);

// After (only checks UNRESOLVED rejections)
const { data: previousHandoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('id, status, created_at, rejection_reason, resolved_at')
  .eq('sd_id', sd.id)
  .eq('handoff_type', 'LEAD-TO-PLAN')
  .in('status', ['rejected', 'failed', 'blocked'])
  .is('resolved_at', null)  // ← KEY CHANGE: Only unresolved
  .order('created_at', { ascending: false })
  .limit(5);
```

**Performance**: Partial index `idx_sd_phase_handoffs_unresolved` ensures this query remains fast even with large handoff history.

## Usage Patterns

### Pattern 1: Automatic Resolution on Retry Success

**When**: Handoff executor detects previous rejection, retries, and passes

```javascript
// In handoff executor (e.g., leadToPlanExecutor.js)
async function markPreviousRejectionAsResolved(supabase, sdId, handoffType, newHandoffId) {
  // Find the most recent rejected handoff
  const { data: rejectedHandoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('id')
    .eq('sd_id', sdId)
    .eq('handoff_type', handoffType)
    .in('status', ['rejected', 'failed', 'blocked'])
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (rejectedHandoffs && rejectedHandoffs.length > 0) {
    const oldHandoffId = rejectedHandoffs[0].id;

    // Mark as resolved
    await supabase
      .from('sd_phase_handoffs')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_type: 'retry_succeeded',
        resolution_notes: `Resolved by successful retry (handoff ${newHandoffId})`
      })
      .eq('id', oldHandoffId);
  }
}
```

### Pattern 2: Manual Resolution via RCA/Learning

**When**: Issue pattern captured by `/learn` or RCA sub-agent, dedicated SD created

```javascript
// In /learn workflow or RCA sub-agent
async function resolveHandoffViaSD(supabase, handoffId, createdSDKey) {
  await supabase
    .from('sd_phase_handoffs')
    .update({
      resolved_at: new Date().toISOString(),
      resolution_type: 'escalated_to_sd',
      resolution_notes: `Created ${createdSDKey} to address root cause`
    })
    .eq('id', handoffId);
}
```

### Pattern 3: Obsolete Resolution

**When**: SD cancelled or approach changed (handoff no longer needed)

```javascript
async function markHandoffObsolete(supabase, handoffId, reason) {
  await supabase
    .from('sd_phase_handoffs')
    .update({
      resolved_at: new Date().toISOString(),
      resolution_type: 'obsolete',
      resolution_notes: reason
    })
    .eq('id', handoffId);
}
```

### Pattern 4: Manual Override (Database Admin)

**When**: Human decision overrides gate failure (rare, emergency use)

```sql
-- Direct SQL (requires service_role or admin access)
UPDATE sd_phase_handoffs
SET
  resolved_at = NOW(),
  resolution_type = 'manual_override',
  resolution_notes = 'Approved by @username for emergency deployment'
WHERE id = 'handoff-uuid-here';
```

## Operational Queries

### Find Unresolved Failures Blocking SDs

```sql
SELECT
  sd.sd_key,
  sd.title,
  h.handoff_type,
  h.status,
  h.rejection_reason,
  h.created_at,
  EXTRACT(EPOCH FROM (NOW() - h.created_at)) / 3600 as hours_blocked
FROM sd_phase_handoffs h
JOIN strategic_directives_v2 sd ON h.sd_id = sd.id
WHERE h.status IN ('rejected', 'failed', 'blocked')
  AND h.resolved_at IS NULL
ORDER BY h.created_at ASC;
```

**Use Case**: Daily operations check to identify stuck SDs

### Resolution Effectiveness Metrics

```sql
SELECT
  resolution_type,
  COUNT(*) as resolution_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours_to_resolution,
  MIN(resolved_at) as first_resolution,
  MAX(resolved_at) as last_resolution
FROM sd_phase_handoffs
WHERE resolved_at IS NOT NULL
  AND resolved_at > NOW() - INTERVAL '30 days'
GROUP BY resolution_type
ORDER BY resolution_count DESC;
```

**Use Case**: Monthly retrospectives on handoff quality

### Resolution Type Distribution

```sql
SELECT
  resolution_type,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) as percentage
FROM sd_phase_handoffs
WHERE resolved_at IS NOT NULL
GROUP BY resolution_type
ORDER BY count DESC;
```

**Use Case**: Identify most common resolution paths

### Handoff Retry Effectiveness

```sql
WITH handoff_attempts AS (
  SELECT
    sd_id,
    handoff_type,
    COUNT(*) as total_attempts,
    SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as successes,
    SUM(CASE WHEN status IN ('rejected', 'failed', 'blocked') THEN 1 ELSE 0 END) as failures,
    SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved_failures
  FROM sd_phase_handoffs
  GROUP BY sd_id, handoff_type
)
SELECT
  handoff_type,
  COUNT(*) as sd_count,
  AVG(total_attempts) as avg_attempts,
  ROUND(100.0 * SUM(successes) / NULLIF(SUM(total_attempts), 0), 2) as success_rate,
  ROUND(100.0 * SUM(resolved_failures) / NULLIF(SUM(failures), 0), 2) as resolution_rate
FROM handoff_attempts
GROUP BY handoff_type
ORDER BY handoff_type;
```

**Use Case**: Quarterly report on handoff system health

## Benefits

### 1. Unblocks Permanently Stuck SDs
- **Before**: SD blocked by old rejection, even after fix
- **After**: Old rejection marked resolved, SD can proceed

### 2. Maintains Audit Trail
- **Preservation**: Original rejection record remains in database
- **Context**: Resolution notes explain what changed and why

### 3. Enables Learning Loops
- **Pattern Detection**: Identify recurring rejection reasons
- **Root Cause Escalation**: Track which failures required dedicated SDs
- **Success Metrics**: Measure time-to-resolution and retry effectiveness

### 4. Optimizes Query Performance
- **Partial Index**: Only indexes unresolved failures (small subset)
- **Fast Lookups**: Gate query uses index for O(log n) performance

## Testing

### Unit Tests

**File**: `tests/unit/transition-readiness-resolution.test.js`

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateTransitionReadiness } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/transition-readiness.js';

describe('Transition Readiness - Resolution Lifecycle', () => {
  it('should PASS when previous rejection is marked resolved', async () => {
    const supabase = createMockSupabase([
      {
        id: 'handoff-123',
        status: 'rejected',
        resolved_at: '2026-02-09T10:00:00Z', // Resolved
        resolution_type: 'retry_succeeded'
      }
    ]);

    const result = await validateTransitionReadiness({ id: 'sd-001' }, supabase);

    // Should pass because rejection is resolved
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should BLOCK when previous rejection is unresolved', async () => {
    const supabase = createMockSupabase([
      {
        id: 'handoff-123',
        status: 'rejected',
        resolved_at: null, // Unresolved
        rejection_reason: 'Gate validation failed'
      }
    ]);

    const result = await validateTransitionReadiness({ id: 'sd-001' }, supabase);

    // Should block because rejection is unresolved
    expect(result.pass).toBe(false);
    expect(result.issues.some(i => i.includes('REJECTED'))).toBe(true);
  });

  it('should filter resolved rejections from query results', async () => {
    // Note: This test verifies the query includes .is('resolved_at', null)
    const supabase = createMockSupabase([]);

    await validateTransitionReadiness({ id: 'sd-001' }, supabase);

    // Verify query chain includes .is('resolved_at', null)
    expect(supabase.from).toHaveBeenCalledWith('sd_phase_handoffs');
    const chain = supabase.from().select().eq().eq().in();
    expect(chain.is).toHaveBeenCalledWith('resolved_at', null);
  });
});
```

### Integration Tests

**File**: `tests/integration/handoff-resolution-lifecycle.test.js`

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Handoff Resolution Lifecycle (Integration)', () => {
  let supabase;

  beforeAll(() => {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  });

  it('should mark handoff as resolved and unblock retry', async () => {
    // Step 1: Create a rejected handoff
    const { data: rejectedHandoff } = await supabase
      .from('sd_phase_handoffs')
      .insert({
        sd_id: 'test-sd-001',
        handoff_type: 'LEAD-TO-PLAN',
        status: 'rejected',
        rejection_reason: 'Test rejection'
      })
      .select()
      .single();

    // Step 2: Verify it blocks transition
    const { data: blockingHandoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('*')
      .eq('sd_id', 'test-sd-001')
      .eq('handoff_type', 'LEAD-TO-PLAN')
      .in('status', ['rejected'])
      .is('resolved_at', null);

    expect(blockingHandoffs).toHaveLength(1);

    // Step 3: Mark as resolved
    await supabase
      .from('sd_phase_handoffs')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_type: 'retry_succeeded',
        resolution_notes: 'Integration test resolution'
      })
      .eq('id', rejectedHandoff.id);

    // Step 4: Verify it no longer blocks
    const { data: afterResolve } = await supabase
      .from('sd_phase_handoffs')
      .select('*')
      .eq('sd_id', 'test-sd-001')
      .eq('handoff_type', 'LEAD-TO-PLAN')
      .in('status', ['rejected'])
      .is('resolved_at', null);

    expect(afterResolve).toHaveLength(0);

    // Cleanup
    await supabase
      .from('sd_phase_handoffs')
      .delete()
      .eq('id', rejectedHandoff.id);
  });
});
```

## Rollout Impact

### Database Changes
- **3 new columns**: `resolved_at`, `resolution_type`, `resolution_notes`
- **1 partial index**: `idx_sd_phase_handoffs_unresolved`
- **1 check constraint**: Validates resolution_type values
- **3 column comments**: Documentation in schema

### Code Changes
- **1 gate query updated**: `transition-readiness.js` (added `.is('resolved_at', null)`)
- **1 test updated**: `transition-readiness-rejection.test.js` (added `.is()` to mock chain)

### Risk Assessment
- **Risk Level**: Low
- **Reason**: Additive schema change (no data loss), backward compatible
- **Validation**: All tests pass, gate query performance unchanged

### Rollback Plan
If issues arise:
```sql
-- Remove partial index
DROP INDEX IF EXISTS idx_sd_phase_handoffs_unresolved;

-- Remove check constraint
ALTER TABLE sd_phase_handoffs
DROP CONSTRAINT IF EXISTS chk_resolution_type_valid;

-- Remove columns (destructive - only if necessary)
ALTER TABLE sd_phase_handoffs
DROP COLUMN resolved_at,
DROP COLUMN resolution_type,
DROP COLUMN resolution_notes;
```

## Related Patterns

### 1. Terminal Identity Centralization
**Pattern**: PAT-AUTO-e646ab92
**Document**: [Terminal Identity Centralization Pattern](./terminal-identity-centralization-pattern.md)
**Relationship**: Accurate terminal identity detection prevents false multi-session conflicts, which reduces handoff rejections

### 2. Multi-Session Coordination
**SD**: SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001
**Document**: [Multi-Session Coordination Ops](../06_deployment/multi-session-coordination-ops.md)
**Relationship**: Multi-session claim system generates handoff rejections when conflicts detected

### 3. RCA-Driven SD Creation
**Trigger**: Recurring handoff failures
**Resolution**: RCA sub-agent creates SD to fix root cause, marks original handoff as resolved via `escalated_to_sd`

## Lessons Learned

### 1. Database Lifecycle Design
- **Principle**: Records should have explicit lifecycle states (active → resolved)
- **Antipattern**: Using status alone to track both current state and history

### 2. Partial Indexes for Performance
- **Use Case**: When filtering large tables by nullable column (WHERE col IS NULL)
- **Benefit**: Index only stores rows matching condition (small, fast)

### 3. Audit Trail Preservation
- **Do NOT**: Delete or overwrite rejection records
- **DO**: Add resolution metadata alongside original data

### 4. Resolution Type Enumeration
- **Benefit**: Standardized vocabulary enables reporting and metrics
- **Implementation**: CHECK constraint enforces valid values

### 5. Query Filter Clarity
- **Pattern**: `.is('resolved_at', null)` more explicit than `.eq('resolved_at', null)`
- **Supabase**: `.is()` method designed for NULL checks

## Implementation Checklist

When applying this pattern to other lifecycle-tracked entities:

- [ ] Identify entity with lifecycle states (e.g., handoffs, sessions, claims)
- [ ] Add resolution tracking columns (`resolved_at`, `resolution_type`, `resolution_notes`)
- [ ] Define resolution type enum (CHECK constraint)
- [ ] Create partial index for unresolved-only queries (WHERE resolved_at IS NULL)
- [ ] Update queries to filter by resolution state
- [ ] Add tests for resolved vs unresolved filtering
- [ ] Document operational queries for monitoring
- [ ] Update schema documentation

## References

- **SD**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-018
- **Migration**: `database/migrations/20260209_handoff_resolution_tracking.sql`
- **Gate Logic**: `scripts/modules/handoff/executors/lead-to-plan/gates/transition-readiness.js`
- **Test**: `tests/unit/transition-readiness-rejection.test.js`
- **Schema Doc**: `docs/reference/schema/engineer/tables/sd_phase_handoffs.md`
- **Operational Guide**: [Multi-Session Coordination Ops](../06_deployment/multi-session-coordination-ops.md#handoff-resolution-tracking-sd-learn-fix-address-pattern-learn-018)

---

*Part of LEO Protocol Infrastructure Hardening*
*Pattern Resolved: PAT-AUTO-e74d3e36*
