#!/usr/bin/env node
/**
 * session_coordination lane-lint gauge tick — FR-6.
 *
 * SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001.
 *
 * READ-ONLY (per lib/coordination/lane-lint-gauge.cjs) — prints per-violation-class counts.
 * No writes, no feedback rows, no kill-switch: unlike scripts/coordinator-relay-drop-gauge.cjs
 * this gauge has no write side to gate.
 *
 * Usage: node scripts/coordinator-lane-lint-gauge.cjs [--window-hours 24] [--resurface-window-days 30]
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { runLaneLintGauge } = require('../lib/coordination/lane-lint-gauge.cjs');

function parseHours(argv, flag, fallbackHours) {
  const idx = argv.indexOf(flag);
  const n = idx >= 0 ? Number(argv[idx + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallbackHours;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key);
}

async function main() {
  const windowHours = parseHours(process.argv, '--window-hours', 24);
  const resurfaceWindowDays = parseHours(process.argv, '--resurface-window-days', 30);
  const supabase = getSupabase();
  const result = await runLaneLintGauge(supabase, {
    windowMs: windowHours * 60 * 60 * 1000,
    resurfaceWindowMs: resurfaceWindowDays * 24 * 60 * 60 * 1000,
  });
  console.log(
    `LANE_LINT_GAUGE window=${windowHours}h rows=${result.windowRows} ` +
    `untyped_row=${result.untyped_row} bodyless_row=${result.bodyless_row} ` +
    `empty_sender_row=${result.empty_sender_row} resurface_dedup_drift=${result.resurface_dedup_drift}` +
    `${result.error ? ' error=' + result.error : ''}`
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('coordinator-lane-lint-gauge failed:', (e && e.message) || e);
    process.exit(1);
  });
}
