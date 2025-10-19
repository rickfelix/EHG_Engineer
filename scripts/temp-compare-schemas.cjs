require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

(async () => {
  // Get schema for leo_handoff_executions
  const { data: legacyData, error: legacyError } = await supabase
    .from('leo_handoff_executions')
    .select('*')
    .limit(1);

  // Get schema for sd_phase_handoffs
  const { data: unifiedData, error: unifiedError } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .limit(1);

  console.log('=== LEGACY TABLE (leo_handoff_executions) ===');
  console.log('Sample record:', JSON.stringify(legacyData?.[0] || {}, null, 2));
  console.log('Fields:', legacyData?.[0] ? Object.keys(legacyData[0]).join(', ') : 'NONE');

  console.log('\n=== UNIFIED TABLE (sd_phase_handoffs) ===');
  console.log('Sample record:', JSON.stringify(unifiedData?.[0] || {}, null, 2));
  console.log('Fields:', unifiedData?.[0] ? Object.keys(unifiedData[0]).join(', ') : 'NONE');

  // Get row counts
  const { count: legacyCount } = await supabase
    .from('leo_handoff_executions')
    .select('*', { count: 'exact', head: true });

  const { count: unifiedCount } = await supabase
    .from('sd_phase_handoffs')
    .select('*', { count: 'exact', head: true });

  console.log('\n=== RECORD COUNTS ===');
  console.log(`Legacy: ${legacyCount} records`);
  console.log(`Unified: ${unifiedCount} records`);
  console.log(`Gap: ${legacyCount - unifiedCount} records to migrate`);
})().catch(console.error);
