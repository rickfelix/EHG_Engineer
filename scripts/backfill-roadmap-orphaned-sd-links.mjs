#!/usr/bin/env node
// Backfill / exit-predicate CLI — QF-20260911-229.
//
// Links roadmap_wave_items rows whose metadata.source_key names an existing SD but whose
// promoted_to_sd_key was never stamped (the register-first gap applyWaveDisposition had until
// this same QF's fix). Dry-run by default; --apply performs the writes via the canonical
// stamp writers (no raw UPDATE). Re-runnable: Solomon's weekly exit predicate is
// `candidates === 0` -- this script's own dry-run report IS that predicate.
//
// Usage: node scripts/backfill-roadmap-orphaned-sd-links.mjs [--apply]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { backfillOrphanedSdLinkedItems } from '../lib/roadmap/orphaned-sd-link-backfill.mjs';

const apply = process.argv.includes('--apply');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const result = await backfillOrphanedSdLinkedItems(supabase, { apply });
  console.log(`[backfill-roadmap-orphaned-sd-links] ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  candidates (orphaned, promoted_to_sd_key=NULL, source_key names a real SD): ${result.candidates}`);
  console.log(`  stamped promoted_to_sd_key:                                                  ${result.stamped}`);
  console.log(`  advanced item_disposition -> promoted (linked SD already completed):          ${result.promoted}`);
  if (result.errors.length > 0) {
    console.log(`  ERRORS (${result.errors.length}):`);
    for (const e of result.errors) console.log(`    - ${JSON.stringify(e)}`);
    process.exitCode = 1;
  }
  if (!apply && result.candidates > 0) {
    console.log('\nRe-run with --apply to perform the writes.');
  }
}

main().catch((err) => {
  console.error(`[backfill-roadmap-orphaned-sd-links] FAILED: ${err.message}`);
  process.exit(1);
});
