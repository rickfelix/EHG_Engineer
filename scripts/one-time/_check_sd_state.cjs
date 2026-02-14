require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = '7d2aa25e-e3a7-4db7-97b3-7a01df699648';

(async () => {
  // 1. Get SD details
  const { data: sd, error: sdErr } = await client
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, is_working_on, progress_percentage')
    .eq('id', SD_UUID)
    .single();

  if (sdErr) {
    console.error('SD query error:', sdErr);
    return;
  }
  console.log('=== SD Details ===');
  console.log(JSON.stringify(sd, null, 2));

  // 2. Get existing handoffs
  const { data: handoffs, error: hErr } = await client
    .from('sd_phase_handoffs')
    .select('id, handoff_type, from_phase, to_phase, status, created_by, created_at, validation_score')
    .eq('sd_id', SD_UUID)
    .order('created_at', { ascending: true });

  if (hErr) {
    console.error('Handoffs query error:', hErr);
    return;
  }
  console.log('\n=== Existing Handoffs ===');
  for (const h of handoffs) {
    console.log(`  ${h.handoff_type} | status=${h.status} | score=${h.validation_score} | by=${h.created_by} | ${h.created_at}`);
  }
  console.log(`  Total: ${handoffs.length} handoffs`);
})();
