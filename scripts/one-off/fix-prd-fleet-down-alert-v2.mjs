#!/usr/bin/env node
// Correct the PRD for SD-LEO-INFRA-FLEET-DOWN-ALERT-001 after PLAN-phase prospective TESTING
// review #2 (sub_agent_execution_results 3c884934-19b2-47f6-9221-dfbcfa2a13e4, CONDITIONAL_PASS/91)
// found:
//   F1 (BLOCKER): FR-2's "group Leg A AND Leg B by host" is dead by construction --
//     evaluateFleetDeadManPredicate's Leg B (global completions) short-circuits BEFORE Leg A is
//     read; a GLOBAL Leg B means any completion anywhere forces every host to read alive. Fix:
//     per-host verdict must be Leg-A-only (heartbeat); the EXISTING global Leg-A+Leg-B verdict is
//     unchanged and complementary.
//   F2 (HIGH): TR-3's name-pattern exclusion misses a real, unrecognized 12th hostname ('h', 1
//     row) -- needs a minimum-activity floor, not just pattern matching.
//   F3 (HIGH): FR-4's premise was backwards (truncation of an already-filtered dead host is a
//     no-op; the real risk direction is crowd-out of a LIVE host -> false positive). Live
//     measurement: 11 sessions, 60th-newest row ~21 days old -- .limit(60) is safe today. Downgrade
//     to a disclosed, non-blocking monitoring item.
//   F4: recordFleetDeadManVerdict is not exported and checkFleetDeadMan calls it with no host arg
//     today -- FR-3 is strictly downstream of FR-2's own parameter-threading work. No dedicated
//     test suite for recordFleetDeadManVerdict exists (FR-3's AC#3 was factually wrong).
//   F5 (MEDIUM): FR-5's premise was FALSE -- checkWorkerFleetDown sends EMAIL (Resend), never SMS.
//     "Triple SMS paging" is unreachable by construction. Rescoped into FR-2 (host-qualified
//     dedupeKey) rather than kept as a separate FR chasing a non-existent problem.
//   F6: an existing dedupeKey namespace + durable-obligation-upsert mechanism already provides
//     collision-avoidance infrastructure (chairman-sms-gate/index.js) -- reuse it, don't invent one.
//   F7: FREEZE_CUT_MINUTES and FLEET_DEAD_MAN_WINDOW_MIN both default to 120 by coincidence --
//     FR-1 needs an explicit non-target stating it does not touch FLEET_DEAD_MAN_WINDOW_MIN.
//   F8 (MEDIUM): TS-1's fixture description didn't match evaluateFleetDownAlert's actual edge-
//     trigger mechanics (needs 3 zero pulses + a 4th prior non-zero row); corrected + noted it
//     extends the existing test file rather than being new.
//   F9 (LOW): existing verdict rows lack a host payload key -- first post-deploy tick reads
//     "no prior row -> assume alive" for every host (fail-open, acceptable, now disclosed).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-FLEET-DOWN-ALERT-001';

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Recalibrate the SHARED FREEZE_CUT_MINUTES constant (lib/fleet/genuine-worker.mjs:59-62) from measured false-positive data, closing the ~166-181min real page latency.',
    description: 'FREEZE_CUT_MINUTES defaults to 120min (FLEET_FREEZE_CUT_MINUTES unset in every workflow/env). It is read at 3 sites: scripts/fleet-worker-pulse.mjs (pager), lib/governance/drive-state/axes/fleet-health.cjs, and scripts/fleet-dashboard.cjs. Recalibrating must change the SHARED constant (or its env override), not fork a pager-only threshold. NON-TARGET (TESTING review #2, F7): FLEET_DEAD_MAN_WINDOW_MIN (scripts/fleet-down-alert.mjs, the separate checkFleetDeadMan arm) currently defaults to the SAME value (120) by coincidence, not by shared configuration -- do NOT conflate the two constants or change them together; genuine-worker.mjs\'s own docblock already warns about this collision class. Corroborate the LEAD-phase n=33 false-positive sample with a larger EXEC-phase sample before locking a value; classifySeat already refuses an uncalibrated default by design.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'FLEET_FREEZE_CUT_MINUTES (or the FREEZE_CUT_MINUTES fallback) is set to a value chosen from a measured false-positive sample of at least n=50, documented in the PR description',
      'The SAME constant value is observed by all 3 read sites (pager, drive-health axis, dashboard) -- verified by a test',
      'FLEET_DEAD_MAN_WINDOW_MIN is explicitly untouched by this FR -- a comment or test confirms the two constants remain independently configurable',
      'The regression-latency test (FR-6) demonstrates the new value pages materially faster than the current ~166-181min baseline',
    ],
  },
  {
    id: 'FR-2',
    requirement: 'Add a per-host, HEARTBEAT-ONLY (Leg A only) liveness check inside checkFleetDeadMan (scripts/fleet-down-alert.mjs:381-433), grouped by claude_sessions.hostname with a minimum-activity floor exclusion, WITHOUT changing the existing global Leg-A+Leg-B verdict.',
    description: 'CORRECTED per TESTING review #2 (F1, BLOCKER): strategic_directives_v2 has no hostname column and no usable session FK (active_session_id populated on 1 of 500 completed SDs; claiming_session_id on 0) -- Leg B (completions) structurally CANNOT be host-attributed. evaluateFleetDeadManPredicate\'s existing `if (completions > 0) return {dead:false}` short-circuit runs BEFORE Leg A is read; with a global Leg B, any completion by ANY host would force every host to read alive, so a naive "group both legs by host" ships a feature that can never fire (live-corroborated: all 5 most recent fleet_dead_man_verdict rows are alive via this exact short-circuit). FIX: introduce a NEW per-host check that reads ONLY Leg A (zero heartbeats for that host in the window) -- it does not consult completions at all, and does not replace or modify the existing global verdict (which keeps its Leg-A+Leg-B combination unchanged, still catching the "fleet stuck but nobody even checking in anywhere" case it was built for). evaluateFleetDeadManPredicate itself is NOT modified; a new, separate per-host evaluation path is added alongside it. Hostname exclusion (TESTING review #2, F2): pattern-matching alone (/^runnervm/i, fixture denylist, NULL) misses real unrecognized one-off hostnames (measured: a 12th hostname \'h\', 1 row, matches none of the 3 patterns) -- add a MINIMUM-ACTIVITY FLOOR (e.g. a host must have N heartbeats in a recent window to be eligible for alerting) so an unrecognized single-row host cannot ghost-page forever. Per TESTING review #2 (F5/F6): a per-host SMS send (if/when this new arm sends one) must use a host-qualified dedupeKey following the EXISTING dedupeKey namespace convention already shipped for the other 2 SMS-sending arms (dead-coordinator-<hour>, fleet-dead-man-<hour> at fleet-down-alert.mjs:204,320, consumed via a durable-obligation upsert with onConflict dedupe_key,ignoreDuplicates at chairman-sms-gate/index.js:154,305) -- reuse this mechanism rather than inventing new cross-arm coordination.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'A new per-host check reads ONLY heartbeat presence (Leg A) for that host\'s sessions, grouped by hostname, and never consults strategic_directives_v2 completions',
      'The existing global evaluateFleetDeadManPredicate (Leg A + Leg B) is unmodified and continues to run as-is, unaffected by the new per-host check',
      'Hostname eligibility uses a minimum-activity floor (not pattern-matching alone) -- verified by a test seeding a real-but-unrecognized single-row hostname alongside runnervm*/fixture/NULL rows, asserting none of them form an alarm group',
      'A 2-host fixture (one all-stale-heartbeat, one healthy) produces a down-verdict only for the stale host',
      'Any new per-host SMS send uses a dedupeKey following the existing <arm>-<hour> convention, verified by a test',
    ],
  },
  {
    id: 'FR-3',
    requirement: 'Add a host parameter to recordFleetDeadManVerdict and checkFleetDeadMan\'s call site, and scope the read by host to match a host-scoped write. Export recordFleetDeadManVerdict for direct testability.',
    description: 'CORRECTED per TESTING review #2 (F4): recordFleetDeadManVerdict is NOT currently exported (scripts/fleet-down-alert.mjs:348), and checkFleetDeadMan calls it today with NO host argument (line 418) -- this FR is strictly DOWNSTREAM of FR-2\'s own per-host check existing first, since there is no host value to thread through until FR-2 produces one. The prior draft\'s claim of an "existing single-host/global test suite for recordFleetDeadManVerdict" was factually wrong -- no dedicated suite exists; coverage today is only indirect via checkFleetDeadMan\'s own tests against a fake db.',
    priority: 'HIGH',
    acceptance_criteria: [
      'recordFleetDeadManVerdict accepts an optional host parameter and is exported from fleet-down-alert.mjs',
      'When a host is provided, the read query for the prior verdict includes a filter on that host (matching Supabase\'s existing in-file JSONB-filter precedent, e.g. .eq(\'metadata->>is_coordinator\', \'true\') at line 236) and the write payload includes the same host key',
      'A dedicated 2-host test (now importable) proves Host A transitioning does not affect Host B\'s own transitioned flag on the same run',
      'Calling recordFleetDeadManVerdict with no host argument (the existing global caller) behaves identically to today -- verified by re-running checkFleetDeadMan\'s existing test suite unmodified',
    ],
  },
  {
    id: 'FR-4',
    requirement: 'Document (not fix) fetchPulseSessions\' shared .limit(60) (scripts/fleet-worker-pulse.mjs:44) as a monitored, currently-safe value -- do not implement a behavior change without new evidence of risk.',
    description: 'CORRECTED per TESTING review #2 (F3): the original framing was backwards. liveFleetWorkers already excludes any seat with a stale heartbeat before the limit is ever applied, so truncating an already-dead host\'s rows is a no-op -- there is no "quiet-dead host hidden by truncation" failure mode. The REAL (opposite) risk is a live, busy host\'s rows crowding out ANOTHER live host\'s rows, causing an under-count -> a false POSITIVE (declaring the fleet down when it is not). Live measurement (TR-5 requirement, executed): only 11 concurrent sessions exist; the 60th-newest row is ~21 days old -- .limit(60) is safe today by a wide margin. Do not add a test that only pins this fact with no behavioral consequence (PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001).',
    priority: 'LOW',
    acceptance_criteria: [
      'A code comment at fetchPulseSessions documents the CORRECT risk direction (crowd-out of a live host, not truncation of an already-excluded dead host) and today\'s measured safety margin (11 sessions vs. limit 60)',
      'No behavior change is made to the limit value itself unless a live re-measurement during EXEC shows the concurrent-session count has grown materially closer to 60',
      'This item is tracked as a monitoring note in the SD risk register, not a blocking test',
    ],
  },
  {
    id: 'FR-5',
    requirement: 'Document checkFleetDeadMan\'s and the freeze/pager chain\'s complementary, non-overlapping roles directly in code comments, so a future SD does not read them as redundant.',
    description: 'checkFleetDeadMan (global Leg A+Leg B, unmodified by this SD) plus the new per-host Leg-A-only check (FR-2) are heartbeat-writer/host-death signals (rows persist -- 13,110 of them; a frozen-but-heartbeating seat keeps these arms reading alive). The freeze/pager chain (checkWorkerFleetDown via liveFleetWorkers/classifySeat, recalibrated by FR-1) is the row-present-but-clock-frozen signal. Neither "total row absence" framing from this SD\'s own earlier LEAD-phase draft was correct (validation-agent finding F4) -- rows never vanish; distinguish by WHAT each arm reads (heartbeat presence vs. last_tool_at freshness), not by row existence. checkWorkerFleetDown\'s delivery channel is EMAIL (Resend), NOT SMS (TESTING review #2, F5) -- the earlier "triple SMS paging" framing (formerly FR-5) was a false premise and has been dropped; there is no cross-arm SMS collision to prevent beyond FR-2\'s own dedupeKey-convention reuse.',
    priority: 'LOW',
    acceptance_criteria: [
      'A docblock comment above checkFleetDeadMan and above checkWorkerFleetDown/liveFleetWorkers states the corrected division of labor, cross-referencing each other by function name',
      'The comment explicitly notes checkWorkerFleetDown sends email (not SMS), to prevent a future reader from assuming a shared SMS channel across all 3 arms',
      'Existing checkFleetDeadMan and checkWorkerFleetDown tests remain green, unmodified in assertions (only comments change for this FR)',
    ],
  },
  {
    id: 'FR-6',
    requirement: 'A regression-latency test replaying the real 19:20-19:29Z 5-seat freeze shape against the actual liveFleetWorkers -> active_count -> evaluateFleetDownAlert chain, extending the existing test file rather than duplicating it.',
    description: 'CORRECTED per TESTING review #2 (F8): the fixture must produce a REAL sequence of fleet_worker_pulse rows matching evaluateFleetDownAlert\'s actual edge-trigger mechanics (requiredConsecutive zero-active_count pulses PLUS one prior non-zero pulse, per scripts/fleet-down-alert.mjs:136 const prior = rows[n]) -- not merely "stale session rows". tests/unit/fleet/fleet-down-pager-freeze-reachability.test.js:117-136 already exercises most of this chain (25 existing tests, all reachability-shaped); this test EXTENDS that file\'s existing projecting-fake pattern to add the OLD-vs-NEW threshold latency comparison specifically, which is the one dimension not already covered. Classify as integration-shaped (it crosses the fleet_worker_pulse table boundary), not pure unit.',
    priority: 'HIGH',
    acceptance_criteria: [
      'The fixture constructs a real pulse-row sequence (N zero-active_count rows + 1 prior non-zero row) matching evaluateFleetDownAlert\'s actual dedup logic, not just stale session rows',
      'The test is added to (not duplicated from) tests/unit/fleet/fleet-down-pager-freeze-reachability.test.js, reusing its existing projecting-fake',
      'The OLD threshold configuration reproduces the measured ~166-181min latency; the NEW recalibrated threshold pages materially faster on the identical fixture',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'FREEZE_CUT_MINUTES remains a single, shared constant read identically by all 3 known call sites. A pager-only fork requires explicit written justification in the PR description, not a silent divergence.',
    rationale: 'validation-agent (826bb1f9) confirmed a 3-site shared constant; forking it would let the same seat disagree across instruments.',
  },
  {
    id: 'TR-2',
    requirement: 'classifySeat\'s cutPointMinutes stays a REQUIRED function parameter with no in-code default. The new calibration value is supplied via FLEET_FREEZE_CUT_MINUTES / the FREEZE_CUT_MINUTES fallback constant, never hardcoded as a new default inside classifySeat itself.',
    rationale: 'The existing "no uncalibrated default" refusal (stuck-seat-predicate.cjs:96-101) is a deliberate design discipline against exactly the mistake this SD\'s original false premise almost repeated -- preserve it.',
  },
  {
    id: 'TR-3',
    requirement: 'Host eligibility for the new per-host check uses a minimum-activity floor (a host must have at least N heartbeats in a recent trailing window to be eligible) as the PRIMARY filter, with the runnervm*/test-fixture/NULL pattern exclusions as a secondary, defense-in-depth layer -- not the sole mechanism.',
    rationale: 'TESTING review #2 (F2) found a real, unrecognized 12th hostname (\'h\', 1 row) that pattern-matching alone would miss and which would ghost-page indefinitely; an activity floor catches any low-signal host regardless of its name shape.',
  },
  {
    id: 'TR-4',
    requirement: 'recordFleetDeadManVerdict\'s host-scoped mode must scope BOTH the read (filtering on the host key in the payload) and the write (payload includes host) -- a write-only host field is strictly worse than no host field at all.',
    rationale: 'Explore sub-agent (9f22f3c4) and validation-agent independently confirmed the current .limit(1) read has zero host filter; TESTING review #2 (F4) further confirmed the function is not exported and is called with no host argument today, so this must be built as new parameter-threading work, not a small patch.',
  },
  {
    id: 'TR-5',
    requirement: 'The per-host Leg A check introduced by FR-2 must NOT call, modify, or share mutable state with evaluateFleetDeadManPredicate (the existing global Leg-A+Leg-B function) -- it is a separate, additive code path.',
    rationale: 'TESTING review #2 (F1, BLOCKER) found that a shared/combined implementation would let the global Leg B short-circuit suppress the per-host signal entirely; keeping them structurally separate is the only way both signals remain independently meaningful.',
  },
  {
    id: 'TR-6',
    requirement: 'Any new per-host SMS send reuses the existing dedupeKey namespace convention (<arm-name>-<hour>, e.g. dead-coordinator-<hour>, fleet-dead-man-<hour>) and the existing durable-obligation-upsert mechanism (onConflict dedupe_key, ignoreDuplicates) rather than introducing a new cross-arm coordination mechanism.',
    rationale: 'TESTING review #2 (F6) found this mechanism already exists and already provides collision-avoidance; the originally-planned separate "suppression rule" (formerly FR-5) would have duplicated existing, working infrastructure.',
  },
];

