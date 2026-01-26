# Database Agent First-Responder Quick Reference


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-23
- **Tags**: database, migration, schema, rls

**Status**: ACTIVE
**Last Updated**: 2026-01-23
**Purpose**: Quick reference for proactive database agent invocation
**Recent Changes**: Added PostToolUse hook for automatic migration detection (SD-LEO-HARDEN-VALIDATION-001)

---

## Core Principle

**DATABASE AGENT IS A FIRST RESPONDER, NOT A LAST RESORT**

```
Database task or error → STOP → Invoke database agent → Implement solution
```

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
→ column "X" does not exist
→ relation "X" does not exist
→ table "X" already exists
→ foreign key constraint violations
→ permission denied for table
→ syntax error at or near (SQL)
→ trigger function errors
→ duplicate key violations

Supabase Errors:
→ RLS policy failures
→ Connection string issues
→ Cross-schema foreign key warnings
→ Row level security errors

Migration Errors:
→ ANY migration execution failure
→ CREATE TABLE IF NOT EXISTS silent failures
→ Schema version mismatches
```

---

## How to Invoke Database Agent

### With SD Context (Most Common)

```bash
# For specific database task
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

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

### Automatic Migration Detection (NEW - 2026-01-23)

**PostToolUse Hook**: When Claude creates a migration file, a hook automatically outputs execution reminders.

**How It Works**:
1. Write tool creates file matching pattern: `database/migrations/*.sql`
2. Hook `migration-execution-reminder.cjs` detects migration file
3. Outputs 4 execution options (Supabase SQL Editor, DATABASE sub-agent, Supabase CLI, psql)
4. Claude sees reminder and chooses execution method

**Why This Matters**:
- Prevents forgot-to-execute-migration errors
- Bridges gap between file creation and execution
- No more "I created the migration but didn't run it" issues

**See**: `docs/reference/database-agent-patterns.md` → "PostToolUse Hook" section for full details

---

## Pre-Database-Work Checklist

### Before PLANNING Database Work

```markdown
- [ ] Invoke database agent for schema review
- [ ] Verify tables mentioned in PRD exist
- [ ] Check for naming conflicts (existing tables)
- [ ] Validate RLS policy requirements
- [ ] Confirm correct database target (EHG vs EHG_Engineer)
```

### Before EXECUTING Database Migrations

```markdown
- [ ] Database agent validated migration file
- [ ] Schema conflicts identified and resolved
- [ ] Connection helper pattern confirmed (scripts/lib/supabase-connection.js)
- [ ] Rollback plan documented
- [ ] Test environment validated
```

### Before WRITING Database Queries

```markdown
- [ ] Database agent confirmed table schema
- [ ] Column names verified (not assumed)
- [ ] RLS policies understood
- [ ] Query performance considerations reviewed
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

## Common Scenarios

### Scenario 1: Migration Fails

```bash
# Error: table "users" already exists

# WRONG: Try variations
CREATE TABLE users_new ...

# RIGHT: Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# Database agent will:
# - Check existing table schema
# - Compare to intended schema
# - Provide ALTER TABLE or confirm safe to proceed
```

### Scenario 2: Column Not Found

```bash
# Error: column "email" does not exist

# WRONG: Add column blindly
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

# RIGHT: Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

# Database agent will:
# - Validate entire table schema
# - Check data types, constraints, indices
# - Provide proper migration
```

### Scenario 3: RLS Policy Blocks Operation

```typescript
// Error: new row violates row-level security policy

// WRONG: Bypass with service role key
const supabase = createClient(url, SERVICE_ROLE_KEY)

// RIGHT: Invoke database agent
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>

// Database agent will:
// - Review RLS policy design
// - Identify why operation blocked
// - Design proper policy
```

### Scenario 4: Connection Issues

```javascript
// Error: connection timeout

// WRONG: Try different regions/ports/SSL configs
postgresql://postgres.PROJECT@aws-0... // fails
postgresql://postgres.PROJECT@aws-1... // try this?

