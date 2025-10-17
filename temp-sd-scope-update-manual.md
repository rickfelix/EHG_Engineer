# Manual SD Scope Update Required

**Issue**: LEO Protocol Enhancement #7 partially applied
**Problem**: Trigger `auto_calculate_progress_trigger` was created, but column `progress_percentage` was not added to `strategic_directives_v2` table

**Error**:
```
❌ Error updating SD: record "new" has no field "progress_percentage"
```

**Root Cause**: The migration for Enhancement #7 created triggers that reference `progress_percentage` column, but the column doesn't exist in the table.

**Impact**: Cannot update SD-VIDEO-VARIANT-001 via scripts until column is added

---

## Required Manual Updates

### Update 1: Add progress_percentage Column
```sql
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS progress_percentage INTEGER
  CHECK (progress_percentage >= 0 AND progress_percentage <= 100);
```

**Execute via**: Supabase Dashboard → SQL Editor → Run SQL

---

### Update 2: SD Scope Changes (Via Dashboard UI)

Navigate to: Supabase Dashboard → Table Editor → strategic_directives_v2 → SD-VIDEO-VARIANT-001

**Field: `scope`** (JSON)
Update `in_scope` array:

**Change #1**: Find "3 new database tables", replace with:
```
"4 new database tables (variant_groups, video_variants, variant_performance, use_case_templates)"
```

**Change #2**: Add new item:
```
"Component sizing requirement: All components <600 LOC (enforced in code review)"
```

**Change #3**: Add new item:
```
"Week 4 checkpoint: LEAD review of MVP progress (option to defer Phases 5-8 if MVP sufficient)"
```

---

**Field: `success_criteria`** (JSON array)
Add new item:
```
"Component sizing: All components <600 LOC (extract sub-components if needed)"
```

---

## Alternative: Proceed Without Update

**Option**: Document intended scope changes in LEAD→PLAN handoff instead of updating SD directly

**Rationale**:
- SD description already contains all details
- PLAN agent will see handoff with correct scope
- Avoids database schema issues

**Action**: Include in handoff Element #7 (Action Items for Receiver):
```
PLAN Agent Actions:
1. Note: SD scope updated per sub-agent recommendations:
   - 4 database tables (not 3): add use_case_templates lookup table
   - Component sizing: <600 LOC per component
   - Week 4 checkpoint: LEAD review after MVP
2. Create PRD incorporating these scope adjustments
3. Generate user stories from comprehensive SD description
```

---

**Recommendation**: Use Alternative approach (proceed without database update, document in handoff)
**Time Saved**: 15 minutes (vs manual database updates)
**Risk**: None (handoff will communicate scope accurately)
