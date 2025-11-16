#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Get a sample SD to see the schema
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .limit(1);

if (error) {
  console.error('Error:', error.message);
} else if (data.length > 0) {
  console.log('Sample SD columns:');
  console.log(Object.keys(data[0]).sort().join('\n'));
}
