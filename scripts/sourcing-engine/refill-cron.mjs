#!/usr/bin/env node
/**
 * Flag-gated auto-refill cron — SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-C.
 *
 * Promotes VALID staged roadmap_wave_items onto the belt (create draft SD + stamp promoted_to_sd_key),
 * reusing the -A predicate via -B's verifier. Ships DORMANT.
 *
 * DOUBLE-GATED (both required to write — guards against the recurring wired-but-no-op trap):
 *   1. ENABLE — the DB activation SSOT: sourcing_engine_activation_state arm 'auto-refill' enabled=true.
 *      Read via readSourcingEngineFlagsFromDb (the SAME source the capacity-forecaster gauge reads) so
 *      the gauge and this action CANNOT diverge. SD-LEO-INFRA-AUTO-REFILL-READ-DB-ACTIVATION-FLAG-001
 *      fixed the prior defect where the env gate read OFF while the seeded DB arm read ON (0/414 promoted).
 *      SOURCING_AUTO_REFILL_V1 is demoted to an OPTIONAL emergency force-off kill-switch (env=false/off/0
 *      forces dormant regardless of the DB). Fail-closed: absent/disabled arm => dormant. Checked FIRST.
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
import { readSourcingEngineFlagsFromDb } from '../lib/sourcing-engine-awareness.mjs';

/**
 * SD-LEO-INFRA-AUTO-REFILL-READ-DB-ACTIVATION-FLAG-001 (FR-1/FR-2): resolve the auto-refill enable
 * decision from the sourcing_engine_activation_state DB SSOT — the SAME source the capacity-forecaster
 * gauge reads (readSourcingEngineFlagsFromDb) — so the gauge and this action can't diverge (the defect:
 * the env gate read OFF while the seeded DB arm read ON, so 0/414 promoted). The DB flag is PRIMARY;
 * SOURCING_AUTO_REFILL_V1 is demoted to an OPTIONAL emergency force-off kill-switch ANDed with it.
 * Fail-closed: an absent/disabled arm => false (dormant), never a runaway promote.
 *
 * @param {Array<{env?:string,label?:string,enabled?:boolean}>} dbFlags  from readSourcingEngineFlagsFromDb
 * @param {object} [env=process.env]
 * @returns {boolean} true when the auto-refill cron is enabled to act
 */
export function resolveAutoRefillEnabled(dbFlags, env = process.env) {
  // Emergency kill-switch: an explicit force-off env value wins regardless of the DB.
  const ev = String((env || {}).SOURCING_AUTO_REFILL_V1 ?? '').toLowerCase();
  if (ev === 'false' || ev === 'off' || ev === '0') return false;
  // DB activation SSOT (same read path as the forecaster). Arm absent/disabled => false (fail-closed).
  const arm = Array.isArray(dbFlags)
    ? dbFlags.find((f) => f && (f.label === 'auto-refill' || f.env === 'SOURCING_AUTO_REFILL_V1'))
    : null;
  return arm?.enabled === true;
}

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

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  // Gate 1 (enable) — read the DB activation SSOT (sourcing_engine_activation_state), the SAME source
  // the capacity-forecaster gauge reads, so the gauge and this action can't diverge. DB flag is PRIMARY;
  // SOURCING_AUTO_REFILL_V1 is only an optional emergency force-off kill-switch. Fail-closed: any read
  // failure degrades (via the reader's env fallback / an empty arm) to dormant, never a runaway promote.
  // SD-LEO-INFRA-AUTO-REFILL-READ-DB-ACTIVATION-FLAG-001 (FR-1/FR-2).
  let dbFlags = [];
  try { dbFlags = await readSourcingEngineFlagsFromDb(supabase); } catch { dbFlags = []; }
  if (!resolveAutoRefillEnabled(dbFlags, process.env)) {
    console.log('[SKIP] auto-refill dormant (sourcing_engine_activation_state arm "auto-refill" disabled / fail-closed, or SOURCING_AUTO_REFILL_V1 force-off). No action.');
    process.exit(0);
  }

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
