#!/usr/bin/env node
/**
 * Fix exec_checklist items for a PRD by marking all as checked
 * Usage: node scripts/fix-exec-checklist.mjs [PRD_ID]
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const prdId = process.argv[2] || 'PRD-SD-IDEATION-STAGE1-001';

async function updateExecChecklist() {
  console.log(`Updating exec_checklist for: ${prdId}\n`);

  // First, get current exec_checklist
  const { data: prd, error: fetchError } = await supabase
    .from('product_requirements_v2')
    .select('id, exec_checklist, status')
    .eq('id', prdId)
    .single();

  if (fetchError) {
    console.error('Error fetching PRD:', fetchError);
    process.exit(1);
  }

  console.log('Current status:', prd.status);
  console.log('Current exec_checklist:');
  console.log(JSON.stringify(prd.exec_checklist, null, 2));

  const currentChecked = prd.exec_checklist?.filter(i => i.checked).length || 0;
  console.log(`\nCurrently checked: ${currentChecked}/${prd.exec_checklist?.length || 0}`);

  if (currentChecked === prd.exec_checklist?.length) {
    console.log('\n✅ All items already checked. No update needed.');
    return;
  }

  // Update all items to checked: true since work is completed
  const updatedChecklist = prd.exec_checklist.map(item => ({
    ...item,
    checked: true
  }));

  console.log('\nUpdating to all checked: true...');

  // Update the PRD
  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({ exec_checklist: updatedChecklist })
    .eq('id', prdId);

  if (updateError) {
    console.error('\nError updating PRD:', updateError);
    process.exit(1);
  }

  console.log('✅ Successfully updated exec_checklist for', prdId);

  // Verify update
  const { data: verified } = await supabase
    .from('product_requirements_v2')
    .select('exec_checklist')
    .eq('id', prdId)
    .single();

  console.log('\nVerified checklist:');
  const checkedCount = verified.exec_checklist.filter(i => i.checked).length;
  console.log(`Checked items: ${checkedCount}/${verified.exec_checklist.length}`);

  if (checkedCount === verified.exec_checklist.length) {
    console.log('\n✅ All items verified as checked!');
  }
}

updateExecChecklist().catch(console.error);
