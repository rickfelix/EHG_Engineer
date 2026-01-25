#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const sdId = 'SD-VISION-TRANSITION-001D2';
  const parentId = 'SD-VISION-TRANSITION-001D';

  console.log('🔧 Preparing SD-D2 for LEAD Approval...\n');

  // Step 1: Fix SD Type (infrastructure → feature)
  // This is UI/feature work, not infrastructure
  console.log('1️⃣ Fixing SD Type...');
  const { error: typeError } = await supabase
    .from('strategic_directives_v2')
    .update({ sd_type: 'feature' })
    .eq('id', sdId);

  if (typeError) {
    console.error('   ❌ Type fix failed:', typeError.message);
  } else {
    console.log('   ✅ SD Type changed to "feature"');
  }

  // Step 2: Add success_metrics if missing
  console.log('\n2️⃣ Adding Success Metrics...');
  const successMetrics = [
    {
      metric: 'Stage 6-9 UI Components Rendered',
      target: '100% of stages render without errors',
      baseline: '0% (not yet implemented)',
      measurement: 'E2E test verification'
    },
    {
      metric: 'lifecycle_stage_config Coverage',
      target: 'All 4 stages (6-9) defined with thresholds',
      baseline: '0 stages defined',
      measurement: 'Database query count'
    },
    {
      metric: 'Stage Data Contracts',
      target: 'Input/output contracts for stages 6-9',
      baseline: 'No contracts exist',
      measurement: 'Code review of contract files'
    },
    {
      metric: 'E2E Test Coverage',
      target: '≥1 E2E test per stage',
      baseline: '0 E2E tests',
      measurement: 'Playwright test count'
    }
  ];

  const { error: metricsError } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics: successMetrics })
    .eq('id', sdId);

  if (metricsError) {
    console.error('   ❌ Metrics update failed:', metricsError.message);
  } else {
    console.log('   ✅ Success metrics added');
  }

  // Step 3: Add key_principles if missing
  console.log('\n3️⃣ Adding Key Principles...');
  const keyPrinciples = [
    'Reuse existing Stage 1-5 patterns and components',
    'Database-first: All stage definitions in lifecycle_stage_config',
    'UI Parity: Every stage output must be visible in the UI',
    'Testing-first: E2E tests before marking complete'
  ];

  const { error: principlesError } = await supabase
    .from('strategic_directives_v2')
    .update({ key_principles: keyPrinciples })
    .eq('id', sdId);

  if (principlesError) {
    console.error('   ❌ Principles update failed:', principlesError.message);
  } else {
    console.log('   ✅ Key principles added');
  }

  // Step 4: Check parent phase and transition to EXEC if needed
  console.log('\n4️⃣ Checking Parent Phase...');
  const { data: parent, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .select('id, status, current_phase')
    .eq('id', parentId)
    .single();

  if (parentError) {
    console.error('   ❌ Parent query failed:', parentError.message);
  } else {
    console.log(`   Parent phase: ${parent.current_phase}`);

    // Per PAT-PARENT-CHILD-001: Parent must be in EXEC for children to activate
    if (parent.current_phase !== 'EXEC') {
      console.log('   ⚠️  Parent needs to be in EXEC phase for children to activate');
      console.log('   📝 Updating parent to EXEC phase...');

      const { error: parentUpdateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          current_phase: 'EXEC',
          status: 'active'
        })
        .eq('id', parentId);

      if (parentUpdateError) {
        console.error('   ❌ Parent update failed:', parentUpdateError.message);
      } else {
        console.log('   ✅ Parent transitioned to EXEC phase');
      }
    } else {
      console.log('   ✅ Parent already in EXEC phase');
    }
  }

  // Step 5: Set SD-D2 status to active for LEAD phase
  console.log('\n5️⃣ Activating SD-D2 for LEAD...');
  const { error: activateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'active',
      current_phase: 'LEAD',
      is_working_on: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId);

  if (activateError) {
    console.error('   ❌ Activation failed:', activateError.message);
  } else {
    console.log('   ✅ SD-D2 activated for LEAD phase');
  }

  // Final verification
  console.log('\n📋 Final State Verification...');
  const { data: final } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, sd_type, success_metrics, key_principles')
    .eq('id', sdId)
    .single();

  console.log('   ID:', final.id);
  console.log('   Status:', final.status);
  console.log('   Phase:', final.current_phase);
  console.log('   Type:', final.sd_type);
  console.log('   Success Metrics:', final.success_metrics?.length, 'defined');
  console.log('   Key Principles:', final.key_principles?.length, 'defined');
}

main();
