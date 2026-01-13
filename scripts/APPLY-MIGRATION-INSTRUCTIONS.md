# Apply SD Testing Status Migration

**Quick Start**: Copy the entire SQL file and run it in Supabase SQL Editor.

---

## Step-by-Step Instructions

### 1. Open Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/editor

### 2. Create New Query

Click the **"+ New Query"** button in the left sidebar

### 3. Copy the SQL Script

Open the file:
```
scripts/apply-complete-sd-testing-migration.sql
```

Copy **ALL** contents (entire file, ~180 lines)

### 4. Paste into SQL Editor

Paste the entire script into the query editor

### 5. Run the Script

Click **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)

### 6. Verify Success

You should see:
```
Success. No rows returned
```

This is NORMAL and means the migration succeeded!

### 7. Verify the Migration

Run this command in your terminal:
```bash
node scripts/verify-sd-testing-status-migration.js
```

Expected output:
```
✅ Table EXISTS
✅ View EXISTS
✅ Insert successful
✅ Trigger auto-calculated priority
✅ MIGRATION VERIFIED SUCCESSFULLY!
```

---

## What Gets Created

This migration creates:

- ✅ **1 Table**: `sd_testing_status` (with 21 columns)
- ✅ **4 Indexes**: For performance optimization
- ✅ **3 Functions**:
  - `update_sd_testing_status_updated_at()`
  - `calculate_testing_priority()`
  - `auto_calculate_testing_priority()`
- ✅ **2 Triggers**: Auto-update timestamps and priorities
- ✅ **1 View**: `v_untested_sds` (work-down plan)
- ✅ **Permissions**: Granted to anon and authenticated roles
- ✅ **Comments**: Documentation for table, view, and functions

---

## After Migration

Once verified, you can use these tools:

### Query Untested SDs
```bash
node scripts/query-untested-sds.js
```

### Query Specific Filters
```bash
# Show all SDs (tested and untested)
node scripts/query-untested-sds.js --all

# Show only tested SDs
node scripts/query-untested-sds.js --tested-only

# Limit results
node scripts/query-untested-sds.js --limit=10

# Filter by priority
node scripts/query-untested-sds.js --priority=high

# Filter by application
node scripts/query-untested-sds.js --app=EHG
```

### Test a Specific SD
```bash
node scripts/qa-engineering-director-enhanced.js SD-RECONNECT-014
```

### Mark SD-TEST-001 Complete
Once migration is verified, run:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ status: 'completed', progress: 100 })
    .eq('id', 'SD-TEST-001');
  console.log(error ? 'Error:' + error.message : '✅ SD-TEST-001 marked complete!');
})();
"
```

---

## Troubleshooting

### "relation already exists"
✅ Safe to ignore - table already created. Verify with step 7.

### "permission denied"
❌ Ensure you're logged in as project owner/admin

### "does not exist" (for strategic_directives_v2)
❌ Wrong database - check you're in project dedlbzhpgkmetvhbkyzq

### Other errors
📧 Check error message carefully, may indicate:
- Missing parent table (strategic_directives_v2)
- RLS policies blocking creation
- Network/connection issues

---

## File Location

**SQL Script**: `./scripts/apply-complete-sd-testing-migration.sql`

**This File**: `./scripts/APPLY-MIGRATION-INSTRUCTIONS.md`

---

**Estimated Time**: 2 minutes
**SD**: SD-TEST-001
**Created**: 2025-10-05
