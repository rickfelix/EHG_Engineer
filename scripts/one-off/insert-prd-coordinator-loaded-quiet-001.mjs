import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001';
const SD_UUID = 'e6db824d-e5e2-4f77-9e22-052f64f98db2';

const executive_summary =
  'Add a LOADED_AND_QUIET ~600s coordinator wake band (fleet fully claimed, belt empty by direct count, no pending directive) and fix the standard_loop:inbox registry interval it would otherwise blind.';

const functional_requirements = [
  {
    id: 'FR-1',
    requirement:
      "Make the periodic_process_registry standard_loop:inbox row's expected_interval_seconds durable at a value compatible with the new coordinator wake bands, or retire the row with provenance if the inbox check is folded fully into the quiet tick.",
    description:
      "The row is machine-derived: lib/periodic-liveness/enumerate-processes.mjs's parseStandardLoops() regex-scans scripts/coordinator-startup-check.mjs's STANDARD_LOOPS array (line 161-162, cron '*/2 * * * *') and cronToIntervalSeconds() converts it to 120s. scripts/seed-periodic-process-registry.mjs re-derives and upserts this value (and unconditionally resets currently_expected_active:true) on every seed run, so a DB-only edit to periodic_process_registry silently reverts. The durable fix edits the STANDARD_LOOPS cron string (or removes/retires the entry per the QF-20260830-100 precedent: currently_expected_active:false plus retired_at/retired_reason merged into the existing liveness_source_ref JSON column — there are no dedicated top-level retirement columns) so the next seed run does not clobber it.",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'STANDARD_LOOPS entry for inbox (scripts/coordinator-startup-check.mjs:161-162) is edited or removed, not just the DB row',
      'node scripts/seed-periodic-process-registry.mjs is re-run after the STANDARD_LOOPS edit and the registry read-back is pasted in the PR AFTER that re-seed, not immediately after a DB-only write',
      'periodic_process_registry.standard_loop:inbox.expected_interval_seconds × grace_multiplier(3) is >= the coordinator LOADED_AND_QUIET band max (660s), so a 600s-band tick never produces a false OVERDUE',
    ],
  },
  {
    id: 'FR-2',
    requirement:
      "Add a LOADED_AND_QUIET boolean input to lib/coordinator/quiet-tick.cjs's decideCadence(s) that, when true, yields a delay in [540,660] (coordinator-ratified band, chairman ratification f30d6fdc, coordinator_review.band_decision_seconds), phase-offset by s.partyOffsetS the same way the existing ACTIVE and hard-wake bands are, and never resolving to exactly PROMPT_CACHE_TTL_S (300 — structurally impossible here since 540 > 300, but keep the existing `if (delay === PROMPT_CACHE_TTL_S)` guard in place for defense-in-depth).",
    description:
      "decideCadence(s) is contractually PURE (no IO — module docstring) with three existing branches: hard-wake (s.hasUnactionedDirective || s.hasUndeliveredChairmanEscalation, 15-45s), quiescent (s.quiescent, <=900s), and active (else, 180-270s, optionally widened via s.desiredActiveS from QF-20260830-071/A3). This is a FOURTH, distinct branch — not a reuse of desiredActiveS — because desiredActiveS only widens the ACTIVE band's own ceiling (formula: [max(180,X-45), max(180,X)]), producing a 45s span anchored to whatever X the caller supplies, whereas LOADED_AND_QUIET needs an independent 120s span anchored at a coordinator-fixed floor (540) that must never collapse into the ACTIVE range. Reusing desiredActiveS would either shrink its span to 45s (violating the ratified band width) or require passing an ACTIVE-semantic parameter to represent a semantically different state (fleet-idle-vs-fleet-active), which is the exact 'two mechanisms for one lever, but mislabeled as one' failure VALIDATION warned against. Branch precedence inside decideCadence: hard-wake > quiescent > loaded-and-quiet > active (matches existing branch order plus one insertion point; predicate (d) 'no unactioned directive/escalation' is therefore already structurally enforced by hard-wake taking priority, and does not need separate encoding inside the new branch).",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'decideCadence({loadedAndQuiet:true, partyOffsetS:X, ...}) returns a value in [540,660] for every offset X, and never 300',
      'decideCadence({loadedAndQuiet:true, hasUnactionedDirective:true, ...}) still returns the 15-45s hard-wake value (branch order proof)',
      'decideCadence({loadedAndQuiet:true, quiescent:true, ...}) still returns the existing quiescent value (branch order proof)',
      'decideCadence(s) with loadedAndQuiet omitted/false is byte-identical to current output for every existing fixture in tests/unit/coordinator/quiet-tick.test.js',
    ],
  },
  {
    id: 'FR-3',
    requirement:
      'Compute the four LOADED_AND_QUIET predicate inputs from fresh DB reads in scripts/coordinator-quiet-tick.mjs main(), immediately before the decideCadence() call (~line 464-469), and inject the result as the new loadedAndQuiet boolean — never inside decideCadence itself.',
    description:
      "Predicate: (a) no live worker seat is idle (workers-from-gatherCapacityInputs all claimed), AND (b) direct OPEN_UNCLAIMED count = 0 (quick_fixes.status='open' AND claiming_session_id IS NULL, plus claimable SD drafts — distinct from gatherCapacityInputs()'s dispatchable-leaf claimableCount, per the coordinator's own 14d1b4c6 finding that claimableWithVerify alone missed QF-20260830-283), AND (c) claimableWithVerifyQfCount = 0, AND (d) !unactionedDirective && !undeliveredEscalation (already computed at coordinator-quiet-tick.mjs:~419, reused here — not recomputed). scripts/lib/capacity-inputs.mjs's gatherCapacityInputs() already returns idleNow, workers, openQfCount, claimableCount (beltExtent='dispatchable-leaf'), rawUnclaimed, and claimableWithVerifyQfCount — call it fresh at this point (it is not currently called anywhere in coordinator-quiet-tick.mjs) rather than hand-rolling new DB queries. This placement satisfies the coordinator's additional_amendment (ARM-time freshness, not tick-start-cached quiescent-style data): assessFleetActivity() runs at ~line 373 (tick start) while decideCadence executes at ~line 464, so a value computed at 373 and used at 464 would be stale by construction; computing loadedAndQuiet at ~464 avoids that gap entirely.",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'gatherCapacityInputs() is called in coordinator-quiet-tick.mjs main() immediately before decideCadence(), not reused from an earlier point in the tick',
      'predicate (b) counts BOTH rawUnclaimed quick_fixes (status=open, claiming_session_id IS NULL) AND claimable SD drafts, not claimableCount alone',
      'predicate (d) reuses the existing unactionedDirective/undeliveredEscalation values computed at ~line 419, no duplicate computation',
    ],
  },
  {
    id: 'FR-4',
    requirement:
      'Regression fixtures proving the new branch composes correctly with every existing branch, with byte-identical output when loadedAndQuiet is omitted.',
    description:
      'Mirror the existing regression-test shape at tests/unit/coordinator/quiet-tick.test.js:65-120 (the desiredActiveS precedent): omitted-input byte-identical test, wide-band-resolves-near-requested test, hard-wake-unaffected test, quiescent-unaffected test, never-300 test, floor-at-ACTIVE_MIN_S-equivalent test (floor at 540, not 180, for this band).',
    priority: 'HIGH',
    acceptance_criteria: [
      'One open unclaimed row present -> decideCadence returns the ACTIVE band even with every other loaded-and-quiet condition true (the regression guard the SD text explicitly calls for)',
      'One idle live seat present -> decideCadence returns the ACTIVE band',
      'All pre-existing quiet-tick.test.js cases pass unmodified',
    ],
  },
  {
    id: 'FR-5',
    requirement:
      'Two-sided live proof pasted in the PR after merge: one coordinator tick captured in a genuinely loaded-and-quiet state prints the widened [540,660] band, and one tick captured with a real open-unclaimed row prints the existing ACTIVE band.',
    description:
      'This is a live-system observation, not a unit test — success criterion 4 in the SD. Capture scripts/coordinator-quiet-tick.mjs stdout/log output (or the resulting nextWakeSeconds recorded to session state) for both states and paste both stamps in the PR description.',
    priority: 'HIGH',
    acceptance_criteria: [
      'Loaded-and-quiet tick stamp shows nextWakeSeconds in [540,660]',
      'Open-unclaimed-row tick stamp shows nextWakeSeconds in [180,270] (existing ACTIVE band)',
      'Both stamps include a timestamp and are pasted verbatim, not paraphrased',
    ],
  },
  {
    id: 'FR-6',
    requirement:
      "Before the widened band ships, add a fixture AND a live measurement proving a coordinator directive landing on a PARKED seat (long ScheduleWakeup delay already armed) still produces a hard-wake within the existing 15-45s window — not just at the moment the seat's own park interval naturally expires.",
    description:
      "Coordinator amendment_2 (metadata.coordinator_review.amendment_2, added 2026-08-30T16:32:56Z) found the [540,660] band's safety argument rests on an UNVERIFIED assumption: that a directive reaches a parked seat and hard-wakes it in 15-45s regardless of how long that seat is currently parked for. Live counter-evidence exists: seat 2b9045cc, parked with wake_delay_seconds=3600 since 15:59:34Z, did not wake on either of two coordinator directives (8b99f801 at 16:17:53Z, fb6eb27f at 16:23:40Z) sent 18 and 24 minutes into its park window — 27+ minutes unacked as of the finding. If a directive genuinely cannot reach a parked seat inside the hard-wake window, the exposure of the loaded-and-quiet band is the FULL band length (up to 660s of undelivered-directive latency), not the 15-45s the band was priced on, and per the coordinator's own gate the band 'must not ship... or must ship with the exposure restated honestly.'",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'Fixture: a decideCadence-style test asserts that hasUnactionedDirective/hasUndeliveredChairmanEscalation set TRUE on a session already parked at a long delay still resolves to the 15-45s hard-wake band, not the previously-armed delay',
      'Live measurement: send a real coordinator directive to a currently-parked worker seat and record the actual wall-clock time until that seat re-checks in; paste the timestamp pair (directive sent, seat checked in) in the PR',
      'If the live measurement shows the directive did NOT wake the seat within the hard-wake window, this SD does NOT ship the loaded-and-quiet band change — instead, the PR documents the finding, re-opens the band decision with the coordinator (per amendment_2 band_unchanged_for_now), and this FR becomes the blocking finding for a follow-up SD/QF fixing the underlying wake-delivery mechanism',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'lib/coordinator/quiet-tick.cjs decideCadence(s) remains a PURE function — no IO, no DB reads, no clock reads beyond what the caller supplies.',
    rationale:
      "The module docstring states this explicitly and the existing test strategy (tests/unit/coordinator/quiet-tick.test.js) pins behavior by calling decideCadence with synthetic inputs, never by observing live cron output. The LOADED_AND_QUIET boolean must be computed by the caller (scripts/coordinator-quiet-tick.mjs) and passed in, exactly like hasUnactionedDirective and hasUndeliveredChairmanEscalation already are.",
  },
  {
    id: 'TR-2',
    requirement: 'scripts/adam-quiet-tick.mjs is NOT modified by this SD — it stays on the current fixed decideCadence() inputs (line 1072).',
    rationale: 'SD deliverable (4) states this explicitly; Adam-seat cadence changes are out of scope for this SD, avoiding an unreviewed behavior change to a second caller of the same shared PURE function.',
  },
  {
    id: 'TR-3',
    requirement: "Predicate inputs (a)-(c) MUST come from scripts/lib/capacity-inputs.mjs's gatherCapacityInputs(), not hand-rolled Supabase queries.",
    rationale:
      "gatherCapacityInputs() is the single existing producer of idleNow/workers/claimableCount(dispatchable-leaf)/rawUnclaimed/openQfCount/claimableWithVerifyQfCount, already correctly distinguishing 'dispatchable-leaf' belt depth from raw unclaimed rows — a distinction the SD's own 'direct OPEN_UNCLAIMED count' language could otherwise be misimplemented against (VALIDATION finding F4).",
  },
  {
    id: 'TR-4',
    requirement: 'The standard_loop:inbox registry-interval fix (FR-1) lands in the SAME PR as the band-widening change (FR-2/FR-3), not a follow-up.',
    rationale:
      "VALIDATION explicitly recommends this ordering: the chairman ratification f30d6fdc treats the interval fix as 'one artifact, no ownerless precondition' — shipping the band widening first would blind the inbox liveness gauge for however long the follow-up takes.",
  },
];

