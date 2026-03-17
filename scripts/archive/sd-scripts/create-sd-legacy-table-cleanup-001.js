#!/usr/bin/env node

/**
 * Create SD for investigating legacy strategic_directives table cleanup
 * This is a technical debt investigation SD
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

async function createLegacyTableCleanupSD() {
  console.log('📋 Creating SD-TECH-DEBT-LEGACY-SD-001...\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const sdData = {
    id: randomUUID(),
    sd_key: 'SD-TECH-DEBT-LEGACY-SD-001',
    title: 'Investigate and Clean Up Legacy strategic_directives Table',
    status: 'draft',
    current_phase: 'LEAD',
    category: 'infrastructure',
    priority: 'low',
    sd_type: 'infrastructure',
    description: `## Overview
Investigate the legacy \`strategic_directives\` table to determine:
1. What (if anything) still depends on it
2. Whether it can be safely removed
3. Migration path if any data needs to be preserved

## Background
The system has migrated to \`strategic_directives_v2\` as the primary SD table. The old \`strategic_directives\` table may still exist and could be:
- Actively referenced by legacy scripts
- Used as a fallback by some queries
- Completely orphaned and safe to drop

## Investigation Scope
1. **Script Dependencies**
   - Search all scripts for references to \`strategic_directives\` (without _v2 suffix)
   - Identify any that specifically exclude _v2 pattern

2. **RLS Policy Dependencies**
   - Check if any RLS policies reference the old table

3. **View/Function Dependencies**
   - Check for database views that select from the old table
   - Check for functions that reference it

4. **Application Code**
   - Search EHG app for any imports/queries to the old table

5. **Data Assessment**
   - Compare row counts between old and v2 tables
   - Identify any data in old table not in v2

## Deliverables
- Dependency audit report
- Cleanup recommendation (drop, archive, or migrate)
- Migration script if needed`,
    rationale: 'Technical debt cleanup to reduce confusion and maintenance burden from having two SD tables with similar names.',
    scope: 'Investigation only - no destructive changes without separate approval',
    created_by: 'LEAD',
    sequence_rank: 999, // Low priority, do when convenient
    version: '1.0',
    metadata: {
      investigation_type: 'dependency_audit',
      tables_involved: ['strategic_directives', 'strategic_directives_v2'],
      risk_level: 'low',
      estimated_effort: 'small',
      created_context: 'Conversation identified need to clean up legacy table'
    }
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating SD:', error.message);
      process.exit(1);
    }

    console.log('✅ SD created successfully!');
    console.log(`   ID: ${data.id}`);
    console.log(`   Key: ${data.sd_key}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Phase: ${data.current_phase}`);
    console.log('\n📝 Next steps:');
    console.log('1. Review SD in LEAD phase');
    console.log('2. Approve when ready to investigate');
    console.log('3. Run: node scripts/handoff.js execute LEAD-TO-PLAN SD-TECH-DEBT-LEGACY-SD-001');

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

createLegacyTableCleanupSD();
