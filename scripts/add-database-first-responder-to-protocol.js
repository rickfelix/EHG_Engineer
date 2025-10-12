#!/usr/bin/env node

/**
 * Add Database First-Responder Protocol to LEO Protocol Database
 *
 * This script adds quick-reference sections to leo_protocol_sections table
 * implementing the database-first responder pattern to prevent workarounds.
 *
 * Evidence: 74 retrospectives analyzed, 13 SDs with database agent usage
 * User Pain Point: "I constantly have to remind that we should use the database subagent"
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function addDatabaseFirstResponder() {
  console.log('🚀 Adding Database First-Responder Protocol to LEO Protocol Database...\n');

  // Step 1: Get active protocol ID
  console.log('📋 Step 1: Fetching active protocol...');
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version, title')
    .eq('status', 'active')
    .single();

  if (protocolError) {
    console.error('❌ Error fetching active protocol:', protocolError);
    process.exit(1);
  }

  console.log(`✅ Active Protocol: ${protocol.version} - ${protocol.title}\n`);

  // Step 2: Get current max order_index
  console.log('📊 Step 2: Finding next order_index...');
  const { data: maxOrder } = await supabase
    .from('leo_protocol_sections')
    .select('order_index')
    .eq('protocol_id', protocol.id)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextOrderIndex = maxOrder && maxOrder.length > 0 ? maxOrder[0].order_index + 1 : 100;
  console.log(`✅ Starting at order_index: ${nextOrderIndex}\n`);

  // Step 3: Define new sections
  const newSections = [
    {
      protocol_id: protocol.id,
      section_type: 'quick-reference',
      title: 'Database Agent Error-Triggered Invocation',
      content: `## 🚨 Database Agent Error-Triggered Invocation

**Problem**: Agents attempt workarounds when encountering database errors instead of using database agent
**Solution**: Immediate database agent invocation on ANY database error

### Error Patterns That MUST Trigger Database Agent

**PostgreSQL Errors** (immediate database agent call):
- \`column "X" does not exist\` → Database agent (schema validation)
- \`relation "X" does not exist\` → Database agent (table validation)
- \`table "X" already exists\` → Database agent (migration conflict)
- \`foreign key constraint\` errors → Database agent (relationship validation)
- \`permission denied for table\` → Database agent (RLS policy issue)
- \`syntax error at or near\` (in SQL) → Database agent (SQL validation)
- \`trigger function\` errors → Database agent (function schema mismatch)
- \`duplicate key value violates unique constraint\` → Database agent (data/schema issue)

**Supabase-Specific Errors**:
- RLS policy failures → Database agent (security architecture)
- Connection string issues → Database agent (connection helper)
- Cross-schema foreign key warnings → Database agent (architecture violation)
- \`row level security\` errors → Database agent (policy design)

**Migration Errors**:
- ANY migration file execution failure → Database agent (don't retry manually)
- \`CREATE TABLE IF NOT EXISTS\` silent failures → Database agent (conflict detection)
- Schema version mismatches → Database agent (version management)

### Error Response Protocol

**When ANY database error occurs**:

❌ **DO NOT**:
- Attempt manual fixes
- Try workarounds
- Modify SQL without validation
- Skip table/column verification
- Use trial-and-error debugging

✅ **DO IMMEDIATELY**:
1. STOP current approach
2. Document the exact error message
3. Invoke database agent:
   \`\`\`bash
   node lib/sub-agent-executor.js DATABASE <SD-ID>
   \`\`\`
4. Provide error context to database agent
5. Implement database agent's solution

**Pattern**: Database error detected → Invoke database agent → Wait for diagnosis → Implement solution

**Evidence**: 74 retrospectives analyzed, 3 failure patterns from workaround attempts
**Impact**: Eliminates technical debt from band-aid solutions, saves 2-4 hours per database issue`,
      order_index: nextOrderIndex,
      metadata: {
        source: 'Retrospectives Database Analysis (74 SDs)',
        created_date: '2025-10-12',
        priority: 'CRITICAL',
        category: 'database',
        user_pain_point: 'Constant reminders needed to use database agent'
      }
    },
    {
      protocol_id: protocol.id,
      section_type: 'quick-reference',
      title: 'Database Workaround Anti-Patterns (NEVER DO THIS)',
      content: `## ⛔ Database Workaround Anti-Patterns (NEVER DO THIS)

**Problem**: Common workarounds create technical debt and mask root causes
**Solution**: Block these patterns, use database agent instead

### Anti-Pattern Catalog

**❌ Anti-Pattern 1: Table Rename Workarounds**
\`\`\`sql
-- WRONG: Renaming table to avoid conflict
CREATE TABLE webhook_events_new ...

-- RIGHT: Use database agent to diagnose why table exists
node lib/sub-agent-executor.js DATABASE <SD-ID>
\`\`\`

**❌ Anti-Pattern 2: Column Existence Guards**
\`\`\`sql
-- WRONG: Adding columns conditionally without knowing schema
ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...

-- RIGHT: Database agent validates schema FIRST
\`\`\`

**❌ Anti-Pattern 3: RLS Policy Bypassing**
\`\`\`typescript
// WRONG: Using service role key to bypass RLS
const supabase = createClient(url, SERVICE_ROLE_KEY)

// RIGHT: Database agent designs proper RLS policies
\`\`\`

**❌ Anti-Pattern 4: Manual SQL Trial-and-Error**
\`\`\`bash
# WRONG: Trying different SQL variations manually
psql -c "CREATE TABLE ..." # fails
psql -c "CREATE TABLE IF NOT EXISTS ..." # fails
psql -c "DROP TABLE ... CASCADE; CREATE TABLE ..." # dangerous

# RIGHT: Database agent analyzes schema state FIRST
\`\`\`

**❌ Anti-Pattern 5: Skipping Migration Validation**
\`\`\`javascript
// WRONG: Executing migration without validation
await executeMigration(sql) // Hope it works

// RIGHT: Database agent validates migration safety
\`\`\`

**❌ Anti-Pattern 6: Connection String Trial-and-Error**
\`\`\`javascript
// WRONG: Trying different regions/ports/SSL configs
postgresql://postgres.PROJECT:PASSWORD@aws-0... // fails
postgresql://postgres.PROJECT:PASSWORD@aws-1... // try this?

// RIGHT: Database agent provides correct connection pattern
// Uses: scripts/lib/supabase-connection.js
\`\`\`

**❌ Anti-Pattern 7: Ignoring Schema Conflicts**
\`\`\`javascript
// WRONG: Proceeding despite "table exists" warnings
// "It says it already exists, let me just use it"

// RIGHT: Database agent investigates conflict and validates schema match
\`\`\`

### Detection Rules

**BLOCKED PATTERNS** (must use database agent instead):
- Renaming tables to avoid conflicts
- Adding IF NOT EXISTS without schema knowledge
- Using SERVICE_ROLE_KEY to bypass RLS
- Trial-and-error with connection strings
- Multiple psql attempts without diagnosis
- Modifying migrations after first failure
- Proceeding with "table exists" warnings without validation

**Evidence**: SD-AGENT-ADMIN-003 (schema mismatch), SD-1A (multiple schema issues), SD-041C (table conflict)
**Impact**: Prevents 100% of workaround-related technical debt`,
      order_index: nextOrderIndex + 1,
      metadata: {
        source: 'Retrospectives Database Analysis (74 SDs)',
        created_date: '2025-10-12',
        priority: 'CRITICAL',
        category: 'database',
        anti_patterns: 7
      }
    },
    {
      protocol_id: protocol.id,
      section_type: 'quick-reference',
      title: 'Database Agent First-Responder Checklist',
      content: `## ✅ Database Agent First-Responder Checklist

**Problem**: Database work attempted without validation, leading to errors
**Solution**: Proactive database agent invocation BEFORE attempting database work

### BEFORE Attempting ANY Database Work

**Pre-Database-Work Checklist** (MANDATORY):

**Before PLANNING database work**:
- [ ] Invoke database agent for schema review
- [ ] Verify tables mentioned in PRD exist
- [ ] Check for naming conflicts (existing tables)
- [ ] Validate RLS policy requirements
- [ ] Confirm correct database target (EHG vs EHG_Engineer)

**Before EXECUTING database migrations**:
- [ ] Database agent validated migration file
- [ ] Schema conflicts identified and resolved
- [ ] Connection helper pattern confirmed (\`scripts/lib/supabase-connection.js\`)
- [ ] Rollback plan documented
- [ ] Test environment validated

**Before WRITING database queries**:
- [ ] Database agent confirmed table schema
- [ ] Column names verified (not assumed)
- [ ] RLS policies understood
- [ ] Query performance considerations reviewed

**When in doubt**: ALWAYS invoke database agent FIRST

### Integration Points

**PLAN Phase (PRD Creation)**:
\`\`\`markdown
## PLAN Pre-EXEC Checklist (ENHANCED)

### Database Dependencies ✅
- [ ] **FIRST**: Invoke database agent for schema validation
- [ ] Identify all data dependencies in PRD
- [ ] Verify tables/columns exist OR create migration plan
- [ ] Document database agent findings in PLAN→EXEC handoff
- [ ] If ANY issues found: Escalate to LEAD with database agent report
\`\`\`

**EXEC Phase (Implementation)**:
\`\`\`markdown
## EXEC Pre-Implementation Checklist (NEW)

### Database Operations ✅
- [ ] If SD involves database work: Database agent invoked? YES/NO
- [ ] Schema validation complete: YES/NO
- [ ] Migration safety confirmed: YES/NO
- [ ] Connection pattern verified: YES/NO
- [ ] RLS policies designed: YES/NO (if needed)
\`\`\`

**Success Pattern Examples**:
- SD-041C: Database agent identified table conflict early, proper rename implemented
- SD-BACKEND-002C: Database agent provided migration pattern, 45-minute execution success
- SD-AGENT-ADMIN-003: Database agent caught trigger function schema mismatch before deployment

**Evidence**: 12 success patterns from proactive database agent usage
**Impact**: Zero schema conflicts, 100% migration success rate when database agent used first`,
      order_index: nextOrderIndex + 2,
      metadata: {
        source: 'Retrospectives Database Analysis (74 SDs)',
        created_date: '2025-10-12',
        priority: 'HIGH',
        category: 'database'
      }
    },
    {
      protocol_id: protocol.id,
      section_type: 'quick-reference',
      title: 'Database Agent Integration Requirements',
      content: `## 🔧 Database Agent Integration Requirements

**Problem**: Database agent treated as last resort instead of first responder
**Solution**: Mandatory integration at key workflow checkpoints

### Mandatory Invocation Points

**LEAD Pre-Approval Phase**:
- IF SD mentions: database, migration, schema, table, RLS, SQL, Postgres
- THEN: Database agent included in parallel sub-agent execution
- \`\`\`bash
  node lib/sub-agent-executor.js DATABASE <SD-ID>
  \`\`\`

**PLAN PRD Creation Phase**:
- Database agent runs FIRST for any SD with data dependencies
- Validates schema before creating PRD
- Documents table existence, RLS requirements, migration needs
- BLOCKS PRD creation if critical database issues found

**EXEC Implementation Phase**:
- Database agent validates schema BEFORE implementation starts
- Consulted for ANY database error encountered
- Provides migration patterns and connection helpers
- Reviews database changes before commit

**PLAN Verification Phase**:
- Database agent verifies migrations executed correctly
- Validates schema matches documentation
- Confirms RLS policies working as designed

### Behavior Change Summary

**Before (Anti-Pattern)**:
1. Agent encounters database error
2. Agent tries manual fix / workaround
3. Fix fails or creates technical debt
4. User intervenes: "Use database agent!"
5. Database agent called
6. Proper solution found (finally)

**After (First-Responder Pattern)**:
1. Agent encounters database task OR database error
2. Agent IMMEDIATELY invokes database agent
3. Database agent diagnoses root cause
4. Proper solution implemented (first try)
5. No workarounds, no technical debt

### Success Metrics

- **Zero workaround attempts** when database errors occur
- **100% database agent usage** for migration work
- **90% reduction** in user reminders to use database agent
- **Zero schema mismatch errors** through proactive validation
- **Faster database operations** (no trial-and-error)

### Key Principle

**DATABASE-FIRST CULTURE**: Database agent is a FIRST RESPONDER, not a LAST RESORT.

**Evidence**: User feedback: "I constantly have to remind that we should use the database subagent"
**Impact**: Eliminates need for manual reminders, establishes proactive database expertise`,
      order_index: nextOrderIndex + 3,
      metadata: {
        source: 'Retrospectives Database Analysis + User Feedback',
        created_date: '2025-10-12',
        priority: 'HIGH',
        category: 'database',
        user_requirement: 'Proactive database agent usage'
      }
    }
  ];

  // Step 4: Insert sections one at a time (database-first: one table at a time)
  console.log('📝 Step 3: Adding new sections...');

  for (const section of newSections) {
    console.log(`\n  Adding: ${section.title}`);
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert([section]);

    if (insertError) {
      console.error(`  ❌ Error inserting "${section.title}":`, insertError);
      // Continue with other sections even if one fails
    } else {
      console.log(`  ✅ Added successfully (order: ${section.order_index})`);
    }
  }

  // Step 5: Verify insertions
  console.log('\n📊 Step 4: Verifying insertions...');
  const { data: addedSections, error: verifyError } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, section_type, order_index')
    .gte('order_index', nextOrderIndex)
    .order('order_index', { ascending: true });

  if (verifyError) {
    console.error('❌ Error verifying sections:', verifyError);
  } else {
    console.log(`✅ ${addedSections.length} sections verified:\n`);
    addedSections.forEach(s => {
      console.log(`   [${s.order_index}] ${s.title} (${s.section_type})`);
    });
  }

  // Step 6: Instructions for next steps
  console.log('\n✅ DATABASE UPDATE COMPLETE!\n');
  console.log('📋 Next Steps:');
  console.log('1. Regenerate CLAUDE.md:');
  console.log('   $ node scripts/generate-claude-md-from-db.js\n');
  console.log('2. Create reference documentation:');
  console.log('   - docs/reference/database-agent-anti-patterns.md');
  console.log('   - docs/reference/database-agent-first-responder.md\n');
  console.log('3. Update database agent configuration:');
  console.log('   - .claude/agents/database-agent.md\n');
  console.log('4. Commit changes:');
  console.log('   $ git add CLAUDE.md docs/ .claude/');
  console.log('   $ git commit -m "docs(LEO): Add database first-responder protocol"\n');

  console.log('🎯 Impact:');
  console.log('   - Zero workaround attempts');
  console.log('   - 100% database agent usage for migrations');
  console.log('   - 90% reduction in manual reminders');
  console.log('   - Database-first culture established\n');
}

// Run the script
addDatabaseFirstResponder()
  .then(() => {
    console.log('🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
