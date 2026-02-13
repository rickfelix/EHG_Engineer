#!/usr/bin/env node
/**
 * EVA Scheduler CLI - Start scheduler or check status
 *
 * SD: SD-EVA-FEAT-SCHEDULER-001
 *
 * Usage:
 *   node scripts/eva-scheduler.js start [options]
 *   node scripts/eva-scheduler.js status [--json]
 *
 * Start Options:
 *   --observe-only     Poll and emit metrics without dispatching stages
 *   --poll-interval N  Poll interval in seconds (default: 60)
 *   --batch-size N     Max ventures per poll (default: 20)
 *
 * Environment Variables:
 *   EVA_SCHEDULER_ENABLED              Master enable switch (true|false)
 *   EVA_SCHEDULER_POLL_INTERVAL_SECONDS Poll cadence (default 60)
 *   EVA_SCHEDULER_DISPATCH_BATCH_SIZE  Max ventures per poll (default 20)
 *   EVA_SCHEDULER_OBSERVE_ONLY         Observe-only mode (true|false)
 *   EVA_SCHEDULER_STATUS_TOP_N         Ventures to preview in status (default 10)
 *
 * Exit Codes:
 *   0  Success
 *   1  Usage error or scheduler not found
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { EvaMasterScheduler } from '../lib/eva/eva-master-scheduler.js';

// ── Colors ───────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

// ── Helpers ──────────────────────────────────────────────────

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printUsage() {
  console.log(`
${c.bold}EVA Scheduler CLI${c.reset}

${c.cyan}Usage:${c.reset}
  node scripts/eva-scheduler.js start [options]
  node scripts/eva-scheduler.js status [--json]

${c.cyan}Start Options:${c.reset}
  --observe-only     Poll and emit metrics without dispatching
  --poll-interval N  Poll interval in seconds (default: 60)
  --batch-size N     Max ventures per poll (default: 20)

${c.cyan}Status Options:${c.reset}
  --json             Output as JSON
  --top N            Number of ventures to preview (default: 10)

${c.cyan}Environment:${c.reset}
  EVA_SCHEDULER_ENABLED=true|false
  EVA_SCHEDULER_POLL_INTERVAL_SECONDS=60
  EVA_SCHEDULER_DISPATCH_BATCH_SIZE=20
  EVA_SCHEDULER_OBSERVE_ONLY=true|false
`);
}

// ── Supabase Client ──────────────────────────────────────────

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(`${c.red}Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${c.reset}`);
    process.exit(1);
  }
  return createClient(url, key);
}

// ── Commands ─────────────────────────────────────────────────

async function cmdStart() {
  // Check if scheduler is enabled
  const enabled = process.env.EVA_SCHEDULER_ENABLED;
  if (enabled === 'false') {
    console.log(`${c.yellow}Scheduler is disabled (EVA_SCHEDULER_ENABLED=false)${c.reset}`);
    process.exit(0);
  }

  const supabase = createSupabase();

  const config = {
    observeOnly: hasFlag('observe-only') || process.env.EVA_SCHEDULER_OBSERVE_ONLY === 'true',
    pollIntervalMs: (parseInt(getArg('poll-interval') || process.env.EVA_SCHEDULER_POLL_INTERVAL_SECONDS || '60', 10)) * 1000,
    dispatchBatchSize: parseInt(getArg('batch-size') || process.env.EVA_SCHEDULER_DISPATCH_BATCH_SIZE || '20', 10),
  };

  const scheduler = new EvaMasterScheduler({ supabase, config });

  console.log(`\n${c.bold}${c.blue}EVA MASTER SCHEDULER${c.reset}`);
  console.log('═'.repeat(50));
  console.log(`  Instance:      ${c.cyan}${scheduler.instanceId}${c.reset}`);
  console.log(`  Poll Interval: ${config.pollIntervalMs / 1000}s`);
  console.log(`  Batch Size:    ${config.dispatchBatchSize}`);
  console.log(`  Observe Only:  ${config.observeOnly ? `${c.yellow}YES${c.reset}` : 'NO'}`);
  console.log('═'.repeat(50));
  console.log(`\n${c.dim}Press Ctrl+C to stop${c.reset}\n`);

  await scheduler.start();
}

async function cmdStatus() {
  const supabase = createSupabase();
  const topN = parseInt(getArg('top') || process.env.EVA_SCHEDULER_STATUS_TOP_N || '10', 10);
  const jsonOutput = hasFlag('json');

  const status = await EvaMasterScheduler.getStatus(supabase, topN);

  if (jsonOutput) {
    console.log(JSON.stringify(status, null, 2));
    if (!status.running) process.exit(1);
    return;
  }

  console.log(`\n${c.bold}${c.blue}EVA SCHEDULER STATUS${c.reset}`);
  console.log('═'.repeat(50));

  if (status.running) {
    console.log(`  Status:        ${c.green}RUNNING${c.reset}`);
  } else {
    console.log(`  Status:        ${c.red}NOT RUNNING${c.reset}`);
  }

  console.log(`  Instance:      ${c.cyan}${status.instance_id || 'N/A'}${c.reset}`);
  console.log(`  Started:       ${status.started_at ? new Date(status.started_at).toLocaleString() : 'N/A'}`);
  console.log(`  Last Poll:     ${status.last_poll_at ? new Date(status.last_poll_at).toLocaleString() : 'N/A'}`);
  console.log(`  Next Poll In:  ${status.next_poll_in_seconds != null ? `${status.next_poll_in_seconds}s` : 'N/A'}`);

  console.log(`\n${c.bold}Counters${c.reset}`);
  console.log(`  Polls:         ${status.poll_count}`);
  console.log(`  Dispatches:    ${status.dispatch_count}`);
  console.log(`  Errors:        ${status.error_count}`);

  console.log(`\n${c.bold}Circuit Breaker${c.reset}`);
  const cbColor = status.circuit_breaker_state === 'OPEN' ? c.red
    : status.circuit_breaker_state === 'HALF_OPEN' ? c.yellow : c.green;
  console.log(`  State:         ${cbColor}${status.circuit_breaker_state}${c.reset}`);
  if (status.paused_reason) {
    console.log(`  Paused:        ${c.yellow}${status.paused_reason}${c.reset}`);
  }

  console.log(`\n${c.bold}Queue${c.reset}`);
  console.log(`  Depth:         ${status.queue_depth}`);
  console.log(`  Observe Only:  ${status.observe_only ? `${c.yellow}YES${c.reset}` : 'NO'}`);

  if (status.top_ventures.length > 0) {
    console.log(`\n${c.bold}Top ${status.top_ventures.length} Ventures (by priority)${c.reset}`);
    console.log(`  ${'Venture ID'.padEnd(38)} ${'Age(s)'.padStart(8)} ${'FIFO'.padEnd(24)} ${'Dispatches'.padStart(10)}`);
    console.log(`  ${'─'.repeat(38)} ${'─'.repeat(8)} ${'─'.repeat(24)} ${'─'.repeat(10)}`);
    for (const v of status.top_ventures) {
      const age = String(v.blocking_decision_age_seconds).padStart(8);
      const fifo = new Date(v.fifo_key).toLocaleString().padEnd(24);
      const dispatches = String(v.dispatch_count || 0).padStart(10);
      console.log(`  ${v.venture_id} ${age} ${fifo} ${dispatches}`);
    }
  } else {
    console.log(`\n${c.dim}  No ventures in queue${c.reset}`);
  }

  console.log('\n' + '═'.repeat(50));

  if (!status.running) {
    console.log(`\n${c.yellow}Scheduler is not running. Start with:${c.reset}`);
    console.log(`  ${c.cyan}node scripts/eva-scheduler.js start${c.reset}\n`);
    process.exit(1);
  }
}

// ── Main ─────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case 'start':
    cmdStart().catch(err => {
      console.error(`${c.red}Fatal: ${err.message}${c.reset}`);
      process.exit(1);
    });
    break;
  case 'status':
    cmdStatus().catch(err => {
      console.error(`${c.red}Error: ${err.message}${c.reset}`);
      process.exit(1);
    });
    break;
  default:
    printUsage();
    if (command) {
      console.error(`${c.red}Unknown command: ${command}${c.reset}`);
      process.exit(1);
    }
}
