#!/usr/bin/env node

/**
 * EVA Idea Sync Cron — post-run health assertion
 * SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 (FR-4 AC-3)
 *
 * scripts/eva-idea-sync.js ALWAYS exits 0 (playlist-sync.js/todoist-sync.js both swallow errors
 * internally and continue), so the cron workflow's own `if: failure()` step can never fire off
 * the sync step's exit code alone. This script is the thing `if: failure()` actually keys off:
 * a separate pre/post watermark comparison, run as its own workflow step.
 *
 * Usage:
 *   node scripts/eva-idea-sync-cron-assert.mjs --capture   (before the sync step)
 *   node scripts/eva-idea-sync-cron-assert.mjs --verify    (after the sync step)
 *
 * Per-source, not combined pass/fail (TS-1): a source whose circuit is already open pending an
 * external decision (e.g. FR-2's credential-architecture cutover) is reported by name rather than
 * folded into one opaque failure, but --verify still exits non-zero if ANY source is unhealthy —
 * an open circuit is always actionable, whatever its root cause.
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { SYNC_STATE_IDENTIFIER as YOUTUBE_CREDENTIAL_ROW } from '../lib/integrations/youtube/oauth-manager.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SOURCE_TYPES = ['youtube', 'todoist'];
const WATERMARK_FILE = '.eva-sync-watermark.json';
const CIRCUIT_OPEN_THRESHOLD = 3;

// TESTING sub-agent finding (EXEC review): a bare source_type filter with no ordering collapses
// multiple rows (legacy Todoist projects, and YouTube's own OAuth-credential row -- a DIFFERENT
// kind of row co-located in this table, never touched by a sync run) into PostgREST's undefined
// heap order, which shifts every time the atomic RPC updates a row. Excluding the credential row
// and taking the most-recently-updated remaining row per source_type is self-healing if the
// active Todoist project or YouTube target ever changes, since only the currently-active
// identifier's row keeps advancing.
export async function fetchState(supabase) {
  const { data, error } = await supabase
    .from('eva_sync_state')
    .select('source_type, source_identifier, last_sync_at, consecutive_failures, updated_at')
    .in('source_type', SOURCE_TYPES)
    .neq('source_identifier', YOUTUBE_CREDENTIAL_ROW)
    .order('updated_at', { ascending: false });
  if (error) {
    throw new Error(`eva_sync_state read failed: ${error.message}`);
  }
  const bySource = {};
  for (const row of data || []) {
    if (!bySource[row.source_type]) {
      bySource[row.source_type] = row;
    }
  }
  return bySource;
}

export async function capture(supabase) {
  const state = await fetchState(supabase);
  const watermark = {};
  for (const sourceType of SOURCE_TYPES) {
    watermark[sourceType] = state[sourceType]?.last_sync_at ?? null;
  }
  writeFileSync(WATERMARK_FILE, JSON.stringify(watermark, null, 2));
  console.log(`Captured pre-run watermark: ${JSON.stringify(watermark)}`);
  return watermark;
}

/**
 * Pure decision function — exported so the pass/fail logic itself is unit-testable without a
 * live DB (mirrors the FR-4 AC-1 renderSyncState testability seam).
 */
export function evaluateSource(sourceType, before, after) {
  if (!after) {
    return { sourceType, healthy: false, reason: 'no eva_sync_state row found post-run' };
  }
  if ((after.consecutive_failures ?? 0) >= CIRCUIT_OPEN_THRESHOLD) {
    return { sourceType, healthy: false, reason: `circuit open (consecutive_failures=${after.consecutive_failures})` };
  }
  const advanced = after.last_sync_at && after.last_sync_at !== before;
  if (!advanced) {
    return { sourceType, healthy: false, reason: `watermark did not advance (still ${after.last_sync_at ?? 'null'})` };
  }
  return { sourceType, healthy: true, reason: `watermark advanced to ${after.last_sync_at}` };
}

export async function verify(supabase) {
  if (!existsSync(WATERMARK_FILE)) {
    throw new Error(`${WATERMARK_FILE} not found — run --capture before --verify`);
  }
  const before = JSON.parse(readFileSync(WATERMARK_FILE, 'utf8'));
  const after = await fetchState(supabase);

  const results = SOURCE_TYPES.map((sourceType) => evaluateSource(sourceType, before[sourceType], after[sourceType]));

  for (const r of results) {
    console.log(`  ${r.sourceType}: ${r.healthy ? 'HEALTHY' : 'UNHEALTHY'} — ${r.reason}`);
  }

  const unhealthy = results.filter((r) => !r.healthy);
  return { results, ok: unhealthy.length === 0 };
}

async function main() {
  const mode = process.argv[2];
  const supabase = createSupabaseServiceClient();

  if (mode === '--capture') {
    await capture(supabase);
    return;
  }
  if (mode === '--verify') {
    const { ok } = await verify(supabase);
    if (!ok) {
      console.error('One or more sources are unhealthy — see per-source detail above.');
      process.exitCode = 1;
    }
    return;
  }
  console.error('Usage: eva-idea-sync-cron-assert.mjs --capture | --verify');
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
