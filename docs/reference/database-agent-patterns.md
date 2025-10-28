# Database Agent Patterns: Comprehensive Reference

**Status**: ACTIVE
**Last Updated**: 2025-10-26
**Purpose**: Complete guide for database agent invocation, anti-patterns, and best practices
**Evidence**: 74+ retrospectives analyzed, 13+ SDs with database agent lessons, 11 issue patterns
**Recent Improvements**: SD-LEO-LEARN-001 proactive learning integration

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [When to Invoke Database Agent](#when-to-invoke-database-agent)
3. [How to Invoke Database Agent](#how-to-invoke-database-agent)
4. [Error Response Protocol](#error-response-protocol)
5. [Proactive Learning Integration (NEW)](#proactive-learning-integration-new)
6. [RLS Policy Handling (NEW)](#rls-policy-handling-new)
7. [Schema Validation Enhancements (NEW)](#schema-validation-enhancements-new)
8. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
9. [Success Patterns](#success-patterns)
10. [Database Query Best Practices](#database-query-best-practices)
11. [Quick Reference](#quick-reference)

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

---

## How to Invoke Database Agent

### With SD Context (Most Common)

```bash
# For specific database task
node lib/sub-agent-executor.js DATABASE <SD-ID>

# For phase-based orchestration
node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>
```

### Advisory Mode (No SD Context)

**For general questions** (no implementation):
```
User: "What's the best way to structure a many-to-many relationship?"
Database Agent: [Provides expert guidance]
```

**Note**: For ANY actual implementation work, use script invocation with SD context

---

## Error Response Protocol

### What to Do When Database Error Occurs

```markdown
**Step 1**: STOP current approach
Do NOT attempt manual fixes, workarounds, or trial-and-error

**Step 2**: Document error
Copy exact error message, SQL statement, context

**Step 3**: Invoke database agent
node lib/sub-agent-executor.js DATABASE <SD-ID>

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
node lib/sub-agent-executor.js DATABASE <SD-ID>

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
node lib/sub-agent-executor.js DATABASE <SD-ID>

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
node lib/sub-agent-executor.js DATABASE <SD-ID>

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
node lib/sub-agent-executor.js DATABASE <SD-ID>

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
node lib/sub-agent-executor.js DATABASE <SD-ID>

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
node lib/sub-agent-executor.js DATABASE <SD-ID>

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
Database task or error? → node lib/sub-agent-executor.js DATABASE <SD-ID>
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

---

**REMEMBER**: Workarounds are **technical debt**. Database agent is **technical excellence**. Choose excellence.

> "Database agent is an Intelligent Trigger, not a worker. Your value is in recognizing database tasks and routing them to the proven, deterministic orchestration system."
