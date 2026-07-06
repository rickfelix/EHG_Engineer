// QF-20260706-985: manual convergence rescore for MarketLens (post-REMED). The S19->S20
// automatic trigger (Child D) hasn't fired for this venture (mid-walk at S24), so the
// retroactive rescore needs a manual invoke of the convergence loop (Child C,
// lib/eva/convergence-loop.js runConvergenceLoop). Read-only against post_build_verdicts:
// scoreVerdictTable/buildDeviationLedger (lib/eva/adherence-scorer.js) never write; no
// backfillFn/createQuickFixFn/createSdFn are injected here, so any gap this run finds is
// safely deferred (never silently remediated) rather than auto-filing new QFs/SDs
// unsupervised -- this is a rescore + report, not a remediation run.
import { runConvergenceLoop } from '../../lib/eva/convergence-loop.js';

export const VENTURE_ID = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';

export async function main(supabase) {
  const result = await runConvergenceLoop(supabase, { ventureId: VENTURE_ID });
  return result;
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  main(sb).then((r) => console.log('[qf-20260706-985]', JSON.stringify(r, null, 2))).catch((e) => { console.error('[qf-20260706-985] error:', e.message); process.exit(1); });
}
