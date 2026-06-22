#!/usr/bin/env node
/**
 * Flag-gated auto-refill cron — SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-C.
 *
 * Promotes VALID staged roadmap_wave_items onto the belt (create draft SD + stamp promoted_to_sd_key),
 * reusing the -A predicate via -B's verifier. Ships DORMANT.
 *
 * DOUBLE-GATED (both required to write — guards against the recurring wired-but-no-op trap):
 *   1. SOURCING_AUTO_REFILL_V1 === 'true'   (enable flag; default OFF -> [SKIP] exit 0). Checked FIRST.
 *   2. --apply                              (write flag; default DRY-RUN -> promotes nothing).
 *
 * Usage: node scripts/sourcing-engine/refill-cron.mjs [--apply] [--limit N] [--json]
 *
 * Also the module's wiring: makes lib/sourcing-engine/refill-auto-promote.js INVOKED (npm entry point),
 * not merely reachable (per the INVOCATION-PATH-PROOF lesson). Mirrors the sibling -B CLI refill-verify.mjs.
 */
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { selectRefillBatch, promoteStagedCandidate } from '../../lib/sourcing-engine/refill-auto-promote.js';
import { pathToFileURL } from 'node:url';
import { normalizeTitleForCompare, crossRefShippedTitleAdvisory } from '../../lib/sourcing-engine/refill-candidate-validity.js';

/**
 * SD-LEO-INFRA-WIRE-ALREADY-SHIPPED-001 (Phase 1 — ADVISORY): for a selected promotion batch, collect the
 * titles that the bounded crossRefShippedTitleAdvisory flags as a PREFIX/lookalike of an already-shipped SD
 * (a class the EXACT-match belt axis does NOT catch). ADVISORY ONLY — pure, no verdict change, no writes;
 * the caller LOGS the result so the false-positive rate is measurable before Phase 2 promotes it to a reject.
 * Pure/total: reuses the caller's once-per-run shippedTitleSet, O(batch × set).
 * @param {Array<{title?:string, source_id?:string}>} batch  the selected refill batch
 * @param {Set<string>} shippedTitleSet  normalizeTitleForCompare() keys of completed SD titles
 * @returns {{ matches: Array<{title:string, source_id:(string|undefined), matched:string}>, byReason: object }}
 */
export function collectShippedTitleAdvisories(batch, shippedTitleSet) {
  const matches = [];
  for (const item of Array.isArray(batch) ? batch : []) {
    if (!item || typeof item !== 'object') continue;
    const matched = crossRefShippedTitleAdvisory(item.title, shippedTitleSet);
    if (matched) matches.push({ title: item.title, source_id: item.source_id, matched });
  }
  const byReason = matches.length ? { ALREADY_SHIPPED_PREFIX_LOOKALIKE: matches.length } : {};
  return { matches, byReason };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const json = args.includes('--json');
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 && Number(args[limIdx + 1]) > 0 ? Number(args[limIdx + 1]) : undefined;

  // Gate 1 (enable) — checked FIRST so --apply is safe unconditionally when the flag is off.
  if (process.env.SOURCING_AUTO_REFILL_V1 !== 'true') {
    console.log('[SKIP] auto-refill dormant (SOURCING_AUTO_REFILL_V1 != "true"). No action.');
    process.exit(0);
  }

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  // Staged = item_disposition='pending' AND not yet promoted.
  const { data: rows, error } = await supabase
    .from('roadmap_wave_items')
    // lane is live (sourcing-engine activation migrations) but postdates the schema-reference snapshot.
    .select('id, title, source_type, source_id, item_disposition, promoted_to_sd_key, lane, wave_id, metadata') // schema-lint-disable-line
    .eq('item_disposition', 'pending')
    .is('promoted_to_sd_key', null)
    .limit(1000);

  if (error) { console.error('refill-cron: query failed:', error.message); process.exit(2); }

  // SD-LEO-INFRA-AUTO-REFILL-BELT-001 (FR-4): build the already-shipped-title Set ONCE per run (one
  // bounded query) so the lookalike belt-quality axis rejects a staged title that re-promotes a title
  // whose SD already COMPLETED. Fail-open: a query error yields an empty Set (axis no-ops), never blocks.
  let shippedTitleSet = new Set();
  try {
    const { data: shipped } = await supabase
      .from('strategic_directives_v2')
      .select('title')
      .eq('status', 'completed')
      .limit(5000);
    shippedTitleSet = new Set((shipped || []).map((s) => normalizeTitleForCompare(s.title)).filter(Boolean));
  } catch { /* fail-open: empty set -> lookalike axis no-ops */ }

  const sel = selectRefillBatch(rows || [], { limit, shippedTitleSet });
  const results = [];
  // SD-LEO-INFRA-WIRE-ALREADY-SHIPPED-001 (Phase 1 — ADVISORY): wire the exported-but-unused
  // crossRefShippedTitleAdvisory into the live promotion caller (its only production call site). It
  // catches a staged title that is a PREFIX/lookalike of an already-shipped SD title — a class the
  // EXACT-match belt axis (in selectRefillBatch/evaluateRefillCandidate) does NOT catch. Advisory ONLY:
  // we LOG matches and surface a count so the false-positive rate is measurable, but we DO NOT change
  // the verdict (no candidate is dropped). Promoting the match to a hard reject is Phase 2, gated on
  // the measured FP rate. shippedTitleSet is REUSED (built once above), never a new full-corpus scan.
  // Phase 1 advisory pass (pure helper) — surfaces lookalike matches WITHOUT changing any verdict.
  const { matches: advisoryMatches, byReason: advisoryByReason } =
    collectShippedTitleAdvisories(sel.batch, shippedTitleSet);
  for (const item of sel.batch) {
    // Gate 2 (write) flows through to the only writer; apply:false => dry-run no-op.
    results.push(await promoteStagedCandidate(supabase, item, { apply }));
  }
  const promoted = results.filter((r) => r.promoted).length;

  if (json) {
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry_run',
      total: sel.total, validCount: sel.validCount, selected: sel.batch.length, limit: sel.limit,
      promoted, results,
      advisoryByReason, advisoryMatches, // Phase 1 advisory (no verdict change) — for FP-rate measurement
    }, null, 2));
  } else {
    console.log(`🔁 Auto-refill cron (${apply ? 'APPLY' : 'DRY RUN'})`);
    console.log(`   staged scanned: ${sel.total} | valid: ${sel.validCount} | selected (≤${sel.limit}): ${sel.batch.length}`);
    console.log(apply ? `   ✅ promoted: ${promoted}` : `   would promote: ${sel.batch.length} (no writes — pass --apply)`);
    for (const r of results) console.log(`     - ${r.sd_key || '(none)'}: ${r.reason}`);
    if (advisoryMatches.length) {
      console.log(`   ⚠️  advisory (NOT enforced): ${advisoryMatches.length} selected title(s) look like an already-shipped SD:`);
      for (const a of advisoryMatches) console.log(`        - "${a.title}" ~ shipped "${a.matched}"`);
    }
  }
  process.exit(0);
}

// Guard CLI execution so the module is importable for unit tests (no main()/DB-client on import).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('refill-cron error:', e.message); process.exit(2); });
}
