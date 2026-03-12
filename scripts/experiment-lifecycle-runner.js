#!/usr/bin/env node

/**
 * Experiment Lifecycle Runner — Listens for pg_notify events from
 * the trg_experiment_advancement trigger and calls checkAndAdvanceExperiment().
 *
 * Usage:
 *   node scripts/experiment-lifecycle-runner.js              # LISTEN mode
 *   node scripts/experiment-lifecycle-runner.js --status      # Show experiment status
 *   node scripts/experiment-lifecycle-runner.js --check <id>  # One-shot check
 *
 * SD-CLOSE-EXPERIMENT-FEEDBACK-LOOP-ORCH-001-A (US-002)
 *
 * @module scripts/experiment-lifecycle-runner
 */

import 'dotenv/config';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { checkAndAdvanceExperiment } from '../lib/eva/experiments/experiment-lifecycle.js';

const { Client } = pg;

const CHANNEL = 'experiment_gate_outcome';
const DEBOUNCE_MS = 5000; // Batch gate outcomes within 5-second window
const MAX_CONSECUTIVE_ERRORS = 10;

function createSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Show status of all running experiments.
 */
async function showStatus() {
  const supabase = createSupabase();
  const { data: experiments, error } = await supabase
    .from('experiments')
    .select('id, name, status, created_at, config')
    .in('status', ['running', 'draft', 'completed'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching experiments:', error.message);
    process.exit(1);
  }

  if (!experiments?.length) {
    console.log('No experiments found.');
    return;
  }

  console.log('\n  Experiment Status');
  console.log('  ═══════════════════════════════════════════════════');
  for (const exp of experiments) {
    const badge = exp.status === 'running' ? '🟢' : exp.status === 'completed' ? '✅' : '📝';
    const winner = exp.config?.final_analysis?.winner;
    const suffix = winner ? ` (winner: ${winner})` : '';
    console.log(`  ${badge} ${exp.id.slice(0, 8)} | ${exp.status.padEnd(10)} | ${exp.name}${suffix}`);
  }
  console.log('');
}

/**
 * One-shot convergence check for a specific experiment.
 */
async function checkExperiment(experimentId) {
  const supabase = createSupabase();
  const logger = console;

  console.log(`\n  Checking experiment: ${experimentId}`);
  console.log('  ───────────────────────────────────────────────────');

  const result = await checkAndAdvanceExperiment(
    { supabase, logger },
    experimentId,
    { survivalMode: true }
  );

  console.log(`  Action: ${result.action}`);
  if (result.reason) console.log(`  Reason: ${result.reason}`);
  if (result.total_outcomes !== undefined) console.log(`  Outcomes: ${result.total_outcomes}`);
  if (result.winner) console.log(`  Winner: ${result.winner}`);
  if (result.next_experiment) console.log(`  Next experiment: ${result.next_experiment}`);
  if (result.details) console.log(`  Details: ${JSON.stringify(result.details)}`);
  console.log('');
}

/**
 * LISTEN mode — connect to PostgreSQL and listen for gate outcome events.
 * Uses debouncing to batch rapid gate outcomes within a 5-second window.
 */
async function listenMode() {
  if (!process.env.SUPABASE_POOLER_URL && !process.env.DATABASE_URL) {
    console.error('Error: SUPABASE_POOLER_URL or DATABASE_URL required for LISTEN mode.');
    console.error('Set one in your .env file.');
    process.exit(1);
  }

  const connectionString = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL;
  const client = new Client({ connectionString });
  const supabase = createSupabase();
  const logger = console;

  // Debounce: track pending experiment IDs
  const pendingExperiments = new Map(); // experimentId -> timeout
  let consecutiveErrors = 0;

  async function processExperiment(experimentId) {
    try {
      logger.log(`\n  [Lifecycle] Processing experiment ${experimentId.slice(0, 8)}...`);
      const result = await checkAndAdvanceExperiment(
        { supabase, logger },
        experimentId,
        { survivalMode: true }
      );
      logger.log(`  [Lifecycle] Result: ${result.action} (${result.reason || 'n/a'})`);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      logger.error(`  [Lifecycle] Error processing ${experimentId.slice(0, 8)}: ${err.message}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        logger.error(`  [Lifecycle] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — pausing for 60s`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        consecutiveErrors = 0;
      }
    }
  }

  function scheduleCheck(experimentId) {
    // Clear existing debounce timer for this experiment
    if (pendingExperiments.has(experimentId)) {
      clearTimeout(pendingExperiments.get(experimentId));
    }

    // Set new debounced check
    const timer = setTimeout(() => {
      pendingExperiments.delete(experimentId);
      processExperiment(experimentId);
    }, DEBOUNCE_MS);

    pendingExperiments.set(experimentId, timer);
  }

  try {
    await client.connect();
    logger.log(`\n  ═══════════════════════════════════════════════════`);
    logger.log(`  Experiment Lifecycle Runner — LISTEN mode`);
    logger.log(`  Channel: ${CHANNEL}`);
    logger.log(`  Debounce: ${DEBOUNCE_MS}ms`);
    logger.log(`  ═══════════════════════════════════════════════════\n`);

    await client.query(`LISTEN ${CHANNEL}`);

    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL) return;

      try {
        const payload = JSON.parse(msg.payload);
        logger.log(
          `  [Event] Gate outcome: experiment=${payload.experiment_id?.slice(0, 8)} ` +
          `stage=${payload.kill_gate_stage} passed=${payload.gate_passed}`
        );

        if (payload.experiment_id) {
          scheduleCheck(payload.experiment_id);
        }
      } catch (err) {
        logger.warn(`  [Event] Failed to parse notification: ${err.message}`);
      }
    });

    client.on('error', (err) => {
      logger.error(`  [PG] Connection error: ${err.message}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.log('\n  [Lifecycle] Shutting down...');
      for (const timer of pendingExperiments.values()) {
        clearTimeout(timer);
      }
      await client.end();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive
    logger.log('  Listening for gate outcome events. Press Ctrl+C to stop.\n');
  } catch (err) {
    logger.error(`  [PG] Failed to connect: ${err.message}`);
    process.exit(1);
  }
}

// CLI routing
const args = process.argv.slice(2);

if (args.includes('--status')) {
  showStatus().catch(err => { console.error(err.message); process.exit(1); });
} else if (args.includes('--check')) {
  const idx = args.indexOf('--check');
  const experimentId = args[idx + 1];
  if (!experimentId) {
    console.error('Usage: --check <experiment-id>');
    process.exit(1);
  }
  checkExperiment(experimentId).catch(err => { console.error(err.message); process.exit(1); });
} else {
  listenMode();
}
