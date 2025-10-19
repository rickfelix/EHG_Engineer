#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .limit(1);

if (error) {
  console.error('❌ Table may not exist:', error.message);
} else if (data && data.length > 0) {
  console.log('sd_phase_handoffs columns:');
  Object.keys(data[0]).sort().forEach(col => {
    console.log(`  - ${col}`);
  });
  
  // Now query for SD-KNOWLEDGE-001
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', 'SD-KNOWLEDGE-001');
    
  console.log(`\nFound ${handoffs?.length || 0} handoff(s) for SD-KNOWLEDGE-001`);
  if (handoffs && handoffs.length > 0) {
    handoffs.forEach((h, idx) => {
      console.log(`\n${idx + 1}. ${h.handoff_type || 'unknown'}`);
      console.log(`   ID: ${h.id}`);
      console.log(`   Status: ${h.status}`);
    });
  }
} else {
  console.log('Table exists but is empty');
}
