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
  .select('*')
  .eq('id', 'SD-REALTIME-001')
  .single();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('SD-REALTIME-001 Completeness Check:');
console.log('='.repeat(50));
console.log('✅ = Present | ❌ = Missing/Empty\n');

const fields = {
  'title': data.title,
  'description': data.description,
  'strategic_objectives': data.strategic_objectives,
  'success_metrics': data.success_metrics,
  'key_principles': data.key_principles,
  'risks': data.risks,
  'priority': data.priority,
  'status': data.status
};

let missingFields = [];

Object.entries(fields).forEach(([key, value]) => {
  const present = value && value.toString().trim().length > 0;
  console.log(`${present ? '✅' : '❌'} ${key}: ${present ? '✓' : 'MISSING'}`);
  if (!present) missingFields.push(key);
});

console.log('\n' + '='.repeat(50));
if (missingFields.length > 0) {
  console.log(`Missing fields (${missingFields.length}):`);
  missingFields.forEach(f => console.log(`  - ${f}`));
} else {
  console.log('✅ All required fields present');
}

console.log('\nStatus:', data.status);
console.log('Priority:', data.priority);
