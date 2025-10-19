#!/usr/bin/env node

/**
 * Update Database Architect Sub-Agent with Migration Validation Capabilities
 *
 * Adds two-phase validation responsibilities and script path
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const UPDATED_DESCRIPTION = `Database architect with 30 years experience scaling systems from startup to IPO.

**Core Expertise**:
- Performance optimization, sharding strategies, migration patterns
- ACID vs BASE tradeoffs, normalization strategies
- Makes data access patterns drive schema design

**Migration Validation** (NEW):
- **Phase 1: Static File Validation**
  - Validates migration SQL syntax
  - Checks for cross-schema foreign keys (auth.users)
  - Verifies SD references in comments
  - Extracts table names for verification
- **Phase 2: Database Verification** (optional --verify-db flag)
  - Verifies tables exist in database (read-only)
  - Checks table accessibility (RLS policies)
  - Validates seed data was inserted (--check-seed-data)

**Lesson Learned**: SD-AGENT-PLATFORM-001 - migration files can exist and be applied successfully, but seed data can fail silently, leaving empty tables.

**Validation Script**: \`scripts/validate-migration-files.js\`

**When to Trigger**:
- PLAN→EXEC handoff: File validation (syntax check)
- EXEC→PLAN handoff: Database verification (tables + seed data)
- Anytime "schema" or "migration" keywords detected`;

const SCRIPT_PATH = 'scripts/validate-migration-files.js';

async function updateDatabaseArchitect() {
  console.log('\n🗄️  UPDATING DATABASE ARCHITECT SUB-AGENT');
  console.log('═'.repeat(60));
  console.log();

  try {
    // Update sub-agent
    const { data: updated, error: updateError } = await supabase
      .from('leo_sub_agents')
      .update({
        description: UPDATED_DESCRIPTION,
        script_path: SCRIPT_PATH,
        metadata: {
          updated_for: 'SD-AGENT-PLATFORM-001',
          updated_date: '2025-10-10',
          feature: 'two-phase migration validation'
        }
      })
      .eq('code', 'DATABASE')
      .select()
      .single();

    if (updateError) {
      console.error('❌ Update failed:', updateError.message);
      process.exit(1);
    }

    console.log('✅ Database Architect sub-agent updated');
    console.log('   ID:', updated.id);
    console.log('   Script Path:', updated.script_path);
    console.log();

    // Check if we need to add EXEC_IMPLEMENTATION_COMPLETE trigger
    const { data: execTrigger } = await supabase
      .from('leo_sub_agent_triggers')
      .select('*')
      .eq('sub_agent_id', updated.id)
      .eq('trigger_phrase', 'EXEC_IMPLEMENTATION_COMPLETE')
      .single();

    if (!execTrigger) {
      console.log('Adding EXEC_IMPLEMENTATION_COMPLETE trigger...');

      const { error: triggerError } = await supabase
        .from('leo_sub_agent_triggers')
        .insert({
          sub_agent_id: updated.id,
          trigger_phrase: 'EXEC_IMPLEMENTATION_COMPLETE',
          trigger_type: 'keyword',
          trigger_context: 'any context',
          priority: 6,
          active: true,
          metadata: {
            purpose: 'automatic migration verification after implementation',
            action: 'run validate-migration-files.js --verify-db --check-seed-data'
          }
        });

      if (triggerError) {
        console.warn('⚠️  Could not add trigger:', triggerError.message);
      } else {
        console.log('✅ EXEC_IMPLEMENTATION_COMPLETE trigger added');
      }
    } else {
      console.log('✅ EXEC_IMPLEMENTATION_COMPLETE trigger already exists');
    }

    console.log();
    console.log('═'.repeat(60));
    console.log('🎯 DATABASE ARCHITECT NOW KNOWS:');
    console.log('   - How to validate migration files (syntax, patterns)');
    console.log('   - How to verify database state (tables, seed data)');
    console.log('   - When to trigger (PLAN→EXEC, EXEC→PLAN, keywords)');
    console.log('   - What script to run (validate-migration-files.js)');
    console.log();
    console.log('📋 NEXT STEPS:');
    console.log('   1. Update migration validation section in leo_protocol_sections');
    console.log('   2. Regenerate CLAUDE.md');
    console.log('   3. Test sub-agent with migration validation');
    console.log();

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

updateDatabaseArchitect();