const system_architecture = {
  overview:
    'Two coordinated changes to the existing coordinator quiet-tick cadence system: (1) a data-durability fix to periodic_process_registry so its self-stamped inbox liveness expectation matches the coordinator wake cadence that stamps it, and (2) a new PURE-function branch in the existing decideCadence() cadence decision function, fed by a freshly-computed boolean from existing capacity-input infrastructure.',
  components: [
    {
      name: 'decideCadence (lib/coordinator/quiet-tick.cjs)',
      responsibility:
        'PURE cadence decision function. Gains one new input (loadedAndQuiet boolean) and one new branch, inserted with precedence hard-wake > quiescent > loaded-and-quiet > active.',
      technology: 'Node.js CJS module, no dependencies',
    },
    {
      name: 'coordinator-quiet-tick.mjs main()',
      responsibility:
        'Orchestrates the coordinator tick: computes fresh loadedAndQuiet predicate immediately before calling decideCadence(), reusing gatherCapacityInputs() and the existing hasUnactionedDirective/hasUndeliveredChairmanEscalation values.',
      technology: 'Node.js ESM script',
    },
    {
      name: 'gatherCapacityInputs (scripts/lib/capacity-inputs.mjs)',
      responsibility: 'Existing, unmodified data-gathering function reused (not extended) to source predicate inputs (a)-(c) for loadedAndQuiet.',
      technology: 'Node.js ESM module, Supabase client',
    },
    {
      name: 'periodic_process_registry (Supabase table) + STANDARD_LOOPS (scripts/coordinator-startup-check.mjs)',
      responsibility:
        "Liveness-expectation registry for the standard_loop:inbox row, sourced from the STANDARD_LOOPS cron string via lib/periodic-liveness/enumerate-processes.mjs's parseStandardLoops()/cronToIntervalSeconds(). This SD edits the cron-string source-of-truth (or retires the entry with provenance), not the DB row directly.",
      technology: 'PostgreSQL (Supabase) + regex-derived config',
    },
  ],
  data_flow:
    'scripts/coordinator-quiet-tick.mjs main() -> gatherCapacityInputs(supabase) [fresh read] -> loadedAndQuiet boolean computed inline -> decideCadence({...existing inputs, loadedAndQuiet}) -> nextWakeSeconds -> ScheduleWakeup-equivalent arm + stampLastFired(standard_loop:quiet-tick). Separately: scripts/coordinator-startup-check.mjs STANDARD_LOOPS[inbox].cron -> lib/periodic-liveness/enumerate-processes.mjs parseStandardLoops()/cronToIntervalSeconds() -> scripts/seed-periodic-process-registry.mjs upsert -> periodic_process_registry.standard_loop:inbox.expected_interval_seconds -> scripts/periodic-liveness-watcher.mjs overdue-threshold check (expected_interval_seconds × grace_multiplier).',
  integration_points: [
    'lib/coordinator/quiet-tick.cjs decideCadence() — consumed by scripts/coordinator-quiet-tick.mjs (this SD) and scripts/adam-quiet-tick.mjs (untouched)',
    'scripts/lib/capacity-inputs.mjs gatherCapacityInputs() — newly consumed by coordinator-quiet-tick.mjs (previously only consumed by coordinator-capacity-forecast.mjs and other cron scripts)',
    'periodic_process_registry table — read by scripts/periodic-liveness-watcher.mjs for overdue detection, written by scripts/seed-periodic-process-registry.mjs',
  ],
};

