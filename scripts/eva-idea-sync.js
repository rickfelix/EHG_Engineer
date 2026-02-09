#!/usr/bin/env node

/**
 * EVA Idea Sync CLI
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001F
 *
 * Syncs ideas from external sources (Todoist, YouTube) into the EVA intake pipeline.
 *
 * Usage:
 *   npm run eva:ideas:sync -- --source todoist
 *   npm run eva:ideas:sync -- --source youtube
 *   npm run eva:ideas:sync -- --source all
 *   npm run eva:ideas:sync -- --source todoist --dry-run
 *   npm run eva:ideas:sync -- --source todoist --limit 5
 */

import dotenv from 'dotenv';
dotenv.config();

const args = process.argv.slice(2);
const source = getArg('--source') || 'all';
const dryRun = args.includes('--dry-run');
const limit = parseInt(getArg('--limit') || '0') || undefined;
const verbose = args.includes('--verbose') || args.includes('-v');

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('EVA Idea Sync');
  console.log('='.repeat(60));
  console.log(`  Source:   ${source}`);
  console.log(`  Dry Run:  ${dryRun}`);
  if (limit) console.log(`  Limit:    ${limit}`);
  console.log('');

  const results = {};

  if (source === 'todoist' || source === 'all') {
    console.log('--- Todoist Sync ---');
    try {
      const { syncTodoist } = await import('../lib/integrations/todoist/todoist-sync.js');
      results.todoist = await syncTodoist({ dryRun, limit, verbose });
      console.log(`  Inserted: ${results.todoist.totalInserted}`);
      console.log(`  Updated:  ${results.todoist.totalUpdated}`);
      console.log(`  Errors:   ${results.todoist.totalErrors}`);
    } catch (err) {
      console.error(`  Todoist sync failed: ${err.message}`);
      results.todoist = { error: err.message };
    }
    console.log('');
  }

  if (source === 'youtube' || source === 'all') {
    console.log('--- YouTube Sync ---');
    try {
      const { syncYouTube } = await import('../lib/integrations/youtube/playlist-sync.js');
      results.youtube = await syncYouTube({ dryRun, limit, verbose });
      console.log(`  Inserted: ${results.youtube.totalInserted}`);
      console.log(`  Updated:  ${results.youtube.totalUpdated}`);
      console.log(`  Errors:   ${results.youtube.totalErrors}`);
    } catch (err) {
      console.error(`  YouTube sync not yet available: ${err.message}`);
      results.youtube = { error: err.message };
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log('Sync Complete');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
