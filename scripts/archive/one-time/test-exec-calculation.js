#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testExecCalculation() {
  console.log('Testing EXEC phase calculation logic:\n');

  // Get all deliverables filtered by priority
  const { data: all } = await supabase
    .from('sd_scope_deliverables')
    .select('deliverable_name, priority, completion_status')
    .eq('sd_id', 'SD-2025-1020-E2E-SELECTORS')
    .in('priority', ['required', 'high']);

  const total = all.length;
  const completed = all.filter(d => d.completion_status === 'completed').length;
  const allComplete = completed === total;

  console.log('Deliverables (priority IN [required, high]):');
  console.log('  Total:', total);
  console.log('  Completed:', completed);
  console.log('  All Complete:', allComplete);
  console.log('');

  console.log('Function logic (lines 46-50):');
  console.log('  IF (COUNT(*) FILTER (WHERE completion_status = completed) = COUNT(*))');
  console.log(`  IF (${completed} = ${total})`);
  console.log(`  IF (${allComplete})`);
  console.log('  THEN progress := progress + 30');
  console.log('');

  console.log('Expected: EXEC phase should add 30 points');
  console.log('Actual behavior: ???');
  console.log('');

  // Now call the actual function
  const { data: progress } = await supabase.rpc('calculate_sd_progress', {
    sd_id_param: 'SD-2025-1020-E2E-SELECTORS'
  });

  console.log('Actual progress from calculate_sd_progress():', progress);
  console.log('');

  if (progress === 70) {
    console.log('✅ EXEC phase IS counting (20 + 20 + 30 = 70)');
  } else if (progress === 40) {
    console.log('❌ EXEC phase NOT counting (20 + 20 = 40)');
    console.log('');
    console.log('⚠️  This suggests the function is using outdated code OR there is a caching issue');
  }
}

testExecCalculation();
