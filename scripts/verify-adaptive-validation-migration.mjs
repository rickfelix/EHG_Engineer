import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function verifyMigration() {
  console.log('=== SD-LEO-PROTOCOL-V4-4-0 Migration Verification ===\n');

  // Test 1: Verify columns exist
  console.log('Test 1: Checking if new columns exist...');
  const { data: columns, error: colError } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .limit(1);

  if (colError) {
    console.error('❌ Error:', colError.message);
    return;
  }

  if (columns && columns[0]) {
    const hasValidationMode = 'validation_mode' in columns[0];
    const hasJustification = 'justification' in columns[0];
    const hasConditions = 'conditions' in columns[0];

    console.log(`  validation_mode: ${hasValidationMode ? '✅' : '❌'}`);
    console.log(`  justification: ${hasJustification ? '✅' : '❌'}`);
    console.log(`  conditions: ${hasConditions ? '✅' : '❌'}`);
  }

  // Test 2: Check legacy CONDITIONAL_PASS conversion
  console.log('\nTest 2: Checking legacy data conversion...');
  const { data: conditionalPass, error: cpError } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('verdict', 'CONDITIONAL_PASS');

  if (cpError) {
    console.error('❌ Error:', cpError.message);
  } else {
    console.log(`  Remaining CONDITIONAL_PASS rows: ${conditionalPass.length}`);
    console.log(`  ${conditionalPass.length === 0 ? '✅ All legacy rows converted to PASS' : '⚠️ Legacy data still exists'}`);
  }

  // Test 3: Verify progress breakdown function works
  console.log('\nTest 3: Testing check_required_sub_agents()...');
  const { data: progressData, error: progressError } = await supabase
    .rpc('check_required_sub_agents', { sd_id_param: 'SD-LEO-PROTOCOL-V4-4-0' });

  if (progressError) {
    console.error('❌ Error:', progressError.message);
  } else {
    console.log('  ✅ Function executed successfully');
    console.log(`  Verified agents: ${progressData.total_verified}`);
    console.log(`  Missing agents: ${progressData.total_missing}`);
    console.log(`  Has conditional pass: ${progressData.has_conditional_pass}`);

    // Check if new fields are present in verified agents
    if (progressData.verified_agents && progressData.verified_agents.length > 0) {
      const firstAgent = progressData.verified_agents[0];
      console.log('\n  Agent fields present:');
      console.log(`    validation_mode: ${firstAgent.validation_mode ? '✅' : '❌'}`);
      console.log(`    critical_issues_count: ${firstAgent.critical_issues_count !== undefined ? '✅' : '❌'}`);
      console.log(`    warnings_count: ${firstAgent.warnings_count !== undefined ? '✅' : '❌'}`);
    }
  }

  console.log('\n=== Verification Complete ===');
}

verifyMigration().catch(console.error);
