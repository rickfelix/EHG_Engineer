#!/usr/bin/env node
// SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001 — income-capture runner (CLI entry point).
//
// The scheduled/on-demand invoker for the replacement-net substrate: aggregate captured charges from
// ops_payment_events into the structured income_capture_monthly inputs, then print the current
// replacement-net for the latest month + whether the chairman deduction params are attested. Run this on a
// schedule (e.g. monthly/daily) so the distance-to-quit income gauge is fed by real captured dollars.
//
//   node scripts/income/run-income-capture.mjs            # live charges (livemode=true)
//   node scripts/income/run-income-capture.mjs --test     # TEST-mode charges (livemode=false)
//
// This is the genuine runtime entry point for the two lib/income modules (statically imported below).
import { aggregateIncomeCapture } from '../../lib/income/income-capture-aggregator.js';
import { replacementNetFromCapture } from '../../lib/income/replacement-net-source.js';

const livemode = !process.argv.includes('--test');

async function main() {
  const rows = await aggregateIncomeCapture({ livemode });
  if (rows == null) {
    console.error('[income:capture] aggregation failed (see error above)');
    process.exitCode = 1;
    return;
  }
  console.log(`[income:capture] aggregated ${rows.length} month(s) from ops_payment_events (livemode=${livemode}).`);

  const r = await replacementNetFromCapture({ livemode });
  if (r == null) {
    console.log('[income:capture] no income_capture_monthly rows yet for the latest month.');
    return;
  }
  const attested = r.unattested ? 'deductions UNATTESTED — chairman params pending' : 'deductions attested';
  console.log(`[income:capture] replacement-net (latest month): $${r.net}  [${attested}]`);
}

main().catch((err) => {
  console.error(`[income:capture] unexpected error: ${err?.message || err}`);
  process.exitCode = 1;
});
