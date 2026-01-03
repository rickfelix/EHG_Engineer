#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check for EXEC handoff
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, from_phase, to_phase, handoff_type, status')
    .eq('sd_id', 'SD-FOUNDATION-SECURITY-001')
    .order('created_at');

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log(`Found ${data.length} handoffs:`);
    data.forEach(h => {
      console.log(`  - ${h.handoff_type}: ${h.from_phase} → ${h.to_phase} (${h.status})`);
    });
  }

  // Check the current phase
  console.log('\nSD Details:');
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, current_phase, status, progress_percentage, is_working_on')
    .eq('id', 'SD-FOUNDATION-SECURITY-001');

  if (sdError) {
    console.error('Error getting SD:', sdError.message);
  } else {
    const s = sd[0];
    console.log(`  - Current Phase: ${s.current_phase}`);
    console.log(`  - Status: ${s.status}`);
    console.log(`  - Progress: ${s.progress_percentage}%`);
    console.log(`  - Working On: ${s.is_working_on}`);
  }
}

check();
