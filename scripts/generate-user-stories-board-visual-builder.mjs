#!/usr/bin/env node
/**
 * Generate User Stories for SD-BOARD-VISUAL-BUILDER-001
 * Product Requirements Expert Sub-Agent
 * Auto-triggered on PRD creation
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const SD_KEY = 'SD-BOARD-VISUAL-BUILDER-001';
const PRD_ID = `PRD-${SD_KEY}`;

// Format: SD-KEY:US-### (3+ digits minimum)
const stories = [
  { key: '001', title: 'Drag Start/End nodes onto canvas', points: 3, priority: 'critical' },
  { key: '002', title: 'Assign board members to Agent Task nodes', points: 5, priority: 'critical' },
  { key: '003', title: 'Configure Decision nodes with branching logic', points: 5, priority: 'critical' },
  { key: '004', title: 'Connect nodes with edges', points: 3, priority: 'critical' },
  { key: '005', title: 'See validation errors highlighted', points: 3, priority: 'high' },
  { key: '006', title: 'Save workflow to database', points: 5, priority: 'critical' },
  { key: '007', title: 'Load saved workflow', points: 3, priority: 'critical' },
  { key: '008', title: 'Preview generated Python code', points: 3, priority: 'high' },
  { key: '009', title: 'Instantiate template workflow', points: 3, priority: 'high' },
  { key: '010', title: 'Publish workflow (draft → active)', points: 2, priority: 'medium' },
  { key: '011', title: 'Delete draft workflows', points: 2, priority: 'low' },
  { key: '012', title: 'Search and filter node types', points: 2, priority: 'low' }
];

async function generateUserStories() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    console.log('\n📝 Generating User Stories for SD-BOARD-VISUAL-BUILDER-001');
    console.log('═'.repeat(70));
    console.log(`   PRD ID: ${PRD_ID}`);
    console.log(`   Total Stories: ${stories.length}`);

    let successCount = 0;
    let skippedCount = 0;

    for (const story of stories) {
      const storyKey = `${SD_KEY}:US-${story.key}`;

      try {
        // Check if story already exists
        const existing = await client.query(`
          SELECT id FROM user_stories WHERE story_key = $1;
        `, [storyKey]);

        if (existing.rows.length > 0) {
          console.log(`   ⏭️  ${storyKey}: Already exists (skipping)`);
          skippedCount++;
          continue;
        }

        // Insert user story
        await client.query(`
          INSERT INTO user_stories (
            story_key, prd_id, sd_id, title,
            user_role, user_want, user_benefit,
            story_points, priority, status,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        `, [
          storyKey,
          PRD_ID,
          SD_KEY,
          story.title,
          'product manager',
          story.title.toLowerCase(),
          'improve workflow builder functionality',
          story.points,
          story.priority,
          'draft' // status: draft, ready, in_progress, testing, completed, blocked
        ]);

        console.log(`   ✅ ${storyKey}: ${story.title} (${story.points} pts)`);
        successCount++;

      } catch (err) {
        console.error(`   ❌ ${storyKey}: ${err.message}`);
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('📊 Summary:');
    console.log(`   ✅ Created: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   Total Story Points: ${stories.reduce((sum, s) => sum + s.points, 0)}`);
    console.log(`   Priority Breakdown:`);
    console.log(`      Critical: ${stories.filter(s => s.priority === 'critical').length}`);
    console.log(`      High: ${stories.filter(s => s.priority === 'high').length}`);
    console.log(`      Medium: ${stories.filter(s => s.priority === 'medium').length}`);
    console.log(`      Low: ${stories.filter(s => s.priority === 'low').length}`);
    console.log('\n📋 Next Steps:');
    console.log('   1. Review generated user stories in database');
    console.log('   2. Each story requires ≥1 E2E test (100% coverage)');
    console.log('   3. Define component architecture details');
    console.log('   4. Create PLAN→EXEC handoff');

  } finally {
    await client.end();
  }
}

generateUserStories().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
