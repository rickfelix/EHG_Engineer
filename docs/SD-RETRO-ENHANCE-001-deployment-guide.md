# SD-RETRO-ENHANCE-001 Deployment Guide
## Step-by-Step Instructions for Manual Deployment

**Status**: Migrations NOT YET DEPLOYED (verified 2025-10-16)
**Required Action**: Manual deployment via Supabase SQL Editor

---

## 📋 PRE-DEPLOYMENT CHECKLIST

- [ ] Supabase Dashboard access confirmed
- [ ] Service role key or appropriate permissions available
- [ ] Database backup created (recommended)
- [ ] Migration files verified and reviewed
- [ ] OpenAI API key configured in `.env` (for embeddings)

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Deploy Checkpoint 1 Migration

**File**: `database/migrations/20251016_enhance_retrospectives_multi_app_context.sql`

**What it does**:
- Adds 8 new columns to `retrospectives` table
- Creates 11 indexes (3 B-tree, 5 GIN, 2 constraints)
- Creates trigger function for auto-population
- Backfills 97 existing retrospectives with default values

**Instructions**:

1. **Open Supabase Dashboard**
   ```
   Navigate to: https://supabase.com/dashboard
   Select project: [Your EHG_Engineer project]
   ```

2. **Open SQL Editor**
   ```
   Click: SQL Editor (left sidebar)
   Click: "+ New query"
   ```

3. **Copy Migration Content**
   ```bash
   # From your local machine
   cat database/migrations/20251016_enhance_retrospectives_multi_app_context.sql
   ```
   - Copy entire contents (all 250 lines)
   - Paste into Supabase SQL Editor

4. **Review Migration**
   - Scroll through to verify it's the correct migration
   - Check for BEGIN and COMMIT statements
   - Verify verification queries at end

5. **Execute Migration**
   ```
   Click: "Run" button (or Ctrl+Enter)
   Wait: ~5-10 seconds for execution
   ```

6. **Verify Success**
   - Check for "Success" message
   - Look for verification notices:
     ```
     NOTICE: Migration verification passed: All 8 columns added successfully
     NOTICE: Enhanced trigger verified
     ```

7. **Confirm Deployment**
   ```bash
   # Run verification script
   node verify-migrations.js
   ```
   - Should show: `Checkpoint 1: ✅ DEPLOYED`

**Expected Output**:
```
BEGIN
ALTER TABLE
ALTER TABLE
... (multiple operations)
COMMIT
NOTICE: Migration verification passed: All 8 columns added successfully
```

**If Errors Occur**:
- Read error message carefully
- Check if columns already exist
- Review rollback instructions at end of migration file
- Contact database admin if needed

---

### Step 2: Deploy Checkpoint 2 Migration

**File**: `database/migrations/20251016_add_vector_search_embeddings.sql`

**What it does**:
- Enables pgvector extension
- Adds `content_embedding vector(1536)` column
- Creates IVFFlat index for vector search
- Creates `match_retrospectives()` RPC function
- Creates `get_retrospective_embedding_stats()` helper function

**Prerequisites**:
- ✅ Checkpoint 1 must be deployed first
- ⚠️  pgvector extension must be available in Supabase

**Instructions**:

1. **Verify pgvector Extension Available**
   ```sql
   -- Run this query first in SQL Editor
   SELECT * FROM pg_available_extensions WHERE name = 'vector';
   ```
   - If not available, contact Supabase support to enable pgvector

2. **Copy Migration Content**
   ```bash
   cat database/migrations/20251016_add_vector_search_embeddings.sql
   ```
   - Copy entire contents (all 250 lines)

3. **Execute Migration** (same process as Checkpoint 1)
   - Paste into SQL Editor
   - Review
   - Click "Run"
   - Wait for completion

4. **Verify Success**
   - Look for verification notices:
     ```
     NOTICE: pgvector extension verified
     NOTICE: content_embedding column verified
     NOTICE: IVFFlat index verified
     NOTICE: match_retrospectives() RPC function verified
     ```

5. **Test RPC Function**
   ```sql
   -- Test that RPC function exists and works
   SELECT * FROM get_retrospective_embedding_stats();
   ```
   - Expected: Returns stats showing 0% embedding coverage (embeddings not yet generated)

**Expected Output**:
```
CREATE EXTENSION
ALTER TABLE
CREATE INDEX
CREATE OR REPLACE FUNCTION
... (multiple operations)
NOTICE: All verifications passed
```

---

### Step 3: Deploy Checkpoint 3 Enforcement Migration

**File**: `database/migrations/20251016_retrospective_quality_enforcement_layers_1_2.sql`

**What it does**:
- Adds 5 database constraints (Layer 1)
- Enhances trigger function (Layer 2)
- Creates `validate_retrospective_quality()` helper function

**Prerequisites**:
- ✅ Checkpoint 1 and 2 must be deployed first

**Instructions**:

