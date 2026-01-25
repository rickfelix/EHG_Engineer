#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-PROGRESS-CALC-FIX';
const PRD_ID = `PRD-${SD_ID}`;

console.log(`📋 Creating PRD for ${SD_ID}...\n`);

// Get SD data
const { data: sdData, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id, scope, description, success_criteria, title')
  .eq('id', SD_ID)
  .single();

if (sdError || !sdData) {
  console.error(`❌ SD ${SD_ID} not found:`, sdError?.message);
  process.exit(1);
}

console.log(`✅ Found SD: ${sdData.title}`);
console.log(`   UUID: ${sdData.uuid_id}\n`);

// Create PRD with acceptance_criteria from SD success_criteria
const prdData = {
  id: PRD_ID,
  directive_id: SD_ID,
  sd_id: SD_ID,
  sd_uuid: sdData.uuid_id,
  title: 'Fix Progress Calculation System Bug - PRD',
  status: 'planning',
  category: 'infrastructure',
  priority: 'critical',
  executive_summary: `This PRD defines the technical requirements to fix the calculate_sd_progress() database function that is returning incorrect progress values and blocking SD completions system-wide.

**Problem**: calculate_sd_progress() function returns incorrect totals despite correct individual phase values.
**Impact**: Blocks all SD completions, undermines progress tracking reliability.
**Solution**: Fix function logic to correctly sum phase progress values.`,

  acceptance_criteria: sdData.success_criteria || [
    'calculate_sd_progress_v2() correctly sums phase progress values',
    'SD-CICD-WORKFLOW-FIX can be marked as complete (100% progress)',
    'get_progress_breakdown() total_progress matches sum of individual phases',
    'New SDs calculate progress correctly through all phases',
    'No manual progress column updates needed',
    'Progress trigger updates SD progress column automatically'
  ],

  functional_requirements: [
    'Fix calculate_sd_progress() function SQL logic',
    'Ensure correct summation of individual phase progress',
    'Validate against existing test cases (SD-CICD-WORKFLOW-FIX)',
    'Update database migration if needed',
    'Test with multiple SDs in different states'
  ],

  technical_requirements: [
    'Database function: calculate_sd_progress()',
    'Database function: get_progress_breakdown()',
    'SQL logic validation',
    'Test data validation',
    'Migration script (if needed)'
  ],

  test_scenarios: [
    'SD with all phases complete shows 100% progress',
    'SD with partial completion shows correct percentage',
    'SD-CICD-WORKFLOW-FIX calculates correctly',
    'New SDs calculate progress from 0% to 100% correctly',
    'Progress column auto-updates via trigger'
  ],

  plan_checklist: [
    { text: 'PRD created and saved', checked: true },
    { text: 'SD requirements mapped to technical specs', checked: true },
    { text: 'Technical architecture defined', checked: true },
    { text: 'Implementation approach documented', checked: false },
    { text: 'Test scenarios defined', checked: true },
    { text: 'Acceptance criteria established', checked: true },
    { text: 'Resource requirements estimated', checked: false },
    { text: 'Timeline and milestones set', checked: false },
    { text: 'Risk assessment completed', checked: false }
  ],

  exec_checklist: [
    { text: 'Analyze calculate_sd_progress() function code', checked: false },
    { text: 'Identify logic error in summation', checked: false },
    { text: 'Fix function logic', checked: false },
    { text: 'Test with SD-CICD-WORKFLOW-FIX', checked: false },
    { text: 'Validate progress calculations', checked: false },
    { text: 'Code review completed', checked: false }
  ],

  validation_checklist: [
    { text: 'All acceptance criteria met', checked: false },
    { text: 'SD-CICD-WORKFLOW-FIX shows correct progress', checked: false },
    { text: 'Function tested with multiple SDs', checked: false },
    { text: 'No regression in other functions', checked: false },
    { text: 'Deployment readiness confirmed', checked: false }
  ],

  phase: 'planning',
  progress: 30,
  created_by: 'PLAN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// Insert PRD
const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prdData)
  .select()
  .single();

if (error) {
  if (error.code === '23505') {
    console.log(`⚠️  PRD ${PRD_ID} already exists`);

    // Try to update instead
    const { data: updated, error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({
        ...prdData,
        updated_at: new Date().toISOString()
      })
      .eq('id', PRD_ID)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Update failed:', updateError.message);
      process.exit(1);
    }

    console.log('✅ PRD updated successfully');
  } else {
    console.error('❌ Database error:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  }
} else {
  console.log(`✅ PRD ${PRD_ID} created successfully!\n`);
}

console.log('📋 PRD Details:');
console.log('   ID:', PRD_ID);
console.log('   Title:', prdData.title);
console.log('   Status:', prdData.status);
console.log('   Priority:', prdData.priority);
console.log('   Progress:', prdData.progress + '%');
console.log('\n✅ Acceptance Criteria:', prdData.acceptance_criteria.length, 'items');
prdData.acceptance_criteria.forEach((ac, i) => {
  console.log(`   ${i + 1}. ${ac}`);
});

console.log('\n📝 Next Steps:');
console.log('   1. Generate user stories from acceptance criteria');
console.log('   2. Document testing strategy');
console.log('   3. Create PLAN→EXEC handoff');
