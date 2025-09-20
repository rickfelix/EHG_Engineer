#!/usr/bin/env node

/**
 * Verify PLAN Supervisor Setup
 * Checks if the supervisor tables are created and ready to use
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifySupervisor() {
  console.log('🔍 Verifying PLAN Supervisor Setup\n');
  console.log('='.repeat(50));
  
  let readyCount = 0;
  let totalChecks = 5;
  
  // Check 1: plan_verification_results table
  console.log('\n1. Checking plan_verification_results table...');
  try {
    const { data, error } = await supabase
      .from('plan_verification_results')
      .select('id')
      .limit(1);
    
    if (!error || error.code === 'PGRST116') { // PGRST116 = no rows returned (table exists)
      console.log('   ✅ Table exists and is accessible');
      readyCount++;
    } else if (error.message.includes('does not exist')) {
      console.log('   ❌ Table does not exist');
      console.log('      Run the migration in Supabase SQL editor');
    } else {
      console.log('   ⚠️  Table exists but has issues:', error.message);
    }
  } catch (err) {
    console.log('   ❌ Error checking table:', err.message);
  }
  
  // Check 2: plan_subagent_queries table
  console.log('\n2. Checking plan_subagent_queries table...');
  try {
    const { data, error } = await supabase
      .from('plan_subagent_queries')
      .select('id')
      .limit(1);
    
    if (!error || error.code === 'PGRST116') {
      console.log('   ✅ Table exists and is accessible');
      readyCount++;
    } else {
      console.log('   ❌ Table does not exist');
    }
  } catch (err) {
    console.log('   ❌ Error checking table:', err.message);
  }
  
  // Check 3: plan_conflict_rules table
  console.log('\n3. Checking plan_conflict_rules table...');
  try {
    const { data, error } = await supabase
      .from('plan_conflict_rules')
      .select('count');
    
    if (!error && data) {
      const count = data[0]?.count || 0;
      console.log(`   ✅ Table exists with ${count} rules configured`);
      readyCount++;
    } else {
      console.log('   ❌ Table does not exist');
    }
  } catch (err) {
    console.log('   ❌ Error checking table:', err.message);
  }
  
  // Check 4: PLAN agent exists
  console.log('\n4. Checking PLAN agent configuration...');
  try {
    const { data, error } = await supabase
      .from('leo_agents')
      .select('agent_code, name, verification_percentage')
      .eq('agent_code', 'PLAN')
      .single();
    
    if (data) {
      console.log(`   ✅ PLAN agent exists: ${data.name}`);
      console.log(`      Current verification: ${data.verification_percentage}%`);
      readyCount++;
    } else {
      console.log('   ⚠️  PLAN agent not found');
    }
  } catch (err) {
    console.log('   ❌ Error checking agent:', err.message);
  }
  
  // Check 5: /leo-verify command file
  console.log('\n5. Checking /leo-verify command...');
  const fs = await import('fs');
  const path = await import('path');
  const commandPath = path.join(process.cwd(), '.claude', 'commands', 'leo-verify.md');
  
  if (fs.existsSync(commandPath)) {
    console.log('   ✅ Command file exists');
    readyCount++;
  } else {
    console.log('   ❌ Command file not found');
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY:');
  console.log(`✅ Ready: ${readyCount}/${totalChecks} checks passed`);
  
  if (readyCount === totalChecks) {
    console.log('\n🎉 PLAN Supervisor is fully configured and ready to use!');
    console.log('\nYou can now use:');
    console.log('  • /leo-verify command in Claude Code');
    console.log('  • node scripts/plan-supervisor-verification.js --prd PRD-ID');
    console.log('\nThis is an OPTIONAL enhancement that won\'t disrupt normal LEO Protocol flow.');
  } else if (readyCount >= 3) {
    console.log('\n⚠️  PLAN Supervisor is partially configured');
    console.log('The database tables need to be created.');
    console.log('\nNext step:');
    console.log('1. Go to Supabase dashboard > SQL Editor');
    console.log('2. Run the SQL from: scripts/apply-supervisor-safe.sql');
  } else {
    console.log('\n❌ PLAN Supervisor is not yet configured');
    console.log('\nTo set it up:');
    console.log('1. Go to Supabase dashboard > SQL Editor');
    console.log('2. Run the SQL from: scripts/apply-supervisor-safe.sql');
    console.log('3. Run: node scripts/generate-claude-md-from-db.js');
  }
  
  console.log('='.repeat(50));
}

// Run verification
verifySupervisor().catch(console.error);