#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-CICD-WORKFLOW-FIX';

console.log('🔍 PROGRESS BUG DIAGNOSTIC');
console.log('='.repeat(70));
console.log('SD:', SD_ID);
console.log('');

// Get calculate_sd_progress result
const { data: calcResult } = await supabase.rpc('calculate_sd_progress', { sd_id_param: SD_ID });
console.log('📊 calculate_sd_progress():', calcResult + '%');

// Get breakdown
const { data: breakdown } = await supabase.rpc('get_progress_breakdown', { sd_id_param: SD_ID });
console.log('');
console.log('📋 get_progress_breakdown() phases:');
Object.entries(breakdown.phases).forEach(([phase, data]) => {
  console.log(`  ${phase}:`);
  console.log(`    Weight: ${data.weight}%`);
  console.log(`    Complete: ${data.complete}`);
  console.log(`    Progress: ${data.progress}%`);
  if (data.deliverables_complete !== undefined) {
    console.log(`    Deliverables Complete: ${data.deliverables_complete}`);
  }
  if (data.user_stories_validated !== undefined) {
    console.log(`    User Stories Validated: ${data.user_stories_validated}`);
  }
});

console.log('');
console.log('Total from breakdown:', breakdown.total_progress + '%');
console.log('');

// Sum up the individual progress values
const sum = Object.values(breakdown.phases).reduce((acc, phase) => acc + phase.progress, 0);
console.log('Sum of individual phase progress:', sum + '%');
console.log('');

if (sum === 100 && breakdown.total_progress === 40) {
  console.log('🐛 BUG CONFIRMED:');
  console.log('  - Individual phases sum to 100%');
  console.log('  - But total_progress = 40%');
  console.log('  - This means calculate_sd_progress() is NOT counting all phases');
  console.log('');
  console.log('Root cause: calculate_sd_progress() has different logic than get_progress_breakdown()');
} else if (sum === 40 && breakdown.total_progress === 40) {
  console.log('✅ Functions agree on 40%');
  console.log('  - Both calculate same progress');
  console.log('  - Issue may be in phase completion logic, not calculation');
} else {
  console.log('⚠️  Unexpected state:');
  console.log('  Sum:', sum + '%');
  console.log('  Total:', breakdown.total_progress + '%');
}
