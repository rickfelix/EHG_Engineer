#!/usr/bin/env node
/**
 * One-off backfill: score the dormant capability ledger.
 * SD: SD-LEO-INFRA-ACTIVATE-CAPABILITY-SCORING-001 | FR-3
 *
 * Activates the existing (action='registered') sd_capabilities rows that sit at
 * maturity_score=extraction_score=0 by deriving + persisting maturity/extraction
 * (the BEFORE trigger trg_compute_plane1_score then recomputes plane1_score).
 *
 * Idempotent: by default only scores rows with maturity=extraction=0. After a
 * non-dry run it asserts the resulting plane1_score distribution is meaningful
 * (COUNT(DISTINCT plane1_score) > 1) and prints the top/bottom 10 of the ledger.
 *
 * Usage:
 *   node scripts/one-off/backfill-capability-scores.mjs            # score unscored rows
 *   node scripts/one-off/backfill-capability-scores.mjs --dry-run  # preview only
 *   node scripts/one-off/backfill-capability-scores.mjs --force    # re-score all rows
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { scoreAndPersistCapabilities } from '../../lib/capabilities/plane1-scoring.js';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function distinctNonZero(scores) {
  return new Set(scores.filter((s) => Number(s) > 0).map((s) => Number(s))).size;
}

async function main() {
  console.log(`Backfill capability scores  (force=${force}, dryRun=${dryRun})`);

  const before = await supabase
    .from('v_capability_ledger')
    .select('plane1_score');
  const beforeDistinct = distinctNonZero((before.data || []).map((r) => r.plane1_score));
  console.log(`  ledger rows: ${(before.data || []).length} | distinct non-zero plane1_score before: ${beforeDistinct}`);

  const result = await scoreAndPersistCapabilities(supabase, { all: true, force, dryRun });
  if (result.error && result.scored === 0) {
    console.error(`  ERROR: ${result.error}`);
    process.exit(1);
  }
  console.log(`  scanned=${result.scanned} scored=${result.scored} skipped=${result.skipped}${result.error ? ` (partial errors: ${result.error})` : ''}`);

  if (dryRun) {
    console.log('  DRY RUN — no writes. Sample of intended changes:');
    for (const c of result.changes.slice(0, 10)) {
      console.log(`    ${c.capability_key} [${c.capability_type}] -> maturity=${c.maturity_score} extraction=${c.extraction_score}`);
    }
    return;
  }

  // Verify distribution is meaningful.
  const after = await supabase
    .from('v_capability_ledger')
    .select('capability_key, capability_type, maturity_score, extraction_score, plane1_score')
    .order('plane1_score', { ascending: false });
  const rows = after.data || [];
  const afterDistinct = distinctNonZero(rows.map((r) => r.plane1_score));
  console.log(`  distinct non-zero plane1_score after: ${afterDistinct}`);

  console.log('  TOP 10 by plane1_score:');
  for (const r of rows.slice(0, 10)) {
    console.log(`    ${r.plane1_score}  ${r.capability_key} [${r.capability_type}] m=${r.maturity_score} e=${r.extraction_score}`);
  }
  console.log('  BOTTOM 10 by plane1_score:');
  for (const r of rows.slice(-10)) {
    console.log(`    ${r.plane1_score}  ${r.capability_key} [${r.capability_type}] m=${r.maturity_score} e=${r.extraction_score}`);
  }

  if (afterDistinct <= 1) {
    console.error('  ❌ DEGENERATE DISTRIBUTION: plane1_score has <=1 distinct non-zero value. Heuristic needs review.');
    process.exit(1);
  }
  console.log('  ✅ plane1_score distribution is meaningful (>1 distinct non-zero value).');
}

main().catch((e) => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
