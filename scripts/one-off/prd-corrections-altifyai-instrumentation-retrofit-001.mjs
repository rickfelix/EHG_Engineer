#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 -- PLAN-phase PRD corrections from
 * TESTING's PLAN-TO-EXEC prospective review (sub_agent_execution_results e7445772, FAIL 90),
 * independently re-verified against live code/DB before applying:
 *
 *  - gateType:'chairman_gate' is INVALID -- recordGateAttempt()'s GATE_TYPE_MAP
 *    (lib/eva/artifact-persistence-service.js:499) has no entry for it, so it falls through
 *    unmapped and violates the table's CHECK (gate_type IN ('entry','exit','kill')). Corrected
 *    to 'stage_gate' (maps to 'exit'), matching the existing call sites' convention for a
 *    stage-exit gate.
 *  - _handleChairmanGate() has 5 distinct return paths that all produce the identical
 *    {blocked:false,killed:false,approved:true} shape: autonomy auto-approve (line ~2381),
 *    governance auto-approve (line ~2388), fixture-venture skip (line ~2460), an
 *    already-resolved chairman_decisions row (line ~2473), and a freshly-resolved decision via
 *    waitForDecision (line ~2502). Only the last two are genuine chairman decisions. As
 *    originally scoped, FR-1 would mislabel every autonomy/governance/fixture auto-approval
 *    fleet-wide as chairman_adjudicated. Corrected: added FR-1a requiring _handleChairmanGate()
 *    to tag its return value with the actual decision source, and narrowed FR-1's new
 *    recordGateAttempt() call to fire ONLY when that source is a genuine chairman decision.
 *  - TESTING's claim that the migration is unapplied/PGRST202 was live-recheck FALSE: a direct
 *    RPC probe (open_eva_gate_attempt with a bogus venture_id) returned a foreign-key
 *    violation (23503), not PGRST202 -- proving the function IS live. The stale
 *    "@approved-by: PENDING" comment and code-comment claim of failure are themselves stale,
 *    not evidence of current unapplied state (the table independently holds 1182 live rows).
 *    Flagged as a documentation-staleness note, not a blocker.
 *  - Added the same non-fatal try/catch wrapper used at the 4 existing recordGateAttempt() call
 *    sites (TESTING's secondary finding).
 *  - Corrected TS-1/TS-2's test strategy: _advanceStage() is too large/entangled (7+ .from()
 *    tables, 4 dynamic imports) to unit-test directly by mocking supabase.rpc alone. Split
 *    into (a) an isolated unit test on _handleChairmanGate()'s new source-tagging return shape
 *    across all 5 branches, and (b) TS-3's existing call-count regression guard as the
 *    integration-level check that the new call site exists and reads the tag correctly.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001';
const CHECKED_IN_PATH = 'docs/prds/prd-altifyai-instrumentation-retrofit-001.json';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, risks, metadata')
  .eq('id', PRD_ID)
  .single();
