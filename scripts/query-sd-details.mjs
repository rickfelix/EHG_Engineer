#!/usr/bin/env node

/**
 * Query SD Details - Retrieve handoff, PRD, and user stories for an SD
 * Temporary utility for EXEC phase preparation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const sdId = process.argv[2] || 'SD-VWC-PHASE1-001';

console.log(`\n📋 Querying details for ${sdId}...\n`);

try {
  // Query 1: Get latest PLAN→EXEC handoff
  console.log('1️⃣ Retrieving PLAN→EXEC handoff...');
  const { data: handoff, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', sdId)
    .eq('handoff_type', 'PLAN-to-EXEC')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (handoffError) {
    console.error('   ❌ Handoff error:', handoffError.message);
  } else {
    console.log(`   ✅ Handoff ID: ${handoff.id}`);
    console.log(`   📅 Created: ${new Date(handoff.created_at).toLocaleString()}`);
    console.log(`   📝 Status: ${handoff.status}`);
    console.log('\n   📦 DELIVERABLES:');
    handoff.deliverables_manifest?.forEach((d, i) => {
      console.log(`      ${i + 1}. ${d}`);
    });
    console.log('\n   🎯 ACTION ITEMS:');
    handoff.action_items?.forEach((a, i) => {
      console.log(`      ${i + 1}. ${a}`);
    });
    console.log('\n   💬 PLAN MESSAGE:');
    console.log(`      ${handoff.plan_message?.substring(0, 200)}...`);
  }

  // Query 2: Get PRD
  console.log('\n2️⃣ Retrieving PRD...');
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('directive_id', sdId)
    .single();

  if (prdError) {
    console.error('   ❌ PRD error:', prdError.message);
  } else {
    console.log(`   ✅ PRD ID: ${prd.id}`);
    console.log(`   📄 Title: ${prd.title}`);
    console.log(`   📊 Priority: ${prd.priority} | Status: ${prd.status}`);
    console.log(`\n   ⚙️  FUNCTIONAL REQUIREMENTS (${prd.functional_requirements?.length || 0}):`);
    prd.functional_requirements?.forEach((fr, i) => {
      console.log(`      ${i + 1}. ${fr.requirement || fr.description}`);
    });
    console.log(`\n   🔧 TECHNICAL REQUIREMENTS (${prd.technical_requirements?.length || 0}):`);
    prd.technical_requirements?.forEach((tr, i) => {
      console.log(`      ${i + 1}. ${tr.requirement || tr.description}`);
    });
    console.log(`\n   ✅ ACCEPTANCE CRITERIA (${prd.acceptance_criteria?.length || 0}):`);
    prd.acceptance_criteria?.forEach((ac, i) => {
      console.log(`      ${i + 1}. ${ac}`);
    });
  }

  // Query 3: Get user stories
  console.log('\n3️⃣ Retrieving user stories...');
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .select('story_key, title, user_want, acceptance_criteria, story_points, priority, status')
    .eq('sd_id', sdId)
    .order('story_key');

  if (storiesError) {
    console.error('   ❌ Stories error:', storiesError.message);
  } else {
    console.log(`   ✅ Found ${stories.length} user stories\n`);
    stories.forEach((story, i) => {
      console.log(`   ${i + 1}. ${story.story_key}: ${story.title}`);
      console.log(`      Want: ${story.user_want}`);
      console.log(`      Points: ${story.story_points} | Priority: ${story.priority} | Status: ${story.status}`);
      if (story.acceptance_criteria?.length > 0) {
        console.log(`      Acceptance Criteria: ${story.acceptance_criteria.length} items`);
      }
    });
  }

  console.log('\n✅ Query complete\n');

} catch (error) {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
}
