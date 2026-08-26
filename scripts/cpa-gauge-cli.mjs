#!/usr/bin/env node
/**
 * Ad-hoc CPA gauge query — SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 FR-3.
 *
 * NOTE: the PRD named this scripts/query-cpa-gauge.mjs; renamed to cpa-gauge-cli.mjs during EXEC
 * because .gitignore's `scripts/query-*.mjs` pattern (a throwaway-one-off-script convention) would
 * have silently excluded this permanent, PRD-specified deliverable from version control.
 *
 * Direct, verdict-flow-independent access to the CPA gauge for chairman/Adam inspection,
 * distinct from lib/marketing/venture-activation-gate.js's resolveCpaRung() (which is
 * venture-wide, all-platforms). This script DOES take an explicit platform argument, per TR-2's
 * resolution of the platform-scoping gap: the verdict layer aggregates across all platforms,
 * per-channel breakdown lives here.
 *
 * Exported functions (not subprocess spawning) are the test seam, matching the precedent set by
 * scripts/venture-telemetry-pull.mjs + tests/unit/venture-telemetry-pull.test.js.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { computeCpaGaugeState } from '../lib/telemetry/cpa-gauge.mjs';
import { DEFAULT_CPA_LOOKBACK_DAYS } from '../lib/marketing/venture-activation-gate.js';

/**
 * @param {object} opts
 * @param {object} opts.supabase
 * @param {string} opts.ventureId
 * @param {string} opts.platform
 * @param {number} [opts.lookbackDays]
 * @param {Date} [opts.now]
 * @returns {Promise<{venture_id: string, platform: string, state: string, value_cents_per_conversion: number|null, reason: string}>}
 */
export async function queryCpaGaugeForChannel({ supabase, ventureId, platform, lookbackDays = DEFAULT_CPA_LOOKBACK_DAYS, now = new Date() }) {
  const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const { data: rows, error } = await supabase
    .from('daily_rollups')
    .select('spend_cents, conversions')
    .eq('venture_id', ventureId)
    .eq('platform', platform)
    .gte('rollup_date', since.toISOString().slice(0, 10));

  if (error) {
    return { venture_id: ventureId, platform, state: 'no_writer_yet', value_cents_per_conversion: null, reason: `daily_rollups query failed: ${error.message}` };
  }

  const gauge = computeCpaGaugeState({ dailyRollupRows: rows || [] });
  return { venture_id: ventureId, platform, ...gauge };
}

export async function main({ supabase, argv = process.argv.slice(2) } = {}) {
  const [ventureId, platform] = argv;
  if (!ventureId || !platform) {
    console.error('Usage: node scripts/cpa-gauge-cli.mjs <venture_id> <platform>');
    process.exitCode = 1;
    return;
  }
  const client = supabase || createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await queryCpaGaugeForChannel({ supabase: client, ventureId, platform });
  console.log(JSON.stringify(result, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  });
}
