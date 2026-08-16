import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, metadata')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

const fr = prd.functional_requirements;
const tr = prd.technical_requirements;
const ts = prd.test_scenarios;

// TESTING PLAN-phase review (evidence 0d731625-a720-4978-b69c-7607d9a20ca9), live-reproduced,
// independently re-verified by direct read before writing this correction. Two CRITICAL,
// EXEC-blocking findings, both confirmed real:
//
// F1: TR-4 deferred "confirm during EXEC whether sd_type is also read" -- TESTING actually ran
// this live (n=20 real candidates) and found sd_type IS read by orchestratorParent, the FIRST
// axis in claim-eligibility.cjs's INELIGIBILITY_AXES table (fires before humanActionRequired).
// Including sd_type in the widened select and running the general classifier would make
// findNextAvailableOrchestrator -- whose entire purpose is finding ORCHESTRATOR sd_type rows --
// refuse its own legitimate targets (measured: 3/20 candidates wrongly refused with
// 'orchestrator_parent'). Metadata-only classification is correct (5 human_action_required + 1
// needs_coordinator_review, zero collisions). Fix: do NOT run the general classifier at all --
// use the narrower, already-exported CLAIM_WRITE_FENCE_AXES set + classifyAllDispatchIneligibility
// (the exact pattern already used this way at claim-eligibility.cjs:814), which excludes
// orchestrator_parent by construction and additionally catches needs_coordinator_review/
// not_before_hold/lead_blocker_active/chairman_ratification_pending -- axes the narrower
// human_action_required-only check (validation-agent's earlier suggestion) would have missed.
//
// F2: handleExecuteCommand is called via bare lexical intra-module reference at 5 sites in
// cli-main.js (L1026/1097/1120/1199/1225) -- vi.mock cannot intercept a same-module direct call.
// Precedent proves the trap already exists live: tests/unit/handoff/standalone-sd-chaining.test.js
// claims to test "the chaining logic in cli-main.js" but never imports cli-main.js at all -- it
// tests the pickers instead. Fix: extract the cache/reprint mechanism into its own EXPORTED,
// injectable function (its job -- cache a result, guarantee its reprint via try/finally -- does
// NOT itself need to call handleExecuteCommand, so it can be unit-tested by injecting a FAKE loop
// body). TS-6 (the LEAD-FINAL-APPROVAL HANDOFF_POST_ACTION-ordering check) genuinely needs the
// real cli-main.js + execution-helpers.js interaction and is retyped as integration, not unit.
//
// Also folded in: F3 (no pure formatter exists for the reprint -- displayExecutionResult does DB
// writes and cannot be safely re-called), F4 (a THIRD unguarded picker, getNextReadyChild at
// child-sd-selector.js:41 -> cli-main.js:1225, zero human-action checks -- independently confirmed
// via direct read), F5 (TS-3's "byte-identical" framing is false and unexecutable as worded), F7
// (a fixture mock omitting .range() silently fails open), F8 (assert the LAST HANDOFF_RESULT=
// occurrence specifically, not "the last stdout line" -- other legitimate lines like
// HANDOFF_POST_ACTION can and should follow it).
//
// Considered and EXCLUDED from scope, stated rather than silently dropped: cli-main.js:1199's
// completedSD.parent_sd_id cascade (a child completing triggers its OWN parent's LEAD-FINAL-
// APPROVAL) is a structurally different, already-intentional parent/child relationship, not an
// "unrelated SD from a queue" pick -- TESTING's own trace did not flag it alongside the three real
// pickers (selectNextSD, findNextAvailableOrchestrator, getNextReadyChild), and it is out of this
// SD's scope on that basis.

