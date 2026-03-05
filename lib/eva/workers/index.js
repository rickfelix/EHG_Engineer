/**
 * Worker entry point — Registers and starts all background workers.
 *
 * Usage:
 *   node lib/eva/workers/index.js
 *   node lib/eva/workers/index.js --health   (print health and exit)
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { WorkerScheduler } from './worker-scheduler.js';
import { StageAdvanceWorker } from './stage-advance-worker.js';
import { HealthMonitorWorker } from './health-monitor-worker.js';
import { MetricsCollectorWorker } from './metrics-collector-worker.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[workers] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const scheduler = new WorkerScheduler();

// Register workers
scheduler.register(new StageAdvanceWorker({ supabase }));
scheduler.register(new HealthMonitorWorker({ supabase }));
scheduler.register(new MetricsCollectorWorker({ supabase }));

// CLI
const args = process.argv.slice(2);

if (args.includes('--health')) {
  // Print health and exit
  console.log(JSON.stringify(scheduler.healthCheck(), null, 2));
  process.exit(0);
}

// Start all workers
scheduler.installShutdownHandlers();
scheduler.startAll();

console.log(`[workers] Running ${scheduler.list().length} worker(s): ${scheduler.list().join(', ')}`);
console.log('[workers] Press Ctrl+C to stop');
