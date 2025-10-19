#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking sd_phase_handoffs table schema');

// Try to query existing handoffs to see structure
const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .limit(1);

if (error) {
  console.error('❌ Error:', error);
} else {
  console.log('✅ Sample record:');
  console.log(JSON.stringify(data, null, 2));
}

// Also check what columns exist
const { data: columns, error: schemaError } = await supabase
  .rpc('get_table_columns', { table_name: 'sd_phase_handoffs' })
  .catch(() => null);

if (columns) {
  console.log('\n📊 Columns:', columns);
}
