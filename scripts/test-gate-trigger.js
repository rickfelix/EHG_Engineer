import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testGateTrigger() {
  console.log('🔍 Testing Gate Validation Trigger\n');
  
  // First, find the EXEC sub-agent ID
  const { data: execAgent } = await supabase
    .from('leo_sub_agents')
    .select('id, name, code')
    .eq('code', 'EXEC')
    .single();
  
  if (!execAgent) {
    console.error('❌ EXEC sub-agent not found');
    return;
  }
  
  console.log(`Found EXEC agent: ${execAgent.name} (${execAgent.id})`);
  
  // Try to create an execution without gates passed
  console.log('\n📝 Attempting to start EXEC for PRD-SD-001 without gates passed...\n');
  
  const { data, error } = await supabase
    .from('sub_agent_executions')
    .insert({
      sub_agent_id: execAgent.id,
      prd_id: 'PRD-SD-001',
      status: 'running',
      context: { test: 'Testing gate validation' },
      results: {}
    });
  
  if (error) {
    console.log('✅ EXPECTED: Trigger blocked EXEC execution!');
    console.log(`   Error: ${error.message}`);
    
    // Check if it's the right error
    if (error.message.includes('gates have passed')) {
      console.log('\n✅ Gate validation trigger is working correctly!');
    } else {
      console.log('\n⚠️  Unexpected error:', error.message);
    }
  } else {
    console.log('❌ UNEXPECTED: EXEC was allowed without gates!');
    console.log('   This is a security violation - gates should block this');
  }
}

testGateTrigger();
