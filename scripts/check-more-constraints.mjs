#!/usr/bin/env node

/**
 * Check more constraints for final completion
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('Checking additional constraints...\n');

  // 1. Check target_application values in retrospectives
  console.log('1. Valid target_application values:');
  const { data: apps } = await supabase
    .from('retrospectives')
    .select('target_application')
    .limit(50);

  const uniqueApps = [...new Set(apps?.map(a => a.target_application).filter(Boolean))];
  console.log('   ', uniqueApps.join(', '));

  // 2. Check known_issues format in handoffs
  console.log('\n2. Known issues sample from existing handoff:');
  const { data: ho } = await supabase
    .from('sd_phase_handoffs')
    .select('known_issues')
    .not('known_issues', 'is', null)
    .limit(1)
    .single();

  if (ho) {
    console.log('   ', typeof ho.known_issues, ho.known_issues ? 'has value' : 'null');
  }

  // 3. Check user_stories implementation_context requirement
  console.log('\n3. User story implementation_context sample:');
  const { data: us } = await supabase
    .from('user_stories')
    .select('story_key, implementation_context')
    .not('implementation_context', 'is', null)
    .limit(1)
    .single();

  if (us) {
    console.log('   Type:', typeof us.implementation_context);
    console.log('   Sample:', JSON.stringify(us.implementation_context).substring(0, 100));
  }

  // 4. Check existing PRD for this SD
  console.log('\n4. PRD for this SD:');
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, user_stories')
    .eq('id', 'PRD-SD-BLUEPRINT-ENGINE-001')
    .single();

  if (prd) {
    console.log('   PRD ID:', prd.id);
    console.log('   User stories:', Array.isArray(prd.user_stories) ? prd.user_stories.length + ' stories' : typeof prd.user_stories);
  } else {
    console.log('   PRD not found');
  }

  // 5. Check what the progress calc looks for in user stories
  console.log('\n5. Checking user_stories table for sd_id column usage:');
  const { data: storyCheck } = await supabase
    .from('user_stories')
    .select('id, story_key, sd_id, status, validation_status')
    .eq('sd_id', 'SD-BLUEPRINT-ENGINE-001')
    .limit(5);

  console.log('   Stories for this SD:', storyCheck?.length || 0);
  storyCheck?.forEach(s => console.log(`   - ${s.story_key}: status=${s.status}, validation=${s.validation_status}`));

  console.log('\n');
}

check().catch(console.error);
