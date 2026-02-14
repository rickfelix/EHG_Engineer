#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_id, title, status, version, created_at')
    .eq('sd_id', 'SD-EVA-FEAT-PHASE-A-VALIDATION-001');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('NO PRD FOUND');
  } else {
    console.log('PRD:', JSON.stringify(data, null, 2));
  }

  // Also check SD current state
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, current_phase, progress')
    .eq('sd_key', 'SD-EVA-FEAT-PHASE-A-VALIDATION-001')
    .single();

  if (sd) {
    console.log('\nSD State:', sd.status, sd.current_phase, sd.progress + '%');
  }
}

main();