// RIGHT: Use established pattern
import { createDatabaseClient } from '../lib/supabase-connection.js';
const client = await createDatabaseClient('engineer', { verify: true });
```

---

## Integration with LEO Protocol Phases

### LEAD Pre-Approval

**When**:
- SD mentions database keywords
- Strategic database architecture needed

**Action**:
```bash
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

**Include in**: Parallel sub-agent execution with Security, Design, Systems Analyst

---

### PLAN PRD Creation

**When** (MANDATORY):
- ANY data dependencies in SD
- Tables or columns mentioned
- RLS policies needed

**Action**:
```bash
# FIRST thing in PLAN phase
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

**Blocks**: PRD creation if critical database issues found

**Documents**: Table existence, RLS requirements, migration needs in PLAN→EXEC handoff

---

### EXEC Implementation

**When**:
- Before implementing ANY database changes
- When ANY database error occurs
- Before executing migrations

**Action**:
```bash
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

**Provides**: Migration patterns, connection helpers, schema validation

---

### PLAN Verification

**When**:
- Verifying migrations executed correctly
- Validating schema matches documentation

**Action**:
```bash
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

**Confirms**: Migrations successful, schema correct, RLS policies working

---

## Success Patterns (Proven Examples)

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

## Quick Decision Matrix

| Situation | Invoke DB Agent? | Why |
|-----------|-----------------|-----|
| Planning SD with database work | ✅ YES | Proactive validation |
| About to create migration | ✅ YES | Safety validation |
| Database error occurs | ✅ YES | Root cause diagnosis |
| Writing database queries | ✅ YES | Schema confirmation |
| General database question | ⚠️ MAYBE | Advisory mode okay for theory |
| Already using established pattern | ❌ NO | Pattern already validated |

---

## Established Patterns (No Database Agent Needed)

### Connection Helper (Already Validated)

```javascript
// This pattern is already validated, no need for database agent
import { createDatabaseClient } from '../lib/supabase-connection.js';
const client = await createDatabaseClient('engineer', { verify: true });
```

### Query Patterns (After Schema Validated)

```javascript
// Once database agent has validated schema, these are safe
const { data } = await supabase
  .from('validated_table')
  .select('validated_columns')
  .eq('validated_column', value);
```

**Key**: Database agent validates schema FIRST, then normal queries proceed

---

## Performance Metrics

**From 13 SDs with Database Agent Usage**:

| Metric | With DB Agent | Without DB Agent |
|--------|--------------|------------------|
| Schema Conflicts | 0 | 3+ |
| Migration Failures | 0 | Multiple attempts |
| Time to Resolution | 15-30 min | 2-4 hours |
| Technical Debt Created | 0 | Workarounds |
| User Interventions | 0 | Constant reminders |

**Expected Outcomes** (This Protocol):
- **Zero workaround attempts**
- **100% database agent usage for migrations**
- **90% reduction in user reminders**
- **Faster database operations**

---

## Related Documentation

**Protocol Sections**:
- CLAUDE.md Section 2354: Database Agent Error-Triggered Invocation
- CLAUDE.md Section 2355: Database Workaround Anti-Patterns
- CLAUDE.md Section 2356: Database Agent First-Responder Checklist
- CLAUDE.md Section 2357: Database Agent Integration Requirements

**Detailed Guides**:
- `docs/reference/database-agent-anti-patterns.md` - Comprehensive anti-pattern catalog
- `scripts/lib/supabase-connection.js` - Established connection patterns
- `.claude/agents/database-agent.md` - Database agent configuration

---

## Cheat Sheet

### One-Line Decision

```
Database task or error? → node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

### Three Rules

1. **Database agent BEFORE attempting database work**
2. **Database agent IMMEDIATELY on database errors**
3. **No workarounds, ever**

### Remember

> "Database agent is an Intelligent Trigger, not a worker. Your value is in recognizing database tasks and routing them to the proven, deterministic orchestration system."
>
> — `.claude/agents/database-agent.md`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-12 | Initial quick reference from 74 retrospectives |

---

**BOTTOM LINE**: When in doubt, invoke database agent. It's faster than debugging workarounds.
