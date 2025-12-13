import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = '7a33e6f8-a4be-4b60-a071-8d810279f648';

console.log('Testing PRD query with sdId:', sdId);
console.log('Type:', typeof sdId);
console.log('Length:', sdId.length);

// Exact query from analyze-sd.js
const { data: prd, error } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status, prd_phase')
  .eq('directive_id', sdId)
  .limit(1);

console.log('\nQuery result:');
console.log('Error:', error);
console.log('Data:', JSON.stringify(prd, null, 2));
console.log('Length:', prd?.length);

// Try without limit
const { data: prd2 } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status, prd_phase, directive_id')
  .eq('directive_id', sdId);

console.log('\nWithout limit:');
console.log(JSON.stringify(prd2, null, 2));

// Check if directive_id column uses different case
const { data: schema } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .limit(1);

console.log('\nColumn check - first PRD columns:', Object.keys(schema?.[0] || {}));
