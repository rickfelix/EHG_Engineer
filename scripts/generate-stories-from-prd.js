#!/usr/bin/env node

/**
 * User Story Generation Sub-Agent
 * Automatically generates user stories from PRD acceptance criteria
 * Called by PLAN agent when creating or updating PRDs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Generate stories from a PRD's acceptance criteria
 * @param {string} prdId - The PRD ID to generate stories from
 * @param {string} sdId - The parent Strategic Directive ID
 * @param {boolean} dryRun - If true, only preview without saving
 */
async function generateStoriesFromPRD(prdId, sdId, dryRun = false) {
  console.log(`\n📚 USER STORY SUB-AGENT ACTIVATED`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`PRD ID: ${prdId}`);
  console.log(`SD ID: ${sdId}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);

  try {
    // 1. Fetch PRD details
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (prdError || !prd) {
      throw new Error(`PRD not found: ${prdId}`);
    }

    console.log(`\n📋 PRD: ${prd.title}`);
    console.log(`Priority: ${prd.priority || 'medium'}`);

    // 2. Parse acceptance criteria
    let acceptanceCriteria = [];
    if (prd.functional_requirements && Array.isArray(prd.functional_requirements)) {
      // Functional requirements often contain acceptance criteria
      acceptanceCriteria = prd.functional_requirements;
    } else if (typeof prd.functional_requirements === 'string') {
      try {
        acceptanceCriteria = JSON.parse(prd.functional_requirements);
      } catch (e) {
        // If not JSON, treat as single criterion
        acceptanceCriteria = [prd.functional_requirements];
      }
    }

    if (acceptanceCriteria.length === 0) {
      console.log('⚠️  No acceptance criteria found in PRD');
      return { created: 0, stories: [] };
    }

    console.log(`\n✅ Found ${acceptanceCriteria.length} acceptance criteria`);

    // 3. Check for existing stories to avoid duplicates
    const { data: existingStories } = await supabase
      .from('sd_backlog_map')
      .select('story_key')
      .eq('sd_id', sdId)
      .eq('item_type', 'story')
      .like('story_key', `${sdId}:${prdId}:%`);

    const existingKeys = new Set(existingStories?.map(s => s.story_key) || []);
    console.log(`📊 Found ${existingKeys.size} existing stories for this PRD`);

    // 4. Generate stories
    const stories = [];
    let sequenceStart = existingKeys.size + 1;

    acceptanceCriteria.forEach((criterion, index) => {
      // Generate unique story key
      const storyNum = String(sequenceStart + index).padStart(3, '0');
      const storyKey = `${sdId}:${prdId}:US-${storyNum}`;

      // Skip if already exists
      if (existingKeys.has(storyKey)) {
        console.log(`⏭️  Skipping existing story: ${storyKey}`);
        return;
      }

      // Extract story title from criterion
      let storyTitle = criterion;
      if (typeof criterion === 'string' && criterion.length > 100) {
        storyTitle = criterion.substring(0, 97) + '...';
      }

      // Determine priority based on position
      let priority = prd.priority || 'medium';
      if (index === 0) priority = 'high'; // First story is usually most important
      else if (index > acceptanceCriteria.length * 0.7) priority = 'low'; // Last 30% are lower priority

      const story = {
        sd_id: sdId,
        backlog_id: uuidv4(),
        backlog_title: `Story: ${storyTitle}`,
        item_description: `User story generated from PRD acceptance criteria`,
        priority: priority,
        item_type: 'story',
        sequence_no: sequenceStart + index,
        story_key: storyKey,
        story_title: storyTitle,
        story_description: `As a user, I need ${criterion.toLowerCase()} so that the feature meets its acceptance criteria`,
        acceptance_criteria: JSON.stringify([criterion]),
        verification_status: 'not_run',
        parent_id: prdId,
        import_run_id: uuidv4(),
        present_in_latest_import: true
      };

      stories.push(story);
      console.log(`📝 Generated: ${storyKey} - ${storyTitle.substring(0, 50)}...`);
    });

    // 5. Save stories to database
    if (!dryRun && stories.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('sd_backlog_map')
        .insert(stories)
        .select();

      if (insertError) {
        throw new Error(`Failed to insert stories: ${insertError.message}`);
      }

      console.log(`\n✅ Successfully created ${inserted.length} user stories`);

      // 6. Update SD metadata to reflect new stories
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('h_count, m_count, l_count')
        .eq('id', sdId)
        .single();

      if (sd) {
        const highCount = stories.filter(s => s.priority === 'high').length;
        const mediumCount = stories.filter(s => s.priority === 'medium').length;
        const lowCount = stories.filter(s => s.priority === 'low').length;

        await supabase
          .from('strategic_directives_v2')
          .update({
            h_count: (sd.h_count || 0) + highCount,
            m_count: (sd.m_count || 0) + mediumCount,
            l_count: (sd.l_count || 0) + lowCount,
            updated_at: new Date().toISOString()
          })
          .eq('id', sdId);

        console.log(`📊 Updated SD backlog counts: +${highCount}H +${mediumCount}M +${lowCount}L`);
      }
    } else if (dryRun) {
      console.log(`\n🔍 DRY RUN: Would create ${stories.length} stories`);
      stories.forEach(s => {
        console.log(`  - ${s.story_key}: ${s.story_title.substring(0, 60)}...`);
      });
    }

    return {
      created: stories.length,
      stories: stories.map(s => ({
        key: s.story_key,
        title: s.story_title,
        priority: s.priority
      }))
    };

  } catch (error) {
    console.error(`\n❌ Error generating stories: ${error.message}`);
    throw error;
  }
}

/**
 * Batch generate stories for all PRDs in an SD
 */
async function generateStoriesForSD(sdId, dryRun = false) {
  console.log(`\n🎯 Generating stories for all PRDs in SD: ${sdId}`);

  // Fetch all PRDs for this SD
  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('sd_id', sdId)
    .or(`directive_id.eq.${sdId}`);

  if (error || !prds || prds.length === 0) {
    console.log('⚠️  No PRDs found for this SD');
    return { totalCreated: 0, prdCount: 0 };
  }

  console.log(`📋 Found ${prds.length} PRDs to process`);

  let totalCreated = 0;
  for (const prd of prds) {
    console.log(`\n━━━ Processing PRD: ${prd.title} ━━━`);
    const result = await generateStoriesFromPRD(prd.id, sdId, dryRun);
    totalCreated += result.created;
  }

  console.log(`\n✅ Total stories created: ${totalCreated} across ${prds.length} PRDs`);
  return { totalCreated, prdCount: prds.length };
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage:');
    console.log('  node generate-stories-from-prd.js <PRD_ID> <SD_ID> [--dry-run]');
    console.log('  node generate-stories-from-prd.js --sd <SD_ID> [--dry-run]');
    console.log('\nExamples:');
    console.log('  node generate-stories-from-prd.js PRD-001 SD-GOVERNANCE-001');
    console.log('  node generate-stories-from-prd.js --sd SD-VISION-001 --dry-run');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');

  if (args[0] === '--sd') {
    // Generate for all PRDs in an SD
    const sdId = args[1];
    if (!sdId) {
      console.error('❌ SD ID required');
      process.exit(1);
    }
    generateStoriesForSD(sdId, dryRun)
      .then(() => process.exit(0))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  } else {
    // Generate for specific PRD
    const [prdId, sdId] = args;
    if (!prdId || !sdId) {
      console.error('❌ Both PRD ID and SD ID required');
      process.exit(1);
    }
    generateStoriesFromPRD(prdId, sdId, dryRun)
      .then(() => process.exit(0))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  }
}

export { generateStoriesFromPRD, generateStoriesForSD };