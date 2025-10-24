#!/usr/bin/env node
/**
 * Update User Stories Completion Status
 * SD-VWC-PHASE1-001
 *
 * Updates completion status for 3 user stories that have been implemented:
 * - US-005: GCIA fresh scan button
 * - US-007: Extract LLM cost/token data
 * - US-010: i18n wrapper
 */

import { createSupabaseAnonClient } from './lib/supabase-connection.js';

async function main() {
  console.log('\n🔄 Updating User Story Completion Status for SD-VWC-PHASE1-001...\n');

  const supabase = await createSupabaseAnonClient('engineer', { verbose: true });

  // Stories to update (using full story_key format)
  const storiesToComplete = [
    {
      id: 'SD-VWC-PHASE1-001:US-005',
      reason: 'Already implemented in ExecuteAnalysisTab.tsx lines 106-129',
      commit: '5ed69b3'
    },
    {
      id: 'SD-VWC-PHASE1-001:US-007',
      reason: 'Implemented LLMUsageMetrics interface in intelligenceAgents.ts (lines 13-19, 27, 432-468)',
      commit: '5ed69b3'
    },
    {
      id: 'SD-VWC-PHASE1-001:US-010',
      reason: 'Created i18n config (src/i18n/config.ts), translation files (src/i18n/locales/en.json), wrapped UI text in VentureCreationPage.tsx',
      commit: '5ed69b3'
    }
  ];

  console.log('📝 Stories to mark as completed:\n');
  storiesToComplete.forEach(story => {
    console.log(`   ${story.id}: ${story.reason}`);
    console.log(`   Commit: ${story.commit}\n`);
  });

  // Update each story
  let updatedCount = 0;
  for (const story of storiesToComplete) {
    console.log(`🔧 Updating ${story.id}...`);

    const { data, error } = await supabase
      .from('user_stories')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      })
      .eq('story_key', story.id)
      .select();

    if (error) {
      console.error(`   ❌ Error updating ${story.id}:`, error.message);
      console.error(`   Details:`, error);
      continue;
    }

    if (data && data.length > 0) {
      console.log(`   ✅ Updated ${story.id} to 'completed'`);
      updatedCount++;
    } else {
      console.log(`   ⚠️  No record found for ${story.id}`);
    }
  }

  console.log(`\n✨ Updated ${updatedCount} of ${storiesToComplete.length} user stories\n`);

  // Query final completion stats
  console.log('📊 Calculating Final Completion Statistics...\n');

  const { data: allStories, error: queryError } = await supabase
    .from('user_stories')
    .select('story_key, title, status, story_points, priority')
    .or(`prd_id.eq.PRD-VWC-PHASE1-001,sd_id.eq.SD-VWC-PHASE1-001`)
    .order('story_key', { ascending: true });

  if (queryError) {
    console.error('❌ Error querying stories:', queryError.message);
    return;
  }

  if (!allStories || allStories.length === 0) {
    console.log('⚠️  No user stories found for SD-VWC-PHASE1-001');
    return;
  }

  // Calculate statistics
  const totalStories = allStories.length;
  const completedStories = allStories.filter(s => s.status === 'completed');
  const completedCount = completedStories.length;

  const totalPoints = allStories.reduce((sum, s) => sum + (s.story_points || 0), 0);
  const completedPoints = completedStories.reduce((sum, s) => sum + (s.story_points || 0), 0);

  const completionPercentage = totalStories > 0
    ? ((completedCount / totalStories) * 100).toFixed(1)
    : 0;

  const pointsPercentage = totalPoints > 0
    ? ((completedPoints / totalPoints) * 100).toFixed(1)
    : 0;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                 COMPLETION STATISTICS                          ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total User Stories:        ${totalStories}`);
  console.log(`Completed Stories:         ${completedCount}`);
  console.log(`Completion Rate:           ${completionPercentage}%`);
  console.log(`───────────────────────────────────────────────────────────────`);
  console.log(`Total Story Points:        ${totalPoints}`);
  console.log(`Completed Points:          ${completedPoints}`);
  console.log(`Points Completion Rate:    ${pointsPercentage}%`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Group by status
  const byStatus = allStories.reduce((acc, story) => {
    const status = story.status || 'unknown';
    if (!acc[status]) acc[status] = [];
    acc[status].push(story);
    return acc;
  }, {});

  console.log('📋 Stories by Status:\n');
  Object.entries(byStatus).forEach(([status, stories]) => {
    const points = stories.reduce((sum, s) => sum + (s.story_points || 0), 0);
    console.log(`   ${status.toUpperCase()}: ${stories.length} stories (${points} points)`);
    stories.forEach(story => {
      console.log(`      ${story.story_key}: ${story.title} [${story.story_points || 0} pts]`);
    });
    console.log('');
  });

  console.log('✅ Update complete!\n');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
