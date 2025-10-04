#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: prds, error } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', 'SD-REALTIME-001');

if (error || !prds || prds.length === 0) {
  console.error('Error:', error || 'No PRDs found');
  process.exit(1);
}

const data = prds[0];

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('📋 PRD for SD-REALTIME-001');
console.log('='.repeat(70));
console.log('ID:', data.id);
console.log('Status:', data.status);
console.log('Phase:', data.phase);
console.log('Created:', new Date(data.created_at).toLocaleString());

console.log('\n📝 Executive Summary:');
console.log('-'.repeat(70));
console.log(data.executive_summary);

console.log('\n🎯 Functional Requirements:');
console.log('-'.repeat(70));
const frs = Array.isArray(data.functional_requirements)
  ? data.functional_requirements
  : JSON.parse(data.functional_requirements || '[]');

frs.forEach((fr, i) => {
  console.log(`\n${i + 1}. ${fr.title || fr.id} [${fr.priority}]`);
  console.log(`   ${fr.description}`);
});

console.log('\n⚙️ Non-Functional Requirements:');
console.log('-'.repeat(70));
const nfrs = Array.isArray(data.non_functional_requirements)
  ? data.non_functional_requirements
  : JSON.parse(data.non_functional_requirements || '[]');

nfrs.forEach((nfr, i) => {
  console.log(`${i + 1}. ${nfr.title}: ${nfr.requirement}`);
});

console.log('\n✅ Acceptance Criteria:');
console.log('-'.repeat(70));
const ac = Array.isArray(data.acceptance_criteria)
  ? data.acceptance_criteria
  : JSON.parse(data.acceptance_criteria || '[]');

ac.forEach((criterion, i) => {
  console.log(`${i + 1}. ${criterion.criteria || criterion}`);
});

console.log('\n🏗️ System Architecture:');
console.log('-'.repeat(70));
console.log(data.system_architecture);

console.log('\n📊 Implementation Approach:');
console.log('-'.repeat(70));
console.log(data.implementation_approach);
