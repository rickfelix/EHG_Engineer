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

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();


// Pure, exported so TS-4 can unit-test the error-vs-empty distinction without a live DB
// (SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 FR-4 AC-1). A failed read must never render
// identically to a genuinely empty eva_sync_state table.
export function renderSyncState(syncState, error) {
  const lines = ['  Sync State:'];
  if (error) {
    lines.push(`    ERROR: query failed — ${error.message || error} (sync state unavailable, NOT confirmed empty)`);
  } else if (syncState?.length) {
    for (const s of syncState) {
      const lastSync = s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : 'Never';
      const health = s.consecutive_failures >= 3 ? 'CIRCUIT OPEN' :
                     s.consecutive_failures > 0 ? `${s.consecutive_failures} failures` : 'Healthy';
      lines.push(`    ${s.source_type}/${s.source_identifier}: ${lastSync} (${s.total_synced} total, ${health})`);
    }
  } else {
    lines.push('    No sync history');
  }
  return lines;
}

async function main() {
  const supabase = createSupabaseServiceClient();

  console.log('');
  console.log('='.repeat(60));
  console.log('EVA Idea Pipeline Status');
  console.log('='.repeat(60));
  console.log('');

  // Todoist counts. SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: eva_todoist_intake
  // is unbounded and every row is tallied into the per-status histogram below — paginate to
  // completion. Fail-open to [] mirrors the prior undefined-on-error `todoistCounts || []`.
  let todoistFailed = false;
  const todoistCounts = await fetchAllPaginated(() => supabase
    .from('eva_todoist_intake')
    .select('status')
    .order('id', { ascending: true })) // unique tiebreaker (FR-6)
    .catch(() => { todoistFailed = true; return []; });

  const todoistByStatus = {};
  for (const row of todoistCounts || []) {
    todoistByStatus[row.status] = (todoistByStatus[row.status] || 0) + 1;
  }

  console.log('  Todoist Intake:');
  // A failed read must never look identical to a genuinely empty table (A3) — flag it explicitly.
  console.log(`    Total:          ${todoistFailed ? 'unavailable' : (todoistCounts?.length || 0)}`);
  for (const [status, count] of Object.entries(todoistByStatus).sort()) {
    console.log(`    ${status.padEnd(16)} ${count}`);
  }
  console.log('');

  // YouTube counts. SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: eva_youtube_intake
  // is unbounded and every row is tallied into the per-status histogram below — paginate to
  // completion. Fail-open to [] mirrors the prior undefined-on-error `youtubeCounts || []`.
  let youtubeFailed = false;
  const youtubeCounts = await fetchAllPaginated(() => supabase
    .from('eva_youtube_intake')
    .select('status')
    .order('id', { ascending: true })) // unique tiebreaker (FR-6)
    .catch(() => { youtubeFailed = true; return []; });

  const youtubeByStatus = {};
  for (const row of youtubeCounts || []) {
    youtubeByStatus[row.status] = (youtubeByStatus[row.status] || 0) + 1;
  }

  console.log('  YouTube Intake:');
  console.log(`    Total:          ${youtubeFailed ? 'unavailable' : (youtubeCounts?.length || 0)}`);
  for (const [status, count] of Object.entries(youtubeByStatus).sort()) {
    console.log(`    ${status.padEnd(16)} ${count}`);
  }
  console.log('');

  // Sync state
  const { data: syncState, error: syncStateError } = await supabase
    .from('eva_sync_state')
    .select('source_type, source_identifier, last_sync_at, total_synced, consecutive_failures')
    .order('source_type');

  for (const line of renderSyncState(syncState, syncStateError)) {
    console.log(line);
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

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
