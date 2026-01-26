# Database Agent Patterns: Comprehensive Reference


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-25
- **Tags**: database, api, testing, unit

**Status**: ACTIVE
**Last Updated**: 2026-01-24
**Version**: 1.2.0
**Purpose**: Complete guide for database agent invocation, anti-patterns, and best practices
**Evidence**: 74+ retrospectives analyzed, 13+ SDs with database agent lessons, 11 issue patterns
**Recent Improvements**:
- SD-LEO-INFRA-DATABASE-SUB-AGENT-001 (2026-01-24): SQL execution intent semantic triggering with auto-invocation
- SD-LEO-LEARN-001: Proactive learning integration
- SD-LEO-HARDEN-VALIDATION-001 (2026-01-23): PostToolUse hook for automatic migration detection
- 2026-01-23: Intelligent migration execution with action trigger detection

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [When to Invoke Database Agent](#when-to-invoke-database-agent)
3. [How to Invoke Database Agent](#how-to-invoke-database-agent)
4. [Error Response Protocol](#error-response-protocol)
5. [Proactive Learning Integration (NEW)](#proactive-learning-integration-new)
6. [RLS Policy Handling (NEW)](#rls-policy-handling-new)
7. [Schema Validation Enhancements (NEW)](#schema-validation-enhancements-new)
8. [SQL Execution Intent Semantic Triggering (NEW)](#sql-execution-intent-semantic-triggering-new-2026-01-24)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
10. [Success Patterns](#success-patterns)
11. [Database Query Best Practices](#database-query-best-practices)
12. [Quick Reference](#quick-reference)

---

## Core Principles

### DATABASE AGENT IS A FIRST RESPONDER, NOT A LAST RESORT

```
Database task or error → STOP → Invoke database agent → Implement solution
```

**Key Insight** (User Feedback):
> "Oftentimes, what I found is that there would be an error message or the application would struggle with the migration. Instead of trying to resolve the migration, it would try to do a workaround. Whereas what it should do initially is ensure that it's using the database sub-agent."

**Impact of Proper Usage**:
- Zero technical debt
- Zero workarounds
- 100% database agent usage for migrations
- 90% reduction in user reminders
- Faster database operations (15-30 min vs 2-4 hours)

---

## When to Invoke Database Agent

### Automatic Triggers (MUST invoke)

**Planning Phase**:
- [ ] SD mentions: database, migration, schema, table, RLS, SQL, Postgres
- [ ] PRD requires data dependencies
- [ ] Feature needs new tables or columns
- [ ] Authentication/authorization changes required

**Implementation Phase**:
- [ ] About to create/modify migration files
- [ ] About to execute database queries
- [ ] Need to design RLS policies
- [ ] Connection to database needed

**Error Response**:
- [ ] ANY PostgreSQL error occurs
- [ ] ANY Supabase error occurs
- [ ] ANY migration fails
- [ ] ANY schema conflict detected

### Error Patterns (Immediate Invocation)

```
✅ INVOKE DATABASE AGENT IMMEDIATELY:

PostgreSQL Errors:
  • column "X" does not exist
  • relation "X" does not exist
  • table "X" already exists
  • foreign key constraint violations
  • permission denied for table
  • syntax error at or near (SQL)
  • trigger function errors
  • duplicate key violations

Supabase Errors:
  • RLS policy failures
  • Connection string issues
  • Cross-schema foreign key warnings
  • Row level security errors

Migration Errors:
  • ANY migration execution failure
  • CREATE TABLE IF NOT EXISTS silent failures
  • Schema version mismatches
```

### Auto-Trigger Keywords

**These keywords MUST trigger database agent consideration**:
- "table already exists"
- "column does not exist"
- "permission denied"
- "foreign key constraint"
- "RLS policy"
- "connection refused"
- "syntax error" (in SQL context)
- "migration failed"
- "schema mismatch"

### Action Trigger Keywords (NEW - 2026-01-23)

**These keywords indicate intent to EXECUTE migrations** (not just validate):
- "apply migration"
- "run migration"
- "execute migration"
- "apply supabase migration"
- "push migration"
- "migrate database"
- "db push"
- "supabase db push"
- "apply schema"
- "run schema migration"

**Behavior**: When detected, the DATABASE sub-agent switches to execution mode:
1. Finds pending migration files
2. Displays what will be applied (filename, types, preview)
3. Requires `--confirm-apply` flag to execute
4. Runs `supabase db push` via CLI

**Example Usage**:
```
User: "apply the migration in Supabase"
→ DATABASE sub-agent detects action intent
→ Shows migration preview with confirmation prompt
→ Executes with user confirmation
```

---

## How to Invoke Database Agent

### With SD Context (Most Common)

```bash
# For specific database task
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# For phase-based orchestration
node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>

# With migration execution (action triggers)
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID> --context "apply migration"
# → Detects action intent, finds migrations, shows confirmation

# With auto-execution (requires confirmation flag)
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID> --context "apply migration" --confirm-apply
# → Executes migrations without prompting (use with caution)
```

### Advisory Mode (No SD Context)

**For general questions** (no implementation):
```
User: "What's the best way to structure a many-to-many relationship?"
Database Agent: [Provides expert guidance]
```

**Note**: For ANY actual implementation work, use script invocation with SD context

### PostToolUse Hook: Automatic Migration Detection (NEW - 2026-01-23)

**Purpose**: Automatically remind Claude to execute migrations when migration files are created.

**How It Works**:
1. Claude uses Write tool to create a migration file (e.g., `database/migrations/20260123_*.sql`)
2. PostToolUse hook `migration-execution-reminder.cjs` detects the Write operation
3. Hook analyzes file path against migration patterns:
   - `database/migrations/*.sql`
   - `supabase/migrations/*.sql`
   - `supabase/ehg_engineer/migrations/*.sql`
   - `migrations/[timestamp]_*.sql`
4. If match found, hook outputs execution reminder with multiple options
5. Claude sees reminder and can choose execution method

**Migration File Patterns Detected**:
```regex
/database[\/\\]migrations[\/\\].*\.sql$/i
/supabase[\/\\]migrations[\/\\].*\.sql$/i
/supabase[\/\\]ehg_engineer[\/\\]migrations[\/\\].*\.sql$/i
/migrations[\/\\]\d{8,14}_.*\.sql$/i
```

**Execution Options Provided**:
```
1. Supabase SQL Editor (RECOMMENDED for hosted):
   → Open: https://supabase.com/dashboard/project/[PROJECT_ID]/sql
   → Paste and run the migration SQL

2. DATABASE Sub-Agent (if CLI is linked):
   → node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID> --execute-migration --confirm-apply

3. Supabase CLI (if linked locally):
   → supabase db push

4. Direct psql (if available):
   → psql $DATABASE_URL -f "[file_path]"
```

**Hook Configuration**:
- **File**: `scripts/hooks/migration-execution-reminder.cjs`
- **Registered**: `.claude/settings.json` → PostToolUse → Write tool matcher
- **Timeout**: 5000ms
- **Exit Mode**: Advisory (exit code 0, non-blocking)

**Why This Was Added** (SD-LEO-HARDEN-VALIDATION-001):
- **Root Cause**: DATABASE sub-agent has ACTION_TRIGGERS for "apply migration" keywords, but only runs when explicitly invoked
- **Gap**: Creating migration files did NOT automatically trigger execution reminders
- **Fix**: PostToolUse hook bridges the gap between file creation and execution awareness
- **Impact**: No more missed migration executions; Claude is always reminded after creating migration files

**Example Output**:
```
════════════════════════════════════════════════════════════
  MIGRATION FILE CREATED - ACTION REQUIRED
════════════════════════════════════════════════════════════
   File: 20260123_retrospective_auto_archive_trigger.sql
   Path: database/migrations/20260123_retrospective_auto_archive_trigger.sql
   SD: SD-LEO-HARDEN-VALIDATION-001

   This migration needs to be EXECUTED against the database.

   OPTIONS TO EXECUTE:
   [4 execution methods listed above]
════════════════════════════════════════════════════════════
```

---

## Error Response Protocol

### What to Do When Database Error Occurs

```markdown
**Step 1**: STOP current approach
Do NOT attempt manual fixes, workarounds, or trial-and-error

**Step 2**: Document error
Copy exact error message, SQL statement, context

**Step 3**: Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

**Step 4**: Provide context
Share error message, what you were trying to do, relevant code

**Step 5**: Implement solution
Follow database agent's guidance exactly
```

### What NOT to Do

```markdown
❌ DO NOT:
- Attempt manual fixes
- Try workarounds (table renames, RLS bypasses)
- Modify SQL without validation
- Skip table/column verification
- Use trial-and-error debugging
- Add IF NOT EXISTS without knowing schema
- Use SERVICE_ROLE_KEY to bypass RLS
- Try different connection string variations

✅ DO:
- Invoke database agent immediately
- Wait for diagnosis
- Implement proper solution
```

---

## Proactive Learning Integration (NEW)

**Added**: 2025-10-26 (SD-LEO-LEARN-001)
**Impact**: Prevents 2-4 hours of rework by consulting lessons BEFORE encountering issues

### Before Starting ANY Database Work

Query the database for similar patterns and proven solutions:

```bash
# Search for prior database issues
node scripts/search-prior-issues.js "database schema mismatch"

# Query issue_patterns table for database category
node -e "
import { createDatabaseClient } from './lib/supabase-connection.js';
(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });
  const result = await client.query(\`
    SELECT pattern_id, issue_summary, proven_solutions, prevention_checklist
    FROM issue_patterns
    WHERE category = 'database' AND status = 'active'
    ORDER BY occurrence_count DESC
    LIMIT 5
  \`);
  console.log('Known Database Patterns:');
  result.rows.forEach(p => {
    console.log(\`\n\${p.pattern_id}: \${p.issue_summary}\`);
    if (p.proven_solutions) {
      console.log('Proven Solutions:', JSON.stringify(p.proven_solutions, null, 2));
    }
    if (p.prevention_checklist) {
      console.log('Prevention Steps:', JSON.stringify(p.prevention_checklist, null, 2));
    }
  });
  await client.end();
})();
"
```

### Known Database Issue Patterns

**PAT-001: Database Schema Mismatch** (5 occurrences, decreasing trend)
- **Issue**: TypeScript interfaces don't match Supabase table columns
- **Proven Solution**: Run schema verification before TypeScript interface updates
  - Success Rate: 100% (5/5 applications)
  - Average Resolution Time: 15 minutes
- **Prevention Checklist**:
  1. Verify database schema before updating TypeScript types
  2. Run migration before code changes
  3. Check Supabase dashboard for table structure

### Integration with Phase Workflow

**LEAD Pre-Approval**:
```bash
# Query for database patterns related to SD objective
node scripts/search-prior-issues.js "$(grep 'objective' SD-ID.txt)"
```

**PLAN Phase**:
```bash
# Query patterns before PRD creation
node scripts/phase-preflight.js --phase PLAN --sd-id <UUID>
```

**EXEC Phase**:
```bash
# Query patterns before implementation
node scripts/phase-preflight.js --phase EXEC --sd-id <UUID>
```

---

## RLS Policy Handling (NEW)

**Added**: 2025-10-26 (SD-GTM-INTEL-DISCOVERY-001)
**Impact**: Prevents security vulnerabilities and architectural violations

### Understanding RLS Access Levels

| Key Type | Access Level | Use Case | Security Risk |
|----------|--------------|----------|---------------|
| **ANON_KEY** | Read-only (SELECT) | Application queries, public access | Low (intended) |
| **SERVICE_ROLE_KEY** | Full access, bypasses RLS | Admin operations, migrations | **HIGH** if misused |
| **Supabase Dashboard** | Elevated privileges | Manual SQL execution | Medium (requires login) |

### When RLS Blocks Operations

**Option 1: Design Proper RLS Policy** (✅ PREFERRED)

```sql
-- Allow authenticated users to insert their own data
CREATE POLICY insert_own_data ON table_name
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to read specific records
CREATE POLICY select_own_data ON table_name
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Allow anon users to read public data
CREATE POLICY select_public ON table_name
FOR SELECT TO anon
USING (is_public = true);
```

**Option 2: Document Blocker + Manual Workaround** (⚠️ ACCEPTABLE)

When SERVICE_ROLE_KEY is not available:
1. Document RLS constraint in handoff/PR
2. Provide SQL migration script for manual execution
3. User executes via Supabase dashboard (elevated privileges)
4. Mark as CONDITIONAL_PASS with clear completion path

**Example** (SD-GTM-INTEL-DISCOVERY-001):
- ANON_KEY blocked INSERT to `nav_routes` table
- Database agent created migration script with INSERT statements
- User executed manually in Supabase dashboard
- Result: CONDITIONAL_PASS, work completed

**Option 3: SERVICE_ROLE_KEY in Code** (❌ NEVER DO THIS)

```typescript
// ❌ WRONG: Bypassing RLS in application code
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // SECURITY HOLE!
);

await supabase.from('sensitive_data').insert(data);
// Now ALL RLS policies bypassed, no audit trail, security vulnerability
```

**Why This is Dangerous**:
- Creates security vulnerabilities
- Violates principle of least privilege
- No audit trail for sensitive operations
- Makes debugging harder (why does this need elevated access?)
- Future developers may copy this anti-pattern

### RLS Policy Design Patterns

**Pattern 1: User-Owned Resources**
```sql
CREATE POLICY manage_own_resources ON resources
FOR ALL TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);
```

**Pattern 2: Public Read, Authenticated Write**
```sql
CREATE POLICY public_read ON content
FOR SELECT TO anon
USING (true);

CREATE POLICY authenticated_write ON content
FOR INSERT TO authenticated
WITH CHECK (true);
```

**Pattern 3: Role-Based Access**
```sql
CREATE POLICY admin_access ON sensitive_table
FOR ALL TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin'
);
```

---

## Governance Trigger Automation Bypass (NEW)

**Added**: 2026-01-01 (Fix 5 - Process Improvement)
**Impact**: Allows LEO orchestration to bypass governance triggers with full audit trail

### The Problem

Governance triggers (orphan protection, type change validation) block automation workflows even when the operations are valid. For example:
- LEO orchestrator creating child SDs
- System migrations changing SD types
- Admin operations during maintenance

### The Solution: `automation_context`

Add bypass metadata to `governance_metadata` field:

```json
{
  "automation_context": {
    "bypass_governance": true,
    "actor_role": "LEO_ORCHESTRATOR",
    "bypass_reason": "Creating child SDs as part of orchestrator setup",
    "requested_at": "2026-01-01T00:00:00Z"
  }
}
```

### Valid Actor Roles

| Role | Use Case |
|------|----------|
| `LEO_ORCHESTRATOR` | LEO Protocol automation (child SD creation, phase transitions) |
| `SYSTEM_MIGRATION` | Database migrations, schema updates |
| `ADMIN` | Manual admin override (fully audited) |

### Affected Governance Triggers

| Trigger | Normal Behavior | With Bypass |
|---------|-----------------|-------------|
| `orphan_protection` | Blocks type changes that orphan work | Logs + allows |
| `type_change_risk` | Blocks HIGH risk changes without approval | Logs + allows |
| `type_change_timing` | Blocks changes after handoffs created | Logs + allows |
| `type_change_explanation` | Requires explanation for type changes | Logs + allows |

### Audit Trail

All bypasses are logged to `sd_governance_bypass_audit`:

```sql
SELECT * FROM v_recent_governance_bypasses;
```

Fields captured:
- `sd_id` - Which SD was modified
- `trigger_name` - Which trigger was bypassed
- `actor_role` - Who/what requested the bypass
- `bypass_reason` - Justification
- `old_values` / `new_values` - What changed

### Usage Example (JavaScript)

```javascript
// LEO Orchestrator creating child SD
await supabase
  .from('strategic_directives_v2')
  .insert({
    id: 'SD-CHILD-001',
    parent_sd_id: 'SD-PARENT-001',
    sd_type: 'implementation',
    governance_metadata: {
      automation_context: {
        bypass_governance: true,
        actor_role: 'LEO_ORCHESTRATOR',
        bypass_reason: 'Creating child SD for orchestrator workflow',
        requested_at: new Date().toISOString()
      }
    }
  });
```

### Security Considerations

1. **Audit Everything**: All bypasses logged for review
2. **Valid Roles Only**: Only 3 recognized roles
3. **Reason Required**: Must explain why bypass needed
4. **Review Regularly**: Query `v_recent_governance_bypasses` periodically

### Related

- Migration: `database/migrations/20260101_fix5_governance_automation_bypass.sql`
- Function: `is_valid_automation_bypass(governance_metadata, trigger_name)`
- Audit table: `sd_governance_bypass_audit`
- View: `v_recent_governance_bypasses`

---

## Schema Validation Enhancements (NEW)

**Added**: 2025-10-26 (PAT-001, SD-VWC-PRESETS-001)
**Impact**: Prevents schema mismatches, trigger failures, and format conflicts

### Pre-Change Validation Checklist

Before ANY database schema changes, run these validations:

#### 1. Verify Existing Schema Structure

```sql
-- Check table columns and types
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'target_table'
ORDER BY ordinal_position;

-- Check constraints
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'target_table';

-- Check foreign keys
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'target_table';

-- Check triggers
SELECT
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'target_table';
```

#### 2. Verify TypeScript Interface Alignment

```bash
# Find TypeScript interfaces for this table
grep -r "interface.*TargetTable" src/

# Common column name mismatches to check:
# - confidence_score (TS) vs confidence (DB)
# - created_at (TS) vs createdAt (DB)
# - user_id (TS) vs userId (DB)

# Verify field names match EXACTLY
```

**Example Mismatch** (SD-AGENT-ADMIN-003):
- Trigger function referenced `confidence_score` column
- Actual database column was `confidence`
- Result: Runtime trigger failures

**Fix**: Always verify column names in information_schema before writing trigger functions

#### 3. Validate JSONB Structure Expectations

```sql
-- Check JSONB format (object vs array)
SELECT
  column_name,
  data_type,
  jsonb_typeof(column_name) as jsonb_type,
  column_name as sample_value
FROM table_name
WHERE column_name IS NOT NULL
LIMIT 1;
```

**Example Mismatch** (SD-VWC-PRESETS-001):
- Code expected `exec_checklist` as object: `{ items: [...] }`
- Database stored as array: `[...]`
- Result: Runtime errors accessing `exec_checklist.items`

**Fix**: Validate JSONB structure before writing code that accesses nested fields

```javascript
// Good: Defensive coding for JSONB format
const checklist = Array.isArray(sdData.exec_checklist)
  ? { items: sdData.exec_checklist }  // Convert array to object
  : sdData.exec_checklist;             // Already an object
```

#### 4. Validate Trigger Function Column References

```sql
-- Get trigger function source code
SELECT
  proname as function_name,
  prosrc as source_code
FROM pg_proc
WHERE proname = 'trigger_function_name';

-- Parse source code for column references
-- Cross-reference with actual table columns from step 1
```

**Anti-Pattern** (SD-AGENT-ADMIN-003):
```sql
-- Trigger function has stale column reference
CREATE OR REPLACE FUNCTION update_confidence()
RETURNS TRIGGER AS $$
BEGIN
  NEW.confidence_score := calculate_score();  -- Column doesn't exist!
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Fix**: After schema changes, audit all trigger functions for stale column references

#### 5. Check Case-Sensitive String Comparisons

```bash
# Find case-sensitive comparisons that might break after normalization
grep -rn "if.*==.*'EXEC-to-PLAN'" scripts/
grep -rn "switch.*handoff_type" scripts/

# Should be normalized to lowercase: 'exec_to_plan'
```

**Example Issue** (SD-VWC-PRESETS-001):
- Input normalized to lowercase: `handoff_type = 'exec_to_plan'`
- If-statement still used mixed case: `if (type === 'EXEC-to-PLAN')`
- Result: Condition never matched, NULL values created

**Fix**: Use automated linter rule to detect case-sensitive string comparisons

```javascript
// eslint rule suggestion
{
  "rules": {
    "no-mixed-case-handoff-types": "error"
  }
}
```

### Schema Validation Tool Pattern

Create a validation script for systematic checks:

```bash
# scripts/validate-schema-formats.js
node scripts/validate-schema-formats.js <table_name>

# Checks performed:
# 1. JSONB columns: Verify object vs array expectations
# 2. Array columns: Verify element types
# 3. Foreign key references: Verify target tables exist
# 4. NOT NULL constraints: Verify trigger compliance
# 5. Trigger functions: Verify column references are current
# 6. TypeScript interfaces: Verify alignment with database schema
```

---

## Anti-Patterns to Avoid

### Why Workarounds Are Dangerous

#### The Workaround Cycle

1. **Agent encounters database error** (table conflict, missing column, RLS failure)
2. **Agent attempts "quick fix"** (rename table, bypass RLS, trial-and-error SQL)
3. **"Fix" appears to work** (error message goes away)
4. **Technical debt created** (schema mismatch, security hole, confusion)
5. **Future problems emerge** (migrations fail, queries break, security issues)
6. **User intervenes**: "Why didn't you use the database agent?"

#### The Database-First Pattern

1. **Agent encounters database error OR database task**
2. **Agent IMMEDIATELY invokes database agent**
3. **Database agent diagnoses root cause**
4. **Proper solution implemented**
5. **No technical debt, system remains stable**

---

### ❌ Anti-Pattern 1: Table Rename Workarounds

**What It Looks Like**:
```sql
-- Error: table "webhook_events" already exists
CREATE TABLE webhook_events ...

-- WRONG Workaround: Rename to avoid conflict
CREATE TABLE webhook_events_new (
  id UUID PRIMARY KEY,
  ...
);

-- Now code references wrong table name
-- Future migrations confused
-- Documentation mismatched
```

**Why It's Wrong**:
- Doesn't understand WHY table exists
- Creates schema confusion
- Future migrations target wrong table
- Code references inconsistent
- Documentation becomes outdated

**Right Approach**:
```bash
# STOP: Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# Database agent will:
# 1. Check existing table schema
# 2. Determine if table matches intent
# 3. Provide proper migration path (ALTER TABLE vs new table)
# 4. Document the decision
```

**Evidence**: SD-041C - Table conflict properly handled by database agent, documented rename implemented

---

### ❌ Anti-Pattern 2: Column Existence Guards

**What It Looks Like**:
```sql
-- WRONG: Add columns without knowing schema
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

-- Problems:
-- - Don't know if columns already exist with different types
-- - Don't know if constraints are correct
-- - Don't know if indices are needed
```

**Why It's Wrong**:
- No schema validation
- Type mismatches undetected
- Constraint violations possible
- Performance implications ignored
- Migration idempotency unclear

**Right Approach**:
```bash
# STOP: Invoke database agent FIRST
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# Database agent will:
# 1. Query current schema: SELECT column_name, data_type FROM information_schema.columns
# 2. Identify actual differences
# 3. Generate proper ALTER TABLE statements
# 4. Add constraints and indices as needed
```

**Evidence**: SD-AGENT-ADMIN-003 - Schema validation prevented column type mismatches

---

### ❌ Anti-Pattern 3: RLS Policy Bypassing

**What It Looks Like**:
```typescript
// Error: RLS policy blocks INSERT
const { error } = await supabase.from('sensitive_data').insert(data);
// Error: new row violates row-level security policy

// WRONG Workaround: Use service role key to bypass RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // SECURITY HOLE!
);

// Now ALL security bypassed
// No audit trail
// Violates principle of least privilege
```

**Why It's Wrong**:
- **Security vulnerability created**
- Bypasses intended access controls
- No audit trail for sensitive operations
- Violates principle of least privilege
- Makes code less maintainable (why service role needed?)

**Right Approach**:
```bash
# STOP: Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# Database agent will:
# 1. Review RLS policy design
# 2. Identify why INSERT is blocked
# 3. Design proper policy (e.g., authenticated users can INSERT their own rows)
# 4. Implement: CREATE POLICY insert_own_data ON table FOR INSERT TO authenticated ...
```

**Evidence**: SD-AGENT-ADMIN-003 - RLS policies properly configured (20 policies) with anon SELECT and authenticated full access patterns

---

### ❌ Anti-Pattern 4: Manual SQL Trial-and-Error

**What It Looks Like**:
```bash
# Attempt 1
psql -c "CREATE TABLE analytics (id SERIAL PRIMARY KEY, ...);"
# Error: permission denied

# Attempt 2
psql -c "CREATE TABLE IF NOT EXISTS analytics ..."
# Error: table already exists but schema different

# Attempt 3
psql -c "DROP TABLE analytics CASCADE; CREATE TABLE analytics ..."
# Dangerous! Drops production data!

# Attempt 4
psql -c "CREATE TABLE analytics_v2 ..."
# Technical debt created
```

**Why It's Wrong**:
- No understanding of root cause
- Each attempt adds confusion
- CASCADE can destroy data
- No rollback plan
- Wastes 30-60 minutes

**Right Approach**:
```bash
# STOP after FIRST error: Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# Database agent will:
# 1. Diagnose permission issue (wrong user, wrong database)
# 2. Check table existence and schema
# 3. Provide correct CREATE or ALTER statement
# 4. Ensure idempotency
```

**Evidence**: SD-1A - Multiple database schema issues resolved by database agent analysis

---

### ❌ Anti-Pattern 5: Skipping Migration Validation

**What It Looks Like**:
```javascript
// WRONG: Execute migration without validation
const migrationSQL = fs.readFileSync('migration.sql', 'utf8');

try {
  await client.query(migrationSQL);
  console.log('Migration succeeded!');
} catch (error) {
  console.error('Migration failed:', error);
  // Now what? Database in unknown state
}
```

**Why It's Wrong**:
- No pre-flight checks (Do tables exist? Will this conflict?)
- No syntax validation
- No rollback plan
- Database state unclear on failure
- No verification of success

**Right Approach**:
```bash
# BEFORE executing migration: Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# Database agent will:
# 1. Validate SQL syntax
# 2. Check for conflicts (existing tables, constraint names)
# 3. Recommend transaction boundaries
# 4. Provide rollback plan
# 5. Verify execution success
```

**Evidence**: SD-BACKEND-002C - Database agent provided migration pattern, 45-minute execution success

---

### ❌ Anti-Pattern 6: Connection String Trial-and-Error

**What It Looks Like**:
```javascript
// Attempt 1: Wrong region
const client = new Client({
  connectionString: 'postgresql://postgres.PROJECT:PASSWORD@aws-0-us-east-1.pooler...'
});
await client.connect(); // Error: connection timeout

// Attempt 2: Try aws-1
const client = new Client({
  connectionString: 'postgresql://postgres.PROJECT:PASSWORD@aws-1-us-east-1.pooler...'
});
await client.connect(); // Error: SSL required

// ... 5 more attempts ...
```

**Why It's Wrong**:
- Wastes 15-30 minutes
- No understanding of correct pattern
- Ignores established connection helpers
- Creates inconsistent connection code

**Right Approach**:
```bash
# STOP: Use established pattern
# Database agent documented this in: scripts/lib/supabase-connection.js

import { createDatabaseClient } from '../lib/supabase-connection.js';

const client = await createDatabaseClient('engineer', { verify: true });
// Works first try, follows established pattern
```

**Evidence**: All successful database SDs use `createDatabaseClient` helper

---

### ❌ Anti-Pattern 7: Ignoring Schema Conflicts

**What It Looks Like**:
```javascript
// Migration output: "table 'users' already exists"

// WRONG: Assume it's okay and proceed
console.log('Table already exists, continuing...');
await client.query('INSERT INTO users (name, email) VALUES (...)');
// Error: column "email" does not exist
// Existing table has different schema!
```

**Why It's Wrong**:
- Assumes table schema matches intent
- No validation of existing schema
- Proceeds blindly despite warning
- Discovers mismatch too late

**Right Approach**:
```bash
# STOP on "already exists": Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# Database agent will:
# 1. Query existing table schema
# 2. Compare to intended schema
# 3. Generate ALTER TABLE statements if needed
# 4. Or confirm schema matches (safe to proceed)
```

**Evidence**: SD-041C - `CREATE TABLE IF NOT EXISTS` silently failed when table existed with different schema

---

## Success Patterns

### Pattern 1: Proactive Schema Validation

**Example**: SD-041C
- Database agent identified table conflict early
- Proper semantic rename (`github_webhook_events`)
- Zero confusion, documentation updated
- **Time Saved**: 2-3 hours

### Pattern 2: Migration Execution

**Example**: SD-BACKEND-002C
- Database agent provided migration pattern
- Fixed AWS region, FK constraints, SQL parsing
- 7 tables + view created successfully in 45 minutes
- **Success Rate**: 100%

### Pattern 3: Trigger Function Validation

**Example**: SD-AGENT-ADMIN-003
- Database agent caught schema mismatch (`confidence_score` vs `confidence`)
- Updated trigger function before deployment
- Zero runtime errors
- **Time Saved**: 1-2 hours debugging

### Pattern 4: Proactive Learning Consultation (NEW)

**Example**: PAT-001
- Query issue_patterns table BEFORE starting work
- Apply proven_solutions (100% success rate)
- Follow prevention_checklist
- **Time Saved**: 2-4 hours (prevents encountering known issues)

### Pattern 5: RLS Blocker Documentation (NEW)

**Example**: SD-GTM-INTEL-DISCOVERY-001
- ANON_KEY blocked INSERT to nav_routes
- Database agent documented blocker instead of bypass
- Provided SQL migration script for manual execution
- Result: CONDITIONAL_PASS with clear completion path
- **Security**: Zero vulnerabilities introduced

### Pattern 6: Schema Format Validation (NEW)

**Example**: SD-VWC-PRESETS-001 (Negative -> Positive)
- Discovered exec_checklist format mismatch (object vs array)
- Created validation script for JSONB structure checks
- Applied defensive coding pattern
- **Prevention**: Future format mismatches caught early

### Pattern 7: Supabase API Key Resilience (NEW - 2026-01-25)

**Issue Pattern**: PAT-SUPABASE-KEY-001
**Root Cause**: API keys rotated in Supabase Dashboard but `.env` not updated
**Impact**: "Invalid API key" errors blocking all database operations

**Symptoms**:
- Error: "Invalid API key"
- Hint: "Double check your Supabase `anon` or `service_role` API key"
- Service role key works, anon key fails
- Keys in `.env` have valid JWT format

**Root Cause Analysis**:
1. JWT structure is valid (not a format issue)
2. Service role key works (project connection is fine)
3. Anon key was REVOKED/REGENERATED in Supabase Dashboard
4. Old key still in `.env` file

**Prevention Pattern** (implemented in `tests/helpers/database-helpers.js`):

```javascript
// PAT-SUPABASE-KEY-001: Resilient Supabase client creation
export function getSupabaseClient() {
  // Support both env var naming conventions
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  // Prefer service role key for integration tests (needed for insert/delete)
  // Falls back to anon key if service role not available
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                      process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase credentials not found. Set one of:\n' +
      '  - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (recommended)\n' +
      '  - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
      '  - SUPABASE_URL + SUPABASE_ANON_KEY'
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Connection validation for fail-fast behavior
export async function getValidatedSupabaseClient() {
  const client = getSupabaseClient();
  const { error } = await client.from('strategic_directives_v2').select('id').limit(1);
  if (error) {
    throw new Error(
      `Database connection failed: ${error.message}\n` +
      `Hint: ${error.hint || 'Check API keys - they may have been rotated'}`
    );
  }
  return client;
}
```

**Why Service Role Key for Tests**:
- Integration tests need INSERT/DELETE permissions
- Service role bypasses RLS (required for test data setup/cleanup)
- Provides resilience if anon key is rotated
- Clear separation: anon key for app, service role for tests/admin

**Fix Procedure** (when anon key fails):
1. Access Supabase Dashboard: `https://supabase.com/dashboard/project/[PROJECT_ID]/settings/api`
2. Copy new "anon public" key
3. Update `.env`:
   ```
   SUPABASE_ANON_KEY=[new key]
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[new key]
   ```
4. Restart application/tests

**Files Implementing This Pattern**:
- `tests/helpers/database-helpers.js` - Shared test utility
- `tests/integration/handoff-retrospective.test.js` - Example usage

### Pattern 8: Intelligent Migration Execution (NEW - 2026-01-23)

**Feature**: Action trigger detection for migration execution
- User says "apply migration" or similar phrases
- DATABASE sub-agent automatically:
  1. Detects action intent from keywords
  2. Finds pending migration files
  3. Shows confirmation display with:
     - File names and paths
     - Migration types (CREATE TABLE, ALTER TABLE, RLS, INSERT)
     - Content preview
  4. Requires explicit `--confirm-apply` to execute
- **Safety**: No migrations execute without confirmation
- **Transparency**: Full visibility into what will run
- **Automation**: Reduces manual "run supabase db push" reminders

---

## Database Query Best Practices

### Context Efficiency Principles

**Critical Lesson**: Large database query results consume massive context. Smart querying saves 5K-10K tokens per SD.

### Rule 1: Select Specific Columns Only

**❌ Bad Pattern**:
```javascript
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')  // Returns all 20+ columns
  .eq('id', sdId)
  .single();

console.log(sd);  // Dumps entire object (500-1000 tokens)
```

**✅ Good Pattern**:
```javascript
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, priority, progress')  // Only needed fields
  .eq('id', sdId)
  .single();

console.log(`SD-${sd.id}: ${sd.title} (status: ${sd.status}, priority: ${sd.priority}, progress: ${sd.progress}%)`);
// Tokens: ~50 vs 500-1000
```

**Token Savings**: 90% reduction (500+ tokens → 50 tokens)

---

### Rule 2: Limit Results and Paginate

**❌ Bad Pattern**:
```javascript
const { data: allSDs } = await supabase
  .from('strategic_directives_v2')
  .select('*');  // Returns 100+ SDs with all columns

console.log(allSDs);  // Dumps 50K+ tokens
```

**✅ Good Pattern**:
```javascript
const { data: topSDs, count } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, priority', { count: 'exact' })
  .in('status', ['active', 'in_progress'])
  .order('priority', { ascending: false })
  .limit(5);

console.log(`Found ${count} active SDs, showing top 5 by priority:`);
topSDs.forEach((sd, i) => {
  console.log(`  ${i+1}. ${sd.id}: ${sd.title} (priority: ${sd.priority})`);
});
console.log(`\nFull list: http://localhost:3000/strategic-directives`);
```

**Token Savings**: 98% reduction (50K tokens → 1K tokens)

---

### Rule 3: Summarize Large Results

**❌ Bad Pattern**:
```javascript
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', sdId)
  .single();

console.log(JSON.stringify(prd, null, 2));  // 2,000+ lines
```

**✅ Good Pattern**:
```javascript
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status, objectives, acceptance_criteria')
  .eq('directive_id', sdId)
  .single();

console.log(`PRD: ${prd.title}`);
console.log(`Status: ${prd.status}`);
console.log(`Objectives: ${prd.objectives?.length || 0} defined`);
console.log(`Acceptance Criteria: ${prd.acceptance_criteria?.length || 0} items`);
console.log(`\nFull PRD: http://localhost:3000/prd/${prd.id}`);
```

**Token Savings**: 95% reduction (8,000 tokens → 400 tokens)

---

### Rule 4: Reference Instead of Dump

**❌ Bad Pattern**:
```javascript
const { data: retrospectives } = await supabase
  .from('retrospectives')
  .select('*');

console.log('All retrospectives:', retrospectives);  // 50K+ tokens
```

**✅ Good Pattern**:
```javascript
const { data: retroSummary } = await supabase
  .from('retrospectives')
  .select('id, sd_id, quality_score, created_at')
  .order('created_at', { ascending: false })
  .limit(10);

console.log(`Recent retrospectives (${retroSummary.length}):`);
retroSummary.forEach(r => {
  console.log(`  - ${r.sd_id}: Quality ${r.quality_score}/100 (${r.created_at})`);
});
console.log(`\nView all: http://localhost:3000/retrospectives`);
```

**Token Savings**: 98% reduction

---

## PRD Workflow Integration: Design → Database Pattern

**Status**: ACTIVE (since 2025-10-28)
**Purpose**: Schema-aware PRD creation with design-driven database analysis

### Workflow Sequence

When creating a PRD via `add-prd-to-database.js`, sub-agents are invoked in this order:

```
1. PRD Creation (basic structure)
   ↓
2. DESIGN Sub-Agent (UI/UX workflows analysis)
   - User interaction patterns
   - Data display requirements
   - User actions (CRUD operations)
   - UI component needs
   ↓
3. DATABASE Sub-Agent (schema analysis - DESIGN-INFORMED)
   - Schema changes needed
   - Table modifications
   - RLS policy requirements
   - Migration complexity
   ↓
4. Component Recommendations (Shadcn components)
   ↓
5. STORIES Sub-Agent (user story generation)
```

### Why This Order?

**Design First**:
- User workflows drive data requirements
- UI determines what data needs to be stored/displayed
- User actions determine CRUD operations needed

**Database Second**:
- Schema changes informed by design analysis
- Table structure supports identified workflows
- Columns match data display/edit needs
- RLS policies align with user permissions from design

### DATABASE Sub-Agent Context

The DATABASE sub-agent receives:

```javascript
// SD Context
- Title, scope, description, objectives

// DESIGN Analysis Context (if available)
- User workflows identified
- Data fields to display/edit
- User actions (create/edit/delete)
- Data relationships from UI

// Schema Documentation
- docs/reference/schema/engineer/database-schema-overview.md
- Per-table documentation
```

### Example Invocation

```bash
# PRD creation auto-invokes DESIGN → DATABASE → STORIES
node scripts/add-prd-to-database.js SD-EXAMPLE-001 "Feature PRD"

# Output:
# ✅ PRD created
# 🎨 DESIGN analysis complete (user workflows identified)
# 📊 DATABASE schema recommendations (design-informed)
# 🎨 Component recommendations
# 📝 User stories generated
```

### PRD Metadata Storage

Both analyses stored in `product_requirements_v2.metadata`:

```javascript
{
  "design_analysis": {
    "generated_at": "2025-10-28T...",
    "sd_context": { "id": "SD-...", "title": "..." },
    "raw_analysis": "..." // First 5000 chars
  },
  "database_analysis": {
    "generated_at": "2025-10-28T...",
    "design_informed": true,  // ← Key indicator
    "raw_analysis": "..."
  }
}
```

### Benefits

1. **Schema matches design**: Database structure supports all identified workflows
2. **No orphaned columns**: Only fields that UI actually uses
3. **Proper relationships**: Foreign keys match UI navigation patterns
4. **RLS alignment**: Policies match user permissions from design
5. **Reduced rework**: Design-first prevents "we need this column" surprises

### Schema Documentation Access

Database agent has access to auto-generated schema docs:

```
docs/reference/schema/
├── engineer/               (EHG_Engineer database)
│   ├── database-schema-overview.md
│   └── tables/
│       ├── strategic_directives_v2.md
│       ├── product_requirements_v2.md
│       └── ... (159 tables)
└── ehg/                   (EHG application database - requires pooler fix)
    └── ...
```

**Update Docs**: `npm run schema:docs:engineer` or `npm run schema:docs:ehg`

### Related Documentation

- **DESIGN Sub-Agent**: `.claude/agents/design-agent.md`
- **DATABASE Sub-Agent**: `.claude/agents/database-agent.md`
- **STORIES Sub-Agent**: `.claude/agents/stories-agent.md`
- **Schema Docs**: `CLAUDE_PLAN.md` (Database Schema Documentation Access section)

---

## Quick Reference

### Decision Matrix

| Situation | Invoke DB Agent? | Why |
|-----------|-----------------|-----|
| Planning SD with database work | ✅ YES | Proactive validation |
| About to create migration | ✅ YES | Safety validation |
| Database error occurs | ✅ YES | Root cause diagnosis |
| Writing database queries | ✅ YES | Schema confirmation |
| General database question | ⚠️ MAYBE | Advisory mode okay for theory |
| Already using established pattern | ❌ NO | Pattern already validated |

---

### One-Line Decision

```
Database task or error? → node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

---

### Three Rules

1. **Database agent BEFORE attempting database work**
2. **Database agent IMMEDIATELY on database errors**
3. **No workarounds, ever**

---

### Performance Metrics

**From 13 SDs with Database Agent Usage**:

| Metric | With DB Agent | Without DB Agent |
|--------|--------------|------------------|
| Schema Conflicts | 0 | 3+ |
| Migration Failures | 0 | Multiple attempts |
| Time to Resolution | 15-30 min | 2-4 hours |
| Technical Debt Created | 0 | Workarounds |
| User Interventions | 0 | Constant reminders |

---

### Comparison Table

| Scenario | WRONG Approach | RIGHT Approach |
|----------|---------------|----------------|
| Table exists error | Rename table | Database agent validates schema |
| Missing column | Add IF NOT EXISTS | Database agent checks schema first |
| RLS blocks INSERT | Use service role key | Database agent designs proper policy |
| Migration fails | Try variations | Database agent diagnoses root cause |
| Connection fails | Try different configs | Use `createDatabaseClient` helper |
| Schema conflict | Proceed anyway | Database agent validates compatibility |

---

## SQL Execution Intent Semantic Triggering (NEW - 2026-01-24)

**SD**: SD-LEO-INFRA-DATABASE-SUB-AGENT-001
**Status**: ACTIVE
**Impact**: Eliminates manual SQL execution instructions, enables automatic database agent invocation

### Overview

The database agent now includes **automatic invocation when SQL execution intent is detected** in conversation. Instead of outputting "run this SQL manually in Supabase Studio", the system automatically engages the database sub-agent when intent classification reaches the confidence threshold.

**Key Improvement**:
```
BEFORE: "Here's the SQL. Run it in Supabase Studio manually."
AFTER:  "Executing via database sub-agent..." [Auto-invokes Task tool]
```

### Intent Classification System

The system uses a **deterministic pattern-based classifier** with 37+ trigger patterns organized into 6 priority categories:

#### Trigger Categories (Priority-Weighted)

| Category | Priority | Example Triggers | Confidence Boost |
|----------|----------|------------------|------------------|
| **Direct Command** | 9 | "run this sql", "execute the query", "execute this migration" | +0.20 |
| **Delegation** | 8 | "use database sub-agent", "have the database agent run this" | +0.15 |
| **Imperative** | 8 | "please run", "can you execute", "go ahead and run" | +0.15 |
| **Operational** | 7 | "update the table", "create the table", "insert into" | +0.10 |
| **Result-Oriented** | 6 | "make this change in the database", "apply this to production" | +0.08 |
| **Contextual** | 5 | "run it", "execute it", "apply it" (requires SQL context) | +0.05 |

**Note**: Contextual triggers only match when SQL statements (SELECT, INSERT, UPDATE, etc.) are detected in the message.

### Denylist Filtering (False Positive Prevention)

The following phrases **force NO_EXECUTION intent** regardless of other triggers:

- "do not execute"
- "for reference only"
- "example query"
- "sample sql"
- "here is an example"
- "you could run"
- "would look like"

**Example**:
```
❌ "Here is an example query for reference only: SELECT * FROM users"
   → Intent: NO_EXECUTION (denylist match)

✅ "Please run this SQL: SELECT * FROM users"
   → Intent: SQL_EXECUTION (direct command + SQL context)
```

### Intent Classifier Usage

#### Basic Usage

```javascript
import { classifySQLExecutionIntent } from './lib/utils/sql-execution-intent-classifier.js';

const message = "Can you run this migration for me? INSERT INTO users...";
const result = await classifySQLExecutionIntent(message);

console.log(result);
// {
//   intent: 'SQL_EXECUTION',
//   confidence: 0.92,
//   decision: 'invoke_db_agent',
//   matchedTriggerIds: ['trigger-uuid-1', 'trigger-uuid-2'],
//   metadata: {
//     hasSQLContext: true,
//     hasDenylistPhrase: false,
//     matchCount: 2,
//     latencyMs: 45
//   }
// }
```

#### Auto-Invocation Helper

```javascript
import { shouldAutoInvokeAndExecute } from './lib/utils/db-agent-auto-invoker.js';

const message = "Execute this query: UPDATE users SET active = true";
const result = await shouldAutoInvokeAndExecute(message, {
  conversationId: 'conv-123',
  sdKey: 'SD-FEATURE-001'
});

if (result.shouldInvoke) {
  // Use Task tool with result.taskParams
  Task({
    description: result.taskParams.description,
    prompt: result.taskParams.prompt,
    subagent_type: 'database-agent',
    model: 'sonnet'
  });
}
```

### Confidence Scoring Algorithm

**Base Confidence**:
```
baseConfidence = 0.5 + (maxPriority / 20)
// Example: priority 9 → 0.5 + 0.45 = 0.95
```

**Confidence Boosts**:
- Each matched trigger adds its `confidence_boost` value (0.05-0.20)
- SQL context detected: +0.10
- Denylist phrase: forces confidence to ≤0.30

**Final Decision**:
```
if (confidence >= MIN_CONFIDENCE_TO_INVOKE && DB_AGENT_ENABLED) {
  decision = 'invoke_db_agent'
} else if (confidence < MIN_CONFIDENCE_TO_INVOKE) {
  decision = 'blocked_confidence'
} else {
  decision = 'no_execution'
}
```

### Configuration Parameters

Runtime configuration stored in `db_agent_config` table:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MIN_CONFIDENCE_TO_INVOKE` | 0.80 | Minimum confidence score to auto-invoke (0-1) |
| `MAX_TRIGGERS_EVALUATED` | 200 | Maximum triggers to evaluate per classification |
| `DB_AGENT_ENABLED` | true | Global enable/disable for auto-invocation |
| `DENYLIST_PHRASES` | Array | Phrases that force NO_EXECUTION intent |

**Update Configuration**:
```sql
-- Adjust confidence threshold
UPDATE db_agent_config
SET value = '0.85'
WHERE key = 'MIN_CONFIDENCE_TO_INVOKE';

-- Add custom denylist phrase
UPDATE db_agent_config
SET value = value || '["do not apply"]'::jsonb
WHERE key = 'DENYLIST_PHRASES';
```

### Audit Trail

All classification decisions are logged to `db_agent_invocations` table with:

- `correlation_id` - Unique ID for tracing (UUID v4)
- `conversation_id` - Optional conversation tracking
- `intent` - SQL_EXECUTION or NO_EXECUTION
- `confidence` - Score from 0-1
- `matched_trigger_ids` - Array of trigger UUIDs
- `decision` - invoke_db_agent | blocked_policy | blocked_confidence | no_execution
- `block_reason` - Why invocation was blocked (if applicable)
- `latency_ms` - Classification performance metric
- `environment` - development | staging | production

**Query Example**:
```sql
-- Recent high-confidence invocations
SELECT correlation_id, intent, confidence, decision, created_at
FROM db_agent_invocations
WHERE confidence >= 0.90
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;
```

### Environment Safety

Production database execution requires explicit approval:

```bash
# .env file
DB_PROD_EXECUTION_APPROVED=true
```

**Without approval**:
```
❌ Decision: blocked_environment
   Reason: "Production database execution requires DB_PROD_EXECUTION_APPROVED=true"
```

### SQL Context Detection

The classifier recognizes SQL statements via regex patterns:

- `SELECT ... FROM`
- `INSERT INTO`
- `UPDATE ... SET`
- `DELETE FROM`
- `CREATE TABLE|INDEX|FUNCTION|VIEW`
- `ALTER TABLE`
- `DROP TABLE|INDEX|FUNCTION|VIEW`
- `TRUNCATE TABLE`
- `GRANT ... ON`
- `REVOKE ... ON`

**Why This Matters**: Contextual triggers like "run it" only match when SQL is present, preventing false positives on non-database commands.

### Integration Examples

#### Example 1: Migration Execution
```
User: "Can you execute this migration?"

[SQL detected in context]

Classifier:
  - Matched: "execute" (Imperative, priority 8, +0.15)
  - Matched: "migration" (Operational, priority 7, +0.10)
  - SQL context detected: +0.10
  - Confidence: 0.92
  - Decision: invoke_db_agent

Action: Task tool invoked with database-agent subagent_type
```

#### Example 2: Reference Query (Blocked)
```
User: "Here's an example query you could use for reference: SELECT * FROM users"

Classifier:
  - Denylist match: "for reference"
  - Intent: NO_EXECUTION
  - Confidence: 0.95 (high confidence it's NOT an execution request)
  - Decision: no_execution

Action: No invocation, continue conversation
```

#### Example 3: Contextual Command
```
User: "Here's the SQL: UPDATE users SET role = 'admin'. Just run it."

Classifier:
  - Matched: "run it" (Contextual, priority 5, +0.05)
  - SQL context detected (UPDATE statement): +0.10
  - Confidence: 0.78
  - Decision: blocked_confidence (below 0.80 threshold)

Action: "SQL execution detected but confidence too low. Please clarify your intent."
```

### Testing

**Unit Tests**: `test/unit/sql-execution-intent-classifier.test.js`
- 36 tests covering all scenarios
- 100% passing
- Coverage: SQL detection, denylist, trigger matching, confidence calculation

**Run Tests**:
```bash
npm test -- sql-execution-intent-classifier
```

### Files Added

| File | Purpose | Lines |
|------|---------|-------|
| `lib/utils/sql-execution-intent-classifier.js` | Core classification engine | 397 |
| `lib/utils/db-agent-auto-invoker.js` | Orchestration-level integration | 267 |
| `test/unit/sql-execution-intent-classifier.test.js` | Comprehensive unit tests | 368 |
| `database/migrations/20260124_add_sql_execution_intent_triggers.sql` | Trigger patterns + config tables | 207 |

### Metrics & Observability

**Structured Logging**:
```javascript
import { logMetric } from './lib/utils/db-agent-auto-invoker.js';

logMetric('db_trigger.intent_detected_total', 1, { intent: 'SQL_EXECUTION' });
logMetric('db_trigger.invoked_total', 1);
logMetric('db_trigger.classification_latency_ms', 42);
```

**Key Metrics**:
- `db_trigger.intent_detected_total` - Intent classification count by type
- `db_trigger.invoked_total` - Successful auto-invocations
- `db_trigger.blocked_total` - Blocked invocations by reason
- `db_trigger.classification_latency_ms` - Performance tracking

### When to Use Directly

**Automatic** (no manual invocation needed):
- Claude detects SQL execution intent in conversation
- Confidence >= 0.80
- DB_AGENT_ENABLED = true
- Environment permissions granted

**Manual Override** (when classifier fails):
```javascript
// Force invocation bypass
const result = await shouldAutoInvokeAndExecute(message, {
  skipLogging: false,
  environment: 'staging'
});
```

### Success Criteria

✅ **Working correctly when**:
- SQL execution requests auto-invoke database agent
- Reference queries (examples, samples) do NOT trigger invocation
- High-confidence matches (>0.90) consistently invoke
- Audit trail captures all decisions with correlation IDs
- Production execution blocked without explicit approval

❌ **Needs adjustment when**:
- False positives: Non-SQL commands trigger invocation
- False negatives: Clear execution requests don't trigger
- Confidence consistently too high/low for a category
- Denylist misses common reference phrases

### Related Documentation

**Implementation Details**:
- CLAUDE_CORE.md Section 318: Database Sub-Agent Auto-Invocation
- `database/migrations/20260124_add_sql_execution_intent_triggers.sql` - Trigger definitions
- `.claude/agents/database-agent.md` - Database agent configuration

**API Reference**:
- `classifySQLExecutionIntent(message, options)` - Returns full classification result
- `shouldAutoInvokeDBAgent(message, options)` - Returns boolean + result
- `shouldAutoInvokeAndExecute(message, options)` - Returns Task tool params if should invoke

---

## Related Documentation

**Supporting Files**:
- `docs/reference/database-agent-anti-patterns.md` - Detailed anti-pattern catalog
- `docs/reference/database-agent-first-responder.md` - Quick reference guide
- `docs/reference/database-best-practices.md` - Query best practices
- `scripts/lib/supabase-connection.js` - Established connection patterns
- `.claude/agents/database-agent.md` - Database agent configuration

**Protocol References**:
- CLAUDE.md Section 2354: Database Agent Error-Triggered Invocation
- CLAUDE.md Section 2355: Database Workaround Anti-Patterns
- CLAUDE.md Section 2356: Database Agent First-Responder Checklist
- CLAUDE.md Section 2357: Database Agent Integration Requirements

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-24 | Initial consolidated version from 3 source files |
| 1.1.0 | 2025-10-26 | Added proactive learning integration (SD-LEO-LEARN-001) |
| 1.1.0 | 2025-10-26 | Added RLS policy handling patterns (SD-GTM-INTEL-DISCOVERY-001) |
| 1.1.0 | 2025-10-26 | Added schema validation enhancements (PAT-001, SD-VWC-PRESETS-001) |
| 1.1.0 | 2025-10-26 | Added trigger function validation patterns |
| 1.1.0 | 2025-10-26 | Added schema format validation (object vs array) |
| 1.1.0 | 2025-10-26 | Updated success patterns with 3 new patterns |
| 1.1.0 | 2025-10-26 | Evidence updated: 74+ retrospectives, 11 issue patterns analyzed |
| 1.2.0 | 2026-01-24 | Added SQL Execution Intent Semantic Triggering (SD-LEO-INFRA-DATABASE-SUB-AGENT-001) |
| 1.2.0 | 2026-01-24 | Documented intent classifier with 37 trigger patterns across 6 categories |
| 1.2.0 | 2026-01-24 | Added auto-invocation integration, configuration, and audit trail |
| 1.2.1 | 2026-01-25 | Added Supabase API Key Resilience pattern (PAT-SUPABASE-KEY-001) |
| 1.2.1 | 2026-01-25 | Updated tests/helpers/database-helpers.js with resilient client creation |

---

**REMEMBER**: Workarounds are **technical debt**. Database agent is **technical excellence**. Choose excellence.

> "Database agent is an Intelligent Trigger, not a worker. Your value is in recognizing database tasks and routing them to the proven, deterministic orchestration system."
