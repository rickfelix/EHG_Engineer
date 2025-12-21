/**
 * Check if the 9 Industrial sub-agents are registered in agent_registry
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSubAgents() {
  const newAgents = [
    'pricing', 'financial', 'marketing', 'sales', 'crm',
    'analytics', 'monitoring', 'launch', 'valuation'
  ];

  console.log('Checking for 9 Industrial sub-agents in agent_registry...\n');

  const { data, error } = await supabase
    .from('agent_registry')
    .select('id, agent_type, display_name, status')
    .in('agent_type', newAgents);

  if (error) {
    console.error('Error querying agent_registry:', error.message);
    process.exit(1);
  }

  const foundCount = data ? data.length : 0;
  console.log(`Found ${foundCount} of 9 new sub-agents registered:`);

  if (data && data.length > 0) {
    data.forEach(a => console.log(`  ✓ ${a.agent_type} - ${a.display_name} (${a.status})`));
  }

  const missing = newAgents.filter(t => {
    const found = data && data.find(a => a.agent_type === t);
    return !found;
  });

  if (missing.length > 0) {
    console.log('\n❌ Missing sub-agents:', missing.join(', '));
    console.log('\nRun the migration to register them:');
    console.log('  node scripts/run-industrial-subagent-migration.js');
    process.exit(1);
  } else {
    console.log('\n✅ All 9 Industrial sub-agents are registered!');
    process.exit(0);
  }
}

checkSubAgents();
