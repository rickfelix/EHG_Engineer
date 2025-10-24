#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkDeliverables() {
  console.log('Checking EXEC deliverables for SD-2025-1020-E2E-SELECTORS:\n');

  const { data: deliverables, error } = await supabase
    .from('sd_scope_deliverables')
    .select('*')
    .eq('sd_id', 'SD-2025-1020-E2E-SELECTORS');

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  if (!deliverables || deliverables.length === 0) {
    console.log('No deliverables found');
    return;
  }

  console.log('Total deliverables:', deliverables.length);
  console.log('');
  deliverables.forEach(d => {
    console.log(`- ${d.deliverable_name}`);
    console.log(`  Priority: ${d.priority}`);
    console.log(`  Completion Status: ${d.completion_status}`);
    console.log('');
  });

  const required = deliverables.filter(d => d.priority === 'required' || d.priority === 'high');
  const completed = required.filter(d => d.completion_status === 'completed');

  console.log('Summary:');
  console.log(`  Required/High priority: ${required.length}`);
  console.log(`  Completed: ${completed.length}`);
  console.log(`  All complete: ${required.length === completed.length}`);
  console.log('');

  if (required.length !== completed.length) {
    console.log('❌ Not all deliverables completed - this is blocking EXEC phase (30 points)');
    console.log('\nIncomplete deliverables:');
    const incomplete = required.filter(d => d.completion_status !== 'completed');
    incomplete.forEach(d => {
      console.log(`  - ${d.deliverable_name} (${d.completion_status})`);
    });
  } else {
    console.log('✅ All deliverables complete');
  }
}

checkDeliverables();
