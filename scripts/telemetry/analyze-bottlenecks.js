#!/usr/bin/env node
/**
 * Telemetry Bottleneck Analyzer CLI
 *
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001B
 *
 * Queries workflow_trace_log, computes rolling baselines per dimension
 * (phase/gate/sub-agent), flags bottlenecks exceeding 3x baseline,
 * and optionally creates improvement items.
 *
 * Exit codes:
 *   0 - Success (bottlenecks found or not)
 *   1 - Partial failure (some items failed to create)
 *   2 - DB connection error
 *
 * Usage:
 *   npm run telemetry:analyze
 *   node scripts/telemetry/analyze-bottlenecks.js --dry-run
 */

import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { analyzeBottlenecks } from '../../lib/telemetry/bottleneck-analyzer.js';

const args = process.argv.slice(2);
const flags = {
  dryRun: args.includes('--dry-run'),
  lookbackDays: parseInt(args.find((_, i, a) => a[i - 1] === '--lookback-days') || '0', 10) || undefined,
  threshold: parseFloat(args.find((_, i, a) => a[i - 1] === '--threshold') || '0') || undefined,
};

const runId = randomUUID();

async function main() {
  const startTime = Date.now();
  console.log(`[telemetry:analyze] run_id=${runId.substring(0, 8)} started`);

  const dotenv = await import('dotenv');
  dotenv.config();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(JSON.stringify({
      run_id: runId,
      category: 'db_connection_error',
      message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }));
    process.exit(2);
  }

  let supabase;
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    // Quick connectivity test
    const { error: pingError } = await supabase.from('telemetry_thresholds').select('id').limit(1);
    if (pingError && pingError.message.includes('does not exist')) {
      // Table missing is not a connection error
    } else if (pingError && (pingError.message.includes('ECONNREFUSED') || pingError.message.includes('ENOTFOUND'))) {
      throw new Error(pingError.message);
    }
  } catch (err) {
    const sanitized = (err.message || '').replace(/password=[^&\s]+/gi, 'password=***');
    console.error(JSON.stringify({
      run_id: runId,
      category: 'db_connection_error',
      message: sanitized,
    }));
    process.exit(2);
  }

  const result = await analyzeBottlenecks(supabase, {
    lookbackDays: flags.lookbackDays,
    thresholdMultiplier: flags.threshold,
    enableAutoCreate: !flags.dryRun,
    runId,
  });

  const elapsed = Date.now() - startTime;

  // Always output JSON to stdout (FR-1)
  console.log(JSON.stringify(result.bottlenecks));

  // Human-readable summary to stderr
  process.stderr.write('\n' + '='.repeat(60) + '\n');
  process.stderr.write('  TELEMETRY BOTTLENECK ANALYSIS\n');
  process.stderr.write('='.repeat(60) + '\n');
  process.stderr.write(`  run_id:            ${runId.substring(0, 8)}\n`);
  process.stderr.write(`  traces_scanned:    ${result.traces_scanned}\n`);
  process.stderr.write(`  dimensions:        ${result.dimensions_evaluated}\n`);
  process.stderr.write(`  bottlenecks_found: ${result.bottlenecks.length}\n`);
  process.stderr.write(`  items_created:     ${result.items_created}\n`);
  process.stderr.write(`  items_skipped:     rate_limit=${result.items_skipped_rate_limit}, dedupe=${result.items_skipped_dedupe}\n`);
  process.stderr.write(`  total_duration_ms: ${elapsed}\n`);
  process.stderr.write('-'.repeat(60) + '\n');

  if (result.bottlenecks.length === 0) {
    process.stderr.write('  No bottlenecks detected.\n');
  } else {
    result.bottlenecks.forEach((b, i) => {
      process.stderr.write(`\n  [${i + 1}] ${b.dimension_type}: ${b.dimension_key}\n`);
      process.stderr.write(`      observed_p50=${b.observed_p50_ms}ms baseline_p50=${b.baseline_p50_ms}ms ratio=${b.ratio}x\n`);
      process.stderr.write(`      samples=${b.sample_count} exceedances=${b.exceedance_count}\n`);
      if (b.improvement_id) {
        process.stderr.write(`      -> improvement: ${b.improvement_id}\n`);
      }
    });
  }

  if (result.errors.length > 0) {
    process.stderr.write('\n  Errors:\n');
    result.errors.forEach(e => process.stderr.write(`    - ${e}\n`));
  }

  process.stderr.write('='.repeat(60) + '\n\n');

  // Exit code 1 if partial failures
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(JSON.stringify({
    run_id: runId,
    category: 'fatal_error',
    message: err.message,
  }));
  process.exit(1);
});
