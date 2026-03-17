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

console.log('Testing PRD Validation Logic:');
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

let score = 0;
const errors = [];

requiredFields.forEach(field => {
  const value = prd[field];
  const isPresent = value !== null && value !== undefined;

  console.log(`\nField: ${field}`);
  console.log(`  value type: ${typeof value}`);
  console.log(`  isPresent: ${isPresent}`);

  if (!isPresent) {
    errors.push(`Missing required field: ${field}`);
    console.log(`  ❌ MISSING`);
  } else {
    // For strings, check if non-empty after trim
    if (typeof value === 'string' && !value.trim()) {
      errors.push(`Empty required field: ${field}`);
      console.log(`  ❌ EMPTY STRING`);
    } else if (Array.isArray(value) && value.length === 0) {
      errors.push(`Empty array for required field: ${field}`);
      console.log(`  ❌ EMPTY ARRAY`);
    } else {
      score += 10;
      console.log(`  ✅ VALID (+10 points)`);
    }
  }
});

console.log('\n' + '='.repeat(50));
console.log(`Total Score: ${score}/70`);
console.log(`Percentage: ${Math.round((score / 70) * 100)}%`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) {
  errors.forEach(e => console.log(`  - ${e}`));
}
