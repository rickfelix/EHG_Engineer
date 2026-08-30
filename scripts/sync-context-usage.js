#!/usr/bin/env node
/**
 * LEO Protocol - Context Usage Sync
 * ============================================================================
 * Syncs local JSONL context usage logs to Supabase for historical analysis.
 *
 * Features:
 *   - Batched uploads (100 records at a time)
 *   - Deduplication via session_id + timestamp
 *   - Aggregation queries for weekly/daily summaries
 *   - Compaction event tracking
 *
 * Usage:
 *   node scripts/sync-context-usage.js              # Sync pending logs
 *   node scripts/sync-context-usage.js --summary    # Show usage summary
 *   node scripts/sync-context-usage.js --analyze    # Analyze compaction patterns
 *
 * Based on research: Token Accounting & Memory Utilization (Dec 2025)
 *
 * SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (FR-1): this ccusage-style pipeline was extended
 * rather than replaced with OpenTelemetry -- measured, not assumed: 0 of 62 package.json
 * dependencies match /otel|opentelemetry|telemetry|tracing/, and the only repo hits for
 * "opentelemetry" are archived (scripts/archive/codex-integration/), confirming no live OTel
 * integration exists anywhere in this repo.
 * ============================================================================
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import { isMainModule } from '../lib/utils/is-main-module.js';

dotenv.config();

// QF-20260830-792: this script previously authenticated with the ANON key (createSupabaseClient),
// which has no INSERT grant on context_usage_log -- only `authenticated` and `service_role` do
// (database/migrations/20260317_rls_policy_tightening_phase1.sql section 3.5). Every sync tick has
// been running fleet-wide since SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (wired into
// worker-checkin.cjs's cadence) and silently failing every single time ("new row violates
// row-level security policy") -- the WRITE side (statusline.cjs -> .claude/logs/context-usage.jsonl)
// was never broken and has been accumulating real entries the whole time; only this sync's own
// auth was wrong.
const supabase = createSupabaseServiceClient();

const LOG_FILE = path.join(process.cwd(), '.claude/logs/context-usage.jsonl');
const STATE_FILE = path.join(process.cwd(), '.claude/logs/.sync-state.json');
const BATCH_SIZE = 100;
// SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (TESTING finding F3, evidence 0f1303ad): now invoked
// on every worker-checkin.cjs tick fleet-wide. Without a cap, the first post-merge tick against
// a large never-synced backlog (measured: ~620k lines) would process the entire thing in one
// call, risking a fleet-wide check-in stall. Bounding per-invocation work leaves the remainder
// for subsequent ticks rather than trying to fix it all in one pass.
const MAX_ENTRIES_PER_SYNC = 5000;

/**
 * Load sync state (last synced line number)
 */
function loadSyncState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not load sync state:', e.message);
  }
  return { lastSyncedLine: 0, lastSyncedTimestamp: null };
}

/**
 * Save sync state
 */
function saveSyncState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Parse JSONL file and return new entries since last sync.
 *
 * SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (SECURITY finding, evidence 15c8c79e): maxEntries stops
 * the READ itself once the cap is reached, closing the stream early — the previous version
 * buffered the ENTIRE remainder (measured ~620k lines) into memory on every tick before
 * MAX_ENTRIES_PER_SYNC sliced it down for upload, so the cap bounded upload cost but not read/
 * memory cost.
 * @param {number} [sinceLine]
 * @param {number} [maxEntries] - stop reading once this many entries are collected (no cap when omitted/0)
 */
async function getNewEntries(sinceLine = 0, maxEntries = 0) {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('No log file found at:', LOG_FILE);
    return [];
  }

  const entries = [];
  let lineNumber = 0;

  const fileStream = fs.createReadStream(LOG_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    lineNumber++;
    if (lineNumber <= sinceLine) continue;

    try {
      const entry = JSON.parse(line);
      entries.push({
        ...entry,
        _lineNumber: lineNumber
      });
    } catch (e) {
      console.warn(`Skipping malformed line ${lineNumber}:`, e.message);
    }

    if (maxEntries > 0 && entries.length >= maxEntries) {
      rl.close();
      fileStream.destroy();
      break;
    }
  }

  return entries;
}

