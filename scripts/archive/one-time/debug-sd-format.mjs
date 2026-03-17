#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('strategic_objectives, success_metrics, key_principles')
  .eq('id', 'SD-REALTIME-001')
  .single();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('='.repeat(50));
console.log('SD-REALTIME-001 Field Formats:');
console.log('='.repeat(50));

console.log('\nstrategic_objectives:');
console.log('Type:', typeof data.strategic_objectives);
console.log('Value:', data.strategic_objectives);

console.log('\nsuccess_metrics:');
console.log('Type:', typeof data.success_metrics);
console.log('Value:', data.success_metrics);

console.log('\nkey_principles:');
console.log('Type:', typeof data.key_principles);
console.log('Value:', data.key_principles);

// Try parsing
console.log('\n' + '='.repeat(50));
console.log('Parsing Tests:');
console.log('='.repeat(50));

['strategic_objectives', 'success_metrics', 'key_principles'].forEach(field => {
  console.log(`\n${field}:`);
  try {
    if (typeof data[field] === 'string') {
      const parsed = JSON.parse(data[field]);
      console.log('✅ Valid JSON - parsed:', Array.isArray(parsed) ? `Array[${parsed.length}]` : typeof parsed);
    } else if (typeof data[field] === 'object') {
      console.log('Already an object:', Array.isArray(data[field]) ? `Array[${data[field].length}]` : 'Object');
    } else {
      console.log('Type:', typeof data[field]);
    }
  } catch (e) {
    console.log('❌ JSON parse error:', e.message);
  }
});
