import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002';
const SD_UUID = '7d23f04f-d468-41a2-be35-388def3a6025';
const PARENT_SD_KEY = 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001';
const PARENT_PRD_ID = 'PRD-e6db824d-e5e2-4f77-9e22-052f64f98db2';

const executive_summary =
  'Ship the deferred half of the coordinator loaded-and-quiet wake band: fix the standard_loop:inbox registry-interval durability (FR-1) and wire the already-shipped, already-tested computeLoadedAndQuiet() predicate into decideCadence() and coordinator-quiet-tick.mjs (FR-2/FR-3), with regression fixtures (FR-4) and a live two-sided proof (FR-5). FR-1..FR-5 are sourced verbatim (requirement/description/acceptance_criteria) from the parent PRD (PRD-e6db824d, SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001) — that SD shipped FR-7 (the inert predicate) only and deferred the rest here. Preemption for a parked worker seat (parent FR-6) is explicitly OUT of scope for this SD: the coordinator (session f2bf6022) recorded an explicit risk acceptance (session_coordination row 2dd84a5a-94db-401f-834c-f85d738dadb0, captured in this SDs metadata.risk_acceptance_b) accepting the full-band undelivered-directive exposure on the COORDINATOR seat (the seat whose park actually lengthens — see Risk R2 for the precise framing correction from this SDs own LEAD-phase VALIDATION pass, evidence c9d87f02).';

