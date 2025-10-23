#!/usr/bin/env node

import { createDatabaseClient } from './lib/supabase-connection.js';

async function checkUserStories() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    console.log('\n=== USER STORIES FOR PRD-VWC-A11Y-001 ===\n');

    // Query user stories
    const result = await client.query(`
      SELECT
        id, story_key, title, acceptance_criteria,
        priority, status, created_at, implementation_context,
        story_points, user_role, user_want, user_benefit
      FROM user_stories
      WHERE prd_id = $1
      ORDER BY priority DESC, id ASC
    `, ['PRD-VWC-A11Y-001']);

    const stories = result.rows;
    console.log(`Count: ${stories.length} user stories\n`);

    if (stories.length === 0) {
      console.log('⚠️  NO USER STORIES FOUND FOR PRD-VWC-A11Y-001');
      console.log('\nThis could mean:');
      console.log('1. User stories have not been created yet');
      console.log('2. User stories exist with a different prd_id');
      console.log('3. The PRD exists but stories were not generated\n');

      // Check if PRD exists (try product_requirements_v2)
      const prdResult = await client.query(`
        SELECT id, title, status, created_at
        FROM product_requirements_v2
        WHERE id = $1
      `, ['PRD-VWC-A11Y-001']);

      if (prdResult.rows.length === 0) {
        console.log('❌ PRD-VWC-A11Y-001 does NOT exist in product_requirements_v2 table');

        // Check strategic_directives_v2 for related SD
        const sdResult = await client.query(`
          SELECT id, title, status, created_at
          FROM strategic_directives_v2
          WHERE id LIKE '%VWC-A11Y%' OR id LIKE '%A11Y%'
          ORDER BY created_at DESC
          LIMIT 5
        `);

        if (sdResult.rows.length > 0) {
          console.log('\n📋 Found related Strategic Directives:');
          sdResult.rows.forEach(sd => {
            console.log(`   ${sd.id}: ${sd.title} (${sd.status})`);
          });
        }
      } else {
        const prd = prdResult.rows[0];
        console.log('✅ PRD exists:');
        console.log(`   Title: ${prd.title}`);
        console.log(`   Status: ${prd.status}`);
        console.log(`   Created: ${prd.created_at}`);
        console.log('\n👉 User stories need to be generated for this PRD');
      }

      await client.end();
      process.exit(0);
    }

    // Display each story
    stories.forEach((story, idx) => {
      console.log(`Story ${idx + 1}:`);
      console.log(`  ID: ${story.id}`);
      console.log(`  Story Key: ${story.story_key || '(not set)'}`);
      console.log(`  Title: ${story.title}`);
      console.log(`  Priority: ${story.priority || 'not set'}`);
      console.log(`  Status: ${story.status || 'draft'}`);
      console.log(`  Story Points: ${story.story_points || 'not estimated'}`);
      console.log(`  Created: ${story.created_at}`);

      if (story.user_role || story.user_want || story.user_benefit) {
        console.log(`  User Story Format:`);
        console.log(`    As a: ${story.user_role || '(not specified)'}`);
        console.log(`    I want: ${story.user_want || '(not specified)'}`);
        console.log(`    So that: ${story.user_benefit || '(not specified)'}`);
      }

      if (story.implementation_context) {
        const contextPreview = typeof story.implementation_context === 'string'
          ? story.implementation_context.substring(0, 150)
          : JSON.stringify(story.implementation_context).substring(0, 150);
        console.log(`  Implementation Context: ${contextPreview}...`);
      } else {
        console.log(`  Implementation Context: ❌ MISSING`);
      }

      console.log(`  Acceptance Criteria:`);
      if (story.acceptance_criteria) {
        if (Array.isArray(story.acceptance_criteria)) {
          story.acceptance_criteria.forEach((criterion, i) => {
            console.log(`    ${i + 1}. ${criterion}`);
          });
        } else if (typeof story.acceptance_criteria === 'string') {
          console.log(`    ${story.acceptance_criteria}`);
        } else {
          console.log(`    ${JSON.stringify(story.acceptance_criteria)}`);
        }
      } else {
        console.log(`    ❌ NONE SPECIFIED`);
      }
      console.log('');
    });

    // Summary
    const withContext = stories.filter(s =>
      s.implementation_context &&
      (typeof s.implementation_context === 'string' ? s.implementation_context.trim().length > 0 : true)
    ).length;

    const withCriteria = stories.filter(s => {
      if (!s.acceptance_criteria) return false;
      if (Array.isArray(s.acceptance_criteria)) return s.acceptance_criteria.length > 0;
      if (typeof s.acceptance_criteria === 'string') return s.acceptance_criteria.trim().length > 0;
      return true;
    }).length;

    const withStoryPoints = stories.filter(s => s.story_points && s.story_points > 0).length;

    console.log('=== SUMMARY ===');
    console.log(`Total Stories: ${stories.length}`);
    console.log(`With Implementation Context: ${withContext} / ${stories.length} (${Math.round(withContext/stories.length*100)}%)`);
    console.log(`With Acceptance Criteria: ${withCriteria} / ${stories.length} (${Math.round(withCriteria/stories.length*100)}%)`);
    console.log(`With Story Points: ${withStoryPoints} / ${stories.length} (${Math.round(withStoryPoints/stories.length*100)}%)`);

    const totalPoints = stories.reduce((sum, s) => sum + (s.story_points || 0), 0);
    console.log(`Total Story Points: ${totalPoints}`);

    console.log('');
    console.log('BMAD Validation Requirements:');
    console.log(`  Implementation Context: ${(withContext/stories.length >= 0.8) ? '✅ PASS' : '⚠️  FAIL'} (need ≥80%, have ${Math.round(withContext/stories.length*100)}%)`);
    console.log(`  Acceptance Criteria: ${(withCriteria/stories.length >= 0.8) ? '✅ PASS' : '⚠️  FAIL'} (need ≥80%, have ${Math.round(withCriteria/stories.length*100)}%)`);

    await client.end();

  } catch (err) {
    console.error('Fatal error:', err.message);
    console.error(err.stack);
    await client.end();
    process.exit(1);
  }
}

checkUserStories();
