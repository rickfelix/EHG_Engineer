#!/usr/bin/env node

/**
 * EVA Venture Monitor CLI
 *
 * Starts the event-driven venture monitor service.
 * Usage: node scripts/eva-venture-monitor.js [start|stop|status]
 *
 * SD: SD-EVA-FEAT-EVENT-MONITOR-001
 */

import { createClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';
import { VentureMonitor } from '../lib/eva/venture-monitor.js';
import { processStage } from '../lib/eva/eva-orchestrator.js';

dotenvConfig();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const monitor = new VentureMonitor({
  supabase,
  processStage,
  config: {
    healthSweepHourUtc: parseInt(process.env.EVA_HEALTH_SWEEP_HOUR_UTC || '2', 10),
    opsCycleIntervalHours: parseInt(process.env.EVA_OPS_CYCLE_INTERVAL_HOURS || '6', 10),
    cronPollIntervalMs: parseInt(process.env.EVA_CRON_POLL_INTERVAL_MS || '60000', 10),
  },
});

// Graceful shutdown
function handleShutdown(signal) {
  console.log(`\n[VentureMonitor] Received ${signal}, shutting down...`);
  monitor.stop().then(() => {
    console.log('[VentureMonitor] Clean shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Start
console.log('============================================================');
console.log('  EVA Venture Monitor');
console.log('============================================================');
console.log(`  Health sweep hour (UTC): ${monitor.config.healthSweepHourUtc}`);
console.log(`  Ops cycle interval: ${monitor.config.opsCycleIntervalHours}h`);
console.log(`  Cron poll interval: ${monitor.config.cronPollIntervalMs}ms`);
console.log('============================================================');

monitor.start().then(() => {
  console.log('[VentureMonitor] Service running. Press Ctrl+C to stop.');
});
