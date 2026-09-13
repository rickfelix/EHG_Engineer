#!/usr/bin/env node
// Gauge-finding disposition sweep CLI — QF-20260911-425.
//
// Groups outstanding invariant_gauge_finding feedback rows by fingerprint (gauge_id) and writes
// one gauge_finding_dispositions row per fingerprint via the existing canonical writer
// (acceptDisposition) -- the designed drain per gauge-registry.js's own description. Dry-run by
// default; --apply performs the writes. Idempotent (re-running upserts the same fingerprint set,
// never a duplicate row).
//
// Usage: node scripts/gauge-findings/disposition-sweep.mjs [--apply]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { sweepGaugeFindingDispositions } from '../../lib/governance/gauge-finding-disposition-sweep.mjs';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';

const apply = process.argv.includes('--apply');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// QF-20260913-254: standard_loop:gauge-finding-disposition-sweep (scripts/coordinator-startup-check.mjs)
const PROCESS_KEY = 'standard_loop:gauge-finding-disposition-sweep';

async function main() {
  const result = await sweepGaugeFindingDispositions(supabase, { apply });
  console.log(`[gauge-finding-disposition-sweep] ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  outstanding rows:     ${result.outstanding}`);
  console.log(`  distinct fingerprints: ${result.fingerprints}`);
  console.log(`  dispositioned:        ${result.dispositioned}`);
  console.log('\nTop fingerprints by count:');
  for (const g of result.groups.slice(0, 10)) {
    console.log(`  ${String(g.count).padStart(5)}  ${g.fingerprint}  (oldest ${g.oldestCreatedAt})`);
  }
  if (!apply) console.log('\nRe-run with --apply to write the dispositions.');

  // Own liveness, so this sweep is not itself an unwatched one (index-jam-detector.mjs pattern).
  // Non-fatal on failure.
  try {
    await stampLastFired(supabase, PROCESS_KEY);
  } catch (err) {
    console.error(`[gauge-finding-disposition-sweep] stampLastFired failed (non-fatal): ${err.message}`);
  }
}

main().catch((err) => {
  console.error(`[gauge-finding-disposition-sweep] FAILED: ${err.message}`);
  process.exit(1);
});
