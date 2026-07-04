#!/usr/bin/env node
/**
 * solomon-ledger-reconcile.cjs — outcome reconciliation for solomon_advice_outcome_ledger.
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-4).
 *
 * For every ledger row with a populated outcome_sd_key and outcome still 'unknown', reads the
 * ACTUAL terminal status of that downstream SD (strategic_directives_v2.status) and sets outcome
 * accordingly — NEVER from Solomon's own advisory text (CONST-002 proposer!=approver). Rides the
 * existing cron cadence; this file adds no new scheduler, it is invoked manually or from an
 * existing periodic tick.
 *
 * Mapping (conservative — only the unambiguous, positively-confirmed case is auto-set):
 *   strategic_directives_v2.status = 'completed' -> outcome = 'shipped_clean'
 *   strategic_directives_v2.status = 'cancelled' -> outcome = 'reverted'
 *   anything else (in_progress, draft, not found, etc.) -> left 'unknown' (not yet decidable)
 *
 * 'caused_rework' is intentionally NOT auto-detected here (requires human judgment on whether a
 * downstream fix constitutes "rework caused by the original proposal") — it is set manually via a
 * direct ledger update when that judgment is made, not inferred by this script.
 *
 * Closer-of-record (SD-LEO-INFRA-REWARD-SPINE-ONE-001-B): every auto-close stamps closed_by/
 * closed_at so the closure is durably attributable to this mechanism, never a self-report —
 * the anti-Goodhart mechanic named in docs/architecture/reward-spine-ssot.md. This guarantee
 * covers ONLY the auto-close path in this file; the manual caused_rework update path (line 18
 * above) is NOT enforced at the DB level (no CHECK constraint) and can leave closed_by/closed_at
 * NULL if whoever performs that manual update doesn't also set them — a known, accepted scope
 * boundary (a hard CHECK would break pre-existing closed rows that predate this column).
 *
 * Usage:
 *   node scripts/solomon-ledger-reconcile.cjs [--dry-run]
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

const CLOSER_OF_RECORD = 'solomon-ledger-reconcile.cjs';

/**
 * Pure: map a downstream SD's terminal status to a ledger outcome value.
 * Returns null when the status is not yet a confident terminal signal (leave 'unknown'). Exported for tests.
 */
function mapSdStatusToOutcome(sdStatus) {
  if (sdStatus === 'completed') return 'shipped_clean';
  if (sdStatus === 'cancelled') return 'reverted';
  return null;
}

/**
 * Reconcile one batch of ledger rows against live SD status. Fail-open per row: a single lookup
 * failure is logged and skipped, never aborts the batch. Exported for tests.
 */
async function reconcileBatch(supabase, rows) {
  const results = [];
  for (const row of rows) {
    if (!row.outcome_sd_key) { results.push({ id: row.id, updated: false, reason: 'no outcome_sd_key' }); continue; }
    let sd;
    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('status')
        .eq('sd_key', row.outcome_sd_key)
        .maybeSingle();
      if (error) { results.push({ id: row.id, updated: false, reason: error.message }); continue; }
      sd = data;
    } catch (e) {
      results.push({ id: row.id, updated: false, reason: (e && e.message) || String(e) });
      continue;
    }
    if (!sd) { results.push({ id: row.id, updated: false, reason: `SD ${row.outcome_sd_key} not found` }); continue; }
    const outcome = mapSdStatusToOutcome(sd.status);
    if (!outcome) { results.push({ id: row.id, updated: false, reason: `SD status '${sd.status}' not yet terminal` }); continue; }
    results.push({ id: row.id, updated: true, outcome, sdStatus: sd.status, sdKey: row.outcome_sd_key });
  }
  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  const { count: unknownBefore } = await supabase
    .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
    .select('*', { count: 'exact', head: true })
    .eq('outcome', 'unknown');

  const { data: pending, error } = await supabase
    .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
    .select('id, outcome_sd_key')
    .eq('outcome', 'unknown')
    .not('outcome_sd_key', 'is', null)
    .limit(500);
  if (error) { console.error('ERROR: ledger query failed:', error.message); process.exit(1); }
  console.log(`Ledger state before this run: ${unknownBefore ?? '?'} row(s) outcome='unknown'; ${pending ? pending.length : 0} eligible (have an outcome_sd_key).`);
  if (!pending || pending.length === 0) { console.log('(no ledger rows pending reconciliation)'); return; }

  const results = await reconcileBatch(supabase, pending);
  const toUpdate = results.filter((r) => r.updated);

  console.log(`Reconcile: ${pending.length} row(s) checked, ${toUpdate.length} resolved to a terminal outcome.`);
  for (const r of results) {
    console.log(`  ${r.id}: ${r.updated ? `outcome=${r.outcome} (SD status=${r.sdStatus})` : `skipped (${r.reason})`}`);
  }

  if (dryRun || toUpdate.length === 0) return;

  for (const r of toUpdate) {
    // outcome_ref is NOT stamped here — it is documented (20260701_solomon_advice_outcome_ledger.sql)
    // as "e.g. PR URL or CI run reference", and r.sdKey duplicates outcome_sd_key already on the same
    // row, adding no information. closed_by/closed_at are the closer-of-record for this auto-close path.
    const { error: uErr } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
      .update({
        outcome: r.outcome,
        closed_by: CLOSER_OF_RECORD,
        closed_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (uErr) console.error(`  WARN: failed to write outcome for ${r.id}: ${uErr.message}`);
  }
  console.log(`✓ ${toUpdate.length} row(s) updated.`);

  const { count: unknownAfter } = await supabase
    .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
    .select('*', { count: 'exact', head: true })
    .eq('outcome', 'unknown');
  console.log(`Ledger state after this run: ${unknownAfter ?? '?'} row(s) outcome='unknown' (was ${unknownBefore ?? '?'}).`);
}

module.exports = { mapSdStatusToOutcome, reconcileBatch };

if (require.main === module) {
  main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
