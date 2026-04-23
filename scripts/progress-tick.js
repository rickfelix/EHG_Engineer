#!/usr/bin/env node
/**
 * progress-tick - Emit intra-phase progress for an active SD.
 *
 * SD: SD-LEO-INFRA-SD-INTRAPHASE-PROGRESS-001
 *
 * Usage:
 *   node scripts/progress-tick.js <SD-KEY> <pct 0-100> [label]
 *
 * Example:
 *   node scripts/progress-tick.js SD-FOO-001 50 "mid-EXEC"
 *
 * Behavior:
 *   - Writes strategic_directives_v2.progress_percentage = GREATEST(current, pct).
 *     Monotonic: a lower or equal pct than the current value is a no-op.
 *   - Honors existing handoff-boundary writers (trigger_sd_progress_recalc,
 *     lead-final-approval/helpers.js). Those run at phase boundaries; this CLI
 *     lets workers advance the value in between.
 *
 * Exit codes:
 *   0  success (or monotonic no-op)
 *   1  invalid input (unknown SD, pct out of range, missing args)
 *   2  database error (connection, constraint violation)
 *
 * Contract:
 *   - p95 latency < 200ms on warm connection (single SELECT + single UPDATE)
 *   - Fail-soft: never throws; caller (worker process) always continues
 *   - Idempotent: re-running with same pct is a no-op
 *   - Monotonic: pct <= current progress_percentage is a no-op
 *   - Bounded: pct outside [0,100] rejected client-side
 *
 * Note: Uses `process.exitCode` instead of `process.exit(N)` to avoid a
 * Node 24 + Windows libuv assertion (`UV_HANDLE_CLOSING` during active async
 * handle teardown). The main() function returns naturally and the configured
 * exitCode is honored at shutdown.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function usage() {
  console.error('Usage: node scripts/progress-tick.js <SD-KEY> <pct 0-100> [label]');
  console.error('  <SD-KEY>  Strategic Directive key (e.g. SD-FOO-001)');
  console.error('  <pct>     Integer 0-100 — target progress_percentage');
  console.error('  [label]   Optional free-text label for the log line');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    usage();
    process.exitCode = 1;
    return;
  }

  const sdKey = args[0];
  const pctRaw = args[1];
  const label = args[2] || '';

  const pct = Number.parseInt(pctRaw, 10);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100 || String(pct) !== String(pctRaw).trim()) {
    console.error(`ERROR: pct must be an integer in [0,100], got: ${pctRaw}`);
    process.exitCode = 1;
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exitCode = 2;
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, current_phase, progress_percentage')
    .eq('sd_key', sdKey)
    .maybeSingle();

  if (sdErr) {
    console.error(`ERROR: SD lookup failed: ${sdErr.message}`);
    process.exitCode = 2;
    return;
  }
  if (!sd) {
    console.error(`ERROR: SD not found: ${sdKey}`);
    process.exitCode = 1;
    return;
  }

  const current = sd.progress_percentage || 0;

  // Monotonic no-op: don't move backwards
  if (pct <= current) {
    console.log(`${new Date().toISOString()} ${sdKey} ${sd.current_phase || '-'} tick=${pct} (no-op; current=${current})${label ? ' ' + label : ''}`);
    return;
  }

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ progress_percentage: pct })
    .eq('id', sd.id);

  if (updErr) {
    console.error(`ERROR: tick write failed: ${updErr.message}`);
    process.exitCode = 2;
    return;
  }

  console.log(`${new Date().toISOString()} ${sdKey} ${sd.current_phase || '-'} tick=${pct}${label ? ' ' + label : ''}`);
}

main().catch(err => {
  // Fail-soft: even unexpected errors mark the process as failed (DB/infra error)
  // rather than throwing.
  console.error(`ERROR: unexpected failure: ${err.message}`);
  process.exitCode = 2;
});