const test_scenarios = [
  {
    id: 'TS-1',
    scenario: 'decideCadence resolves the loaded-and-quiet band when the new input is true',
    test_type: 'unit',
    given: 'loadedAndQuiet=true, quiescent=false, hasUnactionedDirective=false, hasUndeliveredChairmanEscalation=false, for a range of partyOffsetS values',
    when: 'decideCadence(s) is called',
    then: 'the returned delay is always in [540,660] and never equals 300',
  },
  {
    id: 'TS-2',
    scenario: 'An open unclaimed row forces the ACTIVE band even when every other loaded-and-quiet condition is met',
    test_type: 'unit',
    given: 'the caller computes loadedAndQuiet=false because direct OPEN_UNCLAIMED count > 0, with quiescent=false and no directive',
    when: 'decideCadence(s) is called with loadedAndQuiet=false',
    then: 'the returned delay is in the existing ACTIVE band [180,270], proving the regression guard the SD explicitly requires',
  },
  {
    id: 'TS-3',
    scenario: 'Existing fixtures are byte-identical when loadedAndQuiet is omitted',
    test_type: 'unit',
    given: 'every existing test case in tests/unit/coordinator/quiet-tick.test.js, unmodified',
    when: 'the suite is re-run after the code change',
    then: 'every existing assertion passes with no diff in expected output',
  },
  {
    id: 'TS-4',
    scenario: 'Branch precedence: hard-wake beats loaded-and-quiet',
    test_type: 'unit',
    given: 'loadedAndQuiet=true AND hasUnactionedDirective=true',
    when: 'decideCadence(s) is called',
    then: 'the returned delay is in the 15-45s hard-wake band, not [540,660]',
  },
  {
    id: 'TS-5',
    scenario: 'standard_loop:inbox registry interval survives a re-seed after the STANDARD_LOOPS edit',
    test_type: 'integration',
    given: 'the STANDARD_LOOPS cron entry for inbox has been edited (or removed) in scripts/coordinator-startup-check.mjs',
    when: 'node scripts/seed-periodic-process-registry.mjs is re-run',
    then: 'the periodic_process_registry.standard_loop:inbox row (or its retirement marker) reflects the edit and does NOT revert to the pre-edit 120s value',
  },
  {
    id: 'TS-6',
    scenario: 'A coordinator directive reaches a currently-parked worker seat within the hard-wake window (amendment_2 fixture)',
    test_type: 'integration',
    given: 'a worker session is parked with a long wake delay already armed (simulating a loaded-and-quiet-band park)',
    when: 'a coordinator directive is sent to that session',
    then: 'the session checks in within 15-45s of the directive, OR the PR documents that it did not and the loaded-and-quiet band ships restated/deferred per amendment_2',
  },
  {
    id: 'TS-7',
    scenario: 'Live two-sided proof after merge',
    test_type: 'e2e',
    given: 'the merged coordinator-quiet-tick.mjs running against real fleet state',
    when: 'one tick fires while the fleet is genuinely loaded-and-quiet, and a separate tick fires with a real open-unclaimed row present',
    then: 'the first tick logs nextWakeSeconds in [540,660] and the second logs nextWakeSeconds in [180,270], both pasted verbatim in the PR',
  },
];

