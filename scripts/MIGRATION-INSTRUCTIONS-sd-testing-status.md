# SD Testing Status Migration Instructions

**SD-TEST-001: Apply sd_testing_status migration**

## Manual Migration Required

The `sd_testing_status` table and related database objects need to be created via Supabase SQL Editor.

### Step-by-Step Instructions:

1. **Open Supabase SQL Editor**
   - URL: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/editor
   - Login with your Supabase credentials

2. **Create New Query**
   - Click "+ New Query" button in the left sidebar

3. **Copy Migration SQL**
   - Open file: `database/schema/sd_testing_status.sql`
   - Copy entire contents (154 lines)

4. **Paste and Execute**
   - Paste SQL into the editor
   - Click "Run" button (or Ctrl/Cmd + Enter)
   - Wait for confirmation message

5. **Verify Migration**
   - Run verification script:
     ```bash
     node scripts/verify-sd-testing-status-migration.js
     ```
   - Should show: "✅ Table EXISTS!" and "✅ View EXISTS!"

### What Gets Created:

- **Table**: `sd_testing_status` (tracks SD testing status)
- **View**: `v_untested_sds` (work-down plan query)
- **Functions**:
  - `calculate_testing_priority()` - Calculates priority score
  - `update_sd_testing_status_updated_at()` - Auto-updates timestamp
  - `auto_calculate_testing_priority()` - Auto-calculates priority on insert
- **Triggers**:
  - `trigger_update_sd_testing_status_updated_at` - Updates updated_at field
  - `trigger_auto_calculate_testing_priority` - Calculates testing_priority
- **Indexes**:
  - `idx_sd_testing_status_sd_id`
  - `idx_sd_testing_status_tested`
  - `idx_sd_testing_status_priority`
  - `idx_sd_testing_status_next_in_queue`

### Troubleshooting:

**Error: relation "strategic_directives_v2" does not exist**
- Ensure you're connected to the correct Supabase project (dedlbzhpgkmetvhbkyzq)
- Check that strategic_directives_v2 table exists

**Error: permission denied**
- Ensure you're logged in with admin/owner credentials
- Check RLS policies don't block creation

**Already exists errors**
- Safe to ignore if re-running migration
- Objects use `IF NOT EXISTS` and `OR REPLACE` clauses

### Post-Migration:

Once migration is applied:
1. Run `node scripts/query-untested-sds.js` to see untested SDs
2. Use `node scripts/qa-engineering-director-enhanced.js <SD-ID>` to test any SD
3. Check dashboard for testing status visualization (if implemented)

---

**Estimated Time**: 5 minutes
**Created**: 2025-10-05
**SD**: SD-TEST-001
