#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * QF-20260912-681 fix shape (c): disposition every legacy informational row (decision='pending',
 * decision_requested=false) to decision='deferred'. These were admitted at the DB's own 'pending'
 * default before fix (b) started writing 'deferred' for this case; left at 'pending' they are
 * structurally un-closeable and keep contributing to conduct-probes.js's stale-count. Scope is
 * "every matching row as of run time" (88 measured live 2026-09-13), not the QF's original
 * snapshot count (18), since fix (b) only stops NEW rows -- it doesn't relabel existing ones.
 * Leaves every decision_requested=true row untouched (the honest backlog under ratification
 * 1726f11d still needs a real decision, not a bulk relabel).
 */
async function main() {
  const { data: before, error: readErr } = await supabase
    .from('solomon_advice_outcome_ledger')
    .select('id')
    .eq('decision', 'pending')
    .eq('decision_requested', false);
  if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(1); }
  console.log(`Found ${before.length} row(s) to disposition.`);
  if (before.length === 0) { console.log('Nothing to do.'); return; }

  const { data: updated, error: updateErr } = await supabase
    .from('solomon_advice_outcome_ledger')
    .update({ decision: 'deferred' })
    .eq('decision', 'pending')
    .eq('decision_requested', false)
    .select('id');
  if (updateErr) { console.error('UPDATE FAILED:', updateErr.message); process.exit(1); }
  console.log(`Dispositioned ${updated.length} row(s): pending -> deferred (informational send, QF-20260912-681).`);
}

if (isMainModule(import.meta.url)) {
  main();
}