const test_scenarios = [
  {
    id: 'TS-1',
    scenario: 'Replay a real pulse-row sequence matching the actual 19:20-19:29Z freeze shape (N zero-active_count pulses preceded by one non-zero pulse, per evaluateFleetDownAlert\'s real edge-trigger mechanics) against the OLD vs. NEW recalibrated threshold',
    test_type: 'integration',
    given: 'A synthetic fleet_worker_pulse row sequence: 1 non-zero prior pulse, then N consecutive zero-active_count pulses (N = requiredConsecutive under each threshold config), constructed from the real incident timeline rather than raw session staleness alone',
    when: 'evaluateFleetDownAlert is run against the sequence under the OLD (120min+3x15min) and NEW recalibrated threshold configs',
    then: 'The OLD threshold reproduces the measured ~166-181min first-page latency; the NEW threshold pages materially faster on the identical fixture',
  },
  {
    id: 'TS-2',
    scenario: 'A healthy fixture (fresh last_tool_at, fresh heartbeat_at, normal pulse pattern) never trips the alarm under the new recalibrated threshold',
    test_type: 'unit',
    given: 'All session rows and pulse rows show normal, non-stale activity',
    when: 'The chain is evaluated',
    then: 'No alarm fires (negative control against over-tightening)',
  },
  {
    id: 'TS-3',
    scenario: 'A 2-host fixture, one host with zero heartbeats in-window and one healthy, produces a per-host down-verdict (Leg-A-only) only for the stale host, without touching the existing global Leg-A+Leg-B verdict',
    test_type: 'unit',
    given: 'Two distinct hostnames, one with zero recent heartbeats, one fully healthy; a global completion exists elsewhere in strategic_directives_v2 (proving the global verdict\'s short-circuit is irrelevant to the new per-host check)',
    when: 'The new per-host Leg-A check evaluates the fixture',
    then: 'A down verdict is recorded for the stale host only; the existing global verdict (run separately, unmodified) still reads per its own Leg-A+Leg-B logic',
  },
  {
    id: 'TS-4',
    scenario: 'A real-but-unrecognized single-row hostname, alongside runnervm*/test-fixture/NULL rows, never forms a persistent alarm group',
    test_type: 'unit',
    given: 'Session rows seeded with runnervm*, known test-fixture names, NULL, and one genuine unrecognized one-off hostname (matching the live-measured \'h\' case), none meeting the minimum-activity floor, alongside one real active host',
    when: 'The per-host check evaluates hostname eligibility',
    then: 'Zero alarm groups form for any row failing the minimum-activity floor, regardless of whether its name matches a known exclusion pattern',
  },
  {
    id: 'TS-5',
    scenario: 'Per-host edge-trigger dedup: Host A transitioning dead->alive does not affect Host B\'s own transitioned flag on the same run',
    test_type: 'unit',
    given: 'recordFleetDeadManVerdict exported and accepting a host parameter (FR-3); two hosts, both previously recorded dead with a host-scoped payload; Host A\'s current sweep shows recovery, Host B\'s shows continued death',
    when: 'recordFleetDeadManVerdict runs for both hosts in the same tick',
    then: 'Host A is recorded transitioned=true; Host B is recorded transitioned=false; neither host\'s read is contaminated by the other\'s row',
  },
  {
    id: 'TS-6',
    scenario: 'fetchPulseSessions\' current .limit(60) is documented as safe at today\'s measured scale, with no behavior change required',
    test_type: 'unit',
    given: 'The live-measured concurrent session count (11) and the 60th-newest row age (~21 days)',
    when: 'The documentation comment is reviewed',
    then: 'The comment correctly states the crowd-out risk direction and today\'s safety margin -- no test asserts a currently-nonexistent failure mode',
  },
  {
    id: 'TS-7',
    scenario: 'A system_events write/read failure during the host-scoped verdict recording fails OPEN (treats it as a transition) rather than silently swallowing a real per-host outage',
    test_type: 'unit',
    given: 'A Supabase client double that returns an error on the system_events read for one host',
    when: 'recordFleetDeadManVerdict is called for that host',
    then: 'The function returns transitioned:true (fail-open, matching the existing global-mode behavior) and logs the failure loudly',
  },
  {
    id: 'TS-8',
    scenario: 'Calling recordFleetDeadManVerdict with no host argument (the pre-existing global call site) behaves identically to its pre-SD behavior',
    test_type: 'unit',
    given: 'The existing global caller pattern, unmodified',
    when: 'checkFleetDeadMan\'s existing (unmodified) test suite is re-run',
    then: 'All existing assertions pass unchanged -- host-awareness is additive, not a breaking change to the default path',
  },
];

