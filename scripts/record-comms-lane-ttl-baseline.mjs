#!/usr/bin/env node
/**
 * FR-5 (SD-LEO-INFRA-COMMS-LANE-TTLS-001) — record a dead-letter baseline measurement.
 *
 * Runs the SAME shipped gauge function (lib/coordination/lane-dead-letter-gauge.cjs) for
 * both the day-0 post-fix baseline and the 30-day re-measurement, so the comparison is
 * apples-to-apples per FR-5's acceptance criteria.
 *
 * Usage:
 *   node scripts/record-comms-lane-ttl-baseline.mjs --label day-0-post-fix
 *   node scripts/record-comms-lane-ttl-baseline.mjs --label 30-day-remeasurement
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeLaneDeadLetterGauge, buildBaselineRecord, recordDeadLetterBaseline } = require('../lib/coordination/lane-dead-letter-gauge.cjs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseLabel(argv) {
  const idx = argv.indexOf('--label');
  const label = idx !== -1 ? argv[idx + 1] : 'day-0-post-fix';
  if (label !== 'day-0-post-fix' && label !== '30-day-remeasurement') {
    console.error(`ERROR: --label must be "day-0-post-fix" or "30-day-remeasurement", got "${label}"`);
    process.exit(1);
  }
  return label;
}

async function main() {
  const label = parseLabel(process.argv.slice(2));
  const gauge = await computeLaneDeadLetterGauge(supabase);
  const record = buildBaselineRecord(gauge, { label });
  await recordDeadLetterBaseline(supabase, record);
  console.log(JSON.stringify(record, null, 2));
}

main();
