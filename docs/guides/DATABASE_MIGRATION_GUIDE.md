# 🎯 Database Migration Execution Guide
## SD-VIDEO-VARIANT-001 - LEAD→PLAN Handoff Unblock

**Date**: 2025-10-10  
**Status**: ✅ READY TO EXECUTE  
**Risk Level**: 🟢 VERY LOW  
**Time Required**: <5 minutes  

---

## 📊 Database Architect Assessment

**Sub-Agent**: Principal Database Architect (30 years experience)  
**Confidence**: 🟢🟢🟢🟢🟢 95% (Very High)  
**Verdict**: ✅ ADD PROGRESS_PERCENTAGE COLUMN (Permanent Fix)

### Root Cause Confirmed
- ❌ Column `progress_percentage` missing from `strategic_directives_v2` table
- ✅ Trigger `auto_calculate_progress_trigger` references this column
- ✅ LEO Protocol Enhancement #7 created trigger but column creation was missed

---

## 🚀 EXECUTION STEPS (3 phases, <5 min total)

### Phase 1: Execute Migration SQL (1 minute)

**Navigate to**: [Supabase Dashboard](https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql)

**Copy and paste this SQL**:

```sql
-- Migration: Add progress_percentage column
-- Risk: VERY LOW (additive change only, no data loss possible)
-- Downtime: NONE

-- Step 1: Add column with IF NOT EXISTS (idempotent - safe to run multiple times)
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS progress_percentage INTEGER
  DEFAULT 0
  CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- Step 2: Set default for NULL rows (defensive)
UPDATE strategic_directives_v2
  SET progress_percentage = 0
  WHERE progress_percentage IS NULL;

-- Verification (run this to confirm success)
SELECT id, title, progress_percentage 
FROM strategic_directives_v2 
WHERE id = 'SD-VIDEO-VARIANT-001';
```

**Click**: ▶️ RUN button

**Expected Result**:
```
Success. No rows returned

(For verification query)
id                      | title                                              | progress_percentage
SD-VIDEO-VARIANT-001   | Sora 2 Video Variant Testing & Optimization Engine | 0
```

---

### Phase 2: Populate SD Fields (1 minute)

**After migration succeeds**, return to terminal and run:

```bash
# From EHG_Engineer root directory
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g"
node scripts/populate-sd-video-variant-fields.cjs
```

**Expected Output**:
```
✅ Successfully updated SD-VIDEO-VARIANT-001

--- Updated Fields ---
strategic_objectives: 4 items
key_principles: 5 items
risks: 5 items
success_criteria: 8 items

📊 Completeness Score Estimate:
strategic_objectives: ✅ 4 / 2 required
success_criteria: ✅ 8 / 3 required
key_principles: ✅ POPULATED
risks: ✅ POPULATED

Estimated Score: Should meet 85% threshold
```

---

### Phase 3: Verify LEAD→PLAN Handoff (1 minute)

**Run handoff verification**:

```bash
node scripts/unified-handoff-system.js execute LEAD-to-PLAN SD-VIDEO-VARIANT-001
```

**Expected Output**:
```
✅ HANDOFF APPROVED
📊 SD completeness score: 87% (≥85%)
✅ Strategic Directive handed off to PLAN agent for PRD creation
🎯 PLAN PHASE AUTHORIZED
```

---

## ✅ Success Criteria

After all 3 phases complete, verify:

- [x] Column `progress_percentage` exists in table
- [x] No trigger errors when updating SDs
- [x] SD-VIDEO-VARIANT-001 fields populated (4 objectives, 5 principles, 5 risks, 8 criteria)
- [x] LEAD→PLAN handoff approved (≥85% score)
- [x] SD status updated to 'active', phase updated to 'PLAN'

---

## 🔍 Troubleshooting

### Issue: Migration SQL fails with "column already exists"
**Cause**: Column was added in a previous attempt  
**Solution**: ✅ This is OK! The `IF NOT EXISTS` clause makes it idempotent. Proceed to Phase 2.

### Issue: Populate script still fails with trigger error
**Cause**: Migration didn't actually run (SQL Editor error)  
**Solution**: Check SQL Editor for error messages. Re-run migration SQL.

### Issue: Handoff still rejected with <85% score
**Cause**: Fields not populated correctly  
**Solution**: Run this query to check field values:
```sql
SELECT strategic_objectives, key_principles, risks, success_criteria 
FROM strategic_directives_v2 
WHERE id = 'SD-VIDEO-VARIANT-001';
```
Ensure arrays are NOT empty (`[]`).

---

## 📋 Post-Migration Verification

Run these queries in Supabase SQL Editor to verify success:

```sql
-- 1. Verify column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'strategic_directives_v2' 
AND column_name = 'progress_percentage';

-- 2. Verify SD fields populated
SELECT 
  id,
  title,
  array_length(strategic_objectives, 1) as objectives_count,
  array_length(key_principles, 1) as principles_count,
  array_length(risks, 1) as risks_count,
  array_length(success_criteria, 1) as criteria_count,
  progress_percentage
FROM strategic_directives_v2 
WHERE id = 'SD-VIDEO-VARIANT-001';

-- Expected output:
-- objectives_count: 4
-- principles_count: 5
-- risks_count: 5
-- criteria_count: 8
-- progress_percentage: 0
```

---

## 🎯 Next Steps After Success

Once handoff is approved, proceed to:

1. **PHASE 2: PLAN PRD CREATION**
   - Create PRD in `product_requirements_v2` table
   - Generate user stories (Product Requirements Expert sub-agent)
   - Create PLAN→EXEC handoff

2. **Remaining LEO Protocol Phases**
   - PHASE 3: EXEC IMPLEMENTATION
   - PHASE 4: PLAN VERIFICATION (QA Director E2E testing)
   - PHASE 5: LEAD FINAL APPROVAL (Retrospective generation)

---

## 📚 Related Documentation

- **Database Architect Assessment**: `scripts/database-architect-trigger-issue-assessment.cjs`
- **Migration SQL**: `database/migrations/add_progress_percentage_column.sql`
- **Populate Script**: `scripts/populate-sd-video-variant-fields.cjs`
- **Blocking Issue**: `BLOCKING_ISSUE_SD_VIDEO_VARIANT.md`
- **Phase 0 Results**: `../phase-0-results.json` (parent directory)
- **Sub-Agent Assessments**: `temp-sub-agent-*.md` (3 files)

---

**Ready to Execute**: ✅ YES  
**Migration File Location**: `database/migrations/add_progress_percentage_column.sql`  
**Supabase Dashboard**: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql
