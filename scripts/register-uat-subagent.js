#!/usr/bin/env node

/**
 * Register UAT Sub-Agent in Database
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function registerUATSubAgent() {
  console.log('📝 Registering UAT Sub-Agent in database...\n');

  // Check if sub-agent already exists
  const { data: existing } = await supabase
    .from('leo_sub_agents')
    .select('id')
    .eq('code', 'UAT')
    .single();

  if (existing) {
    console.log('✓ UAT Sub-Agent already registered');
    return existing.id;
  }

  // Insert the UAT sub-agent
  const { data: subAgent, error: agentError } = await supabase
    .from('leo_sub_agents')
    .insert({
      name: 'UAT Test Executor',
      code: 'UAT',
      description: 'Interactive UAT test execution guide for manual testing',
      priority: 90,
      activation_type: 'manual',
      script_path: 'scripts/uat-test-executor.js',
      context_file: 'lib/agents/uat-sub-agent.js',
      active: true,
      metadata: {
        purpose: 'Guide users through UAT testing with step-by-step instructions',
        capabilities: [
          'Provide test instructions',
          'Record test results',
          'Track test progress',
          'Calculate pass rates',
          'Create defect records',
          'Suggest fixes for failures'
        ],
        integration: 'Uses existing uat_* tables for test management'
      }
    })
    .select()
    .single();

  if (agentError) {
    console.error('❌ Failed to register sub-agent:', agentError.message);
    process.exit(1);
  }

  console.log('✅ UAT Sub-Agent registered successfully');
  console.log(`   ID: ${subAgent.id}`);
  console.log(`   Code: ${subAgent.code}`);
  console.log(`   Priority: ${subAgent.priority}`);

  // Add triggers for the sub-agent
  const triggers = [
    'uat test',
    'execute test',
    'run uat',
    'test execution',
    'manual test',
    'uat testing',
    'start testing',
    'TEST-AUTH',
    'TEST-DASH',
    'TEST-VENT'
  ];

  for (const trigger of triggers) {
    const { error: triggerError } = await supabase
      .from('leo_sub_agent_triggers')
      .insert({
        sub_agent_id: subAgent.id,
        trigger_phrase: trigger,
        trigger_type: 'keyword',
        active: true
      });

    if (!triggerError) {
      console.log(`   + Added trigger: "${trigger}"`);
    }
  }

  console.log('\n✨ UAT Sub-Agent is ready for use!');
  console.log('\nUsage:');
  console.log('  node scripts/uat-test-executor.js           # Auto-detect active test');
  console.log('  node scripts/uat-test-executor.js --list    # List all tests');
  console.log('  node scripts/uat-test-executor.js --status  # Show run status');
  console.log('  node scripts/uat-test-executor.js --test TEST-AUTH-001  # Execute specific test');

  return subAgent.id;
}

registerUATSubAgent();