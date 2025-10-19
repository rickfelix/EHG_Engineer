#!/usr/bin/env node
/**
 * Add Database Migration Validation section to CLAUDE.md
 * Context: SD-RECONNECT-009 lesson learned, enhanced for SD-AGENT-PLATFORM-001
 *
 * This script adds migration validation guidance to leo_protocol_sections
 * so it appears in auto-generated CLAUDE.md
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const MIGRATION_VALIDATION_CONTENT = `## 🔍 Database Migration Validation - Two-Phase Approach (MANDATORY)

**Critical Lesson**: SD-AGENT-PLATFORM-001 taught us that migration files can exist and be applied successfully, but **seed data can fail silently**, leaving empty tables.

**Solution**: Two-phase validation catches BOTH file syntax issues AND database state mismatches.

---

### Phase 1: Static File Validation (Always Runs)

**Validates migration files WITHOUT connecting to database**:

- ✅ Migration files exist for SD-ID
- ✅ SQL syntax is valid (no unclosed quotes, balanced parentheses)
- ✅ Required patterns present (CREATE TABLE, ALTER TABLE, etc.)
- ✅ SD references in comments
- ✅ Cross-schema foreign keys detected (auth.users, etc.)

**Command**:
\`\`\`bash
node scripts/validate-migration-files.js <SD-ID>
\`\`\`

**Verdict**: \`VALID\`, \`INVALID\`, \`INCOMPLETE\`, or \`NOT_REQUIRED\`

---

### Phase 2: Database Verification (Optional, via \`--verify-db\`)

**Validates database state matches migration expectations**:

- ✅ Tables mentioned in migration actually exist in database
- ✅ Tables are accessible (RLS policies allow access)
- ✅ Seed data was inserted (with \`--check-seed-data\`)

**Command**:
\`\`\`bash
node scripts/validate-migration-files.js <SD-ID> --verify-db --check-seed-data
\`\`\`

**Verdicts**:
- \`DB_MISMATCH\`: Files valid but tables missing
- \`DB_ACCESS_ISSUE\`: Tables exist but not accessible (RLS)
- \`SEED_DATA_MISSING\`: Tables exist but 0 rows (silent failure)
- \`VALID\`: All checks passed

---

### The SD-AGENT-PLATFORM-001 Pattern

**What Happened**:
1. ✅ Migration file \`20251008000000_agent_platform_schema.sql\` existed
2. ✅ Migration was applied (tables created successfully)
3. ❌ Seed data section failed silently
4. ❌ Result: 0 records in all tables (ai_ceo_agents, agent_departments, etc.)

**How Two-Phase Validation Catches This**:

\`\`\`bash
# Old validation (file-only):
node scripts/validate-migration-files.js AGENT-PLATFORM-001
# ❌ Result: "VALID - migration file exists and syntax correct"
#    Did NOT catch empty tables!

# New validation (file + database):
node scripts/validate-migration-files.js AGENT-PLATFORM-001 --verify-db --check-seed-data
# ✅ Result: "SEED_DATA_MISSING - Tables exist but 0 rows"
#    CAUGHT THE ISSUE!
\`\`\`

---

### Integration with LEO Protocol

#### PLAN Agent Pre-EXEC Checklist
Before creating PLAN→EXEC handoff:
\`\`\`bash
node scripts/validate-migration-files.js <SD-ID>
# Verdict must be: VALID, VALID_WITH_WARNINGS, or NOT_REQUIRED
\`\`\`

#### EXEC Agent Pre-Handoff Checklist
Before creating EXEC→PLAN handoff:
\`\`\`bash
node scripts/validate-migration-files.js <SD-ID> --verify-db --check-seed-data
# Verdict must be: VALID or NOT_REQUIRED
# BLOCKED if: DB_MISMATCH, DB_ACCESS_ISSUE, SEED_DATA_MISSING
\`\`\`

#### Database Architect Sub-Agent (Automatic)
Triggers on:
- \`EXEC_IMPLEMENTATION_COMPLETE\` (runs full validation automatically)
- \`schema\` or \`migration\` keywords

Executes: \`validate-migration-files.js --verify-db --check-seed-data\`

Stores results in: \`sub_agent_execution_results\` table

---

### Usage Examples

#### Basic Validation (File-only)
\`\`\`bash
node scripts/validate-migration-files.js RECONNECT-014
\`\`\`
**Use when**: Creating PRD, checking syntax before commit

#### Full Validation (File + Database)
\`\`\`bash
node scripts/validate-migration-files.js RECONNECT-014 --verify-db
\`\`\`
**Use when**: EXEC→PLAN handoff, verifying migration was applied

#### Comprehensive Check (File + Database + Seed Data)
\`\`\`bash
node scripts/validate-migration-files.js AGENT-PLATFORM-001 --verify-db --check-seed-data
\`\`\`
**Use when**: Seed data is critical to functionality (agent platform, user roles, config)

---

### Common Scenarios

**Scenario 1: Migration file has syntax errors**
- Phase 1: \`INVALID\` verdict
- Action: Fix SQL syntax errors
- Phase 2: Not executed

**Scenario 2: Migration applied but tables missing**
- Phase 1: \`VALID\`
- Phase 2: \`DB_MISMATCH\` verdict
- Action: Apply migration (\`supabase db push\`)

**Scenario 3: Tables exist but empty (SD-AGENT-PLATFORM-001)**
- Phase 1: \`VALID\`
- Phase 2: \`SEED_DATA_MISSING\` verdict
- Action: Re-run seed data script

**Scenario 4: No database changes needed**
- Phase 1: \`NOT_REQUIRED\`
- Action: Proceed without migration validation

---

### Cross-Schema Foreign Keys (Still Validated)

Phase 1 also checks for cross-schema FKs (from SD-RECONNECT-009 lesson):

\`\`\`sql
-- ❌ WRONG: Cross-schema FK
documentation_author UUID REFERENCES auth.users(id),

-- ✅ CORRECT: UUID without FK
documentation_author UUID,  -- FK to auth.users removed
\`\`\`

**Why**: Supabase migrations cannot reference auth schema. Use \`auth.uid()\` in RLS policies instead.

---

**Comprehensive Guide**: See \`docs/database-migration-validation-guide.md\` for troubleshooting, best practices, and error resolution.
`;

async function addMigrationValidationSection() {
  console.log('🔍 Adding migration validation section to leo_protocol_sections...');

  // Get current active protocol
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.error('❌ Error finding active protocol:', protocolError);
    return;
  }

  console.log(`✅ Found active protocol: ${protocol.id}`);

  // Check if section already exists
  const { data: existing } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('protocol_id', protocol.id)
    .eq('section_type', 'best_practices')
    .eq('title', 'Database Migration Validation')
    .single();

  if (existing) {
    console.log('⚠️  Section already exists, updating...');
    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        title: 'Database Migration Validation - Two-Phase Approach',
        content: MIGRATION_VALIDATION_CONTENT,
        order_index: 850,  // More prominent placement
        metadata: {
          source: 'SD-AGENT-PLATFORM-001',
          also_addresses: 'SD-RECONNECT-009',
          updated_date: '2025-10-10',
          priority: 'critical',
          feature: 'two-phase validation (file + database state)'
        }
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('❌ Update failed:', updateError);
      return;
    }

    console.log('✅ Section updated successfully');
  } else {
    // Insert new section
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocol.id,
        section_type: 'database_migration_validation',
        title: 'Database Migration Validation - Two-Phase Approach',
        content: MIGRATION_VALIDATION_CONTENT,
        order_index: 850,  // More prominent placement
        metadata: {
          source: 'SD-AGENT-PLATFORM-001',
          also_addresses: 'SD-RECONNECT-009',
          created_date: '2025-10-10',
          priority: 'critical',
          feature: 'two-phase validation (file + database state)'
        }
      });

    if (insertError) {
      console.error('❌ Insert failed:', insertError);
      return;
    }

    console.log('✅ Section added successfully');
  }

  console.log('\n📋 Next steps:');
  console.log('1. Run: node scripts/generate-claude-md-from-db.js');
  console.log('2. Verify migration validation appears in CLAUDE.md');
  console.log('3. Commit changes');
}

addMigrationValidationSection();
