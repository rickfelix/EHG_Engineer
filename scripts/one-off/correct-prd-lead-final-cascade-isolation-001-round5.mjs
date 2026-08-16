// SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 -- PRD correction round 5.
//
// SECURITY EXEC review (S2, HIGH) found a FOURTH cascade picker,
// getReadyChildren (scripts/modules/handoff/child-sd-selector.js:249), reached from
// cli-main.js's parallel-team check BEFORE getNextReadyChild's own fence is ever reached.
// Fixed in commit bfa82ae8086. This round adds FR-7 for it, and updates TR-5/AC#3/AC#5
// (which still said "three pickers"/"7 new test scenarios") -- the same class of
// after-the-fact PRD drift testing-plan-cascade found and I fixed in round 4, recurring
// because the scope grew again after that fix landed.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, acceptance_criteria')
  .eq('id', PRD_ID)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const FR_7 = {
  id: 'FR-7',
  title: 'getReadyChildren (fourth picker, found by SECURITY EXEC S2) refuses a requires_human_action=TRUE candidate',
  priority: 'critical',
  description:
    "scripts/modules/handoff/child-sd-selector.js:249 getReadyChildren -- reached from cli-main.js's parallel-team check (=== PARALLEL TEAM CHECK ===, gated on ORCH_PARALLEL_CHILDREN_ENABLED, currently unset/latent) BEFORE getNextReadyChild's own fence is ever reached; its 'parallel' result returns early, skipping getNextReadyChild for that iteration entirely, and feeds parallel-team-spawner.js's worktree provisioning directly. It already selected metadata (pre-existing, for DAG construction) but never consulted it. Same fix shape as FR-1/FR-2/FR-6: filter via classifyAllDispatchIneligibility + CLAIM_WRITE_FENCE_AXES, inserted after the existing cadence-gate filter, applied to both the sequential (parallelEnabled:false) and parallel result branches.",
  acceptance_criteria: [
    'A child SD with metadata.requires_human_action=true is never included in getReadyChildren\'s returned children array, in either sequential or parallel mode',
    '[FAIL-OPEN REGRESSION GUARD]: a candidate combining sd_type=\'orchestrator\' with requires_human_action=true is still refused (catches a reversion to the first-match classifier, which CLAIM_WRITE_FENCE_AXES would not catch via orchestrator_parent alone)',
    'A normal (non-fenced) ready child is still selected exactly as before',
  ],
};

const fr = prd.functional_requirements.some((f) => f.id === 'FR-7')
  ? prd.functional_requirements
  : [...prd.functional_requirements, FR_7];

const tr = prd.technical_requirements.map((r) => {
  if (r.id !== 'TR-5') return r;
  return {
    ...r,
    title: 'sd_type is never read by any of the four pickers\' eligibility check (or, where pre-existing for an unrelated reason, is safely ignored by construction)',
    description:
      "orchestratorParent (claim-eligibility.cjs:191-193) reads row.sd_type and is the FIRST axis in the general classifier's ordered table -- live-measured to wrongly refuse 3/20 real orchestrator-type candidates if included via the first-match form. All four pickers (FR-1/FR-2/FR-6/FR-7 -- selectNextSD, findNextAvailableOrchestrator, getNextReadyChild, getReadyChildren) use classifyAllDispatchIneligibility + the CLAIM_WRITE_FENCE_AXES set (claim-eligibility.cjs:769) specifically because it is orchestrator-agnostic by construction -- never the general classifyDispatchIneligibility (first-match) form alone, which either breaks orchestrator selection (if sd_type is read) or silently fails open on a fenced+orchestrator-typed row (if sd_type is read AND the first-match short-circuit lands on orchestrator_parent before ever checking human_action_required -- SECURITY EXEC Q1, live-measured). getNextReadyChild and getReadyChildren both pre-existingly select sd_type for an unrelated reason (SD-type-aware workflow continuation / DAG construction); this is safe only because CLAIM_WRITE_FENCE_AXES excludes orchestrator_parent regardless of what is selected, not because sd_type is absent.",
  };
});

const ac = [
  prd.acceptance_criteria[0],
  'No auto-continue attempt is ever made on a fenced/deferred/human-action SD, via any of the four pickers (selectNextSD, findNextAvailableOrchestrator, getNextReadyChild, getReadyChildren)',
  'All four previously-unguarded cascade call sites (selectNextSD primary path, findNextAvailableOrchestrator fallback path, getNextReadyChild sequential child-continuation path, getReadyChildren parallel child-continuation path) are closed by this SD',
  prd.acceptance_criteria[3],
  'All new test scenarios (TS-1..TS-8 plus the FR-7/getReadyChildren coverage and both [FAIL-OPEN REGRESSION GUARD] fixtures) pass, plus the full pre-existing tests/unit/handoff/** test suite passes unmodified',
];

const frChanged = JSON.stringify(fr) !== JSON.stringify(prd.functional_requirements);
const trChanged = JSON.stringify(tr) !== JSON.stringify(prd.technical_requirements);
const acChanged = JSON.stringify(ac) !== JSON.stringify(prd.acceptance_criteria);

if (!frChanged && !trChanged && !acChanged) {
  console.log('NO_CHANGE — nothing to update');
  process.exit(0);
}

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: fr,
    technical_requirements: tr,
    acceptance_criteria: ac,
    updated_at: new Date().toISOString(),
  })
  .eq('id', PRD_ID);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('PRD_CORRECTED', PRD_ID, { frChanged, trChanged, acChanged });
