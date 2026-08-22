#!/usr/bin/env node
// Correct SD-LEO-INFRA-FLEET-DOWN-ALERT-001's scope after LEAD-phase prospective TESTING review
// (sub_agent_execution_results 71955e26-f9e8-4e17-a7eb-dde8b6878d79, CONDITIONAL_PASS/88) found the
// originating incident directive's stated root cause was false: active_count is already
// last_tool_at-derived (not heartbeat-derived), and the real defect is a ~3h detection latency, not
// blindness. Rewrites title/description/scope/key_changes/strategic_objectives/risks/
// success_criteria/smoke_test_steps to the corrected understanding before any PRD is authored.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'c7b9020f-d7ee-4b27-b395-272c69f0a1a1';

const title = 'Fleet-down alert v2: close the ~3h freeze-detection latency gap + ship the missed GROUP-BY-HOST binding constraint';

const description = `FOLLOW-UP to SD-LEO-INFRA-FLEET-DEAD-MAN-001 (completed 2026-08-21 19:05Z). CORRECTED SCOPE (LEAD-phase prospective TESTING review, sub_agent_execution_results 71955e26-f9e8-4e17-a7eb-dde8b6878d79, verdict CONDITIONAL_PASS/88): the originating incident directive's stated root cause ("heartbeat-derived active_count, blind to a heartbeating-but-frozen seat") is FALSE. fleet_worker_pulse.active_count is ALREADY last_tool_at-derived (scripts/fleet-worker-pulse.mjs -> lib/fleet/genuine-worker.mjs liveFleetWorkers -> lib/fleet/stuck-seat-predicate.cjs classifySeat, shipped by SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001) -- re-keying it would be a REGRESSION (the seventh last_tool_at discriminant genuine-worker.mjs's own docblock warns against). The REAL, measured defect: FREEZE_CUT_MINUTES defaults to 120min (FLEET_FREEZE_CUT_MINUTES unset in every workflow/env), so a frozen seat is not classified STUCK for 2 full hours, then evaluateFleetDownAlert needs 3 more consecutive zero pulses (~45min) before paging -- simulated and corroborated against live fleet_worker_pulse rows bracketing the actual 19:20-19:29Z incident (19:14Z=6, 19:39Z=5, 20:00Z=5, 20:33Z=6 -- active_count never even reached 0). First page would have landed ~166-181min after the freeze started, not never -- a latency defect, not a blindness defect. SEPARATELY, the Solomon GROUP-BY-HOST binding constraint (stamped BINDING while SD-LEO-INFRA-FLEET-DEAD-MAN-001 was in flight) genuinely never shipped -- the relay directive sat unread 216 minutes while that SD completed -- and stays in scope unchanged, now with two production-measured guards the original framing lacked: naive grouping would create 11 permanently-"down" groups from ephemeral runnervm* GitHub Actions hosts + test fixtures + NULL hostnames (12 distinct hostnames total, only 1 -- Legion-Laptop -- has live population) and would page every 15min tick unbounded unless filtered; and the existing edge-trigger dedup (recordFleetDeadManVerdict) reads a single GLOBAL row via limit(1), so adding a host field to the WRITE without adding the matching .eq() to the READ scrambles per-host dedup state across hosts.`;

