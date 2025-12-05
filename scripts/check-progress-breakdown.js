#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking Progress Breakdown for SD-KNOWLEDGE-001\n');

const { data, error } = await supabase.rpc('get_progress_breakdown', {
  sd_id_param: 'SD-KNOWLEDGE-001'
});

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('📊 Progress Breakdown:');
console.log(JSON.stringify(data, null, 2));
