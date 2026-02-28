---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Database Agent Workaround Anti-Patterns Guide



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Why Workarounds Are Dangerous](#why-workarounds-are-dangerous)
  - [The Workaround Cycle](#the-workaround-cycle)
  - [The Database-First Pattern](#the-database-first-pattern)
- [Anti-Pattern Catalog](#anti-pattern-catalog)
  - [❌ Anti-Pattern 1: Table Rename Workarounds](#-anti-pattern-1-table-rename-workarounds)
  - [❌ Anti-Pattern 2: Column Existence Guards](#-anti-pattern-2-column-existence-guards)
  - [❌ Anti-Pattern 3: RLS Policy Bypassing](#-anti-pattern-3-rls-policy-bypassing)
  - [❌ Anti-Pattern 4: Manual SQL Trial-and-Error](#-anti-pattern-4-manual-sql-trial-and-error)
  - [❌ Anti-Pattern 5: Skipping Migration Validation](#-anti-pattern-5-skipping-migration-validation)
  - [❌ Anti-Pattern 6: Connection String Trial-and-Error](#-anti-pattern-6-connection-string-trial-and-error)
  - [❌ Anti-Pattern 7: Ignoring Schema Conflicts](#-anti-pattern-7-ignoring-schema-conflicts)
- [Detection Rules](#detection-rules)
  - [BLOCKED PATTERNS (Database Agent Required)](#blocked-patterns-database-agent-required)
  - [Auto-Trigger Keywords](#auto-trigger-keywords)
- [Success Stories (When Database Agent Used Properly)](#success-stories-when-database-agent-used-properly)
  - [Success 1: Table Conflict Resolution (SD-041C)](#success-1-table-conflict-resolution-sd-041c)
  - [Success 2: Migration Pattern (SD-BACKEND-002C)](#success-2-migration-pattern-sd-backend-002c)
  - [Success 3: Schema Validation (SD-AGENT-ADMIN-003)](#success-3-schema-validation-sd-agent-admin-003)
- [Failure Stories (When Workarounds Attempted)](#failure-stories-when-workarounds-attempted)
  - [Failure 1: Schema Mismatch (SD-1A)](#failure-1-schema-mismatch-sd-1a)
  - [Failure 2: Missing Tables (SD-1A)](#failure-2-missing-tables-sd-1a)
- [When to Invoke Database Agent](#when-to-invoke-database-agent)
  - [Immediate Invocation Required](#immediate-invocation-required)
  - [Database Agent is a FIRST RESPONDER, not a LAST RESORT](#database-agent-is-a-first-responder-not-a-last-resort)
- [How to Invoke Database Agent](#how-to-invoke-database-agent)
  - [Command Line](#command-line)
  - [Advisory Mode (No SD Context)](#advisory-mode-no-sd-context)
- [Quick Reference](#quick-reference)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, migration, schema, rls

**Status**: ACTIVE
**Last Updated**: 2025-10-12
**Evidence**: 74 retrospectives analyzed, 13 SDs with database agent lessons

---

## Executive Summary

This guide documents **7 common anti-patterns** where agents attempt database workarounds instead of invoking the database agent. Each anti-pattern represents technical debt, wasted time, and potential system instability.

**Key Insight** (User Feedback):
> "Oftentimes, what I found is that there would be an error message or the application would struggle with the migration. Instead of trying to resolve the migration, it would try to do a workaround. Whereas what it should do initially is ensure that it's using the database sub-agent."

**Impact of Anti-Patterns**:
- Creates technical debt
- Masks root causes
- Wastes 2-4 hours per incident
- Requires manual intervention
- Reduces system reliability

---

## Why Workarounds Are Dangerous

### The Workaround Cycle

1. **Agent encounters database error** (table conflict, missing column, RLS failure)
2. **Agent attempts "quick fix"** (rename table, bypass RLS, trial-and-error SQL)
3. **"Fix" appears to work** (error message goes away)
4. **Technical debt created** (schema mismatch, security hole, confusion)
5. **Future problems emerge** (migrations fail, queries break, security issues)
6. **User intervenes**: "Why didn't you use the database agent?"

### The Database-First Pattern

1. **Agent encounters database error OR database task**
2. **Agent IMMEDIATELY invokes database agent**
3. **Database agent diagnoses root cause**
4. **Proper solution implemented**
5. **No technical debt, system remains stable**

---

## Anti-Pattern Catalog

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

// Attempt 3: Add SSL
const client = new Client({
  connectionString: 'postgresql://postgres.PROJECT:PASSWORD@aws-1-us-east-1.pooler...',
  ssl: true
});
await client.connect(); // Error: certificate validation failed

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

## Detection Rules

### BLOCKED PATTERNS (Database Agent Required)

**If you see ANY of these patterns, STOP and invoke database agent**:

1. **Renaming database objects** to avoid conflicts
2. **Adding IF NOT EXISTS** without schema validation
3. **Using SERVICE_ROLE_KEY** to bypass RLS
4. **Trial-and-error** with connection strings or SQL
5. **Multiple psql/query attempts** without diagnosis
6. **Modifying migrations** after first execution failure
7. **Proceeding despite "already exists"** warnings
8. **Any database error** without understanding root cause

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

## Success Stories (When Database Agent Used Properly)

### Success 1: Table Conflict Resolution (SD-041C)

**Situation**: Migration failed with "table 'webhook_events' already exists"

**Wrong Approach**: Rename to `webhook_events_new`

**Database Agent Approach**:
1. Queried existing table schema
2. Identified it was different system (GitHub webhooks)
3. Recommended rename to `github_webhook_events` (semantic clarity)
4. Updated all references
5. Documented in CLAUDE.md

**Result**: Zero confusion, proper semantic naming, documentation updated

---

### Success 2: Migration Pattern (SD-BACKEND-002C)

**Situation**: Financial analytics schema needed (7 tables + 1 materialized view)

**Database Agent Approach**:
1. Validated all table dependencies
2. Provided `apply-backend-002c-migrations-direct.mjs` pattern
3. Fixed AWS region issue (aws-0 → aws-1)
4. Removed problematic FK constraints
5. Improved SQL parsing for $ delimited functions

**Result**: 45-minute execution, all 7 tables + view created successfully

---

### Success 3: Schema Validation (SD-AGENT-ADMIN-003)

**Situation**: Trigger function referenced wrong column name

**Database Agent Approach**:
1. Validated trigger function against current schema
2. Identified `confidence_score` vs `confidence` mismatch
3. Updated trigger function to match schema
4. Added validation step to migration checklist

**Result**: Zero runtime errors, function works correctly

---

## Failure Stories (When Workarounds Attempted)

### Failure 1: Schema Mismatch (SD-1A)

**Situation**: Multiple database schema issues throughout development

**Workaround Attempted**: Trial-and-error SQL modifications

**Result**:
- Multiple failed attempts
- Time wasted: 2-3 hours
- Database state unclear
- User intervention required

**Should Have Done**: Invoke database agent at FIRST error, not after multiple failures

---

### Failure 2: Missing Tables (SD-1A)

**Situation**: Handoff governance system had missing database tables

**Workaround Attempted**: Proceeded with implementation despite missing tables

**Result**:
- Runtime failures
- System unreliable
- Rollback required

**Should Have Done**: Database agent validation BEFORE implementation starts

---

## When to Invoke Database Agent

### Immediate Invocation Required

**ALWAYS invoke database agent when**:
- ANY database error occurs
- Starting database-related SD
- Creating/modifying migrations
- Designing RLS policies
- Schema changes needed
- Connection issues encountered
- Query performance problems
- Data integrity concerns

### Database Agent is a FIRST RESPONDER, not a LAST RESORT

**Pattern**:
```
Database task or error
↓
STOP
↓
Invoke database agent
↓
Wait for diagnosis
↓
Implement solution
```

---

## How to Invoke Database Agent

### Command Line

```bash
# For specific task with SD context
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# For phase-based orchestration
node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>
```

### Advisory Mode (No SD Context)

If you have a general database question (no SD context):
```
User: "What's the best way to structure a many-to-many relationship?"
Agent: [Provides expert guidance from 30 years Oracle experience]
```

**But for ANY implementation work**: Use script invocation with SD context

---

## Quick Reference

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

- `CLAUDE.md` - Database Agent First-Responder Protocol (sections 2354-2357)
- `docs/reference/database-agent-first-responder.md` - Proactive invocation guide
- `scripts/lib/supabase-connection.js` - Established connection patterns
- `.claude/agents/database-agent.md` - Database agent configuration

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-12 | Initial version from 74 retrospectives analysis |

---

**REMEMBER**: Workarounds are **technical debt**. Database agent is **technical excellence**. Choose excellence.
