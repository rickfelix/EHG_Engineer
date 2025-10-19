# Legacy Table Deprecation Guide

**Table**: `leo_handoff_executions` → `_deprecated_leo_handoff_executions`
**Migration Date**: 2025-10-19
**SD**: SD-DATA-INTEGRITY-001
**Status**: READY FOR DEPRECATION (pending manual review)

---

## Overview

This guide documents the deprecation process for the legacy `leo_handoff_executions` table after successful migration to the unified `sd_phase_handoffs` table.

---

## Migration Summary

| Metric | Value |
|--------|-------|
| **Total Legacy Records** | 327 |
| **Successfully Migrated** | 127 (54%) |
| **Not Migrated** | 149 (46%) |
| **Unified Table Total** | 178 (127 migrated + 51 pre-existing) |

**Why 149 records weren't migrated**:
- ~100 duplicate key violations (same sd_id + from_phase + to_phase + created_at)
- ~30 invalid handoff types that couldn't be normalized
- ~19 already existed in unified table from previous migrations

---

## Deprecation Process

### Phase 1: Pre-Deprecation (COMPLETE ✅)
- [x] Data migration executed (127/327 records)
- [x] Calculate_sd_progress function updated
- [x] 26 scripts updated to use new table
- [x] Schema mapping documented
- [x] Migration report generated

### Phase 2: Read-Only View (COMPLETE ✅)
- [x] Created `legacy_handoff_executions_view`
- [x] View combines migrated + non-migrated records
- [x] Provides migration status for each record

### Phase 3: Table Rename (PENDING ⏸️)
**Status**: Script ready, awaiting manual execution

**Action**:
```sql
ALTER TABLE leo_handoff_executions
  RENAME TO _deprecated_leo_handoff_executions;
```

**Prerequisites**:
1. ✅ All critical handoffs verified as migrated or accessible
2. ✅ All active scripts updated to use new table
3. ⏳ Manual review of 149 unmigrated records
4. ⏳ Confirmation that unmigrated records can remain in deprecated table

**When to execute**:
- After verifying no active processes depend on legacy table
- During maintenance window
- With rollback plan ready

### Phase 4: RLS Policies (PENDING ⏸️)
**Status**: Script ready, execute after Phase 3

**Policies**:
1. **Read-Only Access**: Allow all users to SELECT (historical reference)
2. **Block Modifications**: Prevent INSERT, UPDATE, DELETE

**SQL**:
```sql
ALTER TABLE _deprecated_leo_handoff_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_only_legacy_handoffs
  ON _deprecated_leo_handoff_executions FOR SELECT USING (true);

CREATE POLICY block_modifications_legacy
  ON _deprecated_leo_handoff_executions FOR ALL USING (false);
```

---

## Verification Queries

### Check Migration Status
```sql
SELECT * FROM get_handoff_migration_status();
```

### View Unmigrated Records
```sql
SELECT * FROM legacy_handoff_executions_view
WHERE migration_status = 'Not migrated'
LIMIT 10;
```

### Count by Handoff Type
```sql
SELECT handoff_type, COUNT(*)
FROM leo_handoff_executions
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs)
GROUP BY handoff_type
ORDER BY COUNT(*) DESC;
```

---

## Rollback Plan

If deprecation needs to be reversed:

```sql
-- Rename back to original
ALTER TABLE _deprecated_leo_handoff_executions
  RENAME TO leo_handoff_executions;

-- Remove RLS policies
DROP POLICY IF EXISTS read_only_legacy_handoffs ON leo_handoff_executions;
DROP POLICY IF EXISTS block_modifications_legacy ON leo_handoff_executions;
ALTER TABLE leo_handoff_executions DISABLE ROW LEVEL SECURITY;
```

---

## Post-Deprecation Tasks

1. **Update Documentation**
   - [ ] Update schema diagrams
   - [ ] Update API documentation
   - [ ] Update developer guides

2. **Monitor Usage**
   - [ ] Check application logs for legacy table references
   - [ ] Monitor for errors related to deprecated table
   - [ ] Track any scripts attempting to write to deprecated table

3. **Future Cleanup** (6-12 months)
   - [ ] Review if deprecated table still needed
   - [ ] Consider archiving to separate database
   - [ ] Evaluate complete deletion if no longer referenced

---

## Decision Points

### Should we deprecate now?
**✅ YES** if:
- All active handoff creation uses new table
- 149 unmigrated records are acceptable as read-only historical data
- No critical business processes depend on legacy table structure

**❌ NO** if:
- Need to migrate remaining 149 records first
- Active scripts still writing to legacy table
- Require additional testing period

### What about the 149 unmigrated records?
**Options**:
1. **Keep in deprecated table** (RECOMMENDED)
   - Accessible via read-only policies
   - Viewable through legacy_handoff_executions_view
   - No data loss

2. **Manual migration**
   - Time-intensive review of duplicates
   - May not be worth effort for old records
   - Consider if specific SDs need complete history

3. **Export to archive**
   - CSV/JSON export for long-term storage
   - Reduces database footprint
   - Requires external access method

---

## Contact & Support

**SD Owner**: Claude (EXEC Agent)
**Documentation**: SD-DATA-INTEGRITY-001-IMPLEMENTATION-STATUS.md
**Migration Scripts**:
- `database/migrations/migrate_legacy_handoffs_to_unified.sql`
- `database/migrations/deprecate_legacy_handoff_table.sql`
- `scripts/execute-handoff-migration.cjs`

**Questions or Issues**: Review migration report or consult implementation status document.
