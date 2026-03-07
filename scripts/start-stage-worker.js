#!/usr/bin/env node

/**
 * Stage Execution Worker — Entry Point
 *
 * Starts the StageExecutionWorker that polls eva_ventures for active ventures,
 * executes stage templates via Gemini, and creates venture_artifacts.
 * Pauses at chairman gate stages for human decisions.
 *
 * Usage:
 *   node scripts/start-stage-worker.js           # Continuous polling (30s default)
 *   node scripts/start-stage-worker.js --once     # Single poll cycle then exit
 *   node scripts/start-stage-worker.js --dry-run  # Skip persistence
 *
 * Environment:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STAGE_WORKER_POLL_INTERVAL_MS  (default: 30000)
 *
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-017
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const PID_FILE = resolve(process.cwd(), 'stage-execution-worker.pid');
const ONCE_MODE = process.argv.includes('--once');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Supabase Client ───────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[stage-worker] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── PID File ──────────────────────────────────────────────────────

function writePid() {
  try {
    writeFileSync(PID_FILE, String(process.pid));
    console.log(`[stage-worker] PID ${process.pid} written to ${PID_FILE}`);
  } catch (err) {
    console.warn(`[stage-worker] Could not write PID file: ${err.message}`);
  }
}

function removePid() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // File may not exist — that's fine
  }
}

// ── Graceful Shutdown ─────────────────────────────────────────────

let worker = null;

async function shutdown(signal) {
  console.log(`\n[stage-worker] Received ${signal}, shutting down...`);
  if (worker) {
    worker.stop();
  }
  removePid();
  // Give in-flight operations a moment to finish
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  // Dynamic import for ESM module
  const { StageExecutionWorker } = await import('../lib/eva/stage-execution-worker.js');

  const pollIntervalMs = parseInt(process.env.STAGE_WORKER_POLL_INTERVAL_MS || '30000', 10);

  worker = new StageExecutionWorker({
    supabase,
    pollIntervalMs,
    dryRun: DRY_RUN,
    logger: {
      log: (...args) => console.log('[stage-worker]', ...args),
      info: (...args) => console.log('[stage-worker]', ...args),
      warn: (...args) => console.warn('[stage-worker]', ...args),
      error: (...args) => console.error('[stage-worker]', ...args),
      debug: (...args) => {
        if (process.env.DEBUG) console.debug('[stage-worker]', ...args);
      },
    },
  });

  writePid();

  console.log('[stage-worker] Starting Stage Execution Worker');
  console.log(`[stage-worker]   Poll interval: ${pollIntervalMs}ms`);
  console.log(`[stage-worker]   Dry run: ${DRY_RUN}`);
  console.log(`[stage-worker]   Once mode: ${ONCE_MODE}`);

  if (ONCE_MODE) {
    // Single poll cycle: call the internal poll method if available,
    // otherwise start and stop after one interval
    if (typeof worker._poll === 'function') {
      await worker._poll();
    } else {
      worker.start();
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs + 5000));
      worker.stop();
    }
    removePid();
    console.log('[stage-worker] Single pass complete, exiting.');
    process.exit(0);
  } else {
    worker.start();
    console.log('[stage-worker] Worker running. Press Ctrl+C to stop.');
  }
}

main().catch(err => {
  console.error('[stage-worker] Fatal error:', err);
  removePid();
  process.exit(1);
});
