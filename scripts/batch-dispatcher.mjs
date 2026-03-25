#!/usr/bin/env node
/**
 * Batch Dispatcher — Unified /batch command entry point.
 * Routes to operation adapters with dry-run enforcement and audit logging.
 *
 * Usage:
 *   node scripts/batch-dispatcher.mjs <operation> [--apply] [--type <value>] [--parent <value>] [--concurrency <N>]
 *   node scripts/batch-dispatcher.mjs --list
 *
 * SD: SD-LEO-SIMPLIFY-ENFORCEMENT-AND-ORCH-001-B, SD-LEO-SIMPLIFY-ENFORCEMENT-AND-ORCH-001-C
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isDeepStrictEqual } from 'node:util';
import operations from './batch-operations/index.mjs';

dotenv.config();

// --- Arg Parsing ---

const args = process.argv.slice(2);
const showList = args.includes('--list');
const applyMode = args.includes('--apply');
const operationKey = args.find(a => !a.startsWith('--'));

// Parse --key value flag pairs
function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && argv[i] !== '--list' && argv[i] !== '--apply') {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      flags[key] = value;
      if (value !== true) i++;
    }
  }
  return flags;
}

const flags = parseFlags(args);
const concurrency = parseInt(flags.concurrency, 10) || 1;
delete flags.concurrency; // Don't pass to adapters as a regular flag

// --- Supabase Client ---

function createSupabaseClient(requiresServiceRole) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = requiresServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !key) {
    console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  return createClient(url, key);
}

// --- Write Verification ---

async function verifiedWrite(supabase, table, id, updates) {
  const { error: writeError } = await supabase.from(table).update(updates).eq('id', id);
  if (writeError) return { success: false, error: writeError.message };

  const { data, error: readError } = await supabase.from(table).select('*').eq('id', id).single();
  if (readError || !data) return { success: false, error: 'Write verification read-back failed' };

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'object' && value !== null) {
      if (!isDeepStrictEqual(data[key], value)) {
        return { success: false, error: `Field ${key} not updated (JSONB mismatch)` };
      }
    } else if (data[key] !== value) {
      return { success: false, error: `Field ${key} not updated (expected: ${value}, got: ${data[key]})` };
    }
  }

  return { success: true };
}

// --- Audit Logging ---

async function logOperation(supabase, entry) {
  const { error } = await supabase.from('batch_operation_log').insert(entry);
  if (error) {
    console.error(`  Warning: Failed to log operation: ${error.message}`);
  }
}

// --- List Operations ---

function listOperations() {
  console.log('\nAvailable batch operations:\n');
  console.log(`  ${'Operation'.padEnd(25)} ${'Description'.padEnd(45)} Flags`);
  console.log('  ' + '-'.repeat(90));

  for (const [key, op] of operations) {
    const flagStr = op.flags.map(f => `--${f.name}`).join(', ') || '(none)';
    console.log(`  ${key.padEnd(25)} ${op.description.padEnd(45)} ${flagStr}`);
  }

  console.log('\nUsage:');
  console.log('  node scripts/batch-dispatcher.mjs <operation>          # Dry-run (preview)');
  console.log('  node scripts/batch-dispatcher.mjs <operation> --apply  # Execute writes');
  console.log('  node scripts/batch-dispatcher.mjs --list               # Show this list');
  console.log();
}

// --- Concurrency Helper ---

/**
 * Process items with configurable concurrency using Promise.allSettled.
 * @param {Array} items - Items to process
 * @param {Function} processor - async (item) => result
 * @param {number} maxConcurrency - Max parallel items (default: 1)
 * @returns {Array<{status: string, value?: any, reason?: any}>}
 */
export async function processConcurrently(items, processor, maxConcurrency = 1) {
  const results = [];
  for (let i = 0; i < items.length; i += maxConcurrency) {
    const chunk = items.slice(i, i + maxConcurrency);
    const chunkResults = await Promise.allSettled(chunk.map(processor));
    results.push(...chunkResults);
  }
  return results;
}

// --- Main ---

async function main() {
  if (showList || !operationKey) {
    listOperations();
    return;
  }

  const operation = operations.get(operationKey);
  if (!operation) {
    console.error(`Unknown operation: ${operationKey}\n`);
    console.error('Available operations:');
    for (const [key, op] of operations) {
      console.error(`  ${key} — ${op.description}`);
    }
    process.exit(1);
  }

  const dryRun = !applyMode;
  const supabase = createSupabaseClient(operation.requiresServiceRole);

  console.log(`\n/batch ${operationKey}${dryRun ? ' (DRY RUN)' : ' (APPLY)'}${concurrency > 1 ? ` (concurrency: ${concurrency})` : ''}`);
  console.log('='.repeat(60));

  if (Object.keys(flags).length > 0) {
    console.log('Flags:', Object.entries(flags).map(([k, v]) => `--${k} ${v}`).join(', '));
  }
  console.log();

  const startedAt = new Date();
  let result;
  let errorMessage = null;

  try {
    result = await operation.execute(supabase, {
      dryRun,
      flags,
      concurrency,
      verifiedWrite: dryRun ? null : verifiedWrite,
    });
  } catch (err) {
    errorMessage = err.message;
    result = { total: 0, processed: 0, skipped: 0, failed: 1, details: [{ error: err.message }] };
  }

  const completedAt = new Date();
  const durationMs = completedAt - startedAt;

  // Display results
  console.log('\n' + '='.repeat(60));
  console.log(`${dryRun ? 'DRY RUN' : 'EXECUTION'} SUMMARY`);
  console.log('='.repeat(60));
  console.log(`  Operation:  ${operationKey}`);
  console.log(`  Mode:       ${dryRun ? 'dry-run (preview only)' : 'apply (writes enabled)'}`);
  console.log(`  Total:      ${result.total}`);
  console.log(`  Processed:  ${result.processed}`);
  console.log(`  Skipped:    ${result.skipped}`);
  console.log(`  Failed:     ${result.failed}`);
  console.log(`  Duration:   ${durationMs}ms`);

  if (result.details.length > 0 && result.details.length <= 20) {
    console.log('\nDetails:');
    for (const detail of result.details) {
      const sdId = detail.sd_id || detail.sd_key || '';
      const status = detail.status || detail.error || '';
      console.log(`  ${sdId ? sdId + ': ' : ''}${status}`);
    }
  } else if (result.details.length > 20) {
    console.log(`\n  (${result.details.length} detail entries — showing first 10)`);
    for (const detail of result.details.slice(0, 10)) {
      const sdId = detail.sd_id || detail.sd_key || '';
      const status = detail.status || detail.error || '';
      console.log(`  ${sdId ? sdId + ': ' : ''}${status}`);
    }
  }

  console.log();

  // Audit log (use service role client for logging)
  const logClient = createSupabaseClient(true);
  await logOperation(logClient, {
    operation: operationKey,
    dry_run: dryRun,
    operator: process.env.CLAUDE_SESSION_ID || 'manual',
    total_items: result.total,
    processed: result.processed,
    skipped: result.skipped,
    failed: result.failed,
    details: result.details,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    error_message: errorMessage,
  });

  if (result.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