const fr1 = fr.find((f) => f.id === 'FR-1');
fr1.description = "scripts/modules/handoff/queue-selector.js:33's selectNextSD, reached via executeAutoChain whenever a session context exists, currently selects ('id, sd_key, title, status, priority, parent_sd_id, category, current_phase') -- no metadata column, no eligibility check of any kind. Widen the select to include metadata ONLY (never sd_type -- see FR-1 AC below for why), then filter candidates via classifyAllDispatchIneligibility(candidateRow).find(r => CLAIM_WRITE_FENCE_AXES.has(r)) (lib/fleet/claim-eligibility.cjs:769,814 -- the narrower authority-fence predicate, NOT the general classifyDispatchIneligibility), skipping any candidate the fence catches.";
fr1.acceptance_criteria = [
  "A candidate with metadata.requires_human_action=true is never returned by selectNextSD, even when it is otherwise the top-ranked candidate",
  "sd_type is deliberately NOT added to the select or read by the eligibility check -- the general classifier's orchestratorParent axis (claim-eligibility.cjs:191-193, fires FIRST in the axis table) would wrongly refuse this picker's own legitimate orchestrator-type targets if sd_type were included (live-measured: 3/20 real candidates wrongly refused). Using classifyAllDispatchIneligibility + CLAIM_WRITE_FENCE_AXES (claim-eligibility.cjs:769) rather than the general classifier avoids this by construction.",
  "The fenced fixture uses sd_type:'infrastructure' (matching the real specimen, BIND-OBSERVE-ONLY-001) with metadata.requires_human_action=true, and the test asserts via classifyAllDispatchIneligibility(row).find(r => CLAIM_WRITE_FENCE_AXES.has(r)) against the REAL function (never a stub) -- a call-count-only assertion would pass identically against the blind, un-widened-select version",
  "A normal (non-fenced) candidate is still selected exactly as before -- same selected candidate id/sd_key as pre-fix, not a byte-identical row object (the widened select necessarily adds a metadata field to the returned shape)",
];

const fr2 = fr.find((f) => f.id === 'FR-2');
fr2.description = "scripts/modules/handoff/orchestrator-completion-hook.js:153-210's findNextAvailableOrchestrator, reached only on the EXIT_NO_SESSION fallback path, currently selects ('id, sd_key, title, status, priority, parent_sd_id') -- also no metadata column, also no eligibility check. Same fix shape and same sd_type exclusion as FR-1 (this function's entire purpose is finding orchestrator-type rows, so including sd_type in the eligibility check would break it identically). Compose the CLAIM_WRITE_FENCE_AXES filter with the existing claimed-SD exclusion loop.";
fr2.acceptance_criteria = [
  "A candidate with metadata.requires_human_action=true is never returned by findNextAvailableOrchestrator, even when it is the highest-priority unclaimed candidate",
  "sd_type is deliberately NOT added to this picker's select either, for the identical reason as FR-1 AC #2 -- this function selects orchestrator-type SDs by design (status/parent_sd_id filter), and the general classifier's orchestratorParent axis would refuse its own subject",
  "The existing claimed-SD exclusion (SD-MAN-INFRA-CLAIM-AUTO-PROCEED-001) continues to work unmodified -- the new CLAIM_WRITE_FENCE_AXES filter is additive to it, not a replacement",
  "Fixture and assertion form identical to FR-1's corrected AC #3: sd_type:'infrastructure', real classifyAllDispatchIneligibility + CLAIM_WRITE_FENCE_AXES, never a stub",
  "A normal (non-fenced, unclaimed) candidate is still selected exactly as before (same id, not byte-identical row)",
];

fr.push({
  id: 'FR-6',
  title: 'getNextReadyChild (third, previously-unnamed picker) refuses a requires_human_action=TRUE candidate',
  priority: 'critical',
  description: 'scripts/modules/handoff/child-sd-selector.js:41 getNextReadyChild, reached from cli-main.js:1225, has ZERO human-action or eligibility checks today (independently confirmed by direct read) -- a third real cascade path this SD had not scoped before TESTING found it. Same fix shape as FR-1/FR-2: widen its select to include metadata (never sd_type, same reasoning), filter via classifyAllDispatchIneligibility + CLAIM_WRITE_FENCE_AXES.',
  acceptance_criteria: [
    'A child SD with metadata.requires_human_action=true is never returned by getNextReadyChild',
    'Fixture and assertion form identical to FR-1/FR-2: sd_type-appropriate fixture, real classifier, CLAIM_WRITE_FENCE_AXES membership check',
    'A normal (non-fenced) ready child is still selected exactly as before',
  ],
});

