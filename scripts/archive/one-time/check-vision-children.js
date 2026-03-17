#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Get all children of SD-VISION-TRANSITION-001
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress')
    .like('id', 'SD-VISION-TRANSITION-001D%')
    .order('id');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('Vision Transition Children Status:\n');
  data?.forEach(sd => {
    const statusIcon = sd.status === 'completed' ? '✅' : (sd.status === 'active' ? '🔄' : '⏳');
    console.log(`${statusIcon} ${sd.id}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Status: ${sd.status} | Phase: ${sd.current_phase} | Progress: ${sd.progress}%`);
    console.log('');
  });
}

main();
