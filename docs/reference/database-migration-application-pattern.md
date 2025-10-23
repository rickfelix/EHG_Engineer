# Database Migration Application Pattern

**Last Updated**: 2025-10-23
**Lesson Source**: SD-VWC-PHASE4-001 Checkpoint 1
**Root Cause**: Database sub-agent incorrectly stated manual application required

---

## ✅ CORRECT Pattern: Programmatic Migration Application

**Established Pattern**: Use `createDatabaseClient` + direct PostgreSQL execution

### Working Example (50+ scripts in repository):
```javascript
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';

async function runMigration() {
  const client = await createDatabaseClient('ehg', {
    verify: true,
    verbose: true
  });

  const statements = splitPostgreSQLStatements(sqlContent);

  for (const stmt of statements) {
    await client.query(stmt);
  }

  // Verify table/indexes/RLS
  await client.end();
}
```

### Requirements:
1. ✅ `SUPABASE_DB_PASSWORD` environment variable
2. ✅ `pg` npm package (already installed)
3. ✅ `scripts/lib/supabase-connection.js` utility (exists)

### Recent Success Examples:
- `scripts/run-intelligence-migration.js` (Oct 17, 2025)
- `scripts/run-wizard-analytics-migration.js` (Oct 23, 2025)
- 48 other migration scripts in `/mnt/c/_EHG/ehg/scripts/`

---

## ❌ INCORRECT Pattern: Manual Dashboard Application

**When Database Sub-Agent Says**: "Manual application via Supabase Dashboard required"

**Reality**: This is ONLY true when:
1. ❌ `SUPABASE_DB_PASSWORD` environment variable is missing
2. ❌ Direct PostgreSQL connection is blocked by firewall
3. ❌ Migration requires interactive input (rare)

**Otherwise**: Use programmatic application pattern above

---

## Database Sub-Agent Checklist

When applying migrations, the database sub-agent MUST:

### Step 1: Check for Existing Migration Scripts
```bash
# Search for similar migration application scripts
ls -la scripts/*migration*.js scripts/*migration*.mjs

# Check if pattern exists (it does - 50+ scripts!)
grep -r "createDatabaseClient" scripts/
```

### Step 2: Check Environment Variables
```bash
# Required for programmatic application
echo $SUPABASE_DB_PASSWORD  # Should output password

# If missing, check .env file
grep SUPABASE_DB_PASSWORD .env
```

### Step 3: Use Programmatic Pattern (Primary)
```javascript
// Create migration application script following established pattern
import { createDatabaseClient } from './lib/supabase-connection.js';

// Execute migration
await client.query(migrationSQL);

// Verify table/indexes/RLS
```

### Step 4: Manual Dashboard (Fallback ONLY)
Only if Steps 1-3 fail, then recommend manual application.

---

## Lessons Learned from SD-VWC-PHASE4-001

### What Went Wrong:
1. ❌ Database sub-agent didn't check for existing migration scripts
2. ❌ Recommended manual application as primary approach
3. ❌ User had to ask "check retrospectives for prior lessons"
4. ❌ Wasted time preparing manual instructions

### What Should Have Happened:
1. ✅ Sub-agent searches for `scripts/*migration*.js` pattern
2. ✅ Finds 50+ examples using `createDatabaseClient`
3. ✅ Creates `run-wizard-analytics-migration.js` following pattern
4. ✅ Executes migration programmatically
5. ✅ Verifies table/indexes/RLS automatically

### Time Impact:
- ❌ Manual approach: 15 minutes (user action required, context switching)
- ✅ Programmatic approach: 2 minutes (fully automated)
- **Savings**: 13 minutes per migration

### Retrospective Quote (SD-2025-1020-E2E-SELECTORS):
> **"MOST IMPORTANT: Cutting corners on LEO Protocol creates MORE work, not less"**
> **"When protocol seems 'heavy', it's actually preventing future problems - trust it"**
> **"Fix root causes immediately, don't work around them"**

The database sub-agent saying "manual required" was a **workaround**, not a **root cause fix**.

---

## Database Sub-Agent Update Instructions

### For Future Sub-Agent Invocations:

**BEFORE** stating "manual application required", database sub-agent MUST:

1. **Search for Existing Patterns**:
   ```bash
   ls -la /mnt/c/_EHG/ehg/scripts/*migration*.js
   ```
   Expected: 50+ migration scripts found

2. **Check for `createDatabaseClient` Usage**:
   ```bash
   grep -r "createDatabaseClient" /mnt/c/_EHG/ehg/scripts/ | wc -l
   ```
   Expected: 50+ matches

3. **Read Example Script**:
   ```bash
   cat /mnt/c/_EHG/ehg/scripts/run-intelligence-migration.js
   ```
   Expected: Working pattern with verification

4. **Check Environment**:
   ```bash
   test -n "$SUPABASE_DB_PASSWORD" && echo "✅ Password available" || echo "❌ Manual required"
   ```

5. **Follow Pattern**: Create migration script using established pattern

6. **Execute & Verify**: Run script, verify table/indexes/RLS

7. **ONLY THEN**: If all above fail, recommend manual approach

---

## Quick Reference: Programmatic vs Manual

| Aspect | Programmatic (✅ Preferred) | Manual (❌ Fallback) |
|--------|---------------------------|-------------------|
| **Time** | 2 minutes | 15 minutes |
| **Automation** | Fully automated | Requires user action |
| **Verification** | Built-in (table/indexes/RLS) | Manual verification |
| **Repeatability** | Scriptable, testable | Error-prone |
| **CI/CD** | Can be automated | Cannot be automated |
| **Audit Trail** | Git-tracked script | No script record |
| **Pattern** | Follows 50+ examples | Ad-hoc |

---

## Updated Database Sub-Agent Prompt

```markdown
When applying database migrations:

1. Search for existing migration application scripts
2. Check if `createDatabaseClient` pattern is available
3. Verify `SUPABASE_DB_PASSWORD` environment variable
4. Create migration script following established pattern
5. Execute migration programmatically
6. Verify table/indexes/RLS automatically
7. ONLY recommend manual approach if Steps 1-6 fail

DO NOT immediately recommend manual application.
Follow the established pattern from 50+ existing scripts.
```

---

## References

- **Working Scripts**: `/mnt/c/_EHG/ehg/scripts/*migration*.js` (50+ examples)
- **Connection Utility**: `/mnt/c/_EHG/ehg/scripts/lib/supabase-connection.js`
- **Recent Success**: `run-wizard-analytics-migration.js` (SD-VWC-PHASE4-001)
- **Retrospective**: SD-2025-1020-E2E-SELECTORS (Oct 20, 2025)
- **Documentation**: `docs/database-migration-validation-guide.md`

---

**Summary**: The programmatic migration pattern is the ESTABLISHED, VALIDATED approach. Manual application should be a rare fallback, not the primary recommendation.
