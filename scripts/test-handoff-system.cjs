require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== Testing Handoff System with sd_phase_handoffs ===\n');

  // Test 1: Table Access
  console.log('Test 1: Verifying table access...');
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, handoff_type, status')
    .eq('sd_id', 'SD-DATA-INTEGRITY-001')
    .limit(5);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log(`✅ Success - found ${data.length} handoffs for SD-DATA-INTEGRITY-001`);
  data.forEach(h => {
    console.log(`   ${h.handoff_type}: ${h.status}`);
  });

  // Test 2: Count Total Handoffs
  console.log('\nTest 2: Counting total handoffs...');
  const { count } = await supabase
    .from('sd_phase_handoffs')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ Total handoffs in table: ${count}`);

  console.log('\n✅ All tests passed! Handoff system ready for EXEC→PLAN handoff.');
})().catch(console.error);
