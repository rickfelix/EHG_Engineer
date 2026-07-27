#!/usr/bin/env node
/**
 * Drain inventory CLI (SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001)
 *
 * Prints, per detector that writes durable output: WHO drains it, whether a closing path EXISTS,
 * and the age of the OLDEST UNDRAINED row — staleness on the DRAIN, not on the detector firing.
 * Exits non-zero if any entry FAILS (no consumer / no expressible terminal state).
 *
 * STRICTLY READ-ONLY over inspected data. It measures drains; draining is a separate concern. A
 * gauge that resolved rows to make itself green would destroy the evidence it exists to surface.
 * The ONLY write is stampLastFired against periodic_process_registry — this gauge's own liveness,
 * so it does not become the next undrained detector in its own inventory.
 *
 * Usage: node scripts/drain-inventory.mjs [--json]
 */
import { createClient } from '@supabase/supabase-js';
import { DRAIN_DESCRIPTORS } from '../lib/governance/gauge-registry.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
import {
  VERDICT, buildInventoryRow, classifyStructural, exitCodeFor, computeOldestUndrainedAge,
} from '../lib/governance/drain-inventory.js';

const PROCESS_KEY = 'standard_loop:drain-inventory';
const UNDRAINED_STATUSES = ['new', 'triaged']; // canonical, per feedback-sla-gauge.cjs:20
const PAGE = 1000;

/**
 * Ordered, paginated read. PostgREST caps a response at 1000 rows; the largest population here is
 * 4,235 (invariant_gauge_finding). An UNORDERED first page can omit the true oldest row and
 * under-report age — an error in the ALARM-SUPPRESSING direction, which is the exact failure mode
 * this inventory exists to detect. So always order by created_at and page to exhaustion.
 */
async function readOldest(supabase, table, applyFilters) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('created_at').order('created_at', { ascending: true });
    q = applyFilters(q).range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) return { noData: true, reason: `${table} read failed: ${error.message}` };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { rows };
}

async function readDescriptor(supabase, descriptor, nowMs) {
  const src = descriptor.source || {};

  if (src.kind === 'feedback_category') {
    const r = await readOldest(supabase, 'feedback',
      (q) => q.eq('category', src.category).in('status', UNDRAINED_STATUSES));
    if (r.noData) return r;
    const age = computeOldestUndrainedAge(r.rows, nowMs);

    // A declared closing path must be PROBED, not assumed. Leaving closingPathUses null let the
    // largest finding in the database (invariant_gauge_finding: thousands outstanding against a
    // dispositions table with zero rows EVER written) render as PASS — this inventory reporting
    // health over exactly the defect it exists to detect.
    if (descriptor.closingPathTable) {
      const { count, error } = await supabase.from(descriptor.closingPathTable)
        .select('*', { count: 'exact', head: true });
      if (error) return { noData: true, reason: `closing-path probe failed: ${error.message}` };
      return { ...age, closingPathUses: count || 0 };
    }
    return { ...age, closingPathUses: null };
  }

  if (src.kind === 'table' && src.table === 'adam_adherence_ledger') {
    const r = await readOldest(supabase, src.table, (q) => q.eq('verdict', 'fail'));
    if (r.noData) return r;
    return { ...computeOldestUndrainedAge(r.rows, nowMs), closingPathUses: null };
  }

  if (src.kind === 'table' && src.table === 'solomon_advice_outcome_ledger') {
    const r = await readOldest(supabase, src.table, (q) => q.eq('decision', 'pending'));
    if (r.noData) return r;
    const { count: closed, error } = await supabase.from(src.table)
      .select('*', { count: 'exact', head: true }).neq('decision', 'pending');
    if (error) return { noData: true, reason: `closing-path probe failed: ${error.message}` };
    return { ...computeOldestUndrainedAge(r.rows, nowMs), closingPathUses: closed || 0 };
  }

  if (src.kind === 'table' && src.table === 'quick_fixes') {
    const r = await readOldest(supabase, src.table,
      (q) => q.eq('status', 'in_progress').is('claiming_session_id', null));
    if (r.noData) return r;
    return { ...computeOldestUndrainedAge(r.rows, nowMs), closingPathUses: null };
  }

  // Sources this CLI cannot read (a git-ignored local artifact, SD metadata, unkeyable work) are
  // left to the STRUCTURAL verdict, which needs no IO at all — never reported as healthy.
  return undefined;
}

