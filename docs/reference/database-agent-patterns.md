# Database Agent Patterns: Comprehensive Reference

**Status**: ACTIVE
**Last Updated**: 2025-10-24
**Purpose**: Complete guide for database agent invocation, anti-patterns, and best practices
**Evidence**: 74 retrospectives analyzed, 13 SDs with database agent lessons

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [When to Invoke Database Agent](#when-to-invoke-database-agent)
3. [How to Invoke Database Agent](#how-to-invoke-database-agent)
4. [Error Response Protocol](#error-response-protocol)
5. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
6. [Success Patterns](#success-patterns)
7. [Database Query Best Practices](#database-query-best-practices)
8. [Quick Reference](#quick-reference)

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

---

**REMEMBER**: Workarounds are **technical debt**. Database agent is **technical excellence**. Choose excellence.

> "Database agent is an Intelligent Trigger, not a worker. Your value is in recognizing database tasks and routing them to the proven, deterministic orchestration system."