const acceptance_criteria = [
  'standard_loop:inbox expected_interval_seconds in periodic_process_registry matches the coordinator wake band it is stamped by (or the row is retired with provenance), verified by a registry read pasted in the PR AFTER a seed re-run',
  'decideCadence returns the loaded-and-quiet band ONLY when every live worker seat holds a claim AND direct OPEN_UNCLAIMED count = 0 AND claimableWithVerify = 0 AND no unactioned directive/escalation; a fixture proves an open unclaimed row forces the ACTIVE band',
  'Existing fixtures pass byte-identical with the new input omitted; hard-wake (15-45s) and quiescent (<=900s) branches are unchanged; no delay ever equals 300',
  'Two-sided live proof after merge: one coordinator tick in a measured loaded-and-quiet state prints the widened band, and one tick with an open unclaimed row prints the ACTIVE band (both stamps pasted)',
  'Amendment_2 fixture + live measurement completed: a directive landing on a parked seat is proven to hard-wake within 15-45s, OR the band ships restated/deferred with the finding documented per the coordinator gate',
];

const risks = [
  {
    risk: "A DB-only edit to periodic_process_registry.standard_loop:inbox.expected_interval_seconds is silently reverted by the next run of scripts/seed-periodic-process-registry.mjs, because the value is re-derived from the STANDARD_LOOPS cron string every time (VALIDATION finding F10, severity CRITICAL).",
    probability: 'HIGH',
    impact: 'HIGH',
    mitigation: 'Edit the STANDARD_LOOPS cron entry (or remove it, retirement-style) as the durable source-of-truth change, and take the registry read-back AFTER re-running the seed script, never immediately after a raw DB write.',
    rollback_plan: 'Revert the STANDARD_LOOPS entry to its prior cron string and re-run the seed script; the registry row self-corrects on the next seed run.',
  },
  {
    risk: 'A coordinator directive cannot reliably reach and hard-wake a parked worker seat (amendment_2, live counter-evidence: seat 2b9045cc unresponsive to two directives for 27+ minutes). If true, the loaded-and-quiet band exposes up to 660s of undelivered-directive latency instead of the 15-45s it was priced on.',
    probability: 'MEDIUM',
    impact: 'HIGH',
    mitigation:
      'FR-6 requires a fixture AND a live measurement of directive-to-parked-seat wake latency before the band ships. This session independently observed a related symptom (ScheduleWakeup-requested delays not honored) and relayed the correlation to the coordinator for possible shared root cause.',
    rollback_plan:
      'If the live measurement shows the directive does not reach the parked seat within the hard-wake window, do NOT ship the band change in this PR — document the finding, leave decideCadence at its current three-branch form, and re-open the band decision with the coordinator per amendment_2.',
  },
  {
    risk: 'The LOADED_AND_QUIET predicate is computed from stale (tick-start-cached) data instead of fresh ARM-time reads, reproducing a failure mode the coordinator already saw twice today on unrelated predictive-deficit caps (cap-1788101756634, cap-1788104154714) voided purely for staleness inside a five-minute window.',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: 'FR-3 places the gatherCapacityInputs() call immediately before the decideCadence() invocation (~line 464), not reused from assessFleetActivity() at tick-start (~line 373).',
    rollback_plan: 'If staleness is observed post-merge, move the gatherCapacityInputs() call later in main() or add an explicit re-read guard immediately before decideCadence().',
  },
  {
    risk: 'A new caller-side band mechanism is added for loaded-and-quiet without addressing the existing desiredActiveS mechanism (QF-20260830-071/A3), leaving two overlapping band-widening mechanisms for coordinator cadence with unclear precedence for future maintainers.',
    probability: 'LOW',
    impact: 'MEDIUM',
    mitigation: 'TR-1/FR-2 explicitly document why loaded-and-quiet is a distinct branch (different predicate/semantics, different span requirement) rather than a desiredActiveS reuse, so the distinction is discoverable in code comments and this PRD rather than left implicit.',
    rollback_plan: 'N/A — this is a documentation/clarity risk, not a functional one.',
  },
];