/**
 * Transform local entry to database schema.
 *
 * SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (FR-2a, TESTING evidence f1af6634): this previously
 * read SHORT keys (entry.session, entry.ts, entry.percent, ...) while the only real writer,
 * .claude/context-usage-feed.cjs's buildUsageEntry, emits LONG keys matching the DB column
 * names 1:1 (entry.session_id, entry.timestamp, entry.usage_percent, ...) -- a live JSONL
 * census found 619,600 of 619,983 lines in the LONG shape, silently producing a row of mostly
 * undefined fields (including the NOT NULL session_id) on every sync attempt. Read the LONG
 * keys buildUsageEntry actually writes; pass loop_name through when present (FR-2).
 */
function transformEntry(entry) {
  const transformed = {
    session_id: entry.session_id,
    timestamp: entry.timestamp,
    model_id: entry.model_id,
    context_used: entry.context_used,
    context_size: entry.context_size,
    usage_percent: entry.usage_percent,
    input_tokens: entry.input_tokens,
    output_tokens: entry.output_tokens,
    cache_creation_tokens: entry.cache_creation_tokens,
    cache_read_tokens: entry.cache_read_tokens,
    status: entry.status,
    compaction_detected: entry.compaction_detected,
    working_directory: entry.working_directory,
  };
  if (entry.loop_name) transformed.loop_name = entry.loop_name;
  return transformed;
}

/**
 * Sync new entries to database
 */
async function syncToDatabase() {
  console.log('\n📊 LEO Protocol - Context Usage Sync');
  console.log('═'.repeat(60));

  const state = loadSyncState();
  console.log(`Last synced line: ${state.lastSyncedLine}`);

  // TESTING finding F3 / SECURITY finding (evidence 0f1303ad, 15c8c79e): the cap is enforced by
  // the READ itself (getNewEntries stops early) so a large backlog is never fully buffered into
  // memory on a single tick, not just capped before upload.
  const entries = await getNewEntries(state.lastSyncedLine, MAX_ENTRIES_PER_SYNC);

  if (entries.length === 0) {
    console.log('✅ No new entries to sync');
    return;
  }

  console.log(`Found ${entries.length} new entries to sync${entries.length === MAX_ENTRIES_PER_SYNC ? ' (capped — remainder, if any, deferred to next tick)' : ''}`);

  // Batch upload
  let synced = 0;
  let errors = 0;
  // TESTING finding F1 (evidence 0f1303ad): the previous version advanced past every entry in
  // this call regardless of per-batch errors, permanently skipping failed entries next run.
  // Track the furthest LINE NUMBER actually persisted and STOP at the first batch failure —
  // never advance state past a line that was not confirmed written, so a transient error is
  // retried on the next tick instead of silently dropped forever.
  let lastPersistedEntry = null;
  let skippedLegacy = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    // QF-20260830-792: a small, permanent historical class (~383 of 619,983 lines, from before
    // the SHORT-key-vs-LONG-key fix above) has no session_id at all -- the NOT NULL constraint
    // rejects the WHOLE batch on the one bad row, and F1's stop-at-first-failure then pins the
    // sync at line ~383 forever, unable to ever reach the 619,600 genuinely-valid entries after
    // it. This is NOT a transient error to retry (backfill for these specific rows is not
    // possible -- there is no session_id to recover) -- skip them and keep advancing.
    const validBatch = batch.filter((e) => !!e.session_id);
    skippedLegacy += batch.length - validBatch.length;
    if (validBatch.length === 0) { lastPersistedEntry = batch[batch.length - 1]; continue; }
    const transformed = validBatch.map(transformEntry);

    let { error } = await supabase
      .from('context_usage_log')
      .upsert(transformed, {
        onConflict: 'session_id,timestamp'
      });

    // SECURITY finding (evidence 15c8c79e): the loop_name column ships as a migration FILE
    // that is not self-applicable by a worker session (prod DDL requires a human/authorized
    // apply). Without this fallback, every upsert after this SD merges would fail PGRST204
    // until that separate apply step lands, and F1's new stop-at-first-failure would then pin
    // the sync permanently. Mirrors the established captureLedgerRow pattern (solomon-advisory.cjs):
    // retry once without the not-yet-migrated column rather than failing capture entirely.
    if (error && error.code === 'PGRST204' && /loop_name/.test(error.message || '')) {
      const withoutLoopName = transformed.map(({ loop_name: _drop, ...rest }) => rest);
      ({ error } = await supabase
        .from('context_usage_log')
        .upsert(withoutLoopName, { onConflict: 'session_id,timestamp' }));
    }

    if (error) {
      console.error(`Error syncing batch ${i / BATCH_SIZE + 1}:`, error.message);
      errors += validBatch.length;
      break; // stop advancing state past a confirmed failure
    } else {
      synced += validBatch.length;
      lastPersistedEntry = batch[batch.length - 1];
    }
  }
  if (skippedLegacy > 0) console.log(`Skipped ${skippedLegacy} legacy entries with no session_id (unrecoverable historical rows -- not a retryable error)`);

  // Update state — only as far as the last batch that actually persisted.
  if (!lastPersistedEntry) {
    console.log(`\n❌ Errors: ${errors} entries; sync state NOT advanced (retry next tick)`);
    console.log('═'.repeat(60) + '\n');
    return;
  }
  const lastEntry = lastPersistedEntry;
  saveSyncState({
    lastSyncedLine: lastEntry._lineNumber,
    // TESTING finding F2 (evidence 0f1303ad): was entry.ts, the same SHORT-key defect class
    // FR-2a fixes elsewhere in this function — buildUsageEntry emits `timestamp`, never `ts`.
    lastSyncedTimestamp: lastEntry.timestamp,
  });

  console.log(`\n✅ Synced: ${synced} entries`);
  if (errors > 0) {
    console.log(`❌ Errors: ${errors} entries`);
  }
  console.log('═'.repeat(60) + '\n');
}