1. **Copy Migration Content**
   ```bash
   cat database/migrations/20251016_retrospective_quality_enforcement_layers_1_2.sql
   ```

2. **Execute Migration** (same process)
   - Paste into SQL Editor
   - Review constraints (they're strict!)
   - Click "Run"

3. **Verify Success**
   - Look for verification notices:
     ```
     NOTICE: All 5 database constraints verified
     NOTICE: Enhanced trigger verified
     NOTICE: Validation function verified
     ```

4. **Test Constraint Enforcement** (Optional)
   ```sql
   -- This SHOULD fail (testing constraint works)
   INSERT INTO retrospectives (
     title, status, target_application, learning_category,
     quality_score, key_learnings, action_items
   ) VALUES (
     'Test', 'PUBLISHED', 'EHG_engineer', 'APPLICATION_ISSUE',
     60, 'Test learning', 'Test action'
   );
   -- Expected: ERROR - quality_score must be >= 70
   ```

**Expected Output**:
```
ALTER TABLE (multiple times for constraints)
DROP TRIGGER
CREATE OR REPLACE FUNCTION
CREATE TRIGGER
CREATE OR REPLACE FUNCTION (validation helper)
NOTICE: All verifications passed
```

---

## 🧪 POST-DEPLOYMENT VERIFICATION

### Verify All Migrations Deployed

```bash
# Run verification script
node verify-migrations.js
```

**Expected Output**:
```
Checkpoint 1: ✅ DEPLOYED
Checkpoint 2: ✅ DEPLOYED
📊 SUMMARY
✅ All migrations deployed! Ready for backfill and embedding generation.
```

### Check Database State

```sql
-- Query 1: Verify all new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'retrospectives'
  AND column_name IN (
    'target_application', 'learning_category', 'applies_to_all_apps',
    'related_files', 'related_commits', 'related_prs',
    'affected_components', 'tags', 'content_embedding'
  )
ORDER BY column_name;

-- Expected: 9 rows returned

-- Query 2: Check retrospective count
SELECT COUNT(*) as total_retrospectives FROM retrospectives;

-- Expected: 97 (or current count)

-- Query 3: Check backfill status (Checkpoint 1)
SELECT
  COUNT(*) as total,
  COUNT(target_application) as with_target_app,
  COUNT(learning_category) as with_category
FROM retrospectives;

-- Expected: All 97 have target_application and learning_category

-- Query 4: Check embedding coverage (Checkpoint 2)
SELECT * FROM get_retrospective_embedding_stats();

-- Expected: 0% coverage initially (embeddings not yet generated)
```

---

## 📦 AUTOMATED SCRIPT EXECUTION

**Once all migrations are deployed**, proceed with automated scripts:

### Step 4: Test Backfill Script (Dry Run)

```bash
# Dry run - no database changes
node scripts/backfill-retrospective-enhancements.js --dry-run
```

**What to look for**:
- Field inference logic working correctly
- No errors during processing
- Reasonable values for learning_category, tags, etc.

**Expected Output**:
```
🔄 Retrospective Backfill Script
⚠️  DRY RUN MODE: No database changes will be made
Found X retrospective(s) to backfill

📦 Batch 1/Y
📝 Processing: [Title]
   Target Application: EHG_engineer
   Learning Category: [Inferred]
   ...
   🔍 DRY RUN: Would update retrospective

✅ All retrospectives already backfilled!
(Checkpoint 1 migration already backfills on deployment)
```

**Note**: Checkpoint 1 migration already backfills retrospectives with default values, so this script may find nothing to do. It's primarily useful for:
- Re-inferring learning categories if needed
- Populating code traceability arrays from existing content
- Future retrospectives after migration

### Step 5: Generate Embeddings

```bash
# Verify OpenAI API key is set
echo $OPENAI_API_KEY

# Generate embeddings for all PUBLISHED retrospectives
node scripts/generate-retrospective-embeddings.js
```

**What it does**:
- Generates OpenAI embeddings for PUBLISHED retrospectives
- Processes in batches of 5
- Estimates cost (~$0.01 for 97 retrospectives)
- Progress tracking with resume capability

**Expected Output**:
```
🚀 Retrospective Embedding Generation
Model: text-embedding-3-small
Batch Size: 5

Found X retrospective(s) to process

📦 Batch 1/Y
📝 Processing: [Title]
   Content length: XXX chars
   🔄 Generating query embedding...
   ✅ Embedding generated (X tokens)
   Tokens: X, Cost: $0.00XXXX
   ✅ Embedding stored successfully

📊 Final Summary
Total Processed: X
✅ Success: X
💰 Total Cost: $0.0X

📈 Embedding Coverage:
   Total Retrospectives: 97
   With Embeddings: X
   Coverage: XX%

✅ Embedding generation complete!
```

**If Errors Occur**:
- Check OpenAI API key is valid
- Check rate limits (3000 req/min)
- Script has retry logic (3 attempts)
- Progress file retained for resume

### Step 6: Verify Semantic Search

```bash
# Test semantic search with sample query
node scripts/automated-knowledge-retrieval.js <SD-UUID> "authentication problems"
```

**Replace `<SD-UUID>` with actual SD UUID** from database:
```sql
SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-RETRO-ENHANCE-001';
```

**Expected Output**:
```
🔍 Researching: "authentication problems"

   🔄 Generating query embedding...
   ✅ Embedding generated (X tokens)
   🎯 Semantic search: Y results in Zms

✅ Research complete: Y results
   Tokens consumed: X
   Execution time: Zms

📋 Research Results:
1. [Title] (local_semantic)
   Confidence: 95%
   Similarity: 0.XX
```

**Success Criteria**:
- Semantic search returns results (if embeddings generated)
- Confidence score = 95% for semantic matches
- Falls back to keyword search gracefully if needed

---

## 🎯 VALIDATION CHECKLIST

After all steps complete:

- [ ] **Checkpoint 1 deployed** - All 8 columns exist
- [ ] **Checkpoint 2 deployed** - content_embedding column exists
- [ ] **Checkpoint 3 deployed** - 5 constraints + enhanced trigger
- [ ] **RPC functions working** - match_retrospectives() callable
- [ ] **Trigger working** - PROCESS_IMPROVEMENT auto-sets applies_to_all_apps
- [ ] **Backfill complete** - All retrospectives have new fields
- [ ] **Embeddings generated** - All PUBLISHED have content_embedding
- [ ] **Semantic search working** - Returns relevant results
- [ ] **Cost tracking** - Total embedding cost logged (~$0.01)

---

## 🔧 TROUBLESHOOTING

### Issue: "pgvector extension not available"
**Solution**: Contact Supabase support to enable pgvector extension for your project

### Issue: "Column already exists"
**Solution**: Migration already partially deployed. Check with `node verify-migrations.js` and skip to next migration.

### Issue: "Constraint violation during migration"
**Solution**: Existing data violates new constraints. Review migration file, may need to adjust backfill logic.

### Issue: "OpenAI API rate limit exceeded"
**Solution**: Script has automatic retry. Wait and run again, or reduce batch size in script.

### Issue: "match_retrospectives() function does not exist"
**Solution**: Checkpoint 2 migration not deployed. Deploy it first.

---

## 📊 MONITORING

### Check Embedding Generation Progress

```sql
SELECT * FROM get_retrospective_embedding_stats();
```

### Check Cross-Application Learning

```sql
SELECT COUNT(*) FROM retrospectives WHERE applies_to_all_apps = TRUE;
```

### Check Semantic Search Performance

```sql
-- Test with sample embedding (from any retrospective)
SELECT * FROM match_retrospectives(
  query_embedding := (SELECT content_embedding FROM retrospectives WHERE content_embedding IS NOT NULL LIMIT 1),
  match_threshold := 0.7,
  match_count := 5
);
```

---

## ⚠️ ROLLBACK PROCEDURES

If issues occur, rollback instructions are at the end of each migration file.

**Checkpoint 1 Rollback**:
```sql
-- See: database/migrations/20251016_enhance_retrospectives_multi_app_context.sql
-- Lines 232-250
DROP TRIGGER IF EXISTS trigger_auto_populate_retrospective_fields ON retrospectives;
DROP FUNCTION IF EXISTS auto_populate_retrospective_fields();
-- ... (drop all indexes and columns)
```

**Checkpoint 2 Rollback**:
```sql
-- See: database/migrations/20251016_add_vector_search_embeddings.sql
DROP FUNCTION IF EXISTS get_retrospective_embedding_stats();
DROP FUNCTION IF EXISTS match_retrospectives(...);
DROP INDEX IF EXISTS idx_retrospectives_content_embedding_ivfflat;
ALTER TABLE retrospectives DROP COLUMN IF EXISTS content_embedding;
```

**Checkpoint 3 Rollback**:
```sql
-- See: database/migrations/20251016_retrospective_quality_enforcement_layers_1_2.sql
-- Drop all 5 constraints and validation function
```

---

## ✅ DEPLOYMENT COMPLETE

Once all steps are complete and validated:

1. **Update tracking**:
   ```sql
   UPDATE strategic_directives_v2
   SET progress = 100,
       status = 'completed'
   WHERE id = 'SD-RETRO-ENHANCE-001';
   ```

2. **Generate retrospective**:
   ```bash
   node scripts/generate-comprehensive-retrospective.js <SD-UUID>
   ```

3. **Create EXEC→PLAN handoff**:
   ```bash
   node scripts/unified-handoff-system.js execute EXEC-to-PLAN SD-RETRO-ENHANCE-001
   ```

---

**Status**: Ready for manual deployment
**Estimated Time**: 30-45 minutes (migrations + scripts)
**Cost**: ~$0.01 (OpenAI embeddings)

---

*Last Updated*: 2025-10-16
*SD*: SD-RETRO-ENHANCE-001
*Phase*: EXEC → Deployment
