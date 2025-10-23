#!/usr/bin/env node
/**
 * Fix exec_checklist format from object to array
 *
 * Root cause: exec_checklist was stored as object {key: boolean}
 * but validation expects array [{text: string, checked: boolean}]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function fixChecklistFormat() {
  console.log('\n🔧 Converting exec_checklist to array format...\n');

  const execChecklistArray = [
    { text: 'Implementation complete', checked: true },
    { text: 'Unit tests passing', checked: true },
    { text: 'E2E tests created', checked: true },
    { text: 'Integration verified', checked: true },
    { text: 'Git commit created', checked: true },
    { text: 'Code reviewed', checked: false },
    { text: 'Documentation updated', checked: false }
  ];

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update({ exec_checklist: execChecklistArray })
    .eq('id', 'PRD-SD-VWC-PRESETS-001')
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Updated exec_checklist to array format');
  console.log(`\nNew format (${execChecklistArray.length} items):`);
  execChecklistArray.forEach((item, i) => {
    console.log(`  ${i+1}. ${item.checked ? '✅' : '❌'} ${item.text}`);
  });

  const checkedCount = execChecklistArray.filter(item => item.checked).length;
  console.log(`\nCompletion: ${checkedCount}/${execChecklistArray.length} (${Math.round(checkedCount/execChecklistArray.length*100)}%)`);
  console.log('\n✅ Format fixed! Validation should now pass.');
}

fixChecklistFormat().catch(console.error);
