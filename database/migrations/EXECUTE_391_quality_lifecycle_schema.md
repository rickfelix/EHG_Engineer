# Manual Execution: Quality Lifecycle Schema Migration

**Migration File**: `391_quality_lifecycle_schema.sql`
**SD Context**: SD-QUALITY-DB-001
**Status**: Ready for manual execution
**Database**: dedlbzhpgkmetvhbkyzq (CONSOLIDATED)

## Blocker

The migration script requires `SUPABASE_POOLER_URL` environment variable to be configured for programmatic execution. Rather than attempting workarounds or incomplete setup, this migration should be executed manually via the Supabase Dashboard SQL Editor, which has elevated privileges.

## Manual Execution Steps

### Option 1: Supabase Dashboard SQL Editor (Recommended)

1. Navigate to [Supabase Dashboard](https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new)
2. Copy the entire contents of `database/migrations/391_quality_lifecycle_schema.sql`
3. Paste into the SQL Editor
4. Click "Run" to execute all statements
5. Verify completion by checking:
   - Tables created: `feedback`, `releases`, `feedback_sd_map`
   - Column added: `strategic_directives_v2.target_release_id`
   - Indexes created (14 total)
   - RLS policies enabled

### Option 2: Configure Pooler URL (For Future Migrations)

If you want to enable programmatic migrations, add to `.env`:

```bash
# Get password from Supabase Dashboard > Settings > Database
SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Then execute:
```bash
node scripts/apply-quality-lifecycle-migration.js
```

## Verification Queries

After manual execution, run these in SQL Editor to verify:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('feedback', 'releases', 'feedback_sd_map')
ORDER BY table_name;

-- Check indexes on feedback
SELECT indexname
FROM pg_indexes
WHERE tablename = 'feedback'
ORDER BY indexname;

-- Check strategic_directives_v2 has target_release_id
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
  AND column_name = 'target_release_id';

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('feedback', 'releases')
ORDER BY tablename;
```

## Expected Results

### Tables Created
- `feedback` (unified issues + enhancements with type discriminator)
- `releases` (release planning per venture)
- `feedback_sd_map` (many-to-many junction table)

### Indexes Created (14 total)
**feedback table (12 indexes)**:
- `idx_feedback_type`
- `idx_feedback_source_app`
- `idx_feedback_source_type`
- `idx_feedback_status`
- `idx_feedback_sd_id`
- `idx_feedback_error_hash` (partial: WHERE error_hash IS NOT NULL)
- `idx_feedback_severity` (partial: WHERE type = 'issue')
- `idx_feedback_priority`
- `idx_feedback_snoozed` (partial: WHERE snoozed_until IS NOT NULL)
- `idx_feedback_created_at`
- `idx_feedback_value` (partial: WHERE type = 'enhancement')
- `idx_feedback_issues` (partial: WHERE type = 'issue')
- `idx_feedback_enhancements` (partial: WHERE type = 'enhancement')

**releases table (3 indexes)**:
- `idx_releases_venture`
- `idx_releases_status`
- `idx_releases_target`

**strategic_directives_v2 (1 index)**:
- `idx_sd_release`

### RLS Policies
- `feedback`: authenticated SELECT, service_role ALL
- `releases`: authenticated SELECT, service_role ALL

### Triggers
- `feedback`: update_updated_at trigger
- `releases`: update_updated_at trigger

## Completion Path

This migration is marked **CONDITIONAL_PASS**:
- ✅ Migration SQL file created and validated
- ✅ Follows established patterns (idempotent, RLS-safe)
- ⚠️ Requires manual execution via Supabase Dashboard
- ⚠️ Missing: SUPABASE_POOLER_URL environment configuration

**Next Steps**:
1. User executes migration via Supabase Dashboard SQL Editor
2. User runs verification queries to confirm success
3. User reports back completion status
4. Database agent can then mark SD-QUALITY-DB-001 as PASS

## Pattern Reference

This follows the **documented blocker + manual workaround** pattern from:
- **SD-GTM-INTEL-DISCOVERY-001**: RLS blocked INSERT, provided SQL for manual execution
- **Database Agent Guidelines**: "Document blockers instead of workarounds"