const implementation_approach = {
  phases: [
    {
      phase: 'Phase 1: Registry durability fix',
      description: 'Edit the STANDARD_LOOPS cron entry (or retire it with provenance) for standard_loop:inbox so its expected_interval_seconds is compatible with the new coordinator wake bands, then re-seed and read back.',
      deliverables: ['STANDARD_LOOPS edit in scripts/coordinator-startup-check.mjs', 'Re-seeded periodic_process_registry row (or retirement marker)', 'Registry read-back pasted in PR'],
    },
    {
      phase: 'Phase 2: decideCadence loaded-and-quiet branch',
      description: 'Add the loadedAndQuiet input and [540,660] band branch to lib/coordinator/quiet-tick.cjs, with regression fixtures.',
      deliverables: ['Updated decideCadence()', 'New/updated tests in tests/unit/coordinator/quiet-tick.test.js'],
    },
    {
      phase: 'Phase 3: Fresh predicate wiring',
      description: 'Wire gatherCapacityInputs() and the loadedAndQuiet computation into scripts/coordinator-quiet-tick.mjs main(), immediately before the decideCadence() call.',
      deliverables: ['Updated coordinator-quiet-tick.mjs'],
    },
    {
      phase: 'Phase 4: Amendment_2 fixture + live measurement',
      description: 'Add the parked-seat directive-wake fixture and perform the live measurement against a real parked worker seat before the band ships.',
      deliverables: ['New fixture/test', 'Live measurement timestamps pasted in PR', 'Go/no-go decision on shipping the band vs. deferring per amendment_2'],
    },
    {
      phase: 'Phase 5: Two-sided live proof',
      description: 'Capture and paste the two live tick stamps required by FR-5/success criterion 4.',
      deliverables: ['Loaded-and-quiet tick stamp', 'ACTIVE-band tick stamp (open-unclaimed-row state)'],
    },
  ],
  technical_decisions: [
    'loadedAndQuiet is a NEW, distinct decideCadence branch rather than a reuse of desiredActiveS, because desiredActiveS only widens the ACTIVE ceiling with a 45s span tied to a caller-supplied maximum, while loaded-and-quiet needs an independent 120s span anchored at a fixed 540s floor representing a semantically different fleet state.',
    'Predicate inputs (a)-(c) are sourced from the existing gatherCapacityInputs() rather than new hand-rolled queries, reusing its dispatchable-leaf vs. raw-unclaimed distinction.',
    'The registry durability fix and the band-widening change ship in the same PR (chairman ratification treats them as one artifact with no ownerless precondition).',
    "Amendment_2's fixture/live-measurement requirement is treated as a ship-blocking gate for the band change itself, not an optional nice-to-have — if the live measurement fails, this PR ships the registry fix alone and documents the deferred band decision.",
  ],
};

