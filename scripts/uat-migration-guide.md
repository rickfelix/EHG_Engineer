# UAT Migration Guide

## Quick Setup (Via Supabase Dashboard)

Since we only have the anon key (not service role), you need to run the migration through the Supabase Dashboard:

### Step 1: Open Supabase Dashboard

1. Go to: [https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq](https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq)
2. Sign in with your Supabase account

### Step 2: Navigate to SQL Editor

1. In the left sidebar, click on **SQL Editor**
2. Click on **New Query**

### Step 3: Run the Migration

1. Open the file: `/mnt/c/_EHG/EHG_Engineer/database/migrations/uat-simple-tracking.sql`
2. Copy the **entire contents** of the file
3. Paste into the SQL Editor
4. Click the **Run** button (or press Ctrl+Enter)

### Step 4: Verify Success

You should see:
- ✅ "Success. No rows returned" for table creation
- ✅ "61 rows inserted" for test case seeding

If you see any errors:
- The tables might already exist (that's OK!)
- Check if you see "relation already exists" - this means tables are already there

### Step 5: Verify Tables Were Created

Run this query in the SQL Editor to verify:

```sql
-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'uat%'
ORDER BY table_name;
```

You should see:
- uat_cases
- uat_defects
- uat_results
- uat_runs

### Step 6: Verify Test Cases

Run this query to check test cases were seeded:

```sql
-- Count test cases
SELECT COUNT(*) as total_cases FROM uat_cases;

-- View some test cases
SELECT * FROM uat_cases LIMIT 10;
```

You should see **61 test cases** total.

## Alternative: Using DATABASE_URL (If Available)

If you have the DATABASE_URL from Supabase:

1. Get it from: Dashboard → Settings → Database → Connection String
2. Add to `.env`:
   ```
   DATABASE_URL=postgresql://postgres.[project-ref]:[password]@[host]:5432/postgres
   ```
3. Run:
   ```bash
   psql $DATABASE_URL -f database/migrations/uat-simple-tracking.sql
   ```

## Troubleshooting

### "Permission denied" errors
- You need service_role key or use the Dashboard method

### "Relation already exists" errors
- Tables are already created - this is fine!
- Check if test cases exist with the verification queries above

### "RPC function does not exist" errors
- The `execute_sql` RPC is not set up
- Use the Dashboard method instead

## Next Steps

Once tables are created:

1. **Start UAT Lead** to create a new run:
   ```bash
   npm run compile:uat
   node dist/scripts/uat-lead.js
   ```

2. **Start UAT Wizard** to execute tests:
   ```bash
   export UAT_RUN_ID=<run-id-from-lead>
   node dist/scripts/uat-wizard.js
   ```

3. **View Dashboard** at:
   ```
   http://localhost:3000/uat-dashboard
   ```