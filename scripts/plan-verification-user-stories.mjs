#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 PLAN Verification: User Stories Coverage');
console.log('='.repeat(60));

// Read SD metadata to get user stories
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', 'SD-AGENT-ADMIN-001')
  .single();

if (sdError || !sd) {
  console.error('❌ Error reading SD:', sdError);
  process.exit(1);
}

// Read PRD metadata to get implementation specification
const { data: prd, error: prdError } = await supabase
  .from('product_requirements_v2')
  .select('metadata')
  .eq('id', 'PRD-SD-AGENT-ADMIN-001')
  .single();

if (prdError || !prd) {
  console.error('❌ Error reading PRD:', prdError);
  process.exit(1);
}

const userStories = sd.metadata.user_stories || [];
const implementationSpec = prd.metadata.implementation_specification || {};

console.log(`\n📊 Found ${userStories.length} user stories`);
console.log(`📊 Specification has ${Object.keys(implementationSpec.implementation_details_by_subsystem || {}).length} subsystems\n`);

// Validation: Check if subsystems are defined in specification
// Map of subsystem numbers to names
const subsystemMapping = {
  1: { key: 'subsystem_1_preset_management', name: 'Preset Management' },
  2: { key: 'subsystem_2_prompt_library', name: 'Prompt Library' },
  3: { key: 'subsystem_3_agent_settings', name: 'Agent Settings' },
  4: { key: 'subsystem_4_search_preferences', name: 'Search Preferences' },
  5: { key: 'subsystem_5_performance_dashboard', name: 'Performance Dashboard' }
};

const validationResults = [];

for (const story of userStories) {
  const result = {
    story_id: story.id,
    title: story.title,
    subsystem: story.subsystem,
    addressed: false,
    component_mapping: [],
    gap_details: ''
  };

  // Match subsystem by name
  let matchedSubsystem = null;
  for (const [num, sub] of Object.entries(subsystemMapping)) {
    if (story.subsystem.toLowerCase().includes(sub.name.toLowerCase().replace(' ', '_').split('_')[0])) {
      matchedSubsystem = { num: parseInt(num), ...sub };
      break;
    }
  }

  if (matchedSubsystem) {
    const subsystemSpec = implementationSpec.implementation_details_by_subsystem?.[matchedSubsystem.key];

    if (subsystemSpec) {
      result.addressed = true;
      result.component_mapping = [
        `${matchedSubsystem.name} (${subsystemSpec.components?.length || 0} components, ${subsystemSpec.story_points || 0} points)`
      ];
    } else {
      result.gap_details = `Subsystem specification not found for ${matchedSubsystem.key}`;
    }
  } else {
    // Try direct match on subsystem name
    const storySubsystemLower = story.subsystem.toLowerCase().replace(/\s+/g, '_');
    let foundSpec = null;
    for (const [key, spec] of Object.entries(implementationSpec.implementation_details_by_subsystem || {})) {
      if (key.toLowerCase().includes(storySubsystemLower) || storySubsystemLower.includes(key.split('_').slice(2).join('_'))) {
        foundSpec = { key, spec };
        break;
      }
    }

    if (foundSpec) {
      result.addressed = true;
      result.component_mapping = [
        `${story.subsystem} (${foundSpec.spec.components?.length || 0} components, ${foundSpec.spec.story_points || 0} points)`
      ];
    } else {
      result.gap_details = `Could not match subsystem: ${story.subsystem}`;
    }
  }

  validationResults.push(result);
}

// Summary
const addressedCount = validationResults.filter(r => r.addressed).length;
const gapCount = validationResults.length - addressedCount;

console.log('📋 Validation Results:');
console.log('='.repeat(60));

for (const result of validationResults) {
  const status = result.addressed ? '✅' : '❌';
  console.log(`${status} ${result.story_id}: ${result.title}`);
  if (result.addressed) {
    console.log(`   Mapped to: ${result.component_mapping.join(', ')}`);
  } else {
    console.log(`   Gap: ${result.gap_details}`);
  }
  console.log();
}

console.log('='.repeat(60));
console.log(`\n📊 Summary:`);
console.log(`   ✅ Addressed: ${addressedCount}/${userStories.length}`);
console.log(`   ❌ Gaps: ${gapCount}`);
console.log(`   Coverage: ${Math.round((addressedCount / userStories.length) * 100)}%`);

if (gapCount === 0) {
  console.log('\n✅ PASS: All user stories addressed in specification');
} else {
  console.log('\n⚠️ CONDITIONAL_PASS: Some stories need clarification');
}

// Store verification results in SD metadata
const updatedMetadata = {
  ...(sd.metadata || {}),
  verification_results: {
    user_stories_validation: {
      total_stories: userStories.length,
      addressed: addressedCount,
      gaps: gapCount,
      coverage_percentage: Math.round((addressedCount / userStories.length) * 100),
      details: validationResults,
      verdict: gapCount === 0 ? 'PASS' : 'CONDITIONAL_PASS',
      verified_at: new Date().toISOString()
    }
  }
};

const { error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: updatedMetadata })
  .eq('id', 'SD-AGENT-ADMIN-001');

if (updateError) {
  console.error('\n❌ Error storing results:', updateError);
} else {
  console.log('\n✅ Verification results stored in SD metadata');
}