/**
 * Show usage summary
 */
async function showSummary() {
  console.log('\n📊 Context Usage Summary');
  console.log('═'.repeat(60));

  // Get summary from database
  const { data: summary, error } = await supabase.rpc('get_context_usage_summary');

  if (error) {
    // Fallback to local analysis if RPC not available
    console.log('Analyzing local log file...\n');
    await analyzeLocalLog();
    return;
  }

  if (summary && summary.length > 0) {
    const s = summary[0];
    console.log(`\nTotal Sessions: ${s.total_sessions}`);
    console.log(`Total Entries: ${s.total_entries}`);
    console.log(`\nAverage Context Usage: ${s.avg_usage_percent?.toFixed(1)}%`);
    console.log(`Peak Context Usage: ${s.max_usage_percent}%`);
    console.log(`\nCompaction Events: ${s.compaction_count}`);
    console.log(`Critical Alerts: ${s.critical_count}`);
    console.log(`Warning Alerts: ${s.warning_count}`);
  }

  console.log('═'.repeat(60) + '\n');
}

/**
 * Analyze local log file for patterns
 */
async function analyzeLocalLog() {
  const entries = await getNewEntries(0);

  if (entries.length === 0) {
    console.log('No entries to analyze');
    return;
  }

  // Group by session
  const sessions = {};
  entries.forEach(e => {
    if (!sessions[e.session]) {
      sessions[e.session] = {
        entries: [],
        maxPercent: 0,
        compactions: 0,
        model: e.model
      };
    }
    sessions[e.session].entries.push(e);
    sessions[e.session].maxPercent = Math.max(sessions[e.session].maxPercent, e.percent);
    if (e.compaction) sessions[e.session].compactions++;
  });

  const sessionKeys = Object.keys(sessions);
  console.log(`Sessions analyzed: ${sessionKeys.length}`);

  // Calculate averages
  const totalMaxPercent = sessionKeys.reduce((sum, k) => sum + sessions[k].maxPercent, 0);
  const avgMaxPercent = totalMaxPercent / sessionKeys.length;

  const totalCompactions = sessionKeys.reduce((sum, k) => sum + sessions[k].compactions, 0);

  console.log(`Average peak usage: ${avgMaxPercent.toFixed(1)}%`);
  console.log(`Total compaction events: ${totalCompactions}`);

  // Status distribution
  const statusCounts = { HEALTHY: 0, WARNING: 0, CRITICAL: 0, EMERGENCY: 0 };
  entries.forEach(e => {
    if (statusCounts[e.status] !== undefined) {
      statusCounts[e.status]++;
    }
  });

  console.log('\nStatus Distribution:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    const pct = ((count / entries.length) * 100).toFixed(1);
    console.log(`  ${status}: ${count} (${pct}%)`);
  });

  // Cache efficiency
  const totalCacheRead = entries.reduce((sum, e) => sum + (e.cache_read || 0), 0);
  const totalInput = entries.reduce((sum, e) => sum + (e.input || 0), 0);
  const cacheEfficiency = totalInput > 0 ? (totalCacheRead / totalInput * 100).toFixed(1) : 0;

  console.log(`\nCache Read Efficiency: ${cacheEfficiency}%`);
}

