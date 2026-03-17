#!/usr/bin/env node

/**
 * Test LLM Story Generation for SD-VISION-V2-001
 *
 * This script tests the new GPT 5.2 story generation by:
 * 1. Deleting existing stories (optional)
 * 2. Running auto-trigger with LLM generation
 * 3. Validating the generated stories
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-VISION-V2-001';

async function main() {
  console.log('🧪 Testing LLM Story Generation');
  console.log('================================\n');

  // Step 1: Find PRD
  console.log('📄 Step 1: Finding PRD...');
  let prd = null;

  // Try sd_id first
  const { data: prdBySdId } = await supabase
    .from('product_requirements_v2')
    .select('id, title, sd_id')
    .eq('sd_id', SD_ID)
    .single();

  if (prdBySdId) {
    prd = prdBySdId;
    console.log(`   ✅ PRD found via sd_id: ${prd.id}`);
  } else {
    // Try directive_id fallback
    const { data: prdByDirective } = await supabase
      .from('product_requirements_v2')
      .select('id, title, sd_id, directive_id')
      .eq('directive_id', SD_ID)
      .single();

    if (prdByDirective) {
      prd = prdByDirective;
      console.log(`   ✅ PRD found via directive_id: ${prd.id}`);
    }
  }

  if (!prd) {
    console.error('   ❌ No PRD found for', SD_ID);
    process.exit(1);
  }

  console.log(`   Title: ${prd.title}\n`);

  // Step 2: Check existing stories
  console.log('📝 Step 2: Checking existing stories...');
  const { data: existingStories } = await supabase
    .from('user_stories')
    .select('id, story_key, title')
    .eq('sd_id', SD_ID);

  console.log(`   Found ${existingStories?.length || 0} existing stories\n`);

  // Step 3: Delete existing stories to test fresh generation
  if (existingStories && existingStories.length > 0) {
    console.log('🗑️  Step 3: Deleting existing stories for fresh test...');

    const { error: deleteError } = await supabase
      .from('user_stories')
      .delete()
      .eq('sd_id', SD_ID);

    if (deleteError) {
      console.error(`   ❌ Delete failed: ${deleteError.message}`);
      process.exit(1);
    }
    console.log(`   ✅ Deleted ${existingStories.length} stories\n`);
  }

  // Step 4: Run auto-trigger with LLM generation
  console.log('🤖 Step 4: Running LLM story generation...\n');

  try {
    const result = await autoTriggerStories(supabase, SD_ID, prd.id, {
      skipIfExists: false,
      logExecution: true
    });

    console.log('\n📊 Generation Result:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Generation failed:', error.message);
    console.error(error.stack);
  }

  // Step 5: Verify generated stories
  console.log('\n✅ Step 5: Verifying generated stories...');
  const { data: newStories } = await supabase
    .from('user_stories')
    .select('story_key, title, user_benefit, acceptance_criteria')
    .eq('sd_id', SD_ID)
    .order('story_key');

  if (newStories && newStories.length > 0) {
    console.log(`\n   Generated ${newStories.length} stories:\n`);
    for (const story of newStories) {
      const acCount = Array.isArray(story.acceptance_criteria)
        ? story.acceptance_criteria.length
        : 0;
      const benefitLen = story.user_benefit?.length || 0;
      console.log(`   ${story.story_key}: ${story.title}`);
      console.log(`      - Benefit: ${benefitLen} chars`);
      console.log(`      - Acceptance Criteria: ${acCount}`);
    }
  } else {
    console.log('   ⚠️  No stories generated');
  }

  console.log('\n================================');
  console.log('🧪 Test Complete\n');
}

main().catch(console.error);
