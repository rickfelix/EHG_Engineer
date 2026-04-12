#!/usr/bin/env node

/**
 * Stage Execution Worker — Supervisor Entry Point
 *
 * FR-004: Process supervisor with auto-restart and circuit breaker.
 *
 * In supervisor mode (default), forks the worker as a child process and
 * restarts it on crash with exponential backoff. A circuit breaker trips
 * if MAX_RESTARTS occur within the WINDOW — the supervisor then waits for
 * the cooldown period before resetting the counter.
 *
 * In direct mode (--direct), runs the worker in-process (for --once, testing).
 *
 * Usage:
 *   node scripts/start-stage-worker.js           # Supervisor mode (auto-restart)
 *   node scripts/start-stage-worker.js --once     # Single poll, no supervisor
 *   node scripts/start-stage-worker.js --dry-run  # Skip persistence
 *   node scripts/start-stage-worker.js --direct   # In-process, no supervisor
 *
 * Environment:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STAGE_WORKER_POLL_INTERVAL_MS  (default: 30000)
 *   STAGE_WORKER_MAX_RESTARTS      (default: 5)
 *   STAGE_WORKER_RESTART_WINDOW_MS (default: 600000 = 10 min)
 *   STAGE_WORKER_COOLDOWN_MS       (default: 60000 = 1 min)
 *
 * SD: SD-LEO-INFRA-STAGE-EXECUTION-WORKER-001
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import chokidar from 'chokidar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PID_FILE = resolve(process.cwd(), 'stage-execution-worker.pid');
const ONCE_MODE = process.argv.includes('--once');
const DRY_RUN = process.argv.includes('--dry-run');
const DIRECT_MODE = process.argv.includes('--direct');

// Circuit breaker settings
const MAX_RESTARTS = parseInt(process.env.STAGE_WORKER_MAX_RESTARTS || '5', 10);
const RESTART_WINDOW_MS = parseInt(process.env.STAGE_WORKER_RESTART_WINDOW_MS || '600000', 10);
const COOLDOWN_MS = parseInt(process.env.STAGE_WORKER_COOLDOWN_MS || '60000', 10);
const BASE_RESTART_DELAY_MS = 1000;

// ── Supabase Client ───────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[supervisor] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ── PID File ──────────────────────────────────────────────────────

function writePid(pid) {
  try {
    writeFileSync(PID_FILE, String(pid));
    console.log(`[supervisor] PID ${pid} written to ${PID_FILE}`);
  } catch (err) {
    console.warn(`[supervisor] Could not write PID file: ${err.message}`);
  }
}

function removePid() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // File may not exist
  }
}

// ── Heartbeat Helpers ─────────────────────────────────────────────

async function markHeartbeat(supabase, workerId, status) {
  const { hostname } = await import('os');
  await supabase
    .from('worker_heartbeats')
    .upsert(
      {
        worker_id: workerId,
        worker_type: 'stage-execution-worker',
        last_heartbeat_at: new Date().toISOString(),
        status,
        pid: process.pid,
        hostname: hostname(),
        metadata: { role: 'supervisor' },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'worker_id' }
    )
    .then(({ error }) => {
      if (error) console.warn(`[supervisor] Heartbeat upsert failed: ${error.message}`);
    });
}

// ── Supervisor Mode ───────────────────────────────────────────────

function runSupervisor() {
  const restartTimestamps = [];
  let child = null;
  let shuttingDown = false;
  let restartTimer = null;

  const workerScript = resolve(__dirname, 'start-stage-worker.js');

  function spawnChild() {
    const args = ['--direct'];
    if (DRY_RUN) args.push('--dry-run');

    child = fork(workerScript, args, {
      stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env },
    });

    writePid(child.pid);
    console.log(`[supervisor] Spawned worker child PID=${child.pid}`);

    child.on('exit', (code, signal) => {
      if (shuttingDown) return;

      console.warn(`[supervisor] Worker exited (code=${code}, signal=${signal})`);

      // Record crash timestamp
      restartTimestamps.push(Date.now());

      // Prune timestamps outside the window
      const windowStart = Date.now() - RESTART_WINDOW_MS;
      while (restartTimestamps.length > 0 && restartTimestamps[0] < windowStart) {
        restartTimestamps.shift();
      }

      // Circuit breaker check
      if (restartTimestamps.length >= MAX_RESTARTS) {
        console.error(
          `[supervisor] Circuit breaker tripped: ${restartTimestamps.length} restarts ` +
          `in ${RESTART_WINDOW_MS / 1000}s window. Cooling down for ${COOLDOWN_MS / 1000}s...`
        );

        // Mark crashed heartbeat
        const supabase = createClient(supabaseUrl, supabaseKey);
        markHeartbeat(supabase, `sew-supervisor-${process.pid}`, 'crashed');

        restartTimer = setTimeout(() => {
          console.log('[supervisor] Cooldown complete, resetting circuit breaker');
          restartTimestamps.length = 0;
          spawnChild();
        }, COOLDOWN_MS);
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped)
      const attempt = restartTimestamps.length;
      const delay = Math.min(BASE_RESTART_DELAY_MS * Math.pow(2, attempt - 1), 30_000);
      console.log(`[supervisor] Restarting in ${delay}ms (attempt ${attempt}/${MAX_RESTARTS})...`);

      restartTimer = setTimeout(spawnChild, delay);
    });

    child.on('error', (err) => {
      console.error(`[supervisor] Worker spawn error: ${err.message}`);
    });
  }

  // ── File Watcher (auto-restart on code changes) ──────────────────
  // Watches core worker + bridge modules. On change, kills child; supervisor's
  // existing exit handler spawns a fresh process with up-to-date code.
  // Disable with STAGE_WORKER_WATCH=false.
  let restartDebounce = null;
  if (process.env.STAGE_WORKER_WATCH !== 'false') {
    const projectRoot = resolve(__dirname, '..');
    const watchPaths = [
      resolve(projectRoot, 'lib/eva/stage-execution-worker.js'),
      resolve(projectRoot, 'lib/eva/bridge'),
      resolve(projectRoot, 'lib/eva/artifact-persistence-service.js'),
    ];

    const watcher = chokidar.watch(watchPaths, {
      ignored: /(^|[/\\])\../, // dotfiles
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    watcher.on('change', (path) => {
      if (shuttingDown) return;
      console.log(`[supervisor] File changed: ${path}`);
      // Debounce: batch multiple saves (e.g. git merges touching many files)
      if (restartDebounce) clearTimeout(restartDebounce);
      restartDebounce = setTimeout(() => {
        if (shuttingDown || !child || child.killed) return;
        console.log('[supervisor] Reloading worker to pick up code changes...');
        // Don't count reload restarts against circuit breaker
        restartTimestamps.length = 0;
        child.kill('SIGTERM');
        // supervisor's child.on('exit') will spawn a new one
      }, 1000);
    });

    watcher.on('ready', () => {
      console.log('[supervisor] File watcher active — auto-restart on code changes in lib/eva/');
    });

    watcher.on('error', (err) => {
      console.warn(`[supervisor] File watcher error: ${err.message}`);
    });
  }

  // Graceful shutdown
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[supervisor] Received ${signal}, shutting down...`);

    if (restartTimer) clearTimeout(restartTimer);

    if (child && !child.killed) {
      child.kill('SIGTERM');
      // Force kill after 5s
      setTimeout(() => {
        if (child && !child.killed) {
          console.warn('[supervisor] Force killing worker');
          child.kill('SIGKILL');
        }
        removePid();
        process.exit(0);
      }, 5000);
    } else {
      removePid();
      process.exit(0);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Last-resort cleanup: if the supervisor is killed abruptly (e.g., taskkill /F),
  // SIGTERM/SIGINT handlers won't fire, but 'exit' still does for most cases.
  // This prevents orphaned child workers (zombie processes).
  process.on('exit', () => {
    if (child && !child.killed) {
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
    }
    removePid();
  });

  console.log('[supervisor] Starting Stage Execution Worker (supervisor mode)');
  console.log(`[supervisor]   Max restarts: ${MAX_RESTARTS} per ${RESTART_WINDOW_MS / 1000}s`);
  console.log(`[supervisor]   Cooldown: ${COOLDOWN_MS / 1000}s`);
  console.log(`[supervisor]   Dry run: ${DRY_RUN}`);

  spawnChild();
}

// ── Direct Mode (in-process) ──────────────────────────────────────

async function runDirect() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { StageExecutionWorker } = await import('../lib/eva/stage-execution-worker.js');

  const pollIntervalMs = parseInt(process.env.STAGE_WORKER_POLL_INTERVAL_MS || '30000', 10);

  const worker = new StageExecutionWorker({
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

  writePid(process.pid);

  // Graceful shutdown — await lock release before exit (QF: stale lock fix)
  async function shutdown(signal) {
    console.log(`\n[stage-worker] Received ${signal}, shutting down...`);
    await worker.stop();
    removePid();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('[stage-worker] Starting Stage Execution Worker (direct mode)');
  console.log(`[stage-worker]   Poll interval: ${pollIntervalMs}ms`);
  console.log(`[stage-worker]   Dry run: ${DRY_RUN}`);
  console.log(`[stage-worker]   Once mode: ${ONCE_MODE}`);

  if (ONCE_MODE) {
    worker.start();
    // Wait for one full tick cycle to complete
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs + 5000));
    worker.stop();
    removePid();
    console.log('[stage-worker] Single pass complete, exiting.');
    process.exit(0);
  } else {
    worker.start();
    // Start health check endpoint
    await worker.startHealthServer().catch(err =>
      console.warn(`[stage-worker] Health server failed: ${err.message}`)
    );
    console.log('[stage-worker] Worker running. Press Ctrl+C to stop.');
  }
}

// ── Entry Point ───────────────────────────────────────────────────

if (ONCE_MODE || DIRECT_MODE) {
  runDirect().catch(err => {
    console.error('[stage-worker] Fatal error:', err);
    removePid();
    process.exit(1);
  });
} else {
  runSupervisor();
}