/**
 * Analyze compaction patterns
 */
async function analyzeCompaction() {
  console.log('\n♻️ Compaction Pattern Analysis');
  console.log('═'.repeat(60));

  const entries = await getNewEntries(0);
  const compactionEvents = entries.filter(e => e.compaction);

  if (compactionEvents.length === 0) {
    console.log('No compaction events detected');
    console.log('═'.repeat(60) + '\n');
    return;
  }

  console.log(`\nTotal compaction events: ${compactionEvents.length}`);

  // Analyze what percentage triggered compaction
  const triggerPercents = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].compaction && i > 0) {
      // Find the previous entry's percentage
      const prevEntry = entries[i - 1];
      if (prevEntry && !prevEntry.compaction) {
        triggerPercents.push(prevEntry.percent);
      }
    }
  }

  if (triggerPercents.length > 0) {
    const avgTrigger = triggerPercents.reduce((a, b) => a + b, 0) / triggerPercents.length;
    const minTrigger = Math.min(...triggerPercents);
    const maxTrigger = Math.max(...triggerPercents);

    console.log('\nCompaction Trigger Analysis:');
    console.log(`  Average trigger point: ${avgTrigger.toFixed(1)}%`);
    console.log(`  Min trigger point: ${minTrigger}%`);
    console.log(`  Max trigger point: ${maxTrigger}%`);
  }

  // Post-compaction context size
  const postCompactionPercents = compactionEvents.map(e => e.percent);
  const avgPostCompaction = postCompactionPercents.reduce((a, b) => a + b, 0) / postCompactionPercents.length;

  console.log('\nPost-Compaction Context:');
  console.log(`  Average post-compaction: ${avgPostCompaction.toFixed(1)}%`);
  console.log(`  This suggests ~${(100 / avgPostCompaction).toFixed(1)}x compression ratio`);

  console.log('═'.repeat(60) + '\n');
}

// CLI — SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (FR-2a, TESTING evidence f1af6634): gated behind
// isMainModule so importing this file (e.g. to reuse transformEntry/syncToDatabase from
// worker-checkin.cjs, or from a test) does not unconditionally trigger a live sync as a
// side effect of the import itself.
if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.includes('--summary')) {
    showSummary();
  } else if (args.includes('--analyze')) {
    analyzeCompaction();
  } else if (args.includes('--help')) {
    console.log(`
LEO Protocol - Context Usage Sync

Usage:
  node scripts/sync-context-usage.js              Sync pending logs to database
  node scripts/sync-context-usage.js --summary    Show usage summary
  node scripts/sync-context-usage.js --analyze    Analyze compaction patterns
  node scripts/sync-context-usage.js --help       Show this help

Log file: .claude/logs/context-usage.jsonl
    `);
  } else {
    syncToDatabase();
  }
}

export { transformEntry, syncToDatabase, getNewEntries, MAX_ENTRIES_PER_SYNC };
