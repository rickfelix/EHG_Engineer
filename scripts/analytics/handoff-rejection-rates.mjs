#!/usr/bin/env node
/**
 * Handoff rejection-rate report (QF-20260703-793). Read-only. Per-handoff_type rejection rates
 * (lifetime + trailing-30d), top rejection reasons, per-SD-type breakdown. Keyed on handoff_type,
 * not from_phase->to_phase (LEAD-FINAL-APPROVAL legitimately has from=to='LEAD' -- see QF notes).
 * Usage: node scripts/analytics/handoff-rejection-rates.mjs [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — fetchSdTypeMap below reads the
// WHOLE strategic_directives_v2 table unfiltered and is joined against every handoff row; a
// PostgREST-capped read would silently mis-bucket handoffs for any SD past the cap as
// sd_type='unknown', corrupting the per-SD-type breakdown.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const JSON_MODE = process.argv.includes('--json');
const PAGE_SIZE = 1000;
const TRAILING_DAYS = 30;

async function fetchAllHandoffs(supabase) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from('sd_phase_handoffs')
      .select('sd_id, handoff_type, status, rejection_reason, created_at')
      .range(from, from + PAGE_SIZE - 1).order('created_at', { ascending: true });
    if (error) throw new Error('fetchAllHandoffs failed: ' + error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Pure: leading GATE_NAME token, or a truncated snippet. */
export function bucketRejectionReason(reason) {
  if (!reason) return '(no reason recorded)';
  const m = reason.match(/^([A-Z][A-Z0-9_]{3,})\b/);
  return m ? m[1] : reason.slice(0, 40);
}

function rate(stats) {
  return !stats || stats.total === 0 ? 'n/a' : `${((stats.rejected / stats.total) * 100).toFixed(1)}%`;
}

export function computeTransitionStats(rows, { sinceMs = null } = {}) {
  const byType = {};
  for (const h of rows) {
    if (sinceMs !== null && Date.parse(h.created_at + 'Z') < sinceMs) continue;
    (byType[h.handoff_type] ??= { total: 0, rejected: 0 }).total++;
    if (h.status === 'rejected') byType[h.handoff_type].rejected++;
  }
  return byType;
}

export function computeTopRejectionReasons(rows, limit = 5) {
  const counts = {};
  for (const h of rows) {
    if (h.status !== 'rejected') continue;
    const bucket = bucketRejectionReason(h.rejection_reason);
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function computeSdTypeStats(rows, sdTypeMap) {
  const byType = {};
  for (const h of rows) {
    const type = sdTypeMap.get(h.sd_id) || 'unknown';
    (byType[type] ??= { total: 0, rejected: 0 }).total++;
    if (h.status === 'rejected') byType[type].rejected++;
  }
  return byType;
}

async function fetchSdTypeMap(supabase) {
  let data;
  try {
    data = await fetchAllPaginated(() => supabase.from('strategic_directives_v2')
      .select('id, sd_type').order('id', { ascending: true }));
  } catch (e) { throw new Error('fetchSdTypeMap failed: ' + e.message); }
  return new Map((data || []).map((r) => [r.id, r.sd_type || 'unknown']));
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);
  const rows = await fetchAllHandoffs(supabase);
  const sdTypeMap = await fetchSdTypeMap(supabase);
  const lifetime = computeTransitionStats(rows);
  const trailing = computeTransitionStats(rows, { sinceMs: Date.now() - TRAILING_DAYS * 24 * 3600 * 1000 });
  const topReasons = computeTopRejectionReasons(rows);
  const sdTypeStats = computeSdTypeStats(rows, sdTypeMap);
  const totalRejected = rows.filter((h) => h.status === 'rejected').length;

  if (JSON_MODE) {
    console.log(JSON.stringify({ totalAll: rows.length, totalRejected, lifetime, trailing, topReasons, sdTypeStats }, null, 2));
    return;
  }
  console.log(`\nHANDOFF REJECTION RATES (${totalRejected}/${rows.length} = ${rate({ total: rows.length, rejected: totalRejected })} lifetime)\n`);
  console.log('Per handoff_type (lifetime vs trailing 30d):');
  for (const type of Object.keys(lifetime).sort()) {
    const l = lifetime[type], t = trailing[type] || { total: 0, rejected: 0 };
    console.log(`  ${type.padEnd(20)} lifetime ${rate(l).padStart(6)} (${l.rejected}/${l.total})   30d ${rate(t).padStart(6)} (${t.rejected}/${t.total})`);
  }
  console.log('\nTop rejection reasons:');
  for (const [reason, count] of topReasons) console.log(`  ${String(count).padStart(5)}  ${reason}`);
  console.log('\nPer SD-type:');
  for (const type of Object.keys(sdTypeStats).sort()) {
    const s = sdTypeStats[type];
    console.log(`  ${type.padEnd(16)} ${rate(s).padStart(6)} (${s.rejected}/${s.total})`);
  }
  console.log('');
}

main().catch((e) => { console.error('[handoff-rejection-rates] FATAL: ' + (e?.message || e)); process.exit(1); });