const integration_operationalization = {
  consumers: [
    { name: 'Coordinator seat (scripts/coordinator-quiet-tick.mjs)', interaction: 'Calls decideCadence() every tick to determine its own next wake delay', frequency: 'Every coordinator tick (currently ~15x/hour when active)' },
    { name: 'Fleet workers / QF claimants', interaction: 'Indirectly affected: a longer coordinator wake cadence when loaded-and-quiet means dispatch/inbox processing latency increases in that state', frequency: 'Continuous, whenever the fleet is fully loaded and quiet' },
  ],
  dependencies: [
    { name: 'scripts/lib/capacity-inputs.mjs gatherCapacityInputs()', type: 'upstream', contract: 'Existing function, called with a fresh Supabase read; no signature change', failure_handling: 'Existing fail-soft/fail-open behavior in gatherCapacityInputs() is unchanged; a failure here should fail the loadedAndQuiet predicate to false (fall through to ACTIVE band), never to a false-true' },
    { name: 'periodic_process_registry / scripts/periodic-liveness-watcher.mjs', type: 'downstream', contract: 'The watcher reads expected_interval_seconds × grace_multiplier as its overdue threshold', failure_handling: 'If the registry fix does not land before the band widens, the watcher will report a false OVERDUE for standard_loop:inbox — this is the exact failure FR-1 exists to prevent' },
  ],
  data_contracts: [
    { contract_name: 'decideCadence(s) input object', schema: 'Adds one new optional boolean field: loadedAndQuiet (default false/undefined = current behavior)', validation: 'Pure function, no runtime schema validation; omitted field falls through to existing else-branch', versioning: 'Backward compatible — existing callers (adam-quiet-tick.mjs) unaffected' },
  ],
  runtime_config: {
    environment_variables: [],
    feature_flags: [],
    deployment_considerations: 'No new environment variables or feature flags; the change ships directly in lib/coordinator/quiet-tick.cjs and scripts/coordinator-quiet-tick.mjs. No deployment sequencing beyond normal PR merge (single-repo, no migration).',
  },
  observability_rollout: {
    monitoring: ['periodic_process_registry.standard_loop:inbox consecutive_miss_count and last_state (should remain 0/OK after the registry fix)', 'coordinator-quiet-tick.mjs tick logs / nextWakeSeconds values, observable via the live-proof stamps'],
    alerts: ['An OVERDUE state on standard_loop:inbox after this PR merges indicates the registry fix did not take effect (FR-1 regression)'],
    rollout_strategy: 'Single PR, no phased rollout — the band only activates under the narrow loaded-and-quiet predicate, so blast radius during a false-positive predicate is bounded to a longer-than-usual coordinator wake, not a missed dispatch (hard-wake still fires on any directive).',
    rollback_trigger: 'Amendment_2 live measurement shows a directive fails to hard-wake a parked seat, OR post-merge the standard_loop:inbox registry shows OVERDUE, OR the two-sided live proof (FR-5) cannot be produced.',
    rollback_procedure: 'Revert the decideCadence() branch addition and the coordinator-quiet-tick.mjs wiring (two self-contained commits); revert the STANDARD_LOOPS edit only if the retirement/interval change itself is implicated.',
  },
};