const fr3 = fr.find((f) => f.id === 'FR-3');
fr3.description = "cli-main.js's chaining loop caches the ORIGINAL SD's handoff result before any cascade attempt and guarantees its reprint via a NEW, separately EXPORTED, TESTABLE function (not inline try/finally logic embedded directly in the loop) -- e.g. runWithGuaranteedReprint(loopBody, reprintFn) -- whose own job (cache a result, run a loop body, unconditionally reprint the cache in a finally block) does not itself call handleExecuteCommand, so it can be unit-tested by injecting a FAKE loop body rather than needing to mock a same-module lexical call (TESTING found vi.mock cannot intercept handleExecuteCommand's 5 same-module call sites -- confirmed live precedent: tests/unit/handoff/standalone-sd-chaining.test.js claims to test cli-main.js's chaining logic but never imports that file). The reprint itself needs a genuine PURE formatter extracted from execution-helpers.js's displayExecutionResult (which currently ALSO performs DB writes and cannot be safely re-called for formatting alone) -- e.g. formatHandoffResultLine(result), reused by both the original call site and the reprint. For LEAD-FINAL-APPROVAL specifically, the reprint preserves BOTH HANDOFF_RESULT and the subsequent HANDOFF_POST_ACTION=ship line (execution-helpers.js:396) in their original order.";
fr3.acceptance_criteria = [
  "A new exported function (runWithGuaranteedReprint or equivalent) is unit-testable in isolation: a fixture loop body that throws, and a fixture loop body that returns early (modeling the parallelExecution early-return), both still trigger the reprint -- proven WITHOUT mocking handleExecuteCommand at all",
  "A new pure formatter function is extracted from displayExecutionResult's DB-writing implementation, used by BOTH the original print call site and the reprint, so the two can never drift into different output formats",
  "TS-6 (LEAD-FINAL-APPROVAL, HANDOFF_POST_ACTION ordering) is explicitly an INTEGRATION test running the real cli-main.js against a real (or realistically faked) LEAD-FINAL-APPROVAL execution -- not a unit test relying on mocked internals",
  "The reprint assertion checks for the LAST occurrence of the string 'HANDOFF_RESULT=' in stdout, not merely 'the last line' -- a legitimate line (HANDOFF_POST_ACTION=ship) can and should follow it",
];

const fr4 = fr.find((f) => f.id === 'FR-4');
fr4.description = fr4.description.replace(
  'Kept (not dropped)',
  'Kept (not dropped, and now covers three pickers -- selectNextSD, findNextAvailableOrchestrator, getNextReadyChild -- not two)'
);

const fr5 = fr.find((f) => f.id === 'FR-5');
fr5.description = 'Regression coverage for all previously-unguarded pickers (now three, per FR-6) and all reprint exit shapes, via the testable seam FR-3 introduces.';
fr5.acceptance_criteria = [
  'New test asserts selectNextSD excludes a fenced candidate (real classifier, CLAIM_WRITE_FENCE_AXES) and still selects a normal candidate by the same id as before this fix',
  'New test asserts findNextAvailableOrchestrator excludes a fenced candidate identically, composed correctly with its existing claimed-SD filter',
  'New test asserts getNextReadyChild excludes a fenced candidate identically (FR-6)',
  'New unit test (via the FR-3 seam) asserts the reprint fires on a thrown loop body AND on an early-returning loop body, without mocking handleExecuteCommand',
  'New INTEGRATION test (TS-6) asserts HANDOFF_POST_ACTION=ship is not orphaned for a real LEAD-FINAL-APPROVAL cascade attempt',
  'Every test fixture whose mock supabase client is queried with chained methods (e.g. .range()) implements every method the real query chain calls -- a mock silently missing a method must not fail open and make its assertion vacuous',
];

tr.push({
  id: 'TR-5',
  title: 'sd_type is never read by any of the three pickers eligibility check',
  description: "orchestratorParent (claim-eligibility.cjs:191-193) reads row.sd_type and is the FIRST axis in the general classifier's ordered table -- live-measured to wrongly refuse 3/20 real orchestrator-type candidates if included. All three pickers (FR-1/FR-2/FR-6) use classifyAllDispatchIneligibility + the CLAIM_WRITE_FENCE_AXES set (claim-eligibility.cjs:769) specifically because it is orchestrator-agnostic by construction -- never the general classifyDispatchIneligibility/classifyAllDispatchIneligibility(...).includes('human_action_required') form alone, which either breaks orchestrator selection (if sd_type is read) or misses legitimate sibling fence reasons like needs_coordinator_review (if it is not).",
});

const ts1 = ts.find((t) => t.id === 'TS-1');
ts1.expected = "Fixture: sd_type:'infrastructure', metadata.requires_human_action=true (mirrors the real BIND-OBSERVE-ONLY-001 specimen). Using the REAL classifyAllDispatchIneligibility (ctx-free): the fenced candidate is never returned by selectNextSD, confirmed via classifyAllDispatchIneligibility(row).find(r => CLAIM_WRITE_FENCE_AXES.has(r)) being non-null for the fenced row. sd_type is NOT part of the select or the check. If a lower-priority non-fenced candidate exists, it is returned instead (same id as pre-fix); if none exists, the function returns its documented no-candidate result.";

