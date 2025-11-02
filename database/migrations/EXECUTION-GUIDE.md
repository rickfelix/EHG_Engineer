# Quick Execution Guide: Idempotent Migration

## TL;DR - Run This Now

```bash
# Navigate to project root
cd /mnt/c/_EHG/EHG_Engineer

# Execute the idempotent migration
psql <your_connection_string> -f database/migrations/sd-agent-admin-003-comprehensive-migration-IDEMPOTENT.sql
```

---

## What This Does

1. Fixes the `strategic_directives_v2` trigger (NEW.phase → NEW.current_phase)
2. Creates 4 missing tables (ab_test_results, search_preferences, agent_executions, performance_alerts)
3. Inserts 28 seed records into 6 tables
4. Updates RLS policies for 7 tables
5. Validates everything with built-in queries

**Key Improvement**: 100% idempotent - can run multiple times safely without errors.

---

## Files You Need

### Required
- **`sd-agent-admin-003-comprehensive-migration-IDEMPOTENT.sql`** - The fixed migration

### Optional (Recommended)
- **`PRE-MIGRATION-VERIFICATION.sql`** - Check current state before running
- **`ROOT-CAUSE-ANALYSIS-TRIGGER-ERROR.md`** - Full technical analysis

---

## Step-by-Step Execution

### Step 1: Pre-Flight Check (Optional)
```bash
psql <connection_string> -f database/migrations/PRE-MIGRATION-VERIFICATION.sql
```

**What to Look For**:
- List of existing tables
- List of existing triggers
- List of existing policies

**Interpretation**:
- If tables/triggers/policies exist: Migration will drop and recreate them (safe)
- If nothing exists: Migration will create everything fresh

### Step 2: Execute Migration
```bash
psql <connection_string> -f database/migrations/sd-agent-admin-003-comprehensive-migration-IDEMPOTENT.sql
```

**Expected Duration**: 5-10 seconds

**Expected Output**:
```
BEGIN
DROP TRIGGER
CREATE FUNCTION
CREATE TRIGGER
CREATE TABLE
CREATE INDEX
... (many similar lines)
INSERT 0 11
INSERT 0 8
INSERT 0 4
INSERT 0 1
INSERT 0 4
CREATE POLICY
... (more policies)
COMMIT

-- Then verification query results:
 table_name          | record_count
---------------------+--------------
 agent_departments   |           11
 agent_tools         |            8
 crewai_agents       |            4
 crewai_crews        |            1
 crew_members        |            4
```

### Step 3: Verify Success

**Check 1**: No errors in output
- ✅ Should see `COMMIT` at the end
- ❌ If you see `ROLLBACK`, something failed (check error message)

**Check 2**: Seed data counts
- agent_departments: 11 records
- agent_tools: 8 records
- crewai_agents: 4 records
- crewai_crews: 1 record
- crew_members: 4 records

**Check 3**: New tables exist
```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('ab_test_results', 'search_preferences', 'agent_executions', 'performance_alerts');
```

**Expected**: 4 rows returned

### Step 4: Test Idempotency (Optional)
```bash
# Run migration again - should succeed without errors
psql <connection_string> -f database/migrations/sd-agent-admin-003-comprehensive-migration-IDEMPOTENT.sql
```

**Expected**: Same output, no errors, same verification results

---

## Connection String Format

### Supabase Direct Connection
```
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

### Supabase Pooler Connection
```
postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**Replace**:
- `[PASSWORD]`: Your database password
- `[PROJECT_REF]`: Your Supabase project reference ID

**Example**:
```bash
psql postgresql://postgres:MyPassword123@db.abcdefghijklmnop.supabase.co:5432/postgres \
  -f database/migrations/sd-agent-admin-003-comprehensive-migration-IDEMPOTENT.sql
```

---

## Troubleshooting

### Error: "connection to server failed"
**Solution**: Check connection string format and network connectivity

### Error: "FATAL: password authentication failed"
**Solution**: Verify password in connection string

### Error: "permission denied for table"
**Solution**: Use postgres role or service_role connection string

### Error: "relation does not exist"
**Solution**: Check if prerequisite tables exist (prompt_ab_tests, auth.users)

### Migration runs but verification shows 0 records
**Possible Causes**:
- Seed data conflicts with existing records (expected - `ON CONFLICT DO NOTHING` will skip)
- Check if records already exist: `SELECT COUNT(*) FROM crewai_agents;`

---

## What Changed from Original

### Original Migration Issues
❌ Used `CREATE TRIGGER` without existence check
❌ Used `CREATE POLICY` without existence check
❌ Would fail on re-run with error 42710

### Idempotent Migration Fixes
✅ Uses `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`
✅ Uses `DROP POLICY IF EXISTS` before `CREATE POLICY`
✅ Uses `DROP FUNCTION IF EXISTS` before `CREATE FUNCTION`
✅ Can run multiple times safely
✅ Transaction-wrapped for atomicity

---

## Safety Guarantees

### What Won't Be Lost
- ✅ Existing table data
- ✅ Existing seed records (ON CONFLICT DO NOTHING)
- ✅ Existing indexes

### What Gets Recreated
- 🔄 Triggers (dropped and recreated)
- 🔄 Policies (dropped and recreated)
- 🔄 Functions (replaced with CREATE OR REPLACE)

### Transaction Safety
- If ANY statement fails → entire migration rolls back
- Database returns to exact pre-migration state
- No partial changes left behind

---

## Post-Execution Checklist

- [ ] Migration completed without errors
- [ ] Saw `COMMIT` at end of output
- [ ] Verification queries show expected counts
- [ ] agent_departments: 11 records
- [ ] agent_tools: 8 records
- [ ] crewai_agents: 4 records
- [ ] crewai_crews: 1 record
- [ ] crew_members: 4 records
- [ ] 4 new tables exist
- [ ] 13 RLS policies active
- [ ] Optional: Re-ran migration successfully

---

## Quick Reference: Key Commands

```bash
# 1. Check current state (optional)
psql <connection> -f database/migrations/PRE-MIGRATION-VERIFICATION.sql

# 2. Run migration
psql <connection> -f database/migrations/sd-agent-admin-003-comprehensive-migration-IDEMPOTENT.sql

# 3. Test idempotency (optional)
psql <connection> -f database/migrations/sd-agent-admin-003-comprehensive-migration-IDEMPOTENT.sql

# 4. Check seed data manually
psql <connection> -c "SELECT COUNT(*) FROM crewai_agents;"

# 5. Check policies manually
psql <connection> -c "SELECT tablename, COUNT(*) as policy_count FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'crewai_%' GROUP BY tablename;"
```

---

## Next Steps After Success

1. Archive original migration file (if desired)
2. Update any documentation referencing the migration
3. Test application functionality with new tables/policies
4. Monitor for any RLS access issues
5. Consider running same migration in test environment first (if not already done)

---

## Support

**For detailed technical analysis**: See `ROOT-CAUSE-ANALYSIS-TRIGGER-ERROR.md`

**For migration source code**: See `sd-agent-admin-003-comprehensive-migration-IDEMPOTENT.sql`

**For pre-migration checks**: See `PRE-MIGRATION-VERIFICATION.sql`
