require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('Using database:', process.env.SUPABASE_URL);

  // First verify SD exists
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status')
    .eq('sd_key', 'SD-RECURSION-AI-001')
    .maybeSingle();

  if (sdErr) {
    console.error('❌ SD query error:', sdErr.message);
    process.exit(1);
  }

  if (!sd) {
    console.error('❌ SD not found: SD-RECURSION-AI-001');
    process.exit(1);
  }

  console.log('✅ SD found:', { id: sd.id, status: sd.status });

  // Get sample handoff to see schema
  const { data: sample, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Handoff query error:', error.message);
  } else if (sample && sample.length > 0) {
    console.log('\n✅ sd_phase_handoffs columns:');
    Object.keys(sample[0]).sort().forEach(col => {
      const value = sample[0][col];
      const type = value === null ? 'null' : typeof value;
      console.log('  - ' + col + ': ' + type);
    });
  } else {
    console.log('⚠️ No handoff records exist yet');
  }
})();
