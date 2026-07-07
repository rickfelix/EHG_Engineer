#!/usr/bin/env node
/**
 * Fable Allocation Report — SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 (FR-5)
 *
 * Aggregates door_routing_ledger rows by r_criterion (which R1-R5 doctrine rule triggered
 * a Fable recommendation) and funnel_position (selection/design/detailing) so the doctrine's
 * own §2 finding — "we over-allocate Fable to detailing and under-allocate to selection" —
 * becomes a measured, trending number instead of folklore.
 *
 * COVERAGE NOTE: r_criterion/funnel_position are only populated on dispatches made while
 * DOOR_ROUTING_ENABLED is on AND the target SD already carries a classified door_class
 * (see lib/coordinator/dispatch.cjs's stampModelRecommendation + lib/fleet/door-routing-ledger.cjs).
 * Pre-cutover, door_routing_ledger itself is not yet live — this report handles that
 * gracefully (treated identically to "empty ledger", never a crash).
 *
 * USAGE
 *   node scripts/fable-allocation-report.mjs                 # last 7 days
 *   node scripts/fable-allocation-report.mjs --days 30       # custom window
 *   node scripts/fable-allocation-report.mjs --since 2026-07-01
 *   node scripts/fable-allocation-report.mjs --json          # machine-readable
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const a = { days: 7, since: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--days') a.days = parseInt(argv[++i], 10);
    else if (k === '--since') a.since = argv[++i];
    else if (k === '--json') a.json = true;
  }
  return a;
}

function loadEnv() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { url, key };
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const txt = readFileSync(resolve(here, '..', '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (m[1] === 'SUPABASE_URL') url = url || v;
      if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL') url = url || v;
      if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY') key = key || v;
    }
  } catch { /* ignore */ }
  return { url, key };
}

/**
 * Pull door_routing_ledger rows since sinceISO. Returns [] (never throws) when the table
 * doesn't exist yet (pre-cutover — PostgREST 404/relation-not-found) or on any fetch error,
 * so the report degrades to "no data in window" instead of crashing.
 */
async function pullRows(url, key, sinceISO) {
  try {
    const q = `${url}/rest/v1/door_routing_ledger` +
      `?select=work_key,door,r_criterion,funnel_position,routed_at` +
      `&routed_at=gte.${sinceISO}&order=routed_at.asc&limit=5000`;
    const r = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return []; // table absent pre-cutover, or transient error — treat as empty
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function aggregate(rows, keyFn) {
  const m = {};
  for (const r of rows) {
    const k = keyFn(r) ?? '(none)';
    if (!m[k]) m[k] = { count: 0 };
    m[k].count++;
  }
  return m;
}

const pad = (s, n) => String(s).padEnd(n);
const padN = (s, n) => String(s).padStart(n);
const pct = (n, total) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : 'n/a');

function showBreakdown(title, m, total) {
  console.log(`--- ${title} ---`);
  console.log(`${pad('key', 16)} ${padN('count', 7)} ${padN('pct', 7)}`);
  const rowsSorted = Object.entries(m).sort((a, b) => b[1].count - a[1].count);
  for (const [k, v] of rowsSorted) console.log(`${pad(k, 16)} ${padN(v.count, 7)} ${padN(pct(v.count, total), 7)}`);
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv);
  const { url, key } = loadEnv();
  if (!url || !key || key.startsWith('encrypted:')) {
    console.error('[fable-allocation-report] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or .env is encrypted)');
    process.exit(2);
  }

  const sinceISO = args.since
    ? new Date(args.since).toISOString()
    : new Date(Date.now() - args.days * 86400_000).toISOString();

  const rows = await pullRows(url, key, sinceISO);

  if (args.json) {
    console.log(JSON.stringify({
      window: { sinceISO, rows: rows.length },
      byCriterion: aggregate(rows, (r) => r.r_criterion),
      byFunnelPosition: aggregate(rows, (r) => r.funnel_position),
    }, null, 2));
    return;
  }

  console.log(`\n=== FABLE ALLOCATION — since ${sinceISO.slice(0, 10)} (${rows.length} rows) ===`);
  if (rows.length === 0) {
    console.log('No data in window (door_routing_ledger is empty or not yet live pre-cutover — this is expected, not an error).\n');
    return;
  }

  console.log('CAVEAT: funnel_position is a coarse phase-derived proxy (LEAD=selection, PLAN=design,');
  console.log('anything else=detailing) — good enough to surface the doctrine\'s observed gross bias,');
  console.log('not a precise instrument.\n');

  showBreakdown('BY R-CRITERION', aggregate(rows, (r) => r.r_criterion), rows.length);
  showBreakdown('BY FUNNEL_POSITION', aggregate(rows, (r) => r.funnel_position), rows.length);
}

main().catch((e) => { console.error('[fable-allocation-report] ERROR', e.message); process.exit(2); });
