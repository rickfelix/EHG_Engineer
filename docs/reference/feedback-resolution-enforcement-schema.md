---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Feedback Resolution Enforcement Schema Design


## Table of Contents

- [Overview](#overview)
- [Schema Changes](#schema-changes)
  - [1. New Columns](#1-new-columns)
  - [2. Updated Status Constraint](#2-updated-status-constraint)
  - [3. Foreign Key Constraints (TR-2)](#3-foreign-key-constraints-tr-2)
  - [4. Status-Dependent CHECK Constraints (TR-1)](#4-status-dependent-check-constraints-tr-1)
  - [5. Performance Indexes](#5-performance-indexes)
- [Validation Rules by Status](#validation-rules-by-status)
  - [Status: `resolved`](#status-resolved)
  - [Status: `wont_fix`](#status-wont_fix)
  - [Status: `duplicate`](#status-duplicate)
  - [Status: `invalid`](#status-invalid)
- [Structured Logging (TR-4)](#structured-logging-tr-4)
- [Preflight Validation (TR-3)](#preflight-validation-tr-3)
- [Migration Phases](#migration-phases)
- [Rollback Script](#rollback-script)
- [Application Code Changes Required](#application-code-changes-required)
- [Testing the Migration](#testing-the-migration)
- [Monitoring](#monitoring)
- [Next Steps](#next-steps)

**SD**: SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Migration File**: `database/migrations/20260131_feedback_resolution_enforcement.sql`
**Date**: 2026-01-31

---

## Overview

This schema enhancement adds status-dependent validation to the `feedback` table, ensuring that feedback items cannot be closed without proper resolution tracking.

## Schema Changes

### 1. New Columns

| Column | Type | Nullable | FK Target | Description |
|--------|------|----------|-----------|-------------|
| `quick_fix_id` | `TEXT` | YES | `quick_fixes.id` | References quick fix that resolved this feedback |
| `strategic_directive_id` | `VARCHAR(50)` | YES | `strategic_directives_v2.id` | References SD that resolved this feedback |
| `duplicate_of_id` | `UUID` | YES | `feedback.id` | Self-reference to original feedback (for duplicates) |

### 2. Updated Status Constraint

**Before**: `['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'backlog', 'shipped']`

**After**: Added `'duplicate'` and `'invalid'` statuses

```sql
CHECK (status IN (
    'new', 'triaged', 'in_progress', 'resolved',
    'wont_fix', 'duplicate', 'invalid', 'backlog', 'shipped'
))
```

### 3. Foreign Key Constraints (TR-2)

All foreign keys use `ON DELETE RESTRICT` to prevent accidental data loss:

```sql
-- FK 1: quick_fix_id -> quick_fixes.id
CONSTRAINT fk_feedback_quick_fix
FOREIGN KEY (quick_fix_id) REFERENCES quick_fixes(id) ON DELETE RESTRICT;

-- FK 2: strategic_directive_id -> strategic_directives_v2.id
CONSTRAINT fk_feedback_strategic_directive
FOREIGN KEY (strategic_directive_id) REFERENCES strategic_directives_v2(id) ON DELETE RESTRICT;

-- FK 3: duplicate_of_id -> feedback.id (self-reference)
CONSTRAINT fk_feedback_duplicate_of
FOREIGN KEY (duplicate_of_id) REFERENCES feedback(id) ON DELETE RESTRICT;
```

### 4. Status-Dependent CHECK Constraints (TR-1)

| Constraint | Rule | Enforces |
|------------|------|----------|
| `chk_resolved_requires_reference` | `status='resolved'` requires `quick_fix_id` OR `strategic_directive_id` | Resolution traceability |
| `chk_wont_fix_requires_notes` | `status='wont_fix'` requires non-empty `resolution_notes` | Rejection justification |
| `chk_duplicate_requires_reference` | `status='duplicate'` requires `duplicate_of_id` (not self) | Duplicate linkage |
| (none) | `status='invalid'` has NO additional requirements | Permissive closure |

**SQL Implementation**:

```sql
-- Constraint 1: Resolved requires reference
CHECK (
    status <> 'resolved' OR (quick_fix_id IS NOT NULL OR strategic_directive_id IS NOT NULL)
);

-- Constraint 2: Won't fix requires notes
CHECK (
    status <> 'wont_fix' OR (resolution_notes IS NOT NULL AND LENGTH(TRIM(resolution_notes)) > 0)
);

-- Constraint 3: Duplicate requires reference (not self)
CHECK (
    status <> 'duplicate' OR (duplicate_of_id IS NOT NULL AND duplicate_of_id <> id)
);
```

### 5. Performance Indexes

Partial indexes created for foreign key columns (only index non-NULL values):

```sql
CREATE INDEX idx_feedback_quick_fix_id
ON feedback(quick_fix_id)
WHERE quick_fix_id IS NOT NULL;

CREATE INDEX idx_feedback_strategic_directive_id
ON feedback(strategic_directive_id)
WHERE strategic_directive_id IS NOT NULL;

CREATE INDEX idx_feedback_duplicate_of_id
ON feedback(duplicate_of_id)
WHERE duplicate_of_id IS NOT NULL;
```

## Validation Rules by Status

### Status: `resolved`

**Requirements**:
- MUST have `quick_fix_id` OR `strategic_directive_id`
- Can have both (e.g., QF escalated to SD)

**Example Valid Scenarios**:
```sql
-- Resolved via quick fix
UPDATE feedback SET
    status = 'resolved',
    quick_fix_id = 'QF-20260131-001',
    resolved_at = NOW()
WHERE id = '...';

-- Resolved via SD
UPDATE feedback SET
    status = 'resolved',
    strategic_directive_id = 'SD-FEEDBACK-001',
    resolved_at = NOW()
WHERE id = '...';

-- Resolved via both (QF escalated to SD)
UPDATE feedback SET
    status = 'resolved',
    quick_fix_id = 'QF-20260131-001',
    strategic_directive_id = 'SD-FEEDBACK-001',
    resolved_at = NOW()
WHERE id = '...';
```

**Invalid Scenario** (constraint violation):
```sql
-- FAILS: No resolution reference
UPDATE feedback SET status = 'resolved' WHERE id = '...';
-- ERROR: chk_resolved_requires_reference
```

### Status: `wont_fix`

**Requirements**:
- MUST have non-empty `resolution_notes`

**Example Valid Scenario**:
```sql
UPDATE feedback SET
    status = 'wont_fix',
    resolution_notes = 'Not aligned with current product strategy. Revisit in Q3 2026.',
    resolved_at = NOW()
WHERE id = '...';
```

**Invalid Scenarios** (constraint violations):
```sql
-- FAILS: No notes
UPDATE feedback SET status = 'wont_fix' WHERE id = '...';
-- ERROR: chk_wont_fix_requires_notes

-- FAILS: Empty notes
UPDATE feedback SET
    status = 'wont_fix',
    resolution_notes = '   '
WHERE id = '...';
-- ERROR: chk_wont_fix_requires_notes (LENGTH(TRIM(...)) = 0)
```

### Status: `duplicate`

**Requirements**:
- MUST have `duplicate_of_id`
- `duplicate_of_id` CANNOT equal `id` (no self-reference)

**Example Valid Scenario**:
```sql
-- Mark as duplicate of another feedback
UPDATE feedback SET
    status = 'duplicate',
    duplicate_of_id = '123e4567-e89b-12d3-a456-426614174000',
    resolved_at = NOW()
WHERE id = '789e4567-e89b-12d3-a456-426614174999';
```

**Invalid Scenarios** (constraint violations):
```sql
-- FAILS: No duplicate reference
UPDATE feedback SET status = 'duplicate' WHERE id = '...';
-- ERROR: chk_duplicate_requires_reference

-- FAILS: Self-reference
UPDATE feedback SET
    status = 'duplicate',
    duplicate_of_id = id  -- Same as current row
WHERE id = '...';
-- ERROR: chk_duplicate_requires_reference (duplicate_of_id <> id)
```

### Status: `invalid`

**Requirements**:
- NONE (permissive)

**Example Valid Scenario**:
```sql
-- Mark as invalid (spam, test data, etc.)
UPDATE feedback SET
    status = 'invalid',
    resolution_notes = 'Spam submission'  -- Optional but recommended
WHERE id = '...';
```

## Structured Logging (TR-4)

The migration includes a trigger function `log_feedback_resolution_violation()` that logs structured violation details BEFORE the CHECK constraint fails.

**Trigger Behavior**:
```plpgsql
-- Logs violation as WARNING with JSONB details
RAISE WARNING '[FEEDBACK_RESOLUTION_VIOLATION] Type: %, Details: %',
    violation_type,
    violation_details;

-- Example log output:
-- [FEEDBACK_RESOLUTION_VIOLATION] Type: resolved_missing_reference,
-- Details: {"feedback_id": "...", "title": "...", "violation": "status=resolved requires quick_fix_id OR strategic_directive_id"}
```

**Benefits**:
- Structured logs for observability (parse with logging tools)
- Captures context before constraint fails
- Helps diagnose why updates are being rejected

## Preflight Validation (TR-3)

The migration includes comprehensive preflight validation in Phase 1:

**Checks Performed**:
1. Verify `quick_fixes` table exists
2. Verify `strategic_directives_v2` table exists
3. Verify `feedback` table exists
4. Check for existing `resolved` rows missing resolution references
5. Check for existing `wont_fix` rows missing `resolution_notes`
6. Check for existing `duplicate` status usage (currently not in constraint)

**Sample Output**:
```
[PREFLIGHT] Starting validation for feedback resolution enforcement migration
[PREFLIGHT] ✓ All target tables exist
[PREFLIGHT] ✓ feedback table exists
[PREFLIGHT] Found 3 feedback rows with status=resolved but no resolution_sd_id or notes
[PREFLIGHT] Sample violations: [{"id": "...", "title": "...", "status": "resolved"}]
[PREFLIGHT] Validation complete. Proceeding with migration.
```

**Important**: Preflight warnings do NOT block migration. They inform you of data that may need manual cleanup.

## Migration Phases

| Phase | Description | Key Actions |
|-------|-------------|-------------|
| **1** | Preflight Validation | Check target tables, identify data issues |
| **2** | Add New Columns | `quick_fix_id`, `strategic_directive_id`, `duplicate_of_id` |
| **3** | Update Status Constraint | Add `'duplicate'` and `'invalid'` statuses |
| **4** | Add Foreign Keys | 3 FKs with `ON DELETE RESTRICT` |
| **5** | Add CHECK Constraints | Status-dependent validation rules |
| **6** | Create Indexes | Performance indexes for FKs |
| **7** | Structured Logging | Trigger for violation logging |
| **8** | Completion Summary | Statistics and next steps |

## Rollback Script

The migration includes a commented-out rollback script at the end. **Use with extreme caution**.

To rollback (emergency only):
1. Uncomment the rollback section at the end of the migration file
2. Run the migration file again
3. All changes will be reversed

**Warning**: Rollback will drop columns and constraints. Data in `quick_fix_id`, `strategic_directive_id`, and `duplicate_of_id` will be lost.

## Application Code Changes Required

After running this migration, update application code to:

1. **When resolving feedback via quick fix**:
   ```javascript
   await supabase
     .from('feedback')
     .update({
       status: 'resolved',
       quick_fix_id: quickFixId,  // NEW
       resolved_at: new Date().toISOString()
     })
     .eq('id', feedbackId);
   ```

2. **When resolving feedback via SD**:
   ```javascript
   await supabase
     .from('feedback')
     .update({
       status: 'resolved',
       strategic_directive_id: sdId,  // NEW
       resolved_at: new Date().toISOString()
     })
     .eq('id', feedbackId);
   ```

3. **When marking as won't fix**:
   ```javascript
   await supabase
     .from('feedback')
     .update({
       status: 'wont_fix',
       resolution_notes: 'Reason for rejection...',  // REQUIRED
       resolved_at: new Date().toISOString()
     })
     .eq('id', feedbackId);
   ```

4. **When marking as duplicate**:
   ```javascript
   await supabase
     .from('feedback')
     .update({
       status: 'duplicate',
       duplicate_of_id: originalFeedbackId,  // NEW, REQUIRED
       resolved_at: new Date().toISOString()
     })
     .eq('id', feedbackId);
   ```

## Testing the Migration

**Test Scenarios**:

```sql
-- Test 1: Resolved with quick fix (should succeed)
INSERT INTO feedback (id, type, source_application, source_type, title, status, quick_fix_id)
VALUES (gen_random_uuid(), 'issue', 'EHG', 'manual_feedback', 'Test resolved with QF', 'resolved', 'QF-20260131-001');

-- Test 2: Resolved with SD (should succeed)
INSERT INTO feedback (id, type, source_application, source_type, title, status, strategic_directive_id)
VALUES (gen_random_uuid(), 'issue', 'EHG', 'manual_feedback', 'Test resolved with SD', 'resolved', 'SD-TEST-001');

-- Test 3: Resolved without reference (should FAIL)
INSERT INTO feedback (id, type, source_application, source_type, title, status)
VALUES (gen_random_uuid(), 'issue', 'EHG', 'manual_feedback', 'Test resolved no ref', 'resolved');
-- ERROR: chk_resolved_requires_reference

-- Test 4: Won't fix with notes (should succeed)
INSERT INTO feedback (id, type, source_application, source_type, title, status, resolution_notes)
VALUES (gen_random_uuid(), 'issue', 'EHG', 'manual_feedback', 'Test wont fix', 'wont_fix', 'Not aligned with strategy');

-- Test 5: Won't fix without notes (should FAIL)
INSERT INTO feedback (id, type, source_application, source_type, title, status)
VALUES (gen_random_uuid(), 'issue', 'EHG', 'manual_feedback', 'Test wont fix no notes', 'wont_fix');
-- ERROR: chk_wont_fix_requires_notes

-- Test 6: Duplicate with reference (should succeed)
-- First create original
INSERT INTO feedback (id, type, source_application, source_type, title, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'issue', 'EHG', 'manual_feedback', 'Original feedback', 'new');
-- Then create duplicate
INSERT INTO feedback (id, type, source_application, source_type, title, status, duplicate_of_id)
VALUES (gen_random_uuid(), 'issue', 'EHG', 'manual_feedback', 'Duplicate feedback', 'duplicate', '00000000-0000-0000-0000-000000000001');

-- Test 7: Duplicate self-reference (should FAIL)
INSERT INTO feedback (id, type, source_application, source_type, title, status, duplicate_of_id)
VALUES ('00000000-0000-0000-0000-000000000002', 'issue', 'EHG', 'manual_feedback', 'Self duplicate', 'duplicate', '00000000-0000-0000-0000-000000000002');
-- ERROR: chk_duplicate_requires_reference (duplicate_of_id <> id)

-- Test 8: Invalid status (should succeed, no requirements)
INSERT INTO feedback (id, type, source_application, source_type, title, status)
VALUES (gen_random_uuid(), 'issue', 'EHG', 'manual_feedback', 'Test invalid', 'invalid');
```

## Monitoring

After deployment, monitor:

1. **Constraint violations** (from structured logging):
   ```sql
   -- Check logs for violations (PostgreSQL logs)
   SHOW log_destination;
   -- Look for: [FEEDBACK_RESOLUTION_VIOLATION]
   ```

2. **Feedback resolution patterns**:
   ```sql
   -- How many resolved via quick fix vs SD?
   SELECT
     COUNT(*) FILTER (WHERE quick_fix_id IS NOT NULL) as resolved_via_qf,
     COUNT(*) FILTER (WHERE strategic_directive_id IS NOT NULL) as resolved_via_sd,
     COUNT(*) FILTER (WHERE quick_fix_id IS NOT NULL AND strategic_directive_id IS NOT NULL) as resolved_via_both
   FROM feedback
   WHERE status = 'resolved';
   ```

3. **Duplicate chains**:
   ```sql
   -- Find feedback items with multiple duplicates
   SELECT
     f1.id as original_id,
     f1.title as original_title,
     COUNT(f2.id) as duplicate_count
   FROM feedback f1
   LEFT JOIN feedback f2 ON f2.duplicate_of_id = f1.id
   GROUP BY f1.id, f1.title
   HAVING COUNT(f2.id) > 0
   ORDER BY duplicate_count DESC;
   ```

## Next Steps

After running the migration:

1. ✅ Review preflight validation warnings (if any)
2. ✅ Run test scenarios to verify constraints work
3. ✅ Update application code to populate new FK columns
4. ✅ Deploy code changes that respect new constraints
5. ✅ Monitor structured logs for violations
6. ✅ Run `npm run schema:docs:engineer` to regenerate schema documentation

---

**Documentation**: This file will be referenced by auto-generated schema docs after migration.
**Schema Docs**: Run `npm run schema:docs:table feedback` to update after migration.
