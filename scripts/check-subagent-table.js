#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from('leo_sub_agents')
  .select('*')
  .limit(1);

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log('No records found');
  process.exit(0);
}

console.log('Available columns:');
console.log(Object.keys(data[0]).sort().join(', '));
console.log('\nSample record:');
console.log(JSON.stringify(data[0], null, 2));
