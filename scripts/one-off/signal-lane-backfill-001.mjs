#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-3) — live-queried, idempotent backfill for the currently
 * open signal-lane population.
 *
 * *** DOES NOT REUSE FR-1's coordinator-ack-signal.cjs WRITER UNMODIFIED. *** That writer
 * hardcodes disposition:'ACTIONED' and isRetention:false (coordinator-ack-signal.cjs:99,102) — a
 * genuine live disposal marker. Reusing it for a retroactive backfill would (a) flatten every
 * hand-stamped row's original disposition text into one generic "ACTIONED" value, and (b) inject
 * up to 262 rows indistinguishable from real coordinator answers into the answered-rate ledger's
 * numerator, inflating it by ~9% (VALIDATION HIGH finding, sub_agent_execution_results
 * eb009c8e-0ec1-49ec-bef7-b8cc2ff20d01). This script instead:
 *   - stamps acknowledged_at (retiring the row from the open/undispositioned view — FR-2's job),
 *   - writes a receipt with isRetention:true, which lib/coordination/answered-rate.cjs's
 *     computeAnsweredRate() EXCLUDES from the "genuinely answered" numerator by construction
 *     (`r.is_retention !== true`) — this is an EXISTING, already-tested mechanism (FR-7), not a
 *     new one invented for this backfill,
 *   - writes disposition:null (buildReceipt treats DISPOSED-with-no-disposition as valid but
 *     "merely unspecified" — an honest signal that no genuine per-item classification happened,
 *     as opposed to claiming a specific one that isn't true),
 *   - preserves the ORIGINAL hand-stamped payload.disposition text (for the ~153 rows that carry
 *     one) verbatim in the receipt's metadata, rather than discarding it.
 *
 * LIVE-QUERIED, NEVER A FROZEN ROW-ID LIST: the "262 open" figure measured at LEAD/PLAN time is a
 * snapshot; manual hand-stamping was confirmed still ongoing as of that measurement. Re-deriving
 * the target set at run time means this script converges the backlog to zero regardless of how
 * many more rows accrued since it was written.
 *
 * IDEMPOTENT: only rows with acknowledged_at IS NULL are selected, so re-running after a partial
 * or full prior run only ever touches what's still open.
 *
 * Usage: node scripts/one-off/signal-lane-backfill-001.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const require_ = createRequire(import.meta.url);
const { recordReceipt, LANES, STATES } = require_('../../lib/coordination/receipt-ledger.cjs');

export const WRITER_IDENTITY = 'signal-lane-backfill-001.mjs';
const PAGE_SIZE = 500;

/**
 * Live-queried, paginated (never truncated by a single-page cap) fetch of every open signal-lane
 * row. Injected client for testability — never constructed here.
 */
export async function fetchOpenSignalRows(sb) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from('session_coordination')
      .select('id, created_at, payload, acknowledged_at')
      .not('payload->>signal_type', 'is', null)
      .is('acknowledged_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetchOpenSignalRows failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

/**
 * Backfill exactly one row. Exported so a fixture test can drive it directly against a fake
 * client without a live DB.
 *
 * @returns {Promise<{ok:true, id:string, handStamped:boolean, receipt:object}|{ok:false, id:string, error:string}>}
 */
export async function backfillRow(sb, row, { nowIso, dryRun = false } = {}) {
  const now = nowIso || new Date().toISOString();
  const originalDisposition = row.payload && typeof row.payload.disposition === 'string'
    ? row.payload.disposition.trim()
    : null;
  const handStamped = Boolean(originalDisposition);

  if (dryRun) return { ok: true, id: row.id, handStamped, receipt: { ok: false, skipped: 'dry_run' } };

  const { error: updErr } = await sb
    .from('session_coordination')
    .update({ acknowledged_at: now })
    .eq('id', row.id);
  if (updErr) return { ok: false, id: row.id, error: updErr.message };

  const receipt = await recordReceipt(sb, {
    coordinationId: row.id,
    lane: LANES.SIGNAL,
    state: STATES.DISPOSED,
    disposition: null,
    actorSession: null,
    actorRole: 'backfill',
    // EXCLUDED from computeAnsweredRate()'s numerator (answered-rate.cjs:80: `is_retention !== true`)
    // -- this is not a genuine live disposal, it is retroactive hygiene closure.
    isRetention: true,
    sourceCreatedAt: row.created_at,
    nowMs: Date.parse(now),
    metadata: {
      via: WRITER_IDENTITY,
      writer_identity: WRITER_IDENTITY,
      backfill_reason: handStamped ? 'hand_stamped_prior_to_FR-1' : 'never_touched_prior_to_FR-1',
      original_hand_stamped_disposition: originalDisposition,
      original_hand_stamped_actioned_at: (row.payload && row.payload.actioned_at) || null,
    },
  });

  return { ok: true, id: row.id, handStamped, receipt };
}

/**
 * Run the full backfill against a live-queried row set. Injected client for testability.
 */
export async function runBackfill(sb, opts = {}) {
  const rows = await fetchOpenSignalRows(sb);
  const results = [];
  for (const row of rows) {
    // Sequential, not Promise.all: this writes to a shared answered-rate ledger and a burst of
    // concurrent inserts is not worth the speedup for a one-time (or rare) backlog convergence.
    results.push(await backfillRow(sb, row, opts));
  }
  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const results = await runBackfill(supabase, { dryRun });
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const handStamped = ok.filter((r) => r.handStamped).length;
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Backfill: ${ok.length} row(s) processed (${handStamped} previously hand-stamped, ${ok.length - handStamped} never touched).`);
  if (failed.length > 0) {
    console.error(`FAILED: ${failed.length} row(s):`, failed.map((f) => `${f.id}: ${f.error}`).join('; '));
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('BACKFILL FAILED:', e.message || e); process.exit(1); });
}
