#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PRD_ID = process.argv[2] || 'PRD-SD-LINT-CLEANUP-001';

console.log('📝 Updating PRD Plan Checklist:', PRD_ID);
console.log('═'.repeat(70));

// Get current checklist
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('plan_checklist')
  .eq('id', PRD_ID)
  .single();

if (!prd || !prd.plan_checklist) {
  console.error('❌ PRD or checklist not found');
  process.exit(1);
}

// Update checklist - mark user stories and security as complete
const updatedChecklist = prd.plan_checklist.map(item => {
  if (item.text.includes('User stories generated') ||
      item.text.includes('Security assessment')) {
    return { ...item, checked: true };
  }
  return item;
});

// Save updated checklist
const { error } = await supabase
  .from('product_requirements_v2')
  .update({
    plan_checklist: updatedChecklist,
    updated_at: new Date().toISOString()
  })
  .eq('id', PRD_ID);

if (error) {
  console.error('❌ Update failed:', error.message);
  process.exit(1);
}

console.log('✅ Plan checklist updated');
console.log('\nChecklist status:');
updatedChecklist.forEach((item, idx) => {
  const status = item.checked ? '✅' : '❌';
  console.log(`   ${status} ${idx + 1}. ${item.text}`);
});

const checked = updatedChecklist.filter(i => i.checked).length;
const total = updatedChecklist.length;
console.log(`\n📊 Completion: ${checked}/${total} (${Math.round(checked/total*100)}%)`);
console.log('═'.repeat(70));
