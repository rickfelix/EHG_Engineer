#!/usr/bin/env node
/**
 * Dry-run staged-candidate verifier CLI — SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-B.
 *
 * Reads the staged roadmap_wave_items corpus and reports which rows the candidate-validity
 * predicate (-A) would accept as valid auto-promote candidates vs reject — DRY RUN, no writes.
 * This is the operator/coordinator preview before the -C auto-refill cron promotes anything.
 *
 * Usage: node scripts/sourcing-engine/refill-verify.mjs [--json] [--limit N]
 *
 * Also the module's wiring: it makes lib/sourcing-engine/refill-dry-run-verifier.js INVOKED
 * (an npm entry point), not merely reachable.
 */
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { verifyStagedCandidates, formatVerifierReport } from '../../lib/sourcing-engine/refill-dry-run-verifier.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — this is the operator preview of
// what refill-cron.mjs will act on; the default --limit=1000 matched the PostgREST cap exactly,
// so a >1000 staged corpus silently under-reported vs what the cron actually promotes from.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 && Number(args[limIdx + 1]) > 0 ? Number(args[limIdx + 1]) : 1000;

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  // Staged = item_disposition='pending' AND not yet promoted. Read-only.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('roadmap_wave_items')
      .select('id, title, source_type, source_id, item_disposition, promoted_to_sd_key, lane, metadata')
      .eq('item_disposition', 'pending')
      .is('promoted_to_sd_key', null)
      .order('id', { ascending: true }), { maxRows: limit }); // declared sampling cap, preserved from prior .limit(limit)
  } catch (e) {
    console.error('refill-verify: query failed:', e.message);
    process.exit(2);
  }

  const report = verifyStagedCandidates(rows);

  if (json) {
    console.log(JSON.stringify({
      total: report.total,
      validCount: report.validCount,
      invalidCount: report.invalidCount,
      byReason: report.byReason,
      validIds: report.valid.map((r) => r.id),
    }, null, 2));
  } else {
    console.log('🔎 Auto-refill dry-run verification (staged → belt candidates)');
    for (const line of formatVerifierReport(report)) console.log(line);
  }

  process.exit(0);
}

main().catch((e) => { console.error('refill-verify error:', e.message); process.exit(2); });
