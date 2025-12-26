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
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const LOG_FILE = path.join(process.cwd(), '.claude/logs/context-usage.jsonl');
const STATE_FILE = path.join(process.cwd(), '.claude/logs/.sync-state.json');
const BATCH_SIZE = 100;

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
 * Parse JSONL file and return new entries since last sync
 */
async function getNewEntries(sinceLine = 0) {
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
  }

  return entries;
}

/**
 * Transform local entry to database schema
 */
function transformEntry(entry) {
  return {
    session_id: entry.session,
    timestamp: entry.ts,
    model_id: entry.model,
    context_used: entry.context_used,
    context_size: entry.context_size,
    usage_percent: entry.percent,
    input_tokens: entry.input,
    output_tokens: entry.output,
    cache_creation_tokens: entry.cache_create,
    cache_read_tokens: entry.cache_read,
    status: entry.status,
    compaction_detected: entry.compaction,
    working_directory: entry.cwd
  };
}

/**
 * Sync new entries to database
 */
async function syncToDatabase() {
  console.log('\n📊 LEO Protocol - Context Usage Sync');
  console.log('═'.repeat(60));

  const state = loadSyncState();
  console.log(`Last synced line: ${state.lastSyncedLine}`);

  const entries = await getNewEntries(state.lastSyncedLine);

  if (entries.length === 0) {
    console.log('✅ No new entries to sync');
    return;
  }

  console.log(`Found ${entries.length} new entries to sync`);

  // Batch upload
  let synced = 0;
  let errors = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const transformed = batch.map(transformEntry);

    const { error } = await supabase
      .from('context_usage_log')
      .upsert(transformed, {
        onConflict: 'session_id,timestamp'
      });

    if (error) {
      console.error(`Error syncing batch ${i / BATCH_SIZE + 1}:`, error.message);
      errors += batch.length;
    } else {
      synced += batch.length;
    }
  }

  // Update state
  const lastEntry = entries[entries.length - 1];
  saveSyncState({
    lastSyncedLine: lastEntry._lineNumber,
    lastSyncedTimestamp: lastEntry.ts
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

// CLI
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
