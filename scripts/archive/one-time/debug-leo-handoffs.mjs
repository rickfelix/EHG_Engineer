#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug() {
  const sdId = process.argv[2] || 'SD-VISION-V2-002';

  console.log(`🔍 Debugging LEO handoff executions for ${sdId}`);
  console.log('');

  // Check leo_handoff_executions (what handoff.js verify uses)
  const { data: leoHandoffs, error: leoError } = await supabase
    .from('leo_handoff_executions')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: true });

  if (leoError) {
    console.log('leo_handoff_executions Error:', leoError.message);
  } else {
    console.log('=== LEO_HANDOFF_EXECUTIONS ===');
    if (leoHandoffs === null || leoHandoffs.length === 0) {
      console.log('No records found');
    } else {
      leoHandoffs.forEach(h => {
        console.log(`  ${h.handoff_type}: ${h.status} - ${h.created_at}`);
      });
      console.log('');
      console.log(`Total: ${leoHandoffs.length}`);

      const accepted = leoHandoffs.filter(h => h.status === 'accepted');
      console.log(`Accepted: ${accepted.length}`);
      console.log('Accepted types:', accepted.map(h => h.handoff_type).join(', '));
    }
  }
}

debug().catch(console.error);
