#!/usr/bin/env node

/**
 * CLI Entry Point — Synthetic Pipeline Runner
 *
 * Usage:
 *   node scripts/run-synthetic-pipeline.js --batch-size 4
 *   node scripts/run-synthetic-pipeline.js --schedule --interval 30
 *   node scripts/run-synthetic-pipeline.js --dry-run
 *   node scripts/run-synthetic-pipeline.js --status
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-A
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createPipelineRunner } from '../lib/eva/pipeline-runner/index.js';
import { executeStageZero } from '../lib/eva/stage-zero/index.js';
import { recordGateSignal } from '../lib/eva/stage-zero/gate-signal-service.js';

const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1;
}

function getFlagValue(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return defaultValue;
  return args[idx + 1];
}

const batchSize = parseInt(getFlagValue('batch-size', '4'), 10);
const intervalMinutes = parseInt(getFlagValue('interval', '30'), 10);
const schedule = getFlag('schedule');
const dryRun = getFlag('dry-run');
const showStatus = getFlag('status');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const runner = createPipelineRunner(
  {
    batchSize,
    intervalMs: intervalMinutes * 60 * 1000,
    maxDailyVentures: parseInt(getFlagValue('max-daily', '144'), 10),
  },
  {
    supabase,
    executeStageZero,
    recordGateSignal,
    logger: console,
  }
);

if (showStatus) {
  const status = runner.status();
  console.log('\n=== Synthetic Pipeline Status ===');
  console.log(JSON.stringify(status, null, 2));
  process.exit(0);
}

if (schedule) {
  console.log(`\n=== Starting Scheduled Pipeline ===`);
  console.log(`  Batch size: ${batchSize}`);
  console.log(`  Interval: ${intervalMinutes} minutes`);
  console.log(`  Dry run: ${dryRun}`);
  console.log('  Press Ctrl+C to stop\n');

  runner.start();

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    runner.stop();
    process.exit(0);
  });
} else {
  // Single batch execution
  console.log(`\n=== Running Single Batch ===`);
  console.log(`  Batch size: ${batchSize}`);
  console.log(`  Dry run: ${dryRun}\n`);

  runner.runBatch({ batchSize, dryRun }).then(result => {
    console.log('\n=== Batch Result ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failures > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Pipeline failed:', err.message);
    process.exit(1);
  });
}