const exploration_summary = {
  files_read: [
    'lib/coordinator/quiet-tick.cjs',
    'tests/unit/coordinator/quiet-tick.test.js',
    'scripts/coordinator-quiet-tick.mjs',
    'scripts/lib/capacity-inputs.mjs',
    'scripts/coordinator-idle-qf-hint.mjs',
    'scripts/seed-periodic-process-registry.mjs',
    'scripts/coordinator-startup-check.mjs',
    'lib/periodic-liveness/enumerate-processes.mjs',
    'scripts/periodic-liveness-watcher.mjs',
    'scripts/adam-quiet-tick.mjs',
    'scripts/one-off/qf-100-retire-singleton-relaunch-registry.mjs',
    '.github/workflows/singleton-relaunch-cron.yml',
  ],
  patterns_identified: [
    'PURE-function cadence decision (decideCadence) fed by caller-computed booleans, never doing its own IO',
    'Caller-side band-widening via an optional numeric parameter (desiredActiveS, QF-20260830-071/A3) as a precedent, deliberately NOT reused here because the new band is a distinct predicate/semantics, not a widened existing band',
    'periodic_process_registry rows sourced from a cron-string-derived registry (STANDARD_LOOPS), making DB-only edits non-durable — a retire-with-provenance precedent exists (QF-20260830-100) using liveness_source_ref-embedded retired_at/retired_reason, no dedicated top-level columns',
  ],
  key_decisions: [
    'Insert the new loaded-and-quiet branch between quiescent and active in decideCadence, matching the SD-specified precedence hard-wake > quiescent > loaded-and-quiet > active',
    'Compute the predicate fresh, immediately before the decideCadence() call in coordinator-quiet-tick.mjs, to satisfy the coordinator ARM-time-freshness amendment',
    "Treat amendment_2's fixture+live-measurement requirement as ship-blocking for the band widening specifically (not for the registry fix, which can ship independently if the live measurement fails)",
  ],
  exploration_date: '2026-08-30',
};

