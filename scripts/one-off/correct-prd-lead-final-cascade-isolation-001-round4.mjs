// SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 -- PRD correction round 4.
//
// testing-plan-cascade (PLAN-phase TESTING sub-agent) found two document-quality defects
// in the PRD, independently re-verified via direct DB read before acting (confirmed both,
// not stale claims):
//
// R1 (CRITICAL): TR-4's description still said "confirm during EXEC whether sd_type is also
// read by the classifier and include it if so" -- directly contradicting TR-5, which
// correctly explains (with live-measured evidence) why sd_type must NEVER be read. Same
// document, same audience (EXEC), opposite instructions on the exact decision that breaks
// findNextAvailableOrchestrator if gotten wrong. The EXEC-phase CODE was already correct
// (independently verified via git diff on all three picker files before this correction --
// this is a documentation defect, not a code defect), but a reader hitting TR-4 before TR-5
// would receive contradictory guidance. Fix: rewrite TR-4 to state the resolved decision
// directly instead of re-opening the question TR-5 already closed.
//
// R2 (MEDIUM): acceptance_criteria still described a two-picker, seven-scenario SD after
// FR-6/TS-8 (getNextReadyChild) were added following testing-plan-cascade's own F4 finding.
// AC#3 and AC#5 specifically would read green on incomplete work (the vacuous-AC class this
// PRD has otherwise been rigorous about) -- AC#3 never asserts the third picker exists, and
// AC#5 never asserts TS-8 exists, so neither would fail if FR-6/TS-8 were absent. AC#1 also
// still said "the last stdout line," the framing TS-6 was corrected to reject in favor of
// "the last HANDOFF_RESULT= occurrence" (a real distinction: printHandoffResultLines emits
// multiple lines, and HANDOFF_POST_ACTION= can legitimately print after HANDOFF_RESULT=,
// making "last line" and "last HANDOFF_RESULT= occurrence" different lines in that case).
//
// Not fixing (residual, documented rather than silently dropped): F6's concern that
// tests/integration/auto-chain-executor.test.js's live-DB assertions could shift once the
// filter lands (6/20 candidates become ineligible in a prior live measurement). Read that
// file directly: every assertion is structural/conditional (`if (result.sd) { expect(...
// toHaveProperty ...) }`), never hardcoded to a specific SD's identity, and the whole suite
// is describe.skipIf(!HAS_REAL_DB)-gated (tests/integration/, not tests/unit/ -- outside
// this PRD's AC#5 "handoff/cli test suite" scope, and requires an operator-designated
// non-production VITEST_DB_ALLOW_REF this session doesn't have readily available to run
// live). Judged low-risk on direct inspection, not verified by an actual live run --
// recorded as an accepted residual, not silently ignored.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('technical_requirements, acceptance_criteria')
  .eq('id', PRD_ID)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const tr = prd.technical_requirements.map((r) => {
  if (r.id !== 'TR-4') return r;
  return {
    ...r,
    description:
      "Both pickers' select() additions are scoped to exactly the columns classifyAllDispatchIneligibility needs for the CLAIM_WRITE_FENCE_AXES it checks (metadata) -- never sd_type (see TR-5 for why), and never a blanket select(*), to avoid pulling unrelated large/sensitive columns into a hot query path.",
  };
});

const trChanged = JSON.stringify(tr) !== JSON.stringify(prd.technical_requirements);

const ac = [
  'The LAST `HANDOFF_RESULT=` occurrence (and its accompanying `HANDOFF_POST_ACTION=` line, where applicable) in the stdout of `handoff.js execute LEAD-FINAL-APPROVAL <SD>` always belongs to that SD, never an unrelated cascaded SD -- not merely "the last stdout line," since printHandoffResultLines emits multiple lines and HANDOFF_POST_ACTION= can legitimately print after HANDOFF_RESULT=',
  'No auto-continue attempt is ever made on a fenced/deferred/human-action SD, via any of the three pickers (selectNextSD, findNextAvailableOrchestrator, getNextReadyChild)',
  'All three previously-unguarded cascade call sites (selectNextSD primary path, findNextAvailableOrchestrator fallback path, getNextReadyChild child-continuation path) are closed by this SD, not just one or two',
  'sd_phase_handoffs stays empty for BIND-OBSERVE-ONLY-001 (or any requires_human_action=TRUE SD) after the fix ships, confirmed via a live post-merge check',
  'All 8 new test scenarios (TS-1..TS-8) pass, plus the full pre-existing tests/unit/handoff/** test suite passes unmodified',
];

const acChanged = JSON.stringify(ac) !== JSON.stringify(prd.acceptance_criteria);

if (!trChanged && !acChanged) {
  console.log('NO_CHANGE — nothing to update');
  process.exit(0);
}

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({
    technical_requirements: tr,
    acceptance_criteria: ac,
    updated_at: new Date().toISOString(),
  })
  .eq('id', PRD_ID);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('PRD_CORRECTED', PRD_ID, { trChanged, acChanged });
