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

// ── FR-4 (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001, W2): negative-outcome back-propagation ────────
// The ledger had ZERO negative outcomes ever recorded, so "accuracy" was unfalsifiable. When a
// revert / red-merge / RCA attribution names a tracked artifact, the linked ledger row's outcome
// flips to 'reverted'. Attribution flows ONLY through EXACT outcome_ref equality — never a heuristic —
// so a real accept that named that artifact (FR-3) is the only thing a negative signal can touch.
const NEGATIVE_OUTCOME = 'reverted';
const NEGATIVE_BACKPROP_SOURCE = 'solomon-ledger-negative-backprop.cjs';
// audit_log events that constitute a durable negative signal. RED_MERGE_DETECTED is written by
// scripts/ci/red-merge-detector.mjs; the revert/RCA events are matched defensively if present.
const NEGATIVE_AUDIT_EVENTS = Object.freeze(['RED_MERGE_DETECTED', 'RED_MERGE', 'SD_REVERTED', 'REVERT', 'RCA_ATTRIBUTED_REGRESSION']);
// Metadata keys a negative signal may carry a reference under (raw value used verbatim — the match
// is still exact outcome_ref equality, so extra candidate keys never create mis-attribution).
const NEGATIVE_REF_KEYS = Object.freeze(['sha', 'commit_sha', 'sd_key', 'sd_id', 'ref', 'outcome_ref', 'pr', 'pr_url', 'pr_number', 'signature']);

/** Pure: add every non-empty candidate reference from a signal's metadata object into `set`. */
function addRefsFromMetadata(set, metadata) {
  if (!metadata || typeof metadata !== 'object') return;
  for (const k of NEGATIVE_REF_KEYS) {
    const v = metadata[k];
    if (v != null && String(v).trim()) set.add(String(v).trim());
  }
}

/**
 * Pure: given ledger rows and a set of negative reference strings, return the rows to flip to
 * 'reverted'. EXACT outcome_ref equality only. A NO_ARTIFACT sentinel ref (FR-3 no-artifact marker)
 * is never linkable. Rows already terminal-negative (reverted/caused_rework) are skipped (idempotent);
 * unknown/shipped_clean flip (a later revert means it was not actually clean). Exported for tests.
 */
function selectNegativeBackprop(ledgerRows, negativeRefs) {
  const refSet = negativeRefs instanceof Set ? negativeRefs : new Set((negativeRefs || []).filter(Boolean).map(String));
  const out = [];
  for (const r of (ledgerRows || [])) {
    const ref = r && r.outcome_ref;
    if (!ref || typeof ref !== 'string') continue;
    if (ref === 'NO_ARTIFACT' || ref.startsWith('NO_ARTIFACT:')) continue; // explicit no-artifact — nothing to track
    if (!refSet.has(ref)) continue;                                        // EXACT linkage only, never heuristic
    if (r.outcome === NEGATIVE_OUTCOME || r.outcome === 'caused_rework') continue; // already negative — idempotent
    out.push({ id: r.id, outcome_ref: ref, priorOutcome: r.outcome });
  }
  return out;
}

/**
 * Read DURABLE negative signals and return the set of reference strings they name. Fail-open per
 * source (a query error yields no refs from that source, never throws). Exported for tests.
 *   1. audit_log rows with a negative event (metadata refs)
 *   2. strategic_directives_v2 rows with metadata.reverted_at set (a real SD revert -> its sd_key + id)
 */
async function collectNegativeRefs(supabase, { sinceMs = null } = {}) {
  const refs = new Set();
  try {
    let q = supabase.from('audit_log').select('event, metadata, created_at').in('event', NEGATIVE_AUDIT_EVENTS);
    if (sinceMs) q = q.gte('created_at', new Date(sinceMs).toISOString());
    const { data, error } = await q.limit(2000);
    if (!error && Array.isArray(data)) for (const row of data) addRefsFromMetadata(refs, row.metadata);
  } catch { /* fail-open */ }
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, metadata')
      .not('metadata->>reverted_at', 'is', null)
      .limit(2000);
    if (!error && Array.isArray(data)) {
      for (const sd of data) { if (sd.sd_key) refs.add(String(sd.sd_key)); if (sd.id) refs.add(String(sd.id)); }
    }
  } catch { /* fail-open */ }
  return refs;
}

/**
 * Back-propagate a NEGATIVE outcome onto every ledger row whose outcome_ref EXACTLY matches a negative
 * reference. Stamps outcome='reverted' + closer-of-record (closed_by/closed_at). Fail-open per row.
 * dryRun returns the matches without writing. Exported for tests.
 */
async function backPropagateNegativeOutcomes(supabase, { negativeRefs, source = NEGATIVE_BACKPROP_SOURCE, nowIso = new Date().toISOString(), dryRun = false } = {}) {
  const refSet = negativeRefs instanceof Set ? negativeRefs : new Set((negativeRefs || []).filter(Boolean).map(String));
  if (refSet.size === 0) return { matched: [], updated: [] };
  let rows = [];
  try {
    const { data, error } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table, not yet in the live snapshot
      .select('id, outcome, outcome_ref')
      .not('outcome_ref', 'is', null)
      .limit(5000);
    if (error) return { matched: [], updated: [], reason: error.message };
    rows = data || [];
  } catch (e) {
    return { matched: [], updated: [], reason: (e && e.message) || String(e) };
  }
  const matched = selectNegativeBackprop(rows, refSet);
  if (dryRun) return { matched, updated: [] };
  const updated = [];
  for (const m of matched) {
    try {
      const { error } = await supabase
        .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table, not yet in the live snapshot
        .update({ outcome: NEGATIVE_OUTCOME, closed_by: source, closed_at: nowIso })
        .eq('id', m.id);
      if (error) { console.error(`  WARN: negative back-prop failed for ${m.id}: ${error.message}`); continue; }
      updated.push(m.id);
    } catch (e) {
      console.error(`  WARN: negative back-prop threw for ${m.id}: ${(e && e.message) || e}`);
    }
  }
  return { matched, updated };
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

  // FR-4: negative-outcome back-propagation. Collect durable revert/red-merge/RCA signals and flip any
  // ledger row whose outcome_ref EXACTLY matches to 'reverted' (closes the "zero negatives ever" gap).
  const negRefs = await collectNegativeRefs(supabase, {});
  console.log(`Negative-signal refs collected (revert/red-merge/RCA): ${negRefs.size}.`);
  const backprop = await backPropagateNegativeOutcomes(supabase, { negativeRefs: negRefs, dryRun });
  if (dryRun) {
    console.log(`  [dry-run] ${backprop.matched.length} ledger row(s) would flip to outcome='reverted' via exact outcome_ref linkage:`);
    for (const m of backprop.matched) console.log(`    ${m.id}: ${m.priorOutcome} -> reverted (ref=${m.outcome_ref})`);
  } else {
    console.log(`  Negative back-prop: ${backprop.updated.length}/${backprop.matched.length} row(s) stamped outcome='reverted' via outcome_ref linkage.`);
  }
}

module.exports = {
  mapSdStatusToOutcome, reconcileBatch,
  selectNegativeBackprop, collectNegativeRefs, backPropagateNegativeOutcomes, addRefsFromMetadata,
  NEGATIVE_OUTCOME, NEGATIVE_BACKPROP_SOURCE, NEGATIVE_AUDIT_EVENTS,
};

if (require.main === module) {
  main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