const risks = [
  {
    risk: 'A tightened FLEET_FREEZE_CUT_MINUTES introduces false-positive pages for seats doing legitimate long-running work',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: 'Corroborate the LEAD-phase n=33 false-positive sample with a larger EXEC-phase sample (target n>=50) before locking a threshold value',
    rollback_plan: 'Revert FLEET_FREEZE_CUT_MINUTES to unset (falls back to the pre-SD 120min default) via a single env var change',
  },
  {
    risk: 'A per-host check that combines Leg A and Leg B (as originally drafted) would be dead by construction -- the global Leg B completions short-circuit fires before per-host Leg A is ever read, since strategic_directives_v2 has no hostname attribution',
    probability: 'HIGH (already true of the original draft, corrected in this revision)',
    impact: 'HIGH',
    mitigation: 'The per-host check is Leg-A-only (heartbeat presence), structurally separate from and non-interacting with the existing global evaluateFleetDeadManPredicate',
    rollback_plan: 'The new per-host check is fully additive (a new code path); reverting means removing that new path while the existing global verdict continues unaffected',
  },
  {
    risk: 'Pattern-based hostname exclusion (runnervm*/fixture/NULL) misses a real unrecognized one-off host, which would ghost-page indefinitely',
    probability: 'HIGH (confirmed live: hostname \'h\', 1 row, matches none of the 3 patterns)',
    impact: 'MEDIUM',
    mitigation: 'A minimum-activity floor is the primary eligibility filter; pattern exclusion is secondary/defense-in-depth',
    rollback_plan: 'Disable the per-host check via a feature flag, falling back to the pre-SD global-only checkFleetDeadMan behavior',
  },
  {
    risk: 'Adding a host dimension to the existing edge-trigger dedup without correcting its read scope scrambles per-host alarm state across hosts',
    probability: 'HIGH',
    impact: 'MEDIUM',
    mitigation: 'Scope the READ by host to match the WRITE, verified by TS-5; recordFleetDeadManVerdict is exported and parameterized to make this directly testable',
    rollback_plan: 'Revert recordFleetDeadManVerdict to its pre-SD unexported, no-host-argument form',
  },
  {
    risk: 'fetchPulseSessions\' shared .limit(60), if the fleet scales up significantly, could eventually crowd out a live host\'s rows (the CORRECTED risk direction -- not truncation of an already-dead host)',
    probability: 'LOW (measured today: 11 sessions vs. limit 60, wide margin)',
    impact: 'MEDIUM',
    mitigation: 'Documented as a monitoring note (FR-4); re-measure before making any behavior change; no action taken now since no current risk exists',
    rollback_plan: 'Not applicable -- no behavior change is made by this SD for this item',
  },
  {
    risk: 'The first tick after deploy, every host reads "no prior verdict row -> assume alive" since none of the 10 existing verdict rows carry a host payload key',
    probability: 'HIGH (guaranteed on first deploy)',
    impact: 'LOW',
    mitigation: 'This is the existing fail-open default (matches pre-SD behavior for the global case) -- acceptable and disclosed, not a regression',
    rollback_plan: 'No rollback needed; this is a one-time, self-resolving transition state after the first successful per-host tick',
  },
];

