#!/usr/bin/env node

/**
 * EVA Idea Status CLI
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001F
 *
 * Shows pipeline status: counts by source and status.
 *
 * Usage:
 *   npm run eva:ideas:status
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('');
  console.log('='.repeat(60));
  console.log('EVA Idea Pipeline Status');
  console.log('='.repeat(60));
  console.log('');

  // Todoist counts
  const { data: todoistCounts } = await supabase
    .from('eva_todoist_intake')
    .select('status');

  const todoistByStatus = {};
  for (const row of todoistCounts || []) {
    todoistByStatus[row.status] = (todoistByStatus[row.status] || 0) + 1;
  }

  console.log('  Todoist Intake:');
  console.log(`    Total:          ${todoistCounts?.length || 0}`);
  for (const [status, count] of Object.entries(todoistByStatus).sort()) {
    console.log(`    ${status.padEnd(16)} ${count}`);
  }
  console.log('');

  // YouTube counts
  const { data: youtubeCounts } = await supabase
    .from('eva_youtube_intake')
    .select('status');

  const youtubeByStatus = {};
  for (const row of youtubeCounts || []) {
    youtubeByStatus[row.status] = (youtubeByStatus[row.status] || 0) + 1;
  }

  console.log('  YouTube Intake:');
  console.log(`    Total:          ${youtubeCounts?.length || 0}`);
  for (const [status, count] of Object.entries(youtubeByStatus).sort()) {
    console.log(`    ${status.padEnd(16)} ${count}`);
  }
  console.log('');

  // Sync state
  const { data: syncState } = await supabase
    .from('eva_sync_state')
    .select('source_type, source_identifier, last_sync_at, total_synced, consecutive_failures')
    .order('source_type');

  console.log('  Sync State:');
  if (syncState?.length) {
    for (const s of syncState) {
      const lastSync = s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : 'Never';
      const health = s.consecutive_failures >= 3 ? 'CIRCUIT OPEN' :
                     s.consecutive_failures > 0 ? `${s.consecutive_failures} failures` : 'Healthy';
      console.log(`    ${s.source_type}/${s.source_identifier}: ${lastSync} (${s.total_synced} total, ${health})`);
    }
  } else {
    console.log('    No sync history');
  }

  // Categories
  const { data: categories } = await supabase
    .from('eva_idea_categories')
    .select('category_type')
    .eq('is_active', true);

  const catCounts = {};
  for (const c of categories || []) {
    catCounts[c.category_type] = (catCounts[c.category_type] || 0) + 1;
  }

  console.log('');
  console.log('  Categories:');
  for (const [type, count] of Object.entries(catCounts)) {
    console.log(`    ${type}: ${count}`);
  }

  console.log('');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
