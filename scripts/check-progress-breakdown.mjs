#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📊 Progress Breakdown: SD-INFRA-VALIDATION\n');

const { data, error } = await supabase.rpc('get_progress_breakdown', {
  sd_id_param: 'SD-INFRA-VALIDATION'
});

if (error) {
  console.error('❌ Error:', error.message);
} else {
  console.log(JSON.stringify(data, null, 2));
}

console.log('\n🔍 Recalculating Progress...\n');

const { data: newProgress, error: progError } = await supabase.rpc('calculate_sd_progress', {
  sd_id_param: 'SD-INFRA-VALIDATION'
});

if (progError) {
  console.error('❌ Error:', progError.message);
} else {
  console.log('New Progress:', newProgress + '%');
}
