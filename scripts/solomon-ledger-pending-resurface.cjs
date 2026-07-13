#!/usr/bin/env node
/**
 * solomon-ledger-pending-resurface.cjs — QF-20260704-598 (chairman directive 2026-07-04:
 * "when Solomon speaks, we should listen"). solomon_advice_outcome_ledger rows sit at
 * decision='pending' indefinitely once nothing re-checks them -- live specimen: a >24h-old
 * pending recommendation only got adopted when a chairman question forced it 3h later.
 * Read-mostly sweep (mirrors feedback-sla-gauge.cjs's dedup-before-insert discipline): finds
 * ledger rows pending longer than the threshold and resurfaces each into Adam's inbox at most
 * once per row per day (payload.dedup_key checked before insert). Stamps nothing on the ledger
 * row itself -- it stays visible every day until a real decision is recorded.
 * Usage: node scripts/solomon-ledger-pending-resurface.cjs [--threshold-hours 24]
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { getActiveAdamId } = require('../lib/coordinator/adam-identity.cjs');

const DEFAULT_THRESHOLD_HOURS = 24;
const DEFAULT_PAGE_SIZE = 50;
// Safety cap on pages per invocation (10 * 50 = 500 rows/run) -- bounds worst-case query
// volume for a sweep script without reintroducing the head-of-queue starvation this fixes.
const DEFAULT_MAX_PAGES = 10;

function parseThresholdHours(argv) {
  const idx = argv.indexOf('--threshold-hours');
  const n = idx >= 0 ? Number(argv[idx + 1]) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLD_HOURS;
}

/** Pure: today's dedup key for a ledger row's resurface (rate limit: one per row per day). */
function dedupKeyFor(ledgerId, nowMs) {
  return `solomon_ledger_pending:${ledgerId}:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/**
 * Fetches ALL ledger rows still pending past the threshold (primary-state check — no
 * caching). QF-20260710-743: the original single .limit(50) query starved rows 51+ forever
 * whenever the oldest 50 stale-pending rows never resolved -- pages via .range() past that
 * window (bounded by maxPages) so the whole backlog surfaces over successive/single runs.
 */
async function planStalePending(supabase, { thresholdHours = DEFAULT_THRESHOLD_HOURS, nowMs = Date.now(), pageSize = DEFAULT_PAGE_SIZE, maxPages = DEFAULT_MAX_PAGES } = {}) {
  const cutoff = new Date(nowMs - thresholdHours * 60 * 60 * 1000).toISOString();
  const all = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table, not yet in the live snapshot
      .select('id, correlation_id, sd_key, proposal_summary, created_at')
      .eq('decision', 'pending')
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`planStalePending query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break; // last page
  }
  return all;
}

/** Rate-limited, deduped daily resurface: at most one inbox row per stale ledger item per day. */
async function resurfaceStalePending(supabase, adamId, { thresholdHours = DEFAULT_THRESHOLD_HOURS, nowMs = Date.now() } = {}) {
  const candidates = await planStalePending(supabase, { thresholdHours, nowMs });
  const resurfaced = [];
  for (const r of candidates) {
    const key = dedupKeyFor(r.id, nowMs);
    const { data: existing } = await supabase.from('session_coordination').select('id')
      .eq('target_session', adamId).eq('payload->>dedup_key', key).limit(1);
    if (existing && existing.length) {
      console.log(`[solomon-ledger-pending-resurface] ${r.id} already resurfaced today (${key}) — skipping`);
      continue;
    }
    const ageHours = Math.floor((nowMs - new Date(r.created_at).getTime()) / (60 * 60 * 1000));
    const { error } = await supabase.from('session_coordination').insert({
      sender_session: null,
      sender_type: 'sweep',
      target_session: adamId,
      message_type: 'INFO',
      subject: `[SOLOMON_LEDGER_PENDING] aged ${ageHours}h: ${(r.proposal_summary || '').slice(0, 80)}`,
      body: (r.proposal_summary || '').slice(0, 500),
      payload: { kind: 'solomon_ledger_pending_resurface', dedup_key: key, ledger_id: r.id, correlation_id: r.correlation_id, sd_key: r.sd_key, age_hours: ageHours },
    });
    console.log(`[solomon-ledger-pending-resurface] ${error ? 'FAILED to resurface' : 'resurfaced'} ${r.id} age=${ageHours}h`);
    if (!error) resurfaced.push(r.id);
  }
  return { candidates, resurfaced };
}

async function main() {
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }
  // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful tick, before
  // the no-active-Adam early-return (both are a completed tick — supabase is already live here).
  try {
    const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
    await stampLastFired(supabase, 'standard_loop:solomon-ledger-resurface');
  } catch (err) {
    console.error(`[solomon-ledger-pending-resurface] stampLastFired failed (non-fatal): ${err.message}`);
  }

  const adamId = await getActiveAdamId(supabase);
  if (!adamId) { console.log('SOLOMON LEDGER PENDING RESURFACE: no active Adam session found — nothing to resurface into.'); return; }
  const thresholdHours = parseThresholdHours(process.argv.slice(2));
  const { candidates, resurfaced } = await resurfaceStalePending(supabase, adamId, { thresholdHours });
  console.log(`SOLOMON LEDGER PENDING RESURFACE — ${candidates.length} candidate(s) pending >${thresholdHours}h, ${resurfaced.length} newly resurfaced`);
}

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}

module.exports = { parseThresholdHours, dedupKeyFor, planStalePending, resurfaceStalePending, DEFAULT_THRESHOLD_HOURS };