const scope = `IN SCOPE: (FR-1) recalibrate FLEET_FREEZE_CUT_MINUTES (and/or evaluateFleetDownAlert's REQUIRED_CONSECUTIVE) using measured false-positive data against real legitimate-parked-silence samples -- prior LEAD-phase measurement (n=33) showed 15min=57.6% FP, 30min=36.4% FP, 45min=3.0% FP, >=90min=0% FP; PLAN/EXEC must corroborate with a larger sample before locking a specific number, respecting classifySeat's own "no uncalibrated default" design discipline rather than hand-picking one. (FR-2) GROUP BY claude_sessions.hostname for the freeze-detection chain, filtered to exclude ephemeral runnervm* Actions hosts, test-fixture hosts, and NULL-hostname rows; per-host system_events verdict rows (mirrors recordFleetDeadManVerdict, corrected to scope its READ by host, not just its WRITE); a cause-classifier seam (host-dead vs session-limit-frozen) as an injectable extensibility point, not a fully-engineered off-host reachability system (none exists yet in this codebase to reuse). (FR-3) a regression-LATENCY test (not a vacuous fires/doesn't-fire check against the unrelated checkFleetDeadMan arm): replay the real 5-seat 19:20-19:29Z shape as a synthetic fixture (no live history table retains the actual point-in-time state) against the ACTUAL broken chain (liveFleetWorkers -> active_count -> evaluateFleetDownAlert), asserting the OLD 120min+45min latency and the NEW recalibrated latency, extending -- not duplicating -- tests/unit/fleet/fleet-down-pager-freeze-reachability.test.js's existing projecting-fake pattern so a hostname column addition can't silently go unselected in production while the test stays green. (FR-4) explicitly document checkFleetDeadMan's continued COEXISTENCE (not replacement) -- it covers a distinct class (total row absence) the freeze-chain structurally cannot (a vanished row has no last_tool_at to be stale).

OUT OF SCOPE (explicit deletions from the original incident-driven framing, per Q8 scope-reduction audit): re-implementing signal selection (last_tool_at vs heartbeat) -- already correctly shipped, would have been pure regression; a fully-engineered off-host reachability/cause-classifier system -- ships as an injectable seam only; the auto-continue actuator (separate, chairman-ratification-gated SD); changing heartbeat semantics.`;

const key_changes = [
  { change: 'Recalibrate FLEET_FREEZE_CUT_MINUTES (lib/fleet/genuine-worker.mjs) and/or evaluateFleetDownAlert REQUIRED_CONSECUTIVE (scripts/fleet-down-alert.mjs) from measured false-positive data, closing the ~166-181min real page latency toward a documented, evidence-calibrated target', impact: 'A real freeze (proven live: 5 seats, 19:20-19:29Z) pages the chairman in tens of minutes instead of ~3 hours' },
  { change: 'GROUP BY claude_sessions.hostname in the freeze-detection chain, filtered to exclude ephemeral runnervm* Actions hosts / test fixtures / NULL hostnames, with per-host system_events verdict rows whose READ is scoped by host (fixing the existing global-limit(1) read/write mismatch)', impact: 'Ships the Solomon BINDING constraint the parent SD missed; a live second host (cloud pilot P2) can no longer mask a fully-dead first host, and does not create 11 permanently-alarming ghost groups' },
  { change: 'A regression-latency test replaying the real 19:20-19:29Z 5-seat shape against the actual liveFleetWorkers -> active_count -> evaluateFleetDownAlert chain (not the unrelated checkFleetDeadMan arm), extending the existing fleet-down-pager-freeze-reachability.test.js fixture pattern', impact: 'Proves the fix closes a measured latency gap rather than asserting a vacuous fires/does-not-fire against the wrong predicate' },
  { change: 'Document checkFleetDeadMan (total row-absence class) and the freeze-chain (row-present-but-frozen class) as intentionally coexisting, non-overlapping detectors', impact: 'Prevents a future SD from reading these as redundant and deleting one, silently losing coverage of the other class' },
];

const strategic_objectives = [
  'Close a measured ~3-hour real detection-latency gap in the fleet-down alarm, proven live by the 19:20-19:29Z 5-seat freeze incident',
  'Ship the Solomon GROUP-BY-HOST binding constraint that was missed during SD-LEO-INFRA-FLEET-DEAD-MAN-001 due to a 216-minute unread relay directive',
  'Do NOT regress the already-correct last_tool_at-based signal selection shipped by SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001',
];

