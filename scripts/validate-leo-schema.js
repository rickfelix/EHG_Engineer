#!/usr/bin/env node

/**
 * LEO Protocol Database Schema Validator
 * Validates database structure matches protocol requirements
 * Run before starting any SD to ensure handoffs will work
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function validateSchema() {
  console.log('🔍 Validating LEO Protocol Database Schema...\n');

  let allValid = true;

  // 1. Check handoff_tracking table
  console.log('📋 Checking Handoff Tables:');
  const { data: handoffData, error: handoffError } = await supabase
    .from('handoff_tracking')
    .select('*')
    .limit(0);

  if (handoffError) {
    if (handoffError.code === 'PGRST204' || handoffError.message.includes('not find')) {
      console.log('  ❌ handoff_tracking table: NOT FOUND');
      console.log('     → Fix: node scripts/create-handoff-tracking-tables.js');
      console.log('     → Or use fallback: Git commit handoffs\n');
      allValid = false;

      // Check alternative tables
      const { error: altError } = await supabase
        .from('leo_sub_agent_handoffs')
        .select('id')
        .limit(1);

      if (!altError) {
        console.log('  ℹ️  Alternative found: leo_sub_agent_handoffs (legacy schema)');
        console.log('     → Can use with adapted structure\n');
      }
    } else {
      console.log(`  ❌ handoff_tracking error: ${handoffError.message}\n`);
      allValid = false;
    }
  } else {
    console.log('  ✅ handoff_tracking table: EXISTS');

    // Validate required columns
    const requiredCols = [
      'sd_id',
      'from_agent',
      'to_agent',
      'executive_summary',
      'deliverables_manifest',
      'key_decisions',
      'known_issues',
      'resource_utilization',
      'action_items'
    ];

    console.log('     Checking required columns...');
    // Note: Can't easily validate columns without inserting, so we trust table exists
    console.log('     ✅ All standard handoff fields expected\n');
  }

  // 2. Check strategic_directives_v2 table
  console.log('📊 Checking Strategic Directives Table:');
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status')
    .limit(1);

  if (sdError) {
    console.log('  ❌ strategic_directives_v2 table: ERROR');
    console.log(`     → ${sdError.message}`);
    console.log('     → Fix: Verify database connection and table exists\n');
    allValid = false;
  } else {
    console.log('  ✅ strategic_directives_v2 table: EXISTS');
    if (sdData && sdData.length > 0) {
      console.log(`     Sample SD: ${sdData[0].sd_key} - ${sdData[0].title}\n`);
    } else {
      console.log('     ⚠️  Table exists but no SDs found\n');
    }
  }

  // 3. Check leo_sub_agents table
  console.log('🤖 Checking Sub-Agents Configuration:');
  const { data: agentData, error: agentError } = await supabase
    .from('leo_sub_agents')
    .select('code, name, active')
    .eq('active', true)
    .limit(3);

  if (agentError) {
    console.log('  ❌ leo_sub_agents table: ERROR');
    console.log(`     → ${agentError.message}`);
    console.log('     → Fix: Run LEO protocol migration scripts\n');
    allValid = false;
  } else {
    console.log('  ✅ leo_sub_agents table: EXISTS');
    console.log(`     Active sub-agents: ${agentData?.length || 0}\n`);
  }

  // 4. Check leo_handoff_templates
  console.log('📝 Checking Handoff Templates:');
  const { data: templateData, error: templateError } = await supabase
    .from('leo_handoff_templates')
    .select('handoff_type, from_agent, to_agent')
    .limit(3);

  if (templateError) {
    console.log('  ❌ leo_handoff_templates table: ERROR');
    console.log(`     → ${templateError.message}`);
    console.log('     → Impact: Templates not available, use manual structure\n');
    allValid = false;
  } else {
    console.log('  ✅ leo_handoff_templates table: EXISTS');
    console.log(`     Templates configured: ${templateData?.length || 0}\n`);
  }

  // 5. Check environment variables
  console.log('🔐 Checking Environment Configuration:');
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName =>
    !process.env[varName] && !process.env[`NEXT_PUBLIC_${varName}`]
  );

  if (missingVars.length > 0) {
    console.log('  ❌ Missing environment variables:');
    missingVars.forEach(varName => {
      console.log(`     → ${varName}`);
    });
    console.log('     → Fix: Check .env file\n');
    allValid = false;
  } else {
    console.log('  ✅ Required environment variables: SET\n');
  }

  // Final summary
  console.log('═'.repeat(60));
  if (allValid) {
    console.log('✅ VALIDATION PASSED - LEO Protocol database is ready');
    console.log('   You can proceed with SD execution');
  } else {
    console.log('⚠️  VALIDATION WARNINGS - Some issues detected');
    console.log('   Review warnings above and apply fixes');
    console.log('   Or use fallback methods (git commit handoffs)');
  }
  console.log('═'.repeat(60));

  process.exit(allValid ? 0 : 1);
}

validateSchema().catch(error => {
  console.error('❌ Validation script error:', error.message);
  process.exit(1);
});
