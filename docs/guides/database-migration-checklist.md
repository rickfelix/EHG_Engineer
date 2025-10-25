# Database Migration Checklist - CRITICAL

**Created**: 2025-10-04
**Context**: SD-RECONNECT-009 lesson learned
**Priority**: CRITICAL - Add to CLAUDE.md via database update

---

## ⚠️ MANDATORY: Validate Migration Script BEFORE Assuming Connection Issues

### Problem Observed (SD-RECONNECT-009)

During SD-RECONNECT-009 implementation, 2+ hours were spent troubleshooting database connection issues (psql credentials, Supabase CLI, pooler URLs) when the **root cause was invalid foreign key constraints in the migration script**.

### The Mistake

**Migration script contained**:
```sql
documentation_author UUID REFERENCES auth.users(id),
created_by UUID REFERENCES auth.users(id),
updated_by UUID REFERENCES auth.users(id)
```

**Problem**: Foreign key constraints to `auth.users` table fail in Supabase migrations because:
1. The `auth` schema is in a different database/schema context
2. Foreign keys across schemas require special permissions
3. Migration tools don't have access to `auth.users` during execution

**Result**: Migration appears to "fail to connect" or "fail to execute" but the actual issue is **invalid SQL syntax for the migration context**.

---

## ✅ CORRECT Migration Validation Process

### Step 1: Analyze Migration Script FIRST (Before Any Connection Attempts)

Run through this checklist **before** attempting `supabase db push` or `psql` execution:

#### 1.1 Check for Cross-Schema Foreign Keys
```bash
grep -E "REFERENCES (auth|storage|extensions)\." migration.sql
```

**If found**: Remove foreign key constraints or use UUIDs without FKs.

**Fix**:
```sql
-- ❌ WRONG: Cross-schema FK
documentation_author UUID REFERENCES auth.users(id),

-- ✅ CORRECT: UUID without FK
documentation_author UUID,  -- FK to auth.users removed
```

#### 1.2 Check for Schema-Specific Functions
```bash
grep -E "auth\.|storage\.|extensions\." migration.sql | grep -v "COMMENT"
```

**Common issues**:
- `auth.uid()` - ✅ OK (function call, not FK)
- `auth.users` in FK - ❌ FAIL
- `auth.users` in SELECT subquery - ⚠️ May fail depending on RLS policies

#### 1.3 Validate RLS Policies
```bash
grep -A 5 "CREATE POLICY" migration.sql
```

**Check for**:
- References to `auth.users` in JOIN/subquery - may fail
- Use `auth.uid()` for current user checks - ✅ OK
- Complex subqueries - test locally first

#### 1.4 Check Extension Dependencies
```bash
grep "CREATE EXTENSION" migration.sql
```

**Ensure extensions are available**:
- `pg_trgm` - ✅ Usually available
- `uuid-ossp` - ✅ Usually available
- Custom extensions - ⚠️ May need manual installation

#### 1.5 Verify INSERT Statements
```bash
grep -A 3 "INSERT INTO" migration.sql | head -20
```

**Check for**:
- Hardcoded UUIDs that reference `auth.users` - ❌ Will fail
- NULL values for FK fields - ✅ OK if FK removed
- Proper escaping of single quotes in strings

---

### Step 2: Test Migration Locally (If Possible)

If Supabase CLI is configured with local Docker:
```bash
supabase db reset --local
# Migration auto-runs on local database
```

**If local test fails**: Fix migration script before attempting remote push.

---

### Step 3: Syntax Validation

```bash
# Check SQL syntax without execution
psql --dry-run -f migration.sql  # (if psql supports dry-run)

# Or use SQL linter
sqlfluff lint migration.sql
```

---

### Step 4: Only After Validation - Attempt Connection

If migration script passes all checks above, **then** troubleshoot connection:

1. `supabase db push --linked`
2. If fails with migration history conflict → repair history
3. If fails with auth → check credentials
4. If fails with "table already exists" → migration may have partially run

---

## 📚 Reference: Common Supabase Migration Errors

