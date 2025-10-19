#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

(async () => {
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', 'SD-BOARD-VISUAL-BUILDER-003')
    .eq('handoff_type', 'EXEC-to-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('❌ No EXEC→PLAN handoff found for SD-BOARD-VISUAL-BUILDER-003');
    process.exit(0);
  }

  console.log('✅ EXEC→PLAN handoff exists:');
  console.log(JSON.stringify(data[0], null, 2));
})();
