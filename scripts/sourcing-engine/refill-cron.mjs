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
    .select('id, title, source_type, source_id, item_disposition, promoted_to_sd_key, lane, wave_id') // schema-lint-disable-line
    .eq('item_disposition', 'pending')
    .is('promoted_to_sd_key', null)
    .limit(1000);

  if (error) { console.error('refill-cron: query failed:', error.message); process.exit(2); }

  const sel = selectRefillBatch(rows || [], { limit });
  const results = [];
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
    }, null, 2));
  } else {
    console.log(`🔁 Auto-refill cron (${apply ? 'APPLY' : 'DRY RUN'})`);
    console.log(`   staged scanned: ${sel.total} | valid: ${sel.validCount} | selected (≤${sel.limit}): ${sel.batch.length}`);
    console.log(apply ? `   ✅ promoted: ${promoted}` : `   would promote: ${sel.batch.length} (no writes — pass --apply)`);
    for (const r of results) console.log(`     - ${r.sd_key || '(none)'}: ${r.reason}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error('refill-cron error:', e.message); process.exit(2); });