const risks = [
  { risk: 'A tightened FLEET_FREEZE_CUT_MINUTES / REQUIRED_CONSECUTIVE introduces false-positive pages for seats doing legitimate long-running work (e.g. a slow npm install, a long test suite)', impact: 'medium', likelihood: 'medium', mitigation: 'Corroborate the LEAD-phase n=33 false-positive sample with a larger PLAN/EXEC-phase measurement before locking a threshold; classifySeat already refuses an uncalibrated default by design -- respect that discipline rather than hand-picking a number' },
  { risk: 'Naive GROUP BY hostname pages on every tick for ephemeral GitHub-Actions runner hosts or test fixtures that are correctly, permanently absent', impact: 'high', likelihood: 'high without mitigation', mitigation: 'Exclude runnervm*, test-fixture hostnames, and NULL hostnames at the query -- confirmed via live measurement: 12 distinct hostnames total, only 1 (Legion-Laptop) has live production population' },
  { risk: 'Adding a host dimension to the existing edge-trigger dedup (recordFleetDeadManVerdict) without correcting its single-global-row limit(1) READ scrambles per-host alarm state across hosts', impact: 'medium', likelihood: 'high without mitigation', mitigation: 'Scope the READ by host (.eq on the payload host field) to match the WRITE, verified by a dedicated multi-host dedup test' },
];

const success_criteria = [
  { criterion: 'A synthetic replay of the real 19:20-19:29Z 5-seat freeze shape (last_tool_at stale, loop_state=active, heartbeat_at fresh) demonstrably pages faster under the recalibrated threshold than the current shipped ~166-181min chain', measure: 'Unit test asserts old-vs-new latency-to-page against liveFleetWorkers -> active_count -> evaluateFleetDownAlert, not against checkFleetDeadMan' },
  { criterion: 'Per-host verdict rows are visible off-host and correctly scoped', measure: 'system_events rows carry a host field; a dedicated test proves two hosts cannot clobber each other\'s edge-trigger dedup state' },
  { criterion: 'Ephemeral/non-production hostnames never form a persistent down-group', measure: 'Unit test seeds runnervm*/test-fixture/NULL hostname rows and asserts zero alarm groups form for them' },
  { criterion: 'checkFleetDeadMan is unmodified in behavior and explicitly documented as covering the row-absence class', measure: 'Existing checkFleetDeadMan tests remain green unmodified; new docblock/comment states the division of labor' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Run the new regression-latency test replaying the real 19:20-19:29Z 5-seat freeze shape', expected_outcome: 'Test shows the OLD threshold would page at ~166-181min and the NEW recalibrated threshold pages materially faster, both against the real liveFleetWorkers/evaluateFleetDownAlert chain' },
  { step_number: 2, instruction: 'Seed a fixture with 2 hosts: one with all-stale last_tool_at, one healthy', expected_outcome: 'Only the stale host produces a per-host down verdict; the healthy host does not mask it and is not itself falsely flagged' },
  { step_number: 3, instruction: 'Seed ephemeral runnervm*/test-fixture/NULL hostname rows alongside the above', expected_outcome: 'Zero alarm groups form for the ephemeral/fixture/NULL rows' },
];

async function main() {
  const { data: before, error: beforeErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata')
    .eq('id', SD_ID)
    .single();
  if (beforeErr) { console.error('Pre-read failed:', beforeErr.message); process.exit(1); }

  const metadata = {
    ...(before.metadata || {}),
    lead_scope_correction: {
      corrected_at: new Date().toISOString(),
      testing_agent_lead_evidence_id: '71955e26-f9e8-4e17-a7eb-dde8b6878d79',
      wrong_sd_id_used_in_first_dispatch: 'c188b2e8-0bc8-4971-81af-46c6a487f4df',
      original_premise: 'active_count is heartbeat-derived, blind to a heartbeating-but-frozen seat',
      corrected_premise: 'active_count is already last_tool_at-derived (SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001); the real defect is a ~166-181min detection latency from FREEZE_CUT_MINUTES defaulting to 120min plus REQUIRED_CONSECUTIVE=3 pulses (~45min)',
    },
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      title, description, scope, key_changes, strategic_objectives, risks,
      success_criteria, smoke_test_steps, scope_reduction_percentage: 45,
      metadata,
    })
    .eq('id', SD_ID)
    .select('id, sd_key, title')
    .single();
  if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }
  console.log('Updated SD:', JSON.stringify(data, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
