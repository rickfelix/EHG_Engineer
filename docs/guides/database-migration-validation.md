# Database Migration Validation Guide

## Overview

**Problem Addressed**: SD-AGENT-PLATFORM-001 taught us that migration files can exist and be applied successfully, but seed data can fail silently, leaving empty tables.

**Solution**: Two-phase validation that checks BOTH migration files AND live database state.

---

## The SD-AGENT-PLATFORM-001 Pattern

### What Happened
1. ✅ Migration file `20251008000000_agent_platform_schema.sql` existed
2. ✅ Migration was applied (tables created successfully)
3. ❌ Seed data section failed silently
4. ❌ Result: 0 records in all tables (ai_ceo_agents, agent_departments, crewai_agents, etc.)

### Why It Was Bad
- UI showed "No Agents Deployed" (user assumed bug in UI)
- Spent 45 minutes investigating before discovering empty tables
- Migration appeared successful in Supabase dashboard
- No errors or warnings - silent failure

### How This Script Prevents It

**Old Validation** (File-only):
```bash
node validate-migration-files.js AGENT-PLATFORM-001
# Result: "VALID - migration file exists and syntax correct"
# ❌ Did NOT catch empty tables!
```

**New Validation** (File + Database):
```bash
node validate-migration-files.js AGENT-PLATFORM-001 --verify-db --check-seed-data
# Result: "SEED_DATA_MISSING - Tables exist but 0 rows"
# ✅ CAUGHT THE ISSUE!
```

---

## Validation Script: `validate-migration-files.js`

### Phase 1: Static File Validation (Always Runs)

**Checks**:
- ✅ Migration files exist for SD-ID
- ✅ SQL syntax is valid
- ✅ Required patterns present (CREATE TABLE, ALTER TABLE, etc.)
- ✅ PRD mentions database changes
- ✅ SD reference in comments

**Verdict**: `VALID`, `INVALID`, `INCOMPLETE`, or `NOT_REQUIRED`

### Phase 2: Database Verification (Optional)

**Enabled with**: `--verify-db` flag

**Checks**:
- ✅ Tables mentioned in migration actually exist in database
- ✅ Tables are accessible (RLS policies allow access)
- ✅ Expected columns present
- ✅ Seed data was inserted (with `--check-seed-data`)

**Verdict**: `DB_MISMATCH`, `DB_ACCESS_ISSUE`, `SEED_DATA_MISSING`, or `VALID`

---

## Usage Examples

### Basic Validation (File-only)
```bash
node scripts/validate-migration-files.js RECONNECT-014
```
**Use when**: Creating PRD, checking syntax before commit

### Full Validation (File + Database)
```bash
node scripts/validate-migration-files.js RECONNECT-014 --verify-db
```
**Use when**: EXEC→PLAN handoff, verifying migration was applied

### Comprehensive Check (File + Database + Seed Data)
```bash
node scripts/validate-migration-files.js AGENT-PLATFORM-001 --verify-db --check-seed-data
```
**Use when**: Seed data is critical to functionality (agent platform, user roles, config)

### Check Different Database
```bash
# Default: EHG application (liapbndqlqxdcgpwntbv)
node scripts/validate-migration-files.js NAV-REFACTOR-001 --verify-db

# Override: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
node scripts/validate-migration-files.js NAV-REFACTOR-001 --verify-db --db=ENGINEER
```

---

## Verdicts Explained

| Verdict | Meaning | Action Required |
|---------|---------|-----------------|
| **NOT_REQUIRED** | No database changes in PRD | None - proceed normally |
| **VALID** | All checks passed | Proceed to next phase |
| **VALID_WITH_WARNINGS** | Passed but has warnings | Review warnings, decide if acceptable |
| **INCOMPLETE** | Migration files missing | Create migration files before EXEC→PLAN |
| **INVALID** | Syntax errors in SQL | Fix SQL syntax errors |
| **DB_MISMATCH** | Files valid but tables missing | Apply migration: `supabase db push` |
| **DB_ACCESS_ISSUE** | Tables exist but not accessible | Fix RLS policies |
| **SEED_DATA_MISSING** | Tables exist but empty | Re-run seed data script |

---

## Integration with LEO Protocol

### PLAN Agent Pre-EXEC Checklist

Before creating PLAN→EXEC handoff:
```bash
# Validate migration files exist
node scripts/validate-migration-files.js <SD-ID>

# Verdict must be: VALID, VALID_WITH_WARNINGS, or NOT_REQUIRED
```

### EXEC Agent Pre-Handoff Checklist

Before creating EXEC→PLAN handoff:
```bash
# Verify migrations were applied
node scripts/validate-migration-files.js <SD-ID> --verify-db --check-seed-data

# Verdict must be: VALID or NOT_REQUIRED
# BLOCKED if: DB_MISMATCH, DB_ACCESS_ISSUE, SEED_DATA_MISSING
```

### Database Architect Sub-Agent Trigger

**Automatic Trigger**: `EXEC_IMPLEMENTATION_COMPLETE`

**Sub-Agent Actions**:
1. Run `validate-migration-files.js <SD-ID> --verify-db --check-seed-data`
2. Store results in `sub_agent_execution_results` table
3. PASS verdict: VALID or NOT_REQUIRED
4. FAIL verdict: Any other verdict
5. Provide recommendations if BLOCKED

---

## Example Output

