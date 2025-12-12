#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('lifecycle_stage_config')
    .select('stage_number, stage_name, description, phase_number, phase_name')
    .gte('stage_number', 6)
    .lte('stage_number', 9)
    .order('stage_number');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('📋 lifecycle_stage_config for Stages 6-9:\n');
  data?.forEach(s => {
    console.log(`Stage ${s.stage_number}: ${s.stage_name}`);
    console.log(`   Phase: ${s.phase_number} - ${s.phase_name}`);
    console.log(`   Description: ${s.description}`);
    console.log('');
  });
}

main();