const fmtAge = (ms) => {
  if (ms === null || ms === undefined) return '—';
  const d = ms / 86_400_000;
  return d >= 1 ? `${d.toFixed(1)}d` : `${(ms / 3_600_000).toFixed(1)}h`;
};

async function main() {
  const asJson = process.argv.includes('--json');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[drain-inventory] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const nowMs = Date.now();
  const rows = [];

  for (const [id, descriptor] of Object.entries(DRAIN_DESCRIPTORS)) {
    // Read the age even when a STRUCTURAL verdict already decides the outcome. The verdict is not
    // affected (classifyObserved never lets a reading override a structural finding), but the age
    // is half the finding: "relay_drop has no consumer" is a fact, "and its oldest row is 8 days
    // undrained" is what makes it actionable. Reporting NO_CONSUMER with a blank age would repeat
    // the SD's own complaint that absence is rendered as an empty cell.
    const structural = classifyStructural(descriptor);
    const readable = structural !== VERDICT.MEASURED_ELSEWHERE;
    const reading = readable ? await readDescriptor(supabase, descriptor, nowMs) : undefined;

    const row = buildInventoryRow(id, descriptor, reading);
    // buildInventoryRow maps an unreadable source to UNAVAILABLE; for a source whose STRUCTURAL
    // verdict is already a finding, keep the finding and simply carry whatever age we could read.
    if (structural !== null && row.verdict === VERDICT.UNAVAILABLE) {
      row.verdict = structural;
      row.failing = structural !== VERDICT.MEASURED_ELSEWHERE;
    }
    rows.push(row);
  }

  const code = exitCodeFor(rows.map((r) => r.verdict));

  if (asJson) {
    console.log(JSON.stringify({ generated_at: new Date(nowMs).toISOString(), rows, exit_code: code }, null, 2));
  } else {
    console.log('\nDRAIN INVENTORY — who drains this, and how stale is the drain');
    console.log('='.repeat(96));
    for (const r of rows) {
      const flag = r.failing ? '!!' : (r.verdict === VERDICT.PASS ? 'ok' : '  ');
      console.log(`${flag} ${r.id.padEnd(30)} ${r.verdict.padEnd(26)} oldest=${fmtAge(r.oldestAgeMs).padStart(7)}  n=${r.count ?? '—'}`);
      if (r.failing) console.log(`     consumer=${r.consumer ?? 'NONE'}  closingPath=${r.closingPath ?? 'NONE'}`);
      if (r.timestampSkew) console.log(`     skew: ${r.timestampSkew}`);
      if (r.reason) console.log(`     ${r.reason}`);
    }
    console.log('='.repeat(96));
    const failing = rows.filter((r) => r.failing);
    console.log(`${rows.length} detectors — ${failing.length} FAILING, `
      + `${rows.filter((r) => r.verdict === VERDICT.MEASURED_ELSEWHERE).length} measured elsewhere, `
      + `${rows.filter((r) => r.verdict === VERDICT.UNAVAILABLE).length} unavailable`);
    if (failing.length) console.log('A failing entry is a FINDING, not a blank to be filled in later.\n');
  }

  // This gauge's own liveness. Non-fatal exactly as gauge-runner.mjs:517-519 treats it — a missing
  // registry row must not fail the run, but its absence is visible in the liveness watcher.
  try {
    await stampLastFired(supabase, PROCESS_KEY);
  } catch (err) {
    console.error(`[drain-inventory] stampLastFired failed (non-fatal): ${err.message}`);
  }

  process.exit(code);
}

main().catch((err) => {
  console.error(`[drain-inventory] ${err.stack || err.message}`);
  process.exit(1);
});