const prd = {
  id: `PRD-${SD_UUID}`,
  directive_id: SD_UUID,
  sd_id: SD_UUID,
  title: 'Coordinator loaded-and-quiet wake band (burn-lever A9)',
  version: '1.0',
  status: 'approved',
  category: 'infrastructure',
  priority: 'high',
  executive_summary,
  functional_requirements,
  technical_requirements,
  system_architecture,
  test_scenarios,
  acceptance_criteria,
  risks,
  implementation_approach,
  integration_operationalization,
  exploration_summary,
  goal_summary: executive_summary,
  metadata: {
    sd_key: SD_KEY,
    mechanism_verifications: [
      { verified_by: 'Hotel (LEAD sub-agent VALIDATION, evidence f360b305)', verified_at: 'lib/coordinator/quiet-tick.cjs:65' },
      { verified_by: 'Hotel (LEAD sub-agent Explore, evidence 31c27540)', verified_at: 'scripts/coordinator-quiet-tick.mjs:464' },
    ],
  },
};

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: existing } = await supabase.from('product_requirements_v2').select('id').eq('id', prd.id).maybeSingle();
  if (existing) {
    const { error } = await supabase.from('product_requirements_v2').update(prd).eq('id', prd.id);
    if (error) throw error;
    console.log('Updated PRD:', prd.id);
  } else {
    const { error } = await supabase.from('product_requirements_v2').insert(prd);
    if (error) throw error;
    console.log('Inserted PRD:', prd.id);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