| Error Message | Root Cause | Fix |
|---------------|------------|-----|
| `relation "auth.users" does not exist` | Cross-schema FK | Remove FK, use UUID only |
| `permission denied for schema auth` | Trying to access auth schema | Use `auth.uid()` not `auth.users` |
| `Tenant or user not found` | Wrong database credentials | Verify pooler URL/password |
| `migration history conflict` | Remote migrations not in local | Run `supabase migration repair` or `db pull` |
| `function does not exist` | Custom function in wrong schema | Create function in `public` schema |

---

## 🎯 Key Lesson for CLAUDE.md

**Add to "PLAN Pre-EXEC Checklist" → "Database Dependencies" section**:

```markdown
### Database Migration Script Validation ✅ (CRITICAL)

**BEFORE attempting to apply any migration**:

- [ ] **Scan for cross-schema foreign keys** (`REFERENCES auth.`, `REFERENCES storage.`)
  - If found: Remove FK constraints, document as comments
- [ ] **Check RLS policies for auth.users references**
  - If found: Simplify to `auth.uid() IS NOT NULL` or use alternative logic
- [ ] **Validate INSERT statements for hardcoded auth UUIDs**
  - If found: Use NULL or remove audit fields
- [ ] **Test migration syntax locally** (if Supabase local available)
  - If fails: Fix script before remote attempt
- [ ] **Only after validation**: Attempt `supabase db push --linked`

**Success Pattern** (SD-RECONNECT-009 correction):
> "Identified cross-schema FK constraints in migration script during validation phase.
> Corrected before attempting connection, saved 2+ hours of connection troubleshooting."

**Anti-Pattern** (SD-RECONNECT-009 original):
> "Attempted psql, pooler, supabase CLI for 2 hours before analyzing migration script.
> Root cause was invalid SQL, not connection issues."
```

---

## 🔧 Tools for Migration Validation

### Quick Validation Script

Create `/scripts/validate-migration.sh`:
```bash
#!/bin/bash
MIGRATION_FILE=$1

echo "🔍 Validating migration: $MIGRATION_FILE"
echo ""

# Check 1: Cross-schema FKs
echo "1️⃣ Checking for cross-schema foreign keys..."
if grep -E "REFERENCES (auth|storage|extensions)\." "$MIGRATION_FILE"; then
  echo "   ❌ FAIL: Cross-schema foreign keys found"
  echo "   → Remove FK constraints to auth/storage/extensions schemas"
  exit 1
else
  echo "   ✅ PASS: No cross-schema FKs"
fi

# Check 2: Auth schema references
echo ""
echo "2️⃣ Checking for problematic auth schema references..."
if grep -E "FROM auth\.|JOIN auth\." "$MIGRATION_FILE" | grep -v "auth.uid()"; then
  echo "   ⚠️  WARNING: auth schema queries found (may fail with RLS)"
  echo "   → Review and test locally"
fi

# Check 3: Extension requirements
echo ""
echo "3️⃣ Checking extension dependencies..."
grep "CREATE EXTENSION" "$MIGRATION_FILE" || echo "   ℹ️  No extensions required"

echo ""
echo "✅ Validation complete. Review warnings before applying migration."
```

**Usage**:
```bash
chmod +x scripts/validate-migration.sh
./scripts/validate-migration.sh supabase/migrations/20251004_create_table.sql
```

---

## 📖 Additional Resources

- **Supabase Migration Docs**: https://supabase.com/docs/guides/database/migrations
- **PostgreSQL Foreign Keys**: https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK
- **Supabase Auth Schema**: https://supabase.com/docs/guides/auth/managing-user-data

---

**Action Item**: Update `leo_protocol_sections` table with migration validation checklist to include in auto-generated CLAUDE.md.

**Database Update Command**:
```sql
INSERT INTO leo_protocol_sections (
  section_name,
  content,
  category,
  priority,
  active
) VALUES (
  'database_migration_validation',
  '[content from this document]',
  'best_practices',
  100,
  true
);
```
