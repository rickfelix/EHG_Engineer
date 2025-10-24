#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📝 Updating PRD EXEC Checklist for PRD-SD-LINT-CLEANUP-001');
console.log('═'.repeat(70));

// Get current checklist
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('exec_checklist')
  .eq('id', 'PRD-SD-LINT-CLEANUP-001')
  .single();

if (!prd || !prd.exec_checklist) {
  console.error('❌ PRD or exec_checklist not found');
  process.exit(1);
}

console.log(`\n📋 Current checklist has ${prd.exec_checklist.length} items`);

// Mark all as checked
const updatedChecklist = prd.exec_checklist.map(item => ({
  ...item,
  checked: true
}));

// Update in database
const { error } = await supabase
  .from('product_requirements_v2')
  .update({
    exec_checklist: updatedChecklist,
    updated_at: new Date().toISOString()
  })
  .eq('id', 'PRD-SD-LINT-CLEANUP-001');

if (error) {
  console.error('❌ Update failed:', error.message);
  process.exit(1);
}

console.log('✅ EXEC checklist updated - all items marked complete');
console.log('\nChecklist status:');
updatedChecklist.forEach((item, idx) => {
  console.log(`   ✅ ${idx + 1}. ${item.text}`);
});

const checked = updatedChecklist.filter(i => i.checked).length;
const total = updatedChecklist.length;
console.log(`\n📊 Completion: ${checked}/${total} (${Math.round(checked/total*100)}%)`);
console.log('═'.repeat(70));
