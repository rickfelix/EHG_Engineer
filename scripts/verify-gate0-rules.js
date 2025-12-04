#!/usr/bin/env node

/**
 * Verify Gate 0 validation rules in database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: rules, error } = await supabase
  .from('leo_validation_rules')
  .select('*')
  .eq('gate', '0')
  .eq('active', true)
  .order('weight', { ascending: false });

if (error) {
  console.error('Error fetching Gate 0 rules:', error);
  process.exit(1);
}

console.log('\n=== Gate 0 Validation Rules ===\n');
console.log(`Total rules: ${rules.length}`);

const totalWeight = rules.reduce((sum, r) => sum + r.weight, 0);
console.log(`Total weight: ${totalWeight.toFixed(3)}\n`);

rules.forEach(rule => {
  console.log(`Rule: ${rule.rule_name}`);
  console.log(`  Weight: ${(rule.weight * 100).toFixed(0)}%`);
  console.log(`  Required: ${rule.required}`);
  console.log(`  Active: ${rule.active}`);
  console.log('  Criteria:', rule.criteria);
  console.log('');
});

if (Math.abs(totalWeight - 1.0) > 0.001) {
  console.error(`❌ Weights do not sum to 1.0! Total: ${totalWeight}`);
  process.exit(1);
} else {
  console.log('✅ Weights sum to 1.0 (valid)');
}

console.log('\n=== Verification Complete ===\n');
