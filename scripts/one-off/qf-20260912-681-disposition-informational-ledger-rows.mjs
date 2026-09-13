#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * QF-20260912-681 fix shape (c): one disposition pass over the legacy informational rows.
 *
 * These rows carry decision='pending' AND decision_requested=false -- informational sends
 * (captureLedgerRow) that were never asking for a judgment, admitted by the DB's own DEFAULT
 * before this QF's fix (b) started writing 'deferred' for exactly this case. Left at 'pending',
 * they are structurally un-closeable (nobody was ever asked to decide) and keep contributing to
 * lib/solomon/conduct-probes.js's permanent-FAIL count for as long as they sit there -- the
 * count-side fix (a) excludes them from the query going forward, but does not retroactively
 * relabel the rows themselves, so they would otherwise remain 'pending' forever in the ledger's
 * own historical record.
 *
 * Scope: EVERY row matching decision='pending' AND decision_requested=false at run time -- not
 * limited to the QF's own snapshot count (18, measured 2026-09-12), which has since grown to 88
 * (measured live 2026-09-13, this session) because captureLedgerRow kept admitting new
 * informational sends at the 'pending' default until fix (b) landed in this same PR. The
 * category is identical regardless of when the row was created, so the disposition pass
 * generalizes to "all such rows as of now" rather than a fixed historical count.
 *
 * Leaves every decision_requested=true row untouched, including the honest 16(+)-row backlog
 * carried under ratification 1726f11d -- those still need a real decision from a recipient-side
 * decision writer, not a bulk relabel.
 */
async function main() {
  const { data: before, error: readErr } = await supabase
    .from('solomon_advice_outcome_ledger')
    .select('id')
    .eq('decision', 'pending')
    .eq('decision_requested', false);
  if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(1); }
  console.log(`Found ${before.length} row(s) to disposition (decision=pending, decision_requested=false).`);
  if (before.length === 0) { console.log('Nothing to do.'); return; }

  const { data: updated, error: updateErr } = await supabase
    .from('solomon_advice_outcome_ledger')
    .update({ decision: 'deferred' })
    .eq('decision', 'pending')
    .eq('decision_requested', false)
    .select('id');
  if (updateErr) { console.error('UPDATE FAILED:', updateErr.message); process.exit(1); }
  console.log(`Dispositioned ${updated.length} row(s): decision 'pending' -> 'deferred' (informational send, no decision was ever requested -- QF-20260912-681).`);
}

if (isMainModule(import.meta.url)) {
  main();
}