### Phase 1: File Validation
```
============================================================
Migration Validation for SD-AGENT-PLATFORM-001
============================================================

VALIDATION MODE:
  Phase 1: Static file validation (always)
  Phase 2: Database verification (enabled)
  Target DB: EHG
  Seed Data Check: enabled

=== PHASE 1: STATIC FILE VALIDATION ===

Step 1: Checking PRD for database requirements...
✅ Database changes detected in PRD
   Keywords found: table, schema, database, supabase

Step 2: Searching for migration files...
✅ Found 1 migration file(s):
   - 20251008000000_agent_platform_schema.sql

Step 3: Validating migration files...

Validating: 20251008000000_agent_platform_schema.sql
  ✅ Syntax valid (42 statements)
  📋 Tables referenced: ai_ceo_agents, agent_departments, crewai_agents, crewai_crews, crew_members, agent_tools
  ⚠️  Warnings:
     - No SD reference in comments (makes tracking difficult)

Phase 1 Result: VALID_WITH_WARNINGS
```

### Phase 2: Database Verification
```
=== PHASE 2: DATABASE VERIFICATION ===

Step 4: Verifying tables exist in EHG database...

Database verification complete:

  ✅ ai_ceo_agents - EXISTS and ACCESSIBLE
  ✅ agent_departments - EXISTS and ACCESSIBLE
  ✅ crewai_agents - EXISTS and ACCESSIBLE
  ✅ crewai_crews - EXISTS and ACCESSIBLE
  ✅ crew_members - EXISTS and ACCESSIBLE
  ✅ agent_tools - EXISTS and ACCESSIBLE

Step 5: Checking seed data...

Seed data verification:

  ⚠️  ai_ceo_agents - 0 rows (EMPTY - seed data may have failed)
  ⚠️  agent_departments - 0 rows (EMPTY - seed data may have failed)
  ⚠️  crewai_agents - 0 rows (EMPTY - seed data may have failed)
  ⚠️  crewai_crews - 0 rows (EMPTY - seed data may have failed)
  ⚠️  crew_members - 0 rows (EMPTY - seed data may have failed)
  ⚠️  agent_tools - 0 rows (EMPTY - seed data may have failed)

⚠️  WARNING: 6 table(s) have no data:
   ai_ceo_agents, agent_departments, crewai_agents, crewai_crews, crew_members, agent_tools
   This matches the SD-AGENT-PLATFORM-001 pattern:
   - Migration exists ✓
   - Tables created ✓
   - Seed data missing ✗
```

### Final Verdict
```
============================================================
FINAL VERDICT
============================================================

Verdict: SEED_DATA_MISSING
Reason: Tables exist but seed data was not inserted (silent failure)
============================================================
```

---

## Troubleshooting

### "Missing EHG Supabase credentials"
**Cause**: Environment variables not set
**Fix**: Ensure `EHG_SUPABASE_URL` and `EHG_SUPABASE_ANON_KEY` are in `.env`

### "relation does not exist"
**Cause**: Migration not applied or wrong database
**Fix**:
```bash
# Check which database you're targeting
echo $EHG_SUPABASE_URL
# Apply migration
cd /mnt/c/_EHG/EHG && supabase db push
```

### "schema cache error"
**Cause**: RLS policies blocking access
**Fix**: Add anon policies or use authenticated client

### "SEED_DATA_MISSING but seed data should exist"
**Possible causes**:
1. Seed data in migration failed with `ON CONFLICT DO NOTHING` (duplicate keys)
2. Transaction rolled back after table creation but before seed data
3. RLS policies blocked INSERT during migration
4. Seed data removed from migration file before it was applied

**Fix**: Re-run seed data separately:
```bash
# Extract seed data from migration
grep -A 100 "INSERT INTO" migration.sql > seed.sql
# Apply seed data
psql $DATABASE_URL -f seed.sql
```

---

## Best Practices

### 1. Always Add SD Reference in Comments
```sql
-- SD-AGENT-PLATFORM-001: Agent platform schema and seed data
CREATE TABLE ai_ceo_agents (...);
```

### 2. Separate Schema from Seed Data
```sql
-- Schema changes (required)
CREATE TABLE agent_departments (...);

-- Seed data (optional but recommended)
INSERT INTO agent_departments VALUES (...);
```

### 3. Use Idempotent Operations
```sql
-- Safe to re-run
CREATE TABLE IF NOT EXISTS agent_departments (...);
INSERT INTO agent_departments (...) ON CONFLICT (department_name) DO NOTHING;
```

### 4. Validate Before and After
```bash
# Before migration
node scripts/validate-migration-files.js <SD-ID>

# Apply migration
supabase db push

# After migration
node scripts/validate-migration-files.js <SD-ID> --verify-db --check-seed-data
```

### 5. Document Expected Row Counts
```sql
-- Expected: 11 departments, 8 tools
INSERT INTO agent_departments (...);  -- Should create 11 rows
INSERT INTO agent_tools (...);        -- Should create 8 rows
```

---

## CLAUDE.md Integration

This validation check should be added to:
1. **PLAN Agent Pre-EXEC Checklist** (file validation)
2. **EXEC Agent Pre-Handoff Checklist** (database verification)
3. **Database Architect Sub-Agent** (automatic trigger)

See: `CLAUDE.md` section "Database Migration Validation"

---

**Last Updated**: 2025-10-10
**Related**: AGENT_DATA_INVESTIGATION_REPORT.md, SD-AGENT-PLATFORM-001