const ts2 = ts.find((t) => t.id === 'TS-2');
ts2.expected = "Same fixture shape and assertion form as TS-1 (CLAIM_WRITE_FENCE_AXES membership, sd_type excluded), for the fallback picker -- existing claimed-SD filter still composes correctly alongside it.";

const ts3 = ts.find((t) => t.id === 'TS-3');
ts3.scenario = 'Regression pin: normal-path candidate selection returns the SAME candidate id/sd_key before and after the fix, for all three pickers';
ts3.expected = "Given a candidate set with zero fenced rows, all three pickers (selectNextSD, findNextAvailableOrchestrator, getNextReadyChild) select the exact same candidate id/sd_key, in the exact same order, as they did before the eligibility filter was added -- NOT 'byte-identical' (the widened select necessarily adds a metadata field to the returned row shape, so the returned OBJECT differs; only the SELECTED IDENTITY must match).";

const ts4 = ts.find((t) => t.id === 'TS-4');
ts4.type = 'unit';
ts4.scenario = 'The FR-3 reprint seam (runWithGuaranteedReprint or equivalent) fires on a thrown loop body';
ts4.expected = 'Unit test, injecting a FAKE loop body that throws -- NOT calling or mocking handleExecuteCommand at all. The cached original result is still reprinted via the finally block.';

const ts5 = ts.find((t) => t.id === 'TS-5');
ts5.type = 'unit';
ts5.scenario = 'The FR-3 reprint seam fires on an early-returning loop body (models the parallelExecution early return)';
ts5.expected = 'Unit test, injecting a FAKE loop body that returns early -- same seam, same no-mock-of-handleExecuteCommand approach. The cached original result still reprints.';

const ts6 = ts.find((t) => t.id === 'TS-6');
ts6.type = 'integration';
ts6.scenario = 'LEAD-FINAL-APPROVAL specifically, real cli-main.js + execution-helpers.js, with a cascade attempt in play';
ts6.expected = "Retyped from unit to INTEGRATION (TESTING found handleExecuteCommand's 5 same-module call sites cannot be vi.mock'd -- proven live precedent: standalone-sd-chaining.test.js claims to test this file but never imports it). Named test harness runs the real chaining path. Assert the LAST occurrence of the literal string 'HANDOFF_RESULT=' in stdout belongs to the original SD, and that a subsequent 'HANDOFF_POST_ACTION=ship' line (if the original handoff type is LEAD-FINAL-APPROVAL) is present and follows it in order -- not 'the last stdout line' generically.";

ts.push({
  id: 'TS-8',
  type: 'unit',
  scenario: 'getNextReadyChild (FR-6) refuses a requires_human_action=TRUE candidate',
  expected: 'Same fixture shape and assertion form as TS-1/TS-2, for the third picker.',
});

const metadata = {
  ...(prd.metadata || {}),
  round3_testing_review: {
    evidence_row: '0d731625-a720-4978-b69c-7607d9a20ca9',
    note: 'CRITICAL F1 (sd_type/orchestratorParent axis collision, live-measured) and F2 (handleExecuteCommand cannot be vi.mock-ed, proven live precedent) both independently re-verified and folded in. F4 (getNextReadyChild, a 3rd unguarded picker) added as FR-6. cli-main.js:1199 (parent-cascade-on-child-completion) considered and excluded -- structurally different from an unrelated-SD pick, not flagged by TESTING alongside the 3 real pickers.',
    recorded_at: new Date().toISOString(),
  },
  estimated_loc: 240,
  estimated_loc_basis: 'round 3 (TESTING-corrected): THREE pickers (not two) each need widened select + CLAIM_WRITE_FENCE_AXES filter + fixture (~40 LOC each = 120); a new exported, unit-testable reprint seam + its own 2 fixtures (~45); a pure formatter extracted from displayExecutionResult (~20); delimiting log block (~15); TS-6 retyped as integration with a named harness (~30); TS-3 regression pin across 3 pickers (~10). Total ~240.',
};

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, technical_requirements: tr, test_scenarios: ts, metadata })
  .eq('id', PRD_ID);
if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

console.log('PRD round-3 corrected: CLAIM_WRITE_FENCE_AXES (not sd_type-inclusive general classifier), testable reprint seam, 3rd picker (FR-6), TS-3/TS-6 precision fixes.');
