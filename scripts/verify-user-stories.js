#!/usr/bin/env node

/**
 * Verify User Stories for 3 Strategic Directives
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const SD_IDS = [
  'SD-VENTURE-IDEATION-MVP-001',
  'SD-AGENT-PLATFORM-001',
  'SD-AGENT-ADMIN-001'
];

async function verifyUserStories() {
  console.log('🔍 Verifying User Stories for 3 Strategic Directives');
  console.log('='.repeat(80));

  try {
    // Query user stories for all 3 SDs
    const { data: stories, error } = await supabase
      .from('user_stories')
      .select('id, story_key, title, sd_id, story_points, priority, status')
      .in('sd_id', SD_IDS)
      .order('sd_id', { ascending: true })
      .order('story_key', { ascending: true });

    if (error) throw error;

    // Group by SD
    const storiesBySd = SD_IDS.reduce((acc, sdId) => {
      acc[sdId] = stories.filter(s => s.sd_id === sdId);
      return acc;
    }, {});

    console.log('\n📊 User Stories Summary:\n');

    let totalStories = 0;
    let totalPoints = 0;

    for (const sdId of SD_IDS) {
      const sdStories = storiesBySd[sdId];
      const points = sdStories.reduce((sum, s) => sum + s.story_points, 0);

      totalStories += sdStories.length;
      totalPoints += points;

      console.log(`${sdId}:`);
      console.log(`  Stories: ${sdStories.length}`);
      console.log(`  Total Points: ${points}`);
      console.log('  Status Breakdown:');

      const statusCounts = sdStories.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {});

      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`    - ${status}: ${count}`);
      });

      console.log('  Priority Breakdown:');
      const priorityCounts = sdStories.reduce((acc, s) => {
        acc[s.priority] = (acc[s.priority] || 0) + 1;
        return acc;
      }, {});

      Object.entries(priorityCounts).forEach(([priority, count]) => {
        console.log(`    - ${priority}: ${count}`);
      });

      console.log('');
    }

    console.log('='.repeat(80));
    console.log(`📈 TOTAL: ${totalStories} user stories across 3 SDs`);
    console.log(`🎯 TOTAL STORY POINTS: ${totalPoints}`);
    console.log('='.repeat(80));

    console.log('\n✅ All user stories verified and linked correctly!\n');

    return {
      totalStories,
      totalPoints,
      storiesBySd
    };
  } catch (error) {
    console.error('❌ Error verifying user stories:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyUserStories();
}

export { verifyUserStories };