const functional_requirements = [
  {
    id: 'FR-1',
    priority: 'CRITICAL',
    requirement:
      "Make the periodic_process_registry standard_loop:inbox row's expected_interval_seconds durable at a value compatible with the new coordinator wake bands, or retire the row with provenance if the inbox check is folded fully into the quiet tick.",
    description:
      "The row is machine-derived: lib/periodic-liveness/enumerate-processes.mjs's parseStandardLoops() regex-scans scripts/coordinator-startup-check.mjs's STANDARD_LOOPS array (line 161-162, cron '*/2 * * * *') and cronToIntervalSeconds() converts it to 120s. scripts/seed-periodic-process-registry.mjs re-derives and upserts this value (and unconditionally resets currently_expected_active:true) on every seed run, so a DB-only edit to periodic_process_registry silently reverts. The durable fix edits the STANDARD_LOOPS cron string (or removes/retires the entry per the QF-20260830-100 precedent: currently_expected_active:false plus retired_at/retired_reason merged into the existing liveness_source_ref JSON column — there are no dedicated top-level retirement columns) so the next seed run does not clobber it. VERIFIED STILL LIVE at this SD's LEAD gate (VALIDATION evidence c9d87f02, VAL-2): the periodic_process_registry row currently reads expected_interval_seconds=900 due to a DB-only edit on 2026-09-01T21:26:53Z, which masks rather than fixes the gap — discoverStandardLoops() still derives 120s from the unedited STANDARD_LOOPS cron string, and the next seed run will revert 900 to 120. This FR is NOT satisfied by the current DB state; the STANDARD_LOOPS cron edit itself has not landed.",
    acceptance_criteria: [
      'STANDARD_LOOPS entry for inbox (scripts/coordinator-startup-check.mjs:161-162) is edited or removed, not just the DB row',
      'node scripts/seed-periodic-process-registry.mjs is re-run after the STANDARD_LOOPS edit and the registry read-back is pasted in the PR AFTER that re-seed, not immediately after a DB-only write',
      'periodic_process_registry.standard_loop:inbox.expected_interval_seconds × grace_multiplier(3) is >= the coordinator LOADED_AND_QUIET band max (660s), so a 600s-band tick never produces a false OVERDUE',
      'MUST land before or in the same PR as FR-2/FR-3 (never after) — shipping the band widening first arms a configuration that produces false OVERDUE the moment anyone re-seeds (this SD LEAD VALIDATION evidence c9d87f02)',
    ],
  },
  {
    id: 'FR-2',
    priority: 'CRITICAL',
    requirement:
      "Add a LOADED_AND_QUIET boolean input to lib/coordinator/quiet-tick.cjs's decideCadence(s) that, when true, yields a delay in [540,660] (coordinator-ratified band, chairman ratification f30d6fdc, coordinator_review.band_decision_seconds), phase-offset by s.partyOffsetS the same way the existing ACTIVE and hard-wake bands are, and never resolving to exactly PROMPT_CACHE_TTL_S (300 — structurally impossible here since 540 > 300, but keep the existing `if (delay === PROMPT_CACHE_TTL_S)` guard in place for defense-in-depth).",
    description:
      "decideCadence(s) is contractually PURE (no IO — module docstring) with three existing branches: hard-wake (s.hasUnactionedDirective || s.hasUndeliveredChairmanEscalation, 15-45s), quiescent (s.quiescent, <=900s), and active (else, 180-270s, optionally widened via s.desiredActiveS from QF-20260830-071/A3). This is a FOURTH, distinct branch — not a reuse of desiredActiveS — because desiredActiveS only widens the ACTIVE band's own ceiling (formula: [max(180,X-45), max(180,X)]), producing a 45s span anchored to whatever X the caller supplies, whereas LOADED_AND_QUIET needs an independent 120s span anchored at a coordinator-fixed floor (540) that must never collapse into the ACTIVE range. Branch precedence inside decideCadence: hard-wake > quiescent > loaded-and-quiet > active. Re-verified against the current tree at this SD's LEAD gate: decideCadence is 246 lines total, three branches at :68 (hard-wake), :76 (quiescent), :82 (active), never-300 guard at :96 — structurally ready for the fourth-branch insertion with no conflicting changes since the parent PRD was authored (VALIDATION evidence c9d87f02).",
    acceptance_criteria: [
      'decideCadence({loadedAndQuiet:true, partyOffsetS:X, ...}) returns a value in [540,660] for every offset X, and never 300',
      'decideCadence({loadedAndQuiet:true, hasUnactionedDirective:true, ...}) still returns the 15-45s hard-wake value (branch order proof)',
      'decideCadence({loadedAndQuiet:true, quiescent:true, ...}) still returns the existing quiescent value (branch order proof)',
      'decideCadence(s) with loadedAndQuiet omitted/false is byte-identical to current output for every existing fixture in tests/unit/coordinator/quiet-tick.test.js',
    ],
  },
  {
    id: 'FR-3',
    priority: 'CRITICAL',
    requirement:
      'Compute the four LOADED_AND_QUIET predicate inputs from fresh DB reads in scripts/coordinator-quiet-tick.mjs main(), immediately before the decideCadence() call (~line 464-469, re-verified at :478 as of this SD\'s LEAD gate), and inject the result as the new loadedAndQuiet boolean — never inside decideCadence itself.',
    description:
      "Predicate: (a) no live worker seat is idle (workers-from-gatherCapacityInputs all claimed), AND (b) direct OPEN_UNCLAIMED count = 0 (quick_fixes.status='open' AND claiming_session_id IS NULL, plus claimable SD drafts — distinct from gatherCapacityInputs()'s dispatchable-leaf claimableCount, per the coordinator's own 14d1b4c6 finding that claimableWithVerify alone missed QF-20260830-283), AND (c) claimableWithVerifyQfCount = 0, AND (d) !unactionedDirective && !undeliveredEscalation (already computed at coordinator-quiet-tick.mjs:~421-425, reused here — not recomputed). computeLoadedAndQuiet() (lib/coordinator/quiet-tick.cjs:219-230) already IS this predicate, shipped and unit-tested in the parent SD — this FR is the call-site wiring, not new predicate logic (parent FR-7 shipped the function with zero callers; this SD's VALIDATION evidence c9d87f02, VAL-5, confirms it remains uncalled as of the LEAD gate). scripts/lib/capacity-inputs.mjs's gatherCapacityInputs() already returns idleNow, workers, openQfCount, claimableCount (beltExtent='dispatchable-leaf'), rawUnclaimed, and claimableWithVerifyQfCount — call it fresh at this point rather than hand-rolling new DB queries; it is confirmed NOT currently called anywhere in coordinator-quiet-tick.mjs. This placement satisfies ARM-time freshness (assessFleetActivity() runs at tick start, well before the decideCadence() call; a value computed there would be stale by construction).",
    acceptance_criteria: [
      'computeLoadedAndQuiet() (lib/coordinator/quiet-tick.cjs:219-230) is imported and called in coordinator-quiet-tick.mjs main(), immediately before decideCadence() — not reimplemented inline',
      'gatherCapacityInputs() is called in coordinator-quiet-tick.mjs main() immediately before decideCadence(), not reused from an earlier point in the tick',
      'predicate (b) counts BOTH rawUnclaimed quick_fixes (status=open, claiming_session_id IS NULL) AND claimable SD drafts, not claimableCount alone',
      'predicate (d) reuses the existing unactionedDirective/undeliveredEscalation values computed at ~line 421-425, no duplicate computation',
    ],
  },
  {
    id: 'FR-4',
    priority: 'HIGH',
    requirement:
      'Regression fixtures proving the new branch composes correctly with every existing branch, with byte-identical output when loadedAndQuiet is omitted.',
    description:
      'Mirror the existing regression-test shape at tests/unit/coordinator/quiet-tick.test.js:65-120 (the desiredActiveS precedent): omitted-input byte-identical test, wide-band-resolves-near-requested test, hard-wake-unaffected test, quiescent-unaffected test, never-300 test, floor-at-ACTIVE_MIN_S-equivalent test (floor at 540, not 180, for this band). computeLoadedAndQuiet() already has 9 direct unit tests (tests/unit/coordinator/quiet-tick.test.js:32-72, one per input dimension, all passing per this SD\'s LEAD-gate baseline run) — this FR extends coverage to the NEW decideCadence branch and the call-site wiring, not the predicate itself.',
    acceptance_criteria: [
      'One open unclaimed row present -> decideCadence returns the ACTIVE band even with every other loaded-and-quiet condition true (the regression guard the SD text explicitly calls for)',
      'One idle live seat present -> decideCadence returns the ACTIVE band',
      'All pre-existing quiet-tick.test.js cases pass unmodified (baseline: 50/50 passing as of this SD\'s LEAD gate)',
      'A golden-baseline regression: a fixed matrix of decideCadence(s) inputs is hashed before and after the change; the hash is unchanged when loadedAndQuiet is omitted',
      'The existing never-300 sweep is extended to cover the new loaded-and-quiet arm, and explicitly asserts band separation (band min 540 > ACTIVE_MAX_S 270)',
    ],
  },
  {
    id: 'FR-5',
    priority: 'HIGH',
    requirement:
      'Two-sided live proof pasted in the PR after merge: one coordinator tick captured in a genuinely loaded-and-quiet state prints the widened [540,660] band, and one tick captured with a real open-unclaimed row prints the existing ACTIVE band.',
    description:
      'This is a live-system observation, not a unit test. Capture scripts/coordinator-quiet-tick.mjs stdout/log output (or the resulting nextWakeSeconds recorded to session state, logged in the QUIET_TICK= summary line) for both states and paste both stamps in the PR description.',
    acceptance_criteria: [
      'Loaded-and-quiet tick stamp shows nextWakeSeconds in [540,660]',
      'Open-unclaimed-row tick stamp shows nextWakeSeconds in [180,270] (existing ACTIVE band)',
      'Both stamps include a timestamp and are pasted verbatim, not paraphrased',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'lib/coordinator/quiet-tick.cjs decideCadence(s) remains a PURE function — no IO, no DB reads, no clock reads beyond what the caller supplies.',
    rationale:
      'The module docstring states this explicitly and the existing test strategy pins behavior by calling decideCadence with synthetic inputs, never by observing live cron output. The LOADED_AND_QUIET boolean must be computed by the caller (scripts/coordinator-quiet-tick.mjs) and passed in, exactly like hasUnactionedDirective and hasUndeliveredChairmanEscalation already are.',
  },
  {
    id: 'TR-2',
    requirement: 'scripts/adam-quiet-tick.mjs is NOT modified by this SD — it stays on the current fixed decideCadence() inputs.',
    rationale: 'Adam-seat cadence changes are out of scope for this SD, avoiding an unreviewed behavior change to the second caller of the same shared PURE function. FR-2 AC-4 (byte-identical when loadedAndQuiet omitted) is what keeps this seat provably unaffected by default.',
  },
  {
    id: 'TR-3',
    requirement: "Predicate inputs (a)-(c) MUST come from scripts/lib/capacity-inputs.mjs's gatherCapacityInputs(), not hand-rolled Supabase queries.",
    rationale:
      "gatherCapacityInputs() is the single existing producer of idleNow/workers/claimableCount(dispatchable-leaf)/rawUnclaimed/openQfCount/claimableWithVerifyQfCount, already correctly distinguishing 'dispatchable-leaf' belt depth from raw unclaimed rows.",
  },
  {
    id: 'TR-4',
    requirement: 'The standard_loop:inbox registry-interval fix (FR-1) lands in the SAME PR as the band-widening change (FR-2/FR-3), not a follow-up.',
    rationale:
      "Shipping the band widening first would blind the inbox liveness gauge for however long a follow-up takes, and this SD's own LEAD-gate VALIDATION (evidence c9d87f02) confirms the registry currently reads falsely-compliant via a DB-only edit that the next seed run reverts — ordering is load-bearing, not ceremonial.",
  },
  {
    id: 'TR-5',
    requirement: 'FR-6 (parked-seat directive-wake preemption mechanism) is explicitly NOT built in this SD.',
    rationale:
      "The coordinator (session f2bf6022) explicitly accepted the exposure via option (b) of the disjunctive LEAD gate carried over from the parent PRD's FR-6 — session_coordination row 2dd84a5a-94db-401f-834c-f85d738dadb0, recorded in this SD's metadata.risk_acceptance_b and independently verified (row exists, read_at and acknowledged_at both set) by this SD's LEAD-gate VALIDATION pass (evidence c9d87f02). Building a preemption mechanism is out of scope; PLAN/EXEC must not expand scope to include it.",
  },
];

const system_architecture = {
  overview:
    'Two coordinated changes to the existing coordinator quiet-tick cadence system: (1) a data-durability fix to periodic_process_registry so its self-stamped inbox liveness expectation matches the coordinator wake cadence that stamps it, and (2) wiring the already-shipped, already-tested computeLoadedAndQuiet() predicate into a new PURE-function branch in decideCadence(), fed by a freshly-computed boolean from existing capacity-input infrastructure.',
  components: [
    {
      name: 'decideCadence (lib/coordinator/quiet-tick.cjs)',
      responsibility: 'PURE cadence decision function. Gains one new input (loadedAndQuiet boolean) and one new branch, inserted with precedence hard-wake > quiescent > loaded-and-quiet > active.',
      technology: 'Node.js CJS module, no dependencies',
    },
    {
      name: 'computeLoadedAndQuiet (lib/coordinator/quiet-tick.cjs:219-230)',
      responsibility: 'Already-shipped, already-tested, fail-closed pure predicate (parent SD FR-7). This SD wires its ALREADY-EXISTING zero call sites into coordinator-quiet-tick.mjs — no new predicate logic.',
      technology: 'Node.js CJS module, no dependencies',
    },
    {
      name: 'coordinator-quiet-tick.mjs main()',
      responsibility: 'Orchestrates the coordinator tick: computes fresh loadedAndQuiet predicate immediately before calling decideCadence(), reusing gatherCapacityInputs() and the existing hasUnactionedDirective/hasUndeliveredChairmanEscalation values.',
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
    'scripts/coordinator-quiet-tick.mjs main() -> gatherCapacityInputs(supabase) [fresh read] -> computeLoadedAndQuiet(inputs) -> decideCadence({...existing inputs, loadedAndQuiet}) -> nextWakeSeconds -> park/arm + tick summary log. Separately: scripts/coordinator-startup-check.mjs STANDARD_LOOPS[inbox].cron -> lib/periodic-liveness/enumerate-processes.mjs parseStandardLoops()/cronToIntervalSeconds() -> scripts/seed-periodic-process-registry.mjs upsert -> periodic_process_registry.standard_loop:inbox.expected_interval_seconds -> scripts/periodic-liveness-watcher.mjs overdue-threshold check.',
  integration_points: [
    'lib/coordinator/quiet-tick.cjs decideCadence() — consumed by scripts/coordinator-quiet-tick.mjs (this SD) and scripts/adam-quiet-tick.mjs (untouched)',
    'scripts/lib/capacity-inputs.mjs gatherCapacityInputs() — newly consumed by coordinator-quiet-tick.mjs',
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
    given: 'computeLoadedAndQuiet() returns false because direct OPEN_UNCLAIMED count > 0, with quiescent=false and no directive',
    when: 'decideCadence(s) is called with loadedAndQuiet=false',
    then: 'the returned delay is in the existing ACTIVE band [180,270], proving the regression guard the SD explicitly requires',
  },
  {
    id: 'TS-3',
    scenario: 'Existing fixtures are byte-identical when loadedAndQuiet is omitted',
    test_type: 'unit',
    given: 'every existing test case in tests/unit/coordinator/quiet-tick.test.js, unmodified (baseline: 50/50 passing)',
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
    scenario: 'Live two-sided proof after merge',
    test_type: 'e2e',
    given: 'the merged coordinator-quiet-tick.mjs running against real fleet state',
    when: 'one tick fires while the fleet is genuinely loaded-and-quiet, and a separate tick fires with a real open-unclaimed row present',
    then: 'the first tick logs nextWakeSeconds in [540,660] and the second logs nextWakeSeconds in [180,270], both pasted verbatim in the PR',
  },
];

const acceptance_criteria = [
  'standard_loop:inbox expected_interval_seconds in periodic_process_registry matches the coordinator wake band it is stamped by (verified by a registry read pasted in the PR AFTER a seed re-run, not a DB-only edit)',
  'decideCadence returns the loaded-and-quiet band ONLY when every live worker seat holds a claim AND direct OPEN_UNCLAIMED count = 0 AND claimableWithVerify = 0 AND no unactioned directive/escalation; a fixture proves an open unclaimed row forces the ACTIVE band',
  'Existing fixtures pass byte-identical with the new input omitted; hard-wake (15-45s) and quiescent (<=900s) branches are unchanged; no delay ever equals 300',
  'Two-sided live proof after merge: one coordinator tick in a measured loaded-and-quiet state prints the widened band, and one tick with an open unclaimed row prints the ACTIVE band (both stamps pasted)',
  'computeLoadedAndQuiet() (parent FR-7) gains its first production call site, immediately before decideCadence() in coordinator-quiet-tick.mjs main()',
];

const risks = [
  {
    risk: "A DB-only edit to periodic_process_registry.standard_loop:inbox.expected_interval_seconds is silently reverted by the next run of scripts/seed-periodic-process-registry.mjs, because the value is re-derived from the STANDARD_LOOPS cron string every time. CONFIRMED STILL LIVE at this SD's LEAD gate: the row currently reads 900s from a DB-only edit dated 2026-09-01T21:26:53Z, which the derivation (still 120s) will revert on next seed.",
    probability: 'HIGH',
    impact: 'HIGH',
    mitigation: 'Edit the STANDARD_LOOPS cron entry (or remove it, retirement-style) as the durable source-of-truth change, and take the registry read-back AFTER re-running the seed script, never immediately after a raw DB write.',
    rollback_plan: 'Revert the STANDARD_LOOPS entry to its prior cron string and re-run the seed script; the registry row self-corrects on the next seed run.',
  },
  {
    risk: 'R2 (RESTATED FROM AMENDMENT_2, per this SD\'s own LEAD-gate VALIDATION correction, evidence c9d87f02): a coordinator directive cannot preempt a park already armed by decideCadence, because no PostToolUse hook fires on a parked seat (scripts/hooks/coordination-inbox.cjs is a PostToolUse hook and a parked seat runs no tools — verified this SD, mechanism_verifications, coordination-inbox.cjs:4). Widening the coordinator\'s own wake band to [540,660] therefore raises worst-case coordinator-directive latency from ~270s (today\'s ACTIVE band) to ~660s+tick. This is the COORDINATOR seat, not a worker seat (no worker-seat caller of decideCadence exists).',
    probability: 'HIGH (structural, not probabilistic)',
    impact: 'HIGH',
    mitigation: 'EXPLICITLY ACCEPTED by the coordinator (session f2bf6022), session_coordination row 2dd84a5a-94db-401f-834c-f85d738dadb0, recorded in this SD\'s metadata.risk_acceptance_b. Preemption (parent FR-6) is out of scope for this SD (see TR-5). No fixture or live measurement of parked-seat wake latency is required to ship FR-1..FR-5, unlike the parent PRD\'s now-superseded FR-6 gate.',
    rollback_plan: 'If post-merge experience shows the accepted exposure is unacceptable in practice, revert the decideCadence() branch addition and the coordinator-quiet-tick.mjs wiring (two self-contained commits), and re-open the band decision with the coordinator/chairman.',
  },
  {
    risk: 'The LOADED_AND_QUIET predicate is computed from stale (tick-start-cached) data instead of fresh ARM-time reads.',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: "FR-3 places the gatherCapacityInputs() call immediately before the decideCadence() invocation, not reused from assessFleetActivity() at tick-start.",
    rollback_plan: 'If staleness is observed post-merge, move the gatherCapacityInputs() call later in main() or add an explicit re-read guard immediately before decideCadence().',
  },
  {
    risk: 'A new caller-side band mechanism is added for loaded-and-quiet without addressing the existing desiredActiveS mechanism (QF-20260830-071/A3), leaving two overlapping band-widening mechanisms for coordinator cadence with unclear precedence for future maintainers.',
    probability: 'LOW',
    impact: 'MEDIUM',
    mitigation: 'TR-1/FR-2 explicitly document why loaded-and-quiet is a distinct branch rather than a desiredActiveS reuse, so the distinction is discoverable in code comments and this PRD rather than left implicit.',
    rollback_plan: 'N/A — this is a documentation/clarity risk, not a functional one.',
  },
];

const implementation_approach = {
  phases: [
    {
      phase: 'Phase 1: Registry durability fix',
      description: 'Edit the STANDARD_LOOPS cron entry (or retire it with provenance) for standard_loop:inbox so its expected_interval_seconds is compatible with the new coordinator wake bands, then re-seed and read back.',
      deliverables: ['STANDARD_LOOPS edit in scripts/coordinator-startup-check.mjs', 'Re-seeded periodic_process_registry row (or retirement marker)', 'Registry read-back pasted in PR, taken AFTER the re-seed'],
    },
    {
      phase: 'Phase 2: decideCadence loaded-and-quiet branch',
      description: 'Add the loadedAndQuiet input and [540,660] band branch to lib/coordinator/quiet-tick.cjs, with regression fixtures.',
      deliverables: ['Updated decideCadence()', 'New/updated tests in tests/unit/coordinator/quiet-tick.test.js'],
    },
    {
      phase: 'Phase 3: Fresh predicate wiring',
      description: 'Wire computeLoadedAndQuiet() and gatherCapacityInputs() into scripts/coordinator-quiet-tick.mjs main(), immediately before the decideCadence() call.',
      deliverables: ['Updated coordinator-quiet-tick.mjs'],
    },
    {
      phase: 'Phase 4: Two-sided live proof',
      description: 'Capture and paste the two live tick stamps required by FR-5.',
      deliverables: ['Loaded-and-quiet tick stamp', 'ACTIVE-band tick stamp (open-unclaimed-row state)'],
    },
  ],
  technical_decisions: [
    'loadedAndQuiet is a NEW, distinct decideCadence branch rather than a reuse of desiredActiveS, because desiredActiveS only widens the ACTIVE ceiling with a 45s span tied to a caller-supplied maximum, while loaded-and-quiet needs an independent 120s span anchored at a fixed 540s floor representing a semantically different fleet state.',
    'Predicate inputs (a)-(c) are sourced from the existing gatherCapacityInputs() rather than new hand-rolled queries, reusing its dispatchable-leaf vs. raw-unclaimed distinction.',
    'The registry durability fix and the band-widening change ship in the same PR (TR-4).',
    'FR-6 (parked-seat preemption) is dropped from this SD\'s scope entirely, superseded by the coordinator\'s explicit risk acceptance (risk_acceptance_b) rather than a fixture/live-measurement gate.',
  ],
};

const integration_operationalization = {
  consumers: [
    { name: 'Coordinator seat (scripts/coordinator-quiet-tick.mjs)', interaction: 'Calls decideCadence() every tick to determine its own next wake delay', frequency: 'Every coordinator tick (currently ~15x/hour when active)' },
    { name: 'Fleet workers / QF claimants', interaction: 'Indirectly affected: a longer coordinator wake cadence when loaded-and-quiet means dispatch/inbox processing latency increases in that state', frequency: 'Continuous, whenever the fleet is fully loaded and quiet' },
  ],
  dependencies: [
    { name: 'scripts/lib/capacity-inputs.mjs gatherCapacityInputs()', type: 'upstream', contract: 'Existing function, called with a fresh Supabase read; no signature change', failure_handling: 'A failure here should fail the loadedAndQuiet predicate to false (fall through to ACTIVE band), never to a false-true' },
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
    rollback_trigger: 'Post-merge the standard_loop:inbox registry shows OVERDUE, OR the two-sided live proof (FR-5) cannot be produced.',
    rollback_procedure: 'Revert the decideCadence() branch addition and the coordinator-quiet-tick.mjs wiring (two self-contained commits); revert the STANDARD_LOOPS edit only if the retirement/interval change itself is implicated.',
  },
};

const exploration_summary = {
  files_read: [
    'lib/coordinator/quiet-tick.cjs',
    'tests/unit/coordinator/quiet-tick.test.js',
    'scripts/coordinator-quiet-tick.mjs',
    'scripts/coordinator-startup-check.mjs',
    'lib/periodic-liveness/enumerate-processes.mjs',
    'scripts/seed-periodic-process-registry.mjs',
    'scripts/lib/capacity-inputs.mjs',
    'scripts/adam-quiet-tick.mjs',
  ],
  patterns_identified: [
    'PURE-function cadence decision (decideCadence) fed by caller-computed booleans, never doing its own IO',
    'Caller-side band-widening via an optional numeric parameter (desiredActiveS, QF-20260830-071/A3) as a precedent, deliberately NOT reused here because the new band is a distinct predicate/semantics, not a widened existing band',
    'periodic_process_registry rows sourced from a cron-string-derived registry (STANDARD_LOOPS), making DB-only edits non-durable',
  ],
  key_decisions: [
    'FR-1..FR-5 sourced verbatim from the parent PRD (PRD-e6db824d) rather than this SD\'s own fabricated metadata.functional_requirements (this SD\'s LEAD-gate VALIDATION finding VAL-1, evidence c9d87f02)',
    'FR-6 (preemption) dropped from scope; superseded by explicit coordinator risk acceptance (risk_acceptance_b)',
    'Risk framing corrected from "worker seat" (as in the original risk_acceptance_b rationale) to "coordinator seat" (the seat that actually calls decideCadence) — VAL-3',
  ],
  exploration_date: '2026-09-01',
};

const prd = {
  id: `PRD-${SD_UUID}`,
  directive_id: SD_UUID,
  sd_id: SD_UUID,
  title: 'Coordinator loaded-and-quiet wake band widening (FR-1..FR-5)',
  version: '1.0',
  status: 'approved',
  category: 'infrastructure',
  priority: 'medium',
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
  goal_summary:
    'Fix the standard_loop:inbox registry-interval durability bug and wire the already-shipped computeLoadedAndQuiet() predicate into decideCadence(), widening the coordinator wake band to [540,660]s when loaded-and-quiet. FR-6 preemption is out of scope; risk explicitly accepted by the coordinator.',
  metadata: {
    sd_key: SD_KEY,
    parent_sd_key: PARENT_SD_KEY,
    parent_prd_id: PARENT_PRD_ID,
    frs_explicitly_excluded: ['FR-6 (parked-seat preemption — superseded by risk_acceptance_b, not built in this SD)', 'FR-7 (shipped in parent SD, PR #7792)'],
    risk_acceptance_b_ref: {
      session_coordination_row_id: '2dd84a5a-94db-401f-834c-f85d738dadb0',
      accepted_by: 'coordinator f2bf6022-42c1-44f4-a491-b36fd9f854c9',
    },
    mechanism_verifications: [
      { verified_by: 'Golf-3 (worker session e6347b41-3673-4082-9c0b-35207a599068), LEAD sub-agent VALIDATION, evidence c9d87f02', verified_at: 'lib/coordinator/quiet-tick.cjs:65' },
      { verified_by: 'Golf-3 (worker session e6347b41-3673-4082-9c0b-35207a599068), LEAD sub-agent Explore, evidence 847df402', verified_at: 'scripts/coordinator-quiet-tick.mjs:478' },
      { verified_by: 'Golf-3 (worker session e6347b41-3673-4082-9c0b-35207a599068)', verified_at: 'scripts/hooks/coordination-inbox.cjs:4' },
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
