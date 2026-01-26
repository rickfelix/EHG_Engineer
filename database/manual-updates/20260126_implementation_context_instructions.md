# Implementation Context Migration

**Purpose**: Add `implementation_context` column to `strategic_directives_v2` to prevent LLM hallucination of irrelevant requirements.

**Status**: Ready to execute
**Created**: 2026-01-26
**Related SD**: SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001

## Problem Statement

When generating PRDs, LLMs hallucinate requirements that don't apply to the implementation context:
- **CLI tools** get WCAG 2.1 accessibility requirements
- **Database migrations** get responsive design requirements
- **Infrastructure** gets user journey requirements

**Solution**: Add `implementation_context` column with valid values: `cli`, `web`, `api`, `database`, `infrastructure`, `hybrid`.

## Files Created

1. **Migration SQL**: `database/migrations/20260126_add_implementation_context.sql` (2.4KB)
2. **Execution Script**: `scripts/execute-implementation-context-migration.js`
3. **Instructions**: This file

## Option 1: Execute via Node.js Script (Recommended)

### Prerequisites
Set database password in `.env`:
```bash
# Add to .env file:
SUPABASE_DB_PASSWORD=your-database-password-here

# Or:
EHG_DB_PASSWORD=your-database-password-here
```

Get password from: Supabase Dashboard > Project Settings > Database > Database Password

### Execute
```bash
node scripts/execute-implementation-context-migration.js
```

The script will:
1. ✅ Check if `implementation_context` column exists
2. ✅ Execute migration if needed
3. ✅ Add CHECK constraint
4. ✅ Update existing infrastructure/database SDs
5. ✅ Run verification queries
6. ✅ Display summary

## Option 2: Execute via Supabase Dashboard (Manual)

If you cannot set the database password in `.env`, execute manually:

### Steps

1. **Open Supabase Dashboard**:
   - Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
   - Navigate to: SQL Editor

2. **Copy SQL from**:
   - File: `database/migrations/20260126_add_implementation_context.sql`

3. **Execute the SQL**:
   - Paste into SQL Editor
   - Click "Run"

4. **Verify the migration**:
   ```sql
   -- Check column was added
   SELECT
     column_name,
     data_type,
     column_default,
     is_nullable
   FROM information_schema.columns
   WHERE table_name = 'strategic_directives_v2'
     AND column_name = 'implementation_context';
   ```

   **Expected Output**:
   ```
   column_name            | data_type | column_default | is_nullable
   -----------------------+-----------+----------------+-------------
   implementation_context | text      | 'web'::text    | YES
   ```

5. **Verify CHECK constraint**:
   ```sql
   -- Check constraint exists
   SELECT constraint_name, check_clause
   FROM information_schema.check_constraints
   WHERE constraint_name = 'valid_implementation_context';
   ```

   **Expected Output**:
   ```
   constraint_name              | check_clause
   -----------------------------+------------------------------------------------------------
   valid_implementation_context | (implementation_context IN ('cli', 'web', 'api', ...))
   ```

6. **Verify updated records**:
   ```sql
   -- Check infrastructure/database SDs were updated
   SELECT
     sd_type,
     implementation_context,
     COUNT(*) as count
   FROM strategic_directives_v2
   WHERE sd_type IN ('infrastructure', 'database')
   GROUP BY sd_type, implementation_context
   ORDER BY sd_type, implementation_context;
   ```

7. **Test the feature**:
   ```sql
   -- Should succeed (valid value)
   UPDATE strategic_directives_v2
   SET implementation_context = 'cli'
   WHERE sd_key = 'SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001';

   -- Should fail (invalid value)
   UPDATE strategic_directives_v2
   SET implementation_context = 'invalid'
   WHERE sd_key = 'SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001';
   -- Expected: ERROR: new row violates check constraint "valid_implementation_context"
   ```

## What the Migration Does

1. **Adds column**: `implementation_context TEXT DEFAULT 'web'`
2. **Adds CHECK constraint**: Valid values only (cli, web, api, database, infrastructure, hybrid)
3. **Adds comment**: Documents purpose and valid values
4. **Updates existing SDs**:
   - Infrastructure SDs → `implementation_context = 'infrastructure'`
   - Database SDs → `implementation_context = 'database'`
5. **Logs migration**: Records in `audit_log` table

## Valid Values