async function main() {
  const { data: before, error: beforeErr } = await supabase
    .from('product_requirements_v2')
    .select('metadata, system_architecture')
    .eq('id', PRD_ID)
    .single();
  if (beforeErr) { console.error('Pre-read failed:', beforeErr.message); process.exit(1); }

  const beforeArch = typeof before.system_architecture === 'string' ? JSON.parse(before.system_architecture) : before.system_architecture;
  const system_architecture = {
    ...beforeArch,
    components: [
      ...beforeArch.components,
      { name: 'evaluateFleetDeadManPredicate (unchanged)', responsibility: 'The EXISTING global Leg-A+Leg-B verdict function -- explicitly NOT modified by this SD; the new per-host check is a separate, additive code path that never calls or shares state with this function', technology: 'Node.js (scripts/fleet-down-alert.mjs)' },
    ],
  };

  const beforeMeta = typeof before.metadata === 'string' ? JSON.parse(before.metadata) : (before.metadata || {});
  const metadata = {
    ...beforeMeta,
    plan_prd_correction: {
      corrected_at: new Date().toISOString(),
      testing_agent_evidence_id_review2: '3c884934-19b2-47f6-9221-dfbcfa2a13e4',
      blocker_found_and_fixed: 'F1: FR-2 combining Leg A + Leg B by host was dead by construction (global Leg B short-circuit); per-host check is now Leg-A-only, structurally separate from the unmodified global verdict',
      false_premise_corrected: 'F5: checkWorkerFleetDown sends email not SMS -- the original FR-5 "triple SMS paging" framing was false and has been folded into FR-2 (dedupeKey reuse) and FR-5 (corrected documentation)',
    },
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements, test_scenarios, risks, system_architecture, metadata })
    .eq('id', PRD_ID)
    .select('id, status')
    .single();
  if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }
  console.log('PRD corrected:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