if (readErr || !prd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const fr = structuredClone(prd.functional_requirements);
const tr = structuredClone(prd.technical_requirements);
const ts = structuredClone(prd.test_scenarios);
const risks = structuredClone(prd.risks);

// FR-1: fix gateType, add the try/catch requirement, and gate strictly on a genuine chairman decision.
const fr1 = fr.find((f) => f.id === 'FR-1');
fr1.description = fr1.description
  .replace("gateType: 'chairman_gate'", "gateType: 'stage_gate' (maps to 'exit' via recordGateAttempt()'s GATE_TYPE_MAP)")
  + " CORRECTION (TESTING, e7445772): the original gateType:'chairman_gate' is INVALID -- GATE_TYPE_MAP has no entry for it and it violates the table's CHECK(gate_type IN ('entry','exit','kill')). Use 'stage_gate' (maps to 'exit'). The new call must ALSO be wrapped in the same non-fatal try/catch pattern used at the 4 existing recordGateAttempt() call sites (lib/eva/eva-orchestrator.js:930,1316; stage-17-blueprint-review.js:471; artifact-persistence-service.js:636) -- a ledger-write failure must never block the real stage advance it is merely recording. CRITICAL: this call must fire ONLY when FR-1a's source tag confirms a genuine chairman decision (see FR-1a) -- NOT on every _gateApproved=true, which is also set by 3 other non-chairman auto-approval paths.";

// New FR-1a: _handleChairmanGate() must tag its return value's decision source.
fr.splice(fr.findIndex((f) => f.id === 'FR-1') + 1, 0, {
  id: 'FR-1a',
  title: '_handleChairmanGate() must tag its return value with the actual decision source',
  priority: 'critical',
  description: "_handleChairmanGate() (lib/eva/stage-execution-worker.js:2357) has 5 distinct return points that all currently produce the identical {blocked:false,killed:false,approved:true} shape: (1) autonomy auto-approve (~line 2381), (2) governance auto-approve via _canAutoAdvance (~line 2388), (3) fixture-venture skip (~line 2460), (4) an already-resolved chairman_decisions row found on re-entry (~line 2473), (5) a freshly-resolved decision via waitForDecision (~line 2502). Only (4) and (5) represent a genuine chairman decision; (1)-(3) are automated bypasses. Add a `source` field to every returned object (e.g. 'autonomy_auto_approve' | 'governance_auto_approve' | 'fixture_venture_skip' | 'chairman_decision') so FR-1's new recordGateAttempt() call site can distinguish them. Without this, FR-1 as originally scoped would mislabel every autonomy/governance/fixture auto-approval fleet-wide (not just AltifyAI) as chairman_adjudicated -- a MORE dishonest instrumentation defect than the one this SD exists to fix.",
  acceptance_criteria: [
    "Each of the 5 return points in _handleChairmanGate() carries a distinct, correct `source` value, verified by a unit test exercising all 5 branches independently.",
    "FR-1's new recordGateAttempt() call fires ONLY when source==='chairman_decision' -- a fixture exercising the other 4 sources produces ZERO new eva_stage_gate_attempts rows.",
  ],
});

// FR-3 (test coverage): correct the test strategy away from unit-testing _advanceStage() wholesale.
const fr3 = fr.find((f) => f.id === 'FR-3');
fr3.description += " CORRECTION (TESTING, e7445772): _advanceStage() is too large/entangled (7+ .from() table calls, 4 dynamic imports) to unit-test directly by mocking supabase.rpc alone. Split coverage into (a) an ISOLATED unit test on _handleChairmanGate()'s new source-tagging return shape (FR-1a's acceptance criteria) -- small, mockable, real function boundary -- and (b) TS-3's call-count regression guard as the integration-level check that the new recordGateAttempt() call site exists inside _advanceStage() and is gated on the source tag. Do NOT attempt a full behavioral unit test of _advanceStage() itself.";

// TR: fix gate_type, add try/catch requirement.
const tr1 = tr.find((t) => t.id === 'TR-1');
if (tr1) tr1.description += " CORRECTION: gateType must be 'stage_gate' (maps to 'exit'), never 'chairman_gate' (unmapped, violates the DB CHECK constraint).";
tr.push({
  id: 'TR-4',
  title: 'Non-fatal try/catch around the new recordGateAttempt() call, matching existing call sites',
  description: 'The new call inside _advanceStage() must be wrapped in a try/catch that logs and continues on failure, never blocking or reverting the real stage advance it records -- matching the pattern at all 4 existing recordGateAttempt() call sites.',
});
tr.push({
  id: 'TR-5',
  title: "_handleChairmanGate()'s decision-source tag is the single source of truth for 'is this a genuine chairman decision'",
  description: "No other heuristic (e.g. re-deriving from chairman_decisions table state independently in _advanceStage()) should be used to decide whether to call recordGateAttempt() -- avoids a second, potentially-diverging classification of the same event.",
});

// TS: correct TS-1/TS-2 test strategy, add the FR-1a source-tagging test.
const ts1 = ts.find((t) => t.id === 'TS-1');
if (ts1) {
  ts1.scenario = "_handleChairmanGate()'s new source tag is correct across all 5 return branches (autonomy auto-approve, governance auto-approve, fixture-venture skip, already-resolved chairman decision, freshly-resolved chairman decision)";
  ts1.expected = "Each branch, exercised independently against a mocked supabase client, returns the correct `source` value; only the two genuine-chairman branches return source='chairman_decision'.";
}
const ts2 = ts.find((t) => t.id === 'TS-2');
if (ts2) {
  ts2.scenario = "NEGATIVE / PRIMARY REGRESSION TEST: recordGateAttempt() is called ZERO times for any of the 3 non-chairman auto-approval/skip sources, even though _gateApproved=true is set for all 5 -- and exactly ONCE for a genuine chairman decision";
  ts2.expected = "A fixture asserting call count by source: 0 calls for autonomy_auto_approve/governance_auto_approve/fixture_venture_skip, 1 call for chairman_decision -- proving the mislabeling risk TESTING found is closed.";
}
ts.push({
  id: 'TS-5',
  scenario: 'The new recordGateAttempt() call uses gateType=\'stage_gate\' (not the invalid \'chairman_gate\') and is wrapped in a non-fatal try/catch',
  type: 'unit',
  expected: "A mocked recordGateAttempt() throwing an error does not propagate out of _advanceStage() or block the real stage UPDATE; the call args include gateType:'stage_gate'.",
});

// Risks: document the corrected mechanism + the stale-docs note.
risks.push({
  risk: "TESTING's live-recheck found the migration comment '@approved-by: PENDING' and a code comment claiming recordGateAttempt() always fails with PGRST202 are themselves STALE -- a live RPC probe confirmed the function is callable (FK violation, not PGRST202) and the table holds 1182 live rows. A future reader trusting those comments without re-verifying would incorrectly believe this SD's dependency is unmet.",
  mitigation: 'This PRD records the live-verified contradiction; EXEC should also correct or remove the stale comments while touching this code, as a small drive-by fix.',
  severity: 'low',
});

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: fr,
    technical_requirements: tr,
    test_scenarios: ts,
    risks,
    metadata: {
      ...prd.metadata,
      plan_prd_correction: {
        performed_at: new Date().toISOString(),
        source: 'TESTING sub_agent_execution_results e7445772-d9a7-4381-a539-ee896ff1d012 (PLAN-TO-EXEC, FAIL 90)',
        summary: "Fixed invalid gateType ('chairman_gate' -> 'stage_gate'), added FR-1a requiring _handleChairmanGate() to tag its 5 return branches with the real decision source so FR-1 fires only on genuine chairman decisions (not autonomy/governance/fixture auto-approvals), corrected TS-1/TS-2's test strategy away from unit-testing the too-large _advanceStage() directly, added try/catch requirement (TR-4), and corrected a stale-migration-status claim TESTING made that a live RPC probe contradicted.",
      },
    },
  })
  .eq('id', PRD_ID);
if (updErr) { console.error('WRITE ERR', updErr.message); process.exit(1); }

// Sync the checked-in PRD JSON file so it doesn't drift from the live DB row (VALIDATION
// finding on the sibling SD-LEO-INFRA-SIGNAL-LANE-PER-001 -- fixed proactively this time).
const checkedIn = JSON.parse(readFileSync(CHECKED_IN_PATH, 'utf8'));
checkedIn.functional_requirements = fr;
checkedIn.technical_requirements = tr;
checkedIn.test_scenarios = ts;
checkedIn.risks = risks;
writeFileSync(CHECKED_IN_PATH, JSON.stringify(checkedIn, null, 2) + '\n');

console.log('OK: PRD corrected for', PRD_ID, '(DB + checked-in file synced)');
