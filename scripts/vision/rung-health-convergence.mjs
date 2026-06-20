#!/usr/bin/env node
/**
 * rung-health-convergence CLI — read-only readout of the feedback-loop convergence indicator
 * (FR-5 of SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001).
 *
 * Prints whether Adam's self-adherence catch rate is CONVERGING (loops maturing, catches → 0)
 * or CHURNING (flat/rising). Fail-soft: degrades to insufficient_data if the ledger is unreadable.
 *
 *   node scripts/vision/rung-health-convergence.mjs [--window-days N]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  computeCatchRateConvergence,
  formatConvergenceLine,
  loadAdherenceLedger,
} from '../../lib/vision/rung-health-convergence.mjs';

const args = process.argv.slice(2);
const wdIdx = args.indexOf('--window-days');
const windowDays = wdIdx !== -1 ? parseInt(args[wdIdx + 1], 10) || 14 : 14;

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = url && key ? createClient(url, key) : null;

const nowMs = Date.now();
const rows = await loadAdherenceLedger(supabase, { nowMs, windowDays });
const c = computeCatchRateConvergence(rows, { nowMs, windowDays });

console.log(`[RUNG-HEALTH] ${formatConvergenceLine(c)}`);
console.log(`  GAUGE convergence trend=${c.trend} converging=${c.converging} catch_rate_per_day=${c.catchRatePerDay} slope_per_day=${c.slopePerDay} days_to_zero=${c.daysToZero} catches=${c.totalCatches} window_days=${c.windowDays}`);
