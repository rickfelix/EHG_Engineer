// SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 -- PRD correction round 6.
//
// validation-verify-cascade-isolation (PLAN_VERIFICATION) found AC#4 ("sd_phase_handoffs
// stays empty for BIND-OBSERVE-ONLY-001... after the fix ships") is unsatisfiable as
// written: the sd_key is actually SD-LEO-INFRA-BIND-OBSERVE-ONLY-001, and it already carries
// 7 rejected sd_phase_handoffs rows (confirmed via direct query). "Stays empty" can never be
// true.
//
// IMPORTANT CORRECTION to validation's causal claim, independently verified before amending:
// validation characterized these 7 rows as "the cascade... firing today," attributing them to
// this SD's own bug. Read all 7 rows directly -- every rejection_reason is
// "Prerequisite preflight failed: SMOKE_TEST_BYPASSED, SUBAGENT_EVIDENCE_MISSING" (6 rows) or
// "GATE_CLAIM_VALIDITY ... NO_CLAIM" (1 row), traced to HandoffOrchestrator.js:176's
// prerequisite-preflight layer -- which runs BEFORE BaseExecutor.execute()'s Step 1.9
// authority fence (the mechanism this SD's cascade fix backstops) is ever reached. NONE of
// the 7 rows carry GATE_COORDINATOR_AUTHORITY_FENCE, the rejection this SD's fix would
// actually produce. These rows are real and recurring, but evidence of a SEPARATE,
// unrelated harness problem (something repeatedly attempting LEAD-TO-PLAN on this specific
// human-action-fenced SD and failing on prerequisite checks, not on the authority fence) --
// logged separately, not attributed to this SD's mechanism.
//
// Fix: reword AC#4 to a baseline-based check (no NEW rows after merge), matching what can
// actually be verified, and note the pre-existing baseline + its real (different) cause.

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
  if (!item.includes('sd_phase_handoffs stays empty')) return item;
  return 'No NEW sd_phase_handoffs row with rejection_reason containing GATE_COORDINATOR_AUTHORITY_FENCE or an authority-fence axis name appears for SD-LEO-INFRA-BIND-OBSERVE-ONLY-001 (or any requires_human_action=TRUE SD) via the CASCADE path after the fix ships, confirmed via a live post-merge check against the baseline: 7 pre-existing rows as of 2026-08-16T02:46:39Z, all rejection_reason="Prerequisite preflight failed: SMOKE_TEST_BYPASSED, SUBAGENT_EVIDENCE_MISSING" or GATE_CLAIM_VALIDITY/NO_CLAIM (HandoffOrchestrator.js prerequisite-preflight layer, which runs before BaseExecutor Step 1.9 -- a separate, pre-existing, unrelated harness issue this SD does not fix; see feedback for the follow-up)';
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
