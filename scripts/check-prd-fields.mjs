#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: prds } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', 'PRD-d4703d1e-4b2c-43ec-a1df-586d80077a6c');

const prd = prds[0];

console.log('PRD Fields Check:');
console.log('='.repeat(50));

const requiredFields = [
  'executive_summary',
  'functional_requirements',
  'system_architecture',
  'acceptance_criteria',
  'test_scenarios',
  'implementation_approach',
  'risks'
];

requiredFields.forEach(field => {
  const exists = prd.hasOwnProperty(field);
  const hasValue = prd[field] !== null && prd[field] !== undefined;
  const isEmpty = hasValue && prd[field].toString().trim() === '';

  console.log(`${field}:`);
  console.log(`  - Exists: ${exists ? '✅' : '❌'}`);
  console.log(`  - Has value: ${hasValue ? '✅' : '❌'}`);
  if (hasValue) {
    console.log(`  - Empty: ${isEmpty ? '❌' : '✅'}`);
    console.log(`  - Type: ${typeof prd[field]}`);
    if (typeof prd[field] === 'string') {
      console.log(`  - Length: ${prd[field].length}`);
    }
  }
  console.log();
});

console.log('All PRD keys:');
console.log(Object.keys(prd).sort());
