#!/usr/bin/env node

/**
 * Fix retrospectives table constraint to allow handoff-related retro_type values
 *
 * Root Cause: Handoff executors use retro_type values like 'LEAD_TO_PLAN' but the
 * database constraint only allowed 'ARCHITECTURE_DECISION', 'INCIDENT', 'SD_COMPLETION'
 *
 * This migration:
 * 1. Drops the existing restrictive constraint
 * 2. Adds new constraint with all valid handoff types
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function main() {
  console.log('🔧 Fixing retrospectives table constraint...\n');

  // Step 1: Check current constraint
  console.log('📋 Step 1: Checking current constraint...');
  const { data: currentConstraints, error: checkError } = await supabase
    .rpc('exec_sql', {
      sql_text: `
        SELECT constraint_name, check_clause
        FROM information_schema.check_constraints
        WHERE constraint_name = 'retrospectives_retro_type_check'
      `
    });

  if (checkError) {
    console.log('⚠️  Could not check current constraint:', checkError.message);
    console.log('   Proceeding with migration anyway...\n');
  } else {
    console.log('   Current constraint:', JSON.stringify(currentConstraints, null, 2));
  }

  // Step 2: Drop existing constraint
  console.log('\n📋 Step 2: Dropping existing constraint...');
  const dropSQL = `
    ALTER TABLE retrospectives
    DROP CONSTRAINT IF EXISTS retrospectives_retro_type_check;
  `;

  const { error: dropError } = await supabase.rpc('exec_sql', {
    sql_text: dropSQL
  });

  if (dropError) {
    console.error('❌ Failed to drop constraint:', dropError.message);
    process.exit(1);
  }
  console.log('✅ Existing constraint dropped');

  // Step 3: Add new constraint with all valid handoff types
  console.log('\n📋 Step 3: Adding new constraint with handoff types...');
  const addSQL = `
    ALTER TABLE retrospectives
    ADD CONSTRAINT retrospectives_retro_type_check
    CHECK (retro_type IN (
      'ARCHITECTURE_DECISION',
      'INCIDENT',
      'SD_COMPLETION',
      'LEAD_TO_PLAN',
      'PLAN_TO_EXEC',
      'EXEC_TO_PLAN',
      'PLAN_TO_LEAD',
      'LEAD_FINAL_APPROVAL',
      'HANDOFF',
      'SPRINT',
      'MILESTONE',
      'WEEKLY',
      'MONTHLY',
      'RELEASE',
      'AUDIT'
    ));
  `;

  const { error: addError } = await supabase.rpc('exec_sql', {
    sql_text: addSQL
  });

  if (addError) {
    console.error('❌ Failed to add new constraint:', addError.message);
    process.exit(1);
  }
  console.log('✅ New constraint added with handoff types');

  // Step 4: Verify new constraint
  console.log('\n📋 Step 4: Verifying new constraint...');
  const { data: newConstraints, error: verifyError } = await supabase
    .rpc('exec_sql', {
      sql_text: `
        SELECT constraint_name, check_clause
        FROM information_schema.check_constraints
        WHERE constraint_name = 'retrospectives_retro_type_check'
      `
    });

  if (verifyError) {
    console.error('❌ Failed to verify constraint:', verifyError.message);
    process.exit(1);
  }

  console.log('   New constraint:', JSON.stringify(newConstraints, null, 2));

  console.log('\n✅ Migration completed successfully!');
  console.log('\n📊 Valid retro_type values now include:');
  console.log('   • Original: ARCHITECTURE_DECISION, INCIDENT, SD_COMPLETION');
  console.log('   • Handoff: LEAD_TO_PLAN, PLAN_TO_EXEC, EXEC_TO_PLAN, PLAN_TO_LEAD, LEAD_FINAL_APPROVAL');
  console.log('   • Other: HANDOFF, SPRINT, MILESTONE, WEEKLY, MONTHLY, RELEASE, AUDIT');
}

main().catch(error => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});
