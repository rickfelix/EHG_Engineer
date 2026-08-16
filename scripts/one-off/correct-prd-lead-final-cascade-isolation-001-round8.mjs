// SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 -- PRD correction round 8.
//
// validation-verify-cascade-isolation re-reviewed round 6's AC#4 reword and found it
// swapped one defect for a worse one: "unsatisfiable" became "unfalsifiable". Verified
// directly before acting:
//   - GATE_COORDINATOR_AUTHORITY_FENCE: 1 row, lifetime, whole table, all SDs, all time.
//   - human_action_required (the specific axis this SD is about): 0 rows, ever.
//   - Prerequisite preflight failed (the DIFFERENT, unrelated signal actually firing on
//     SD-LEO-INFRA-BIND-OBSERVE-ONLY-001): 793 rows.
// Structural reason this can never fail: HandoffOrchestrator.js's prerequisite-preflight
// check rejects and RETURNS before BaseExecutor.execute() (where Step 1.9's
// GATE_COORDINATOR_AUTHORITY_FENCE lives) is ever reached -- for THIS specimen the fence is
// structurally unreachable, not merely dormant. More fundamentally: if the picker fences
// this SD adds actually work, no handoff is attempted at all (the cascade loop returns
// before ever calling handleExecuteCommand), so a WORKING fix's success signature is
// ABSENCE OF ANY ROW, not absence of a specifically-worded row. The round-6 wording would
// read PASS whether the fix works or is completely broken, since
// GATE_COORDINATOR_AUTHORITY_FENCE essentially never fires either way. Matches this repo's
// own recorded pattern PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001 (6 prior instances).
//
// Fix: pin absence of ANY new row (matching the actual success signature), not a specific
// rejection_reason.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('acceptance_criteria')
  .eq('id', PRD_ID)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const ac = prd.acceptance_criteria.map((item) => {
  if (!item.includes('sd_phase_handoffs') || !item.startsWith('No NEW')) return item;
  return 'No NEW sd_phase_handoffs row of ANY rejection_reason appears for SD-LEO-INFRA-BIND-OBSERVE-ONLY-001 (or any requires_human_action=TRUE SD) via the CASCADE path after the fix ships, confirmed via a live post-merge check against the baseline: 7 pre-existing rows as of 2026-08-16T02:46:39.612277Z. This is the correct success signature -- if the picker fences work, the cascade loop returns before ever calling handleExecuteCommand, so a working fix produces ZERO new rows, not a row bearing a specific reason. (Round-6 wording pinned GATE_COORDINATOR_AUTHORITY_FENCE specifically -- a signal with a lifetime population of 1 row and 0 for the human_action_required axis across the whole table, which would read PASS regardless of whether this fix works. Corrected per validation-verify-cascade-isolation, independently re-verified before amending -- both counts confirmed directly.) Note: whether the pre-existing 7 rows stem from a cascade-originated or human-originated LEAD-TO-PLAN attempt is UNDER-DETERMINED, not established -- see feedback 43f0037c\'s amendment for why (emitChainingTelemetry, the one instrument that would discriminate, has never successfully written a row due to an unrelated schema-mismatch bug, logged separately).';
});

const acChanged = JSON.stringify(ac) !== JSON.stringify(prd.acceptance_criteria);

if (!acChanged) {
  console.log('NO_CHANGE — nothing to update');
  process.exit(0);
}

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ acceptance_criteria: ac, updated_at: new Date().toISOString() })
  .eq('id', PRD_ID);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('PRD_CORRECTED', PRD_ID, { acChanged });
