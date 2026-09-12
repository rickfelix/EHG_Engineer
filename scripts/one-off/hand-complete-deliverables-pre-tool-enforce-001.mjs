// SD-LEO-FIX-PRE-TOOL-ENFORCE-001 — EXEC-phase deliverable completion.
//
// The fix (ENF-20 + shallow-fetch-guard.cjs + its test suite) is already committed on this SD's
// own branch, unit tested (14/14), and verified end-to-end against the real hook binary for all
// 4 named cases in the ticket's fix shape. sd_scope_deliverables cannot yet be auto-completed by
// the normal producers (fn_auto_close_deliverables_on_sd_completion / sync-deliverables-from-git,
// both post-merge-only) since this branch hasn't merged to main. Using the sanctioned
// markDeliverableHandCompleted helper (lib/deliverables/mark-hand-completed.js) rather than a
// bare .update(), so provenance (metadata.producer='hand_completed') is recorded for
// DELIVERABLES_COMPLETENESS/SCOPE_AUDIT.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { markDeliverableHandCompleted } from '../../lib/deliverables/mark-hand-completed.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-PRE-TOOL-ENFORCE-001';
const ACTOR = 'LEAD/EXEC worker (this session), commit 7c4ae4c803d';
const REASON =
  'Verified directly: tests/unit/hooks/shallow-fetch-guard.test.js (14/14) and the full ' +
  'tests/unit/hooks/ suite (369/369) pass, plus an end-to-end smoke test against the real hook ' +
  'binary confirming all 4 named cases in the ticket\'s fix shape. Deliverable landed on this ' +
  'SD\'s own branch (commit 7c4ae4c803d), not yet merged, so the automated post-merge producers ' +
  '(sync-deliverables-from-git.js / fn_auto_close_deliverables_on_sd_completion) cannot see it yet.';

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw new Error(sdErr.message);

  const { data: deliverables, error: dErr } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name, completion_status')
    .eq('sd_id', sd.id);
  if (dErr) throw new Error(dErr.message);

  const pending = deliverables.filter((d) => d.completion_status !== 'completed');
  console.log(`Found ${deliverables.length} deliverable(s), ${pending.length} pending.`);

  for (const d of pending) {
    const { error } = await markDeliverableHandCompleted(supabase, d.id, { actor: ACTOR, reason: REASON });
    if (error) throw new Error(`Failed to complete "${d.deliverable_name}": ${error.message}`);
    console.log(`  ✓ completed: ${d.deliverable_name}`);
  }

  const { data: after, error: verifyErr } = await supabase
    .from('sd_scope_deliverables')
    .select('completion_status')
    .eq('sd_id', sd.id);
  if (verifyErr) throw new Error(verifyErr.message);
  const stillPending = after.filter((d) => d.completion_status !== 'completed');
  if (stillPending.length > 0) throw new Error(`VERIFY FAILED: ${stillPending.length} still not completed`);
  console.log(`OK: all ${after.length} deliverables completed and verified.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
