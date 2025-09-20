# Supabase Database Migration Instructions

## UI Validation Schema Setup

To create the UI validation tables in your Supabase database, follow these steps:

### Step 1: Access Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
2. Navigate to the **SQL Editor** tab

### Step 2: Execute Migration

1. Open the SQL Editor
2. Copy the contents of: `supabase/migrations/008_ui_validation_schema.sql`
3. Paste into the SQL Editor
4. Click **Run** button

### Step 3: Verify Tables Created

After running the migration, verify these tables exist:

- [ ] `ui_validation_results`
- [ ] `prd_ui_mappings`
- [ ] `validation_evidence`
- [ ] `ui_validation_checkpoints`
- [ ] `ui_validation_summary` (view)

### Step 4: Verify Validation Rules

Check that validation rules were inserted into `leo_validation_rules`:

```sql
SELECT * FROM leo_validation_rules 
WHERE rule_code IN (
  'UI_REQUIRES_TESTING',
  'SCREENSHOT_EVIDENCE',
  'DESIGN_NEEDS_VERIFICATION',
  'PRD_UI_GAP_CHECK',
  'VISUAL_REGRESSION'
);
```

### Alternative: Using Supabase CLI (if you have direct DB access)

If you have the database connection string:

```bash
# Set the DATABASE_URL environment variable
export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.dedlbzhpgkmetvhbkyzq.supabase.co:5432/postgres"

# Run migration
psql $DATABASE_URL -f supabase/migrations/008_ui_validation_schema.sql
```

### Testing the Setup

Once tables are created, test with:

```bash
# Test PRD UI validation
node lib/testing/prd-ui-validator.js --prd=PRD-1756934172732 --headless

# Test enhanced Testing Sub-Agent
node lib/testing/testing-sub-agent.js --headless
```

## Connection Details

- **Project URL**: https://dedlbzhpgkmetvhbkyzq.supabase.co
- **Project ID**: dedlbzhpgkmetvhbkyzq
- **Region**: (check your Supabase dashboard)

## Troubleshooting

If tables aren't created:
1. Check for SQL syntax errors in the output
2. Ensure you have proper permissions
3. Try creating tables one at a time
4. Check if table names conflict with existing tables

## Files Created

1. `/database/migrations/008_ui_validation_schema.sql` - Original migration
2. `/supabase/migrations/008_ui_validation_schema.sql` - Copy for Supabase
3. `/lib/testing/prd-ui-validator.js` - PRD validation module
4. `/scripts/apply-ui-validation-schema.js` - Application script

## Next Steps

After tables are created:
1. Run PRD validation to detect UI gaps
2. Integrate with Testing Sub-Agent
3. Enforce validation rules in workflow
4. Generate gap reports for missing UI implementations