| Value | Use For | Example Requirements |
|-------|---------|---------------------|
| `cli` | Command-line tools | Input validation, error handling, exit codes |
| `web` | Web applications | WCAG 2.1, responsive design, user flows |
| `api` | REST/GraphQL APIs | OpenAPI spec, rate limiting, authentication |
| `database` | Schema migrations | Indexes, constraints, migration safety |
| `infrastructure` | DevOps/CI/CD | Observability, deployment strategy, rollback |
| `hybrid` | Multi-context SDs | Context-aware requirements |

## Safety Considerations

- **Idempotent**: Uses `ADD COLUMN IF NOT EXISTS`
- **Backward compatible**: DEFAULT 'web' prevents NULL values
- **Non-breaking**: Existing code continues to work
- **Constraint validation**: Prevents invalid values at database level

## Verification Checklist

After migration, verify:

- [ ] `implementation_context` column exists
- [ ] Column default is `'web'::text`
- [ ] CHECK constraint `valid_implementation_context` exists
- [ ] Constraint allows: cli, web, api, database, infrastructure, hybrid
- [ ] Existing infrastructure SDs have `implementation_context = 'infrastructure'`
- [ ] Existing database SDs have `implementation_context = 'database'`
- [ ] Migration logged in `audit_log` table

## Post-Migration Test

```sql
-- Test 1: Default value works
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, sd_type, version, created_at, updated_at
) VALUES (
  'test-sd-001',
  'TEST-001',
  'Test SD',
  'lead_pending_approval',
  'feature',
  1,
  NOW(),
  NOW()
);

SELECT implementation_context FROM strategic_directives_v2 WHERE sd_key = 'TEST-001';
-- Expected: 'web'

-- Test 2: Valid value accepted
UPDATE strategic_directives_v2
SET implementation_context = 'cli'
WHERE sd_key = 'TEST-001';
-- Expected: Success

-- Test 3: Invalid value rejected
UPDATE strategic_directives_v2
SET implementation_context = 'mobile'
WHERE sd_key = 'TEST-001';
-- Expected: ERROR: new row violates check constraint "valid_implementation_context"

-- Cleanup
DELETE FROM strategic_directives_v2 WHERE sd_key = 'TEST-001';
```

## Impact on PRD Generation

### Before Migration
```javascript
// PRD for CLI tool would include:
- WCAG 2.1 Level AA compliance ❌
- Responsive design for mobile devices ❌
- User authentication flows ❌
```

### After Migration
```javascript
// PRD for CLI tool (implementation_context='cli') includes:
- Input validation and error handling ✅
- Help text and usage examples ✅
- Exit codes and status reporting ✅
- Command-line argument parsing ✅
```

## Integration Points

1. **PRD Generator**: `scripts/prd-generator.js`
   - Reads `implementation_context` from SD
   - Filters requirements based on context
   - Prevents hallucination of irrelevant requirements

2. **SD Creator**: `scripts/create-sd.js`
   - Prompts for implementation context
   - Validates against allowed values
   - Defaults to 'web' if not specified

3. **Schema Docs**: Auto-updated when running `npm run schema:docs:all`

## Related Issues

- **User Story**: US-001 - SD Creator specifies implementation context
- **Parent SD**: SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001
- **Pattern**: PAT-PRD-001 - Context-aware requirement generation

## Next Steps

After migration completes:

1. ✅ Test PRD generation with different contexts
2. ✅ Update SD creation prompts to ask for context
3. ✅ Regenerate schema docs: `npm run schema:docs:all`
4. ✅ Update PRD generator to use context field
5. ✅ Document in user guide for SD creators

## Rollback (if needed)

```sql
-- Remove column (will drop CHECK constraint automatically)
ALTER TABLE strategic_directives_v2
DROP COLUMN IF EXISTS implementation_context;

-- Remove audit log entry
DELETE FROM audit_log
WHERE entity_id = 'strategic_directives_v2.implementation_context'
  AND event_type = 'MIGRATION_APPLIED';
```

**⚠️ Warning**: Rollback will lose all `implementation_context` data. Only rollback if migration causes critical issues.

## Questions?

If migration fails or you encounter issues:
1. Check Supabase logs for detailed error messages
2. Verify database password is correct (if using Node.js script)
3. Ensure you have sufficient permissions
4. Verify SQL syntax in migration file
5. Check for conflicting constraints or column names

## Success Criteria

Migration is successful when:
- ✅ Column added without errors
- ✅ CHECK constraint enforces valid values
- ✅ Existing infrastructure/database SDs updated
- ✅ Migration logged to audit_log
- ✅ PRD generator can read and use the field
- ✅ New SDs can specify context during creation
