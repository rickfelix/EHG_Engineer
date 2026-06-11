#!/usr/bin/env node
/**
 * LLM Spend Report + Alert  (SD-LEO-INFRA Gemini cost-reduction, 2026-06-05)
 *
 * Turns the `model_usage_log` table into a standing cost dashboard so spend can
 * never silently double again (the June 2026 incident grew 90% undetected).
 *
 * The bill that prompted this: gemini-2.5-pro gate traffic via lib/llm/client-factory.js.
 * Every factory call is logged to model_usage_log (reported_model_name, subagent_type
 * = purpose, phase, sd_id, metadata.{input_tokens,output_tokens,cache_hit}, captured_at).
 *
 * USAGE
 *   node scripts/llm-cost-report.mjs                 # last 7 days, full breakdown
 *   node scripts/llm-cost-report.mjs --days 30       # custom window
 *   node scripts/llm-cost-report.mjs --since 2026-06-01
 *   node scripts/llm-cost-report.mjs --check         # alert mode (exit 1 if over threshold)
 *       [--max-daily-usd 12] [--max-daily-calls 3000] [--spike 2.0]
 *   node scripts/llm-cost-report.mjs --json          # machine-readable
 *
 * --check is cron-friendly: exits 0 = healthy, 1 = threshold breach, 2 = misconfig.
 *
 * CAVEAT on cost accuracy: Gemini bills *thinking* tokens as output, but the logger
 * records only candidatesTokenCount (visible output), so historical Pro rows UNDERSTATE
 * true output cost (the gap was ~2.6x in June). After 2026-06-05 Flash runs thinking=0,
 * so logged output ≈ billed output going forward. Costs below are best-effort estimates.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// SD-LEO-INFRA-FACTORY-COST-UNIT-001: pricing + per-SD rollup extracted to shared lib
// (behavior-identical) so the email cost panel and tests share one implementation.
import { rowCost as libRowCost, COST_CAVEAT } from '../lib/cost/llm-pricing.js';
import { rollup, UNATTRIBUTED } from '../lib/cost/usage-rollup.js';

function parseArgs(argv) {
  const a = { days: 7, since: null, check: false, json: false, bySd: false,
    maxDailyUsd: 12, maxDailyCalls: 3000, spike: 2.0 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--days') a.days = parseInt(argv[++i], 10);
    else if (k === '--since') a.since = argv[++i];
    else if (k === '--check') a.check = true;
    else if (k === '--json') a.json = true;
    else if (k === '--by-sd') a.bySd = true;
    else if (k === '--max-daily-usd') a.maxDailyUsd = parseFloat(argv[++i]);
    else if (k === '--max-daily-calls') a.maxDailyCalls = parseInt(argv[++i], 10);
    else if (k === '--spike') a.spike = parseFloat(argv[++i]);
  }
  return a;
}

function loadEnv() {
  // Prefer already-injected env (dotenvx/cron), fall back to manual .env parse.
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

async function pullRows(url, key, sinceISO) {
  let all = [], offset = 0;
  const pageSize = 1000;
  for (;;) {
    const q = `${url}/rest/v1/model_usage_log` +
      `?select=reported_model_name,subagent_type,phase,sd_id,metadata,captured_at,provider_source` +
      `&captured_at=gte.${sinceISO}&order=captured_at.asc&limit=${pageSize}&offset=${offset}`;
    const r = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`PostgREST ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break; // safety
  }
  return all;
}

const rowCost = libRowCost;

function aggregate(rows, keyFn) {
  const m = {};
  for (const r of rows) {
    const k = keyFn(r) || 'null';
    const c = rowCost(r);
    if (!m[k]) m[k] = { calls: 0, inT: 0, outT: 0, usd: 0, cacheHits: 0 };
    m[k].calls++; m[k].inT += c.inT; m[k].outT += c.outT; m[k].usd += c.usd;
    if (r.metadata?.cache_hit) m[k].cacheHits++;
  }
  return m;
}

const fmtUsd = (n) => '$' + n.toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
const padN = (s, n) => String(s).padStart(n);

async function main() {
  const args = parseArgs(process.argv);
  const { url, key } = loadEnv();
  if (!url || !key || key.startsWith('encrypted:')) {
    console.error('[llm-cost-report] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or .env is encrypted)');
    process.exit(2);
  }

  const sinceISO = args.since
    ? new Date(args.since).toISOString()
    : new Date(Date.now() - args.days * 86400_000).toISOString();

  const rows = await pullRows(url, key, sinceISO);

  // Daily series (cost + calls)
  const byDay = {};
  for (const r of rows) {
    const d = (r.captured_at || '').slice(0, 10);
    const c = rowCost(r);
    if (!byDay[d]) byDay[d] = { calls: 0, usd: 0, outT: 0 };
    byDay[d].calls++; byDay[d].usd += c.usd; byDay[d].outT += c.outT;
  }
  const days = Object.keys(byDay).sort();
  const totalUsd = rows.reduce((a, r) => a + rowCost(r).usd, 0);

  if (args.check) {
    // Alert mode: evaluate the most recent COMPLETE day vs thresholds + trailing avg.
    const today = new Date().toISOString().slice(0, 10);
    const complete = days.filter(d => d < today);
    const last = complete[complete.length - 1];
    if (!last) { console.log('[llm-cost-report] no complete-day data to check'); process.exit(0); }
    const lastDay = byDay[last];
    const trailing = complete.slice(-8, -1); // up to 7 days before `last`
    const avgUsd = trailing.length ? trailing.reduce((a, d) => a + byDay[d].usd, 0) / trailing.length : 0;
    const breaches = [];
    if (lastDay.usd > args.maxDailyUsd) breaches.push(`spend ${fmtUsd(lastDay.usd)} > ${fmtUsd(args.maxDailyUsd)}`);
    if (lastDay.calls > args.maxDailyCalls) breaches.push(`calls ${lastDay.calls} > ${args.maxDailyCalls}`);
    if (avgUsd > 0 && lastDay.usd > avgUsd * args.spike) breaches.push(`spend ${fmtUsd(lastDay.usd)} > ${args.spike}x trailing avg ${fmtUsd(avgUsd)}`);
    if (breaches.length) {
      console.error(`🚨 [llm-cost-report] ${last} ALERT: ${breaches.join('; ')}`);
      process.exit(1);
    }
    console.log(`✅ [llm-cost-report] ${last} healthy: ${fmtUsd(lastDay.usd)}, ${lastDay.calls} calls (trailing avg ${fmtUsd(avgUsd)})`);
    process.exit(0);
  }

  if (args.json) {
    const out = {
      window: { sinceISO, rows: rows.length, totalUsd: Number(totalUsd.toFixed(2)) },
      caveat: COST_CAVEAT,
      byModel: aggregate(rows, r => r.reported_model_name),
      byPurpose: aggregate(rows, r => r.subagent_type),
      byDay,
    };
    if (args.bySd) {
      const r = rollup(rows);
      out.bySd = r.bySd;
      out.byPhase = r.byPhase;
      out.coverage = r.coverage;
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (args.bySd) {
    // SD-LEO-INFRA-FACTORY-COST-UNIT-001 (FR-2): per-SD / per-phase factory P&L view.
    const r = rollup(rows);
    console.log(`\n=== FACTORY COST BY SD — since ${sinceISO.slice(0, 10)} (${rows.length} calls) ===`);
    console.log(`${COST_CAVEAT}`);
    console.log(`Attribution coverage: ${r.coverage.pct}% of calls carry sd_id (${r.coverage.attributedCalls}/${r.coverage.totalCalls})\n`);

    const sdRows = Object.entries(r.bySd).sort((a, b) => b[1].usd - a[1].usd).slice(0, 25);
    console.log(`${pad('sd_id', 44)} ${padN('calls', 7)} ${padN('inTok', 11)} ${padN('outTok', 11)} ${padN('est$', 9)}`);
    for (const [k, v] of sdRows)
      console.log(`${pad(k === UNATTRIBUTED ? `${UNATTRIBUTED} (null sd_id)` : k, 44)} ${padN(v.calls, 7)} ${padN(v.inT, 11)} ${padN(v.outT, 11)} ${padN(fmtUsd(v.usd), 9)}`);

    console.log('\n--- BY PHASE ---');
    console.log(`${pad('phase', 16)} ${padN('calls', 7)} ${padN('est$', 9)}`);
    for (const [k, v] of Object.entries(r.byPhase).sort((a, b) => b[1].usd - a[1].usd))
      console.log(`${pad(k, 16)} ${padN(v.calls, 7)} ${padN(fmtUsd(v.usd), 9)}`);
    console.log('');
    return;
  }

  // Human report
  console.log(`\n=== LLM SPEND REPORT — since ${sinceISO.slice(0, 10)} (${rows.length} calls) ===`);
  console.log(`Estimated total: ${fmtUsd(totalUsd)}  (output understated for pre-2026-06-05 Pro thinking tokens)\n`);

  const showTable = (title, m, n = 12) => {
    console.log(`--- ${title} ---`);
    const rowsSorted = Object.entries(m).sort((a, b) => b[1].usd - a[1].usd).slice(0, n);
    console.log(`${pad('key', 26)} ${padN('calls', 7)} ${padN('inTok', 11)} ${padN('outTok', 11)} ${padN('est$', 9)} ${padN('cacheHit', 9)}`);
    for (const [k, v] of rowsSorted)
      console.log(`${pad(k, 26)} ${padN(v.calls, 7)} ${padN(v.inT, 11)} ${padN(v.outT, 11)} ${padN(fmtUsd(v.usd), 9)} ${padN(v.cacheHits, 9)}`);
    console.log('');
  };

  showTable('BY MODEL', aggregate(rows, r => r.reported_model_name));
  showTable('BY PURPOSE', aggregate(rows, r => r.subagent_type), 15);

  console.log('--- DAILY ---');
  console.log(`${pad('day', 12)} ${padN('calls', 7)} ${padN('est$', 9)}`);
  for (const d of days) console.log(`${pad(d, 12)} ${padN(byDay[d].calls, 7)} ${padN(fmtUsd(byDay[d].usd), 9)}`);
  console.log('');
}

main().catch((e) => { console.error('[llm-cost-report] ERROR', e.message); process.exit(2); });
