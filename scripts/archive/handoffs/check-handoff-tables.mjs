import { createSupabaseClient } from '../lib/supabase-client.js';

const supabase = createSupabaseClient();

console.log('Checking handoff tracking tables...\n');

const tables = [
  'handoff_tracking',
  'leo_handoff_executions',
  'leo_handoff_validations',
  'leo_handoff_rejections'
];

for (const table of tables) {
  const { data, error } = await supabase
    .from(table)
    .select('count')
    .limit(1);

  if (error) {
    if (error.code === '42P01' || error.message.includes('not found')) {
      console.log(`❌ ${table}: DOES NOT EXIST`);
    } else {
      console.log(`❓ ${table}: ${error.message}`);
    }
  } else {
    console.log(`✅ ${table}: EXISTS`);
  }
}

console.log('\n=== Checking for sample handoffs ===\n');

// Try to query handoff_tracking
const { data: handoffs, error: handoffError } = await supabase
  .from('handoff_tracking')
  .select('sd_id, from_agent, to_agent, status')
  .limit(5);

if (!handoffError && handoffs) {
  console.log(`Found ${handoffs.length} handoffs in handoff_tracking:`);
  handoffs.forEach(h => {
    console.log(`  - ${h.sd_id}: ${h.from_agent}→${h.to_agent} (${h.status})`);
  });
} else {
  console.log('No handoffs found or table does not exist');
}
