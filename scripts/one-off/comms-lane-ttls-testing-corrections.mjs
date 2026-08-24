#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-COMMS-LANE-TTLS-001';
const PRD_ID = 'PRD-SD-LEO-INFRA-COMMS-LANE-TTLS-001';

// TESTING (PLAN-phase, evidence 79b9f70c, CONDITIONAL_PASS) found 3 blocking defects in the PRD
// as originally written:
//
// BLOCKER-1: TS-3's paging-surface allow-list included "the ladder" as a module, but the
// ladder's emitCoordinatorRung() (lib/periodic-liveness/ladder-escalation.mjs:85) writes
// directly to session_coordination -- violating TR-4's hard constraint. Only
// emitLadderDigest() (writes to chairman_decisions) is a safe surface.
//
// BLOCKER-2 (the big one): coordination_receipts -- the measurement source LEAD-phase
// VALIDATION (74c605e7) recommended for FR-4/FR-5 to avoid session_coordination's
// survivorship bias -- is itself structurally incompatible with what this SD needs to
// measure. Its `lane` enum is frozen (receipt-ledger.cjs:44 LANES) to {signal, advisory,
// work_assignment} -- NOT directive/reply/suggestion/dispatch_suggestion, the actual
// payload.kind lanes this SD targets; buildReceipt() (receipt-ledger.cjs:86) returns null
// for any other lane. Its `state` column has exactly ONE live value (disposed) -- a receipt
// records that something HAPPENED, not that something failed to happen. There is no
// dead-letter state representable in this table at all -- the numerator FR-4 needs is
// structurally absent, so any rate computed from it is 0/N by construction, not a real
// measurement. TESTING's diagnosis: VALIDATION correctly found session_coordination
// survivorship-biased, but swapped it for a source biased the OPPOSITE way without
// verifying the second source could express the measured quantity.
//
// RESOLUTION (architectural, not cosmetic): FR-4/FR-5 change their measurement source from
// coordination_receipts to LIVE session_coordination, filtered on FR-2's OWN payload-only
// expired-unread marker. This is actually the more natural design: FR-2's entire purpose is
// to make dead-letter state DURABLE and purge-surviving directly on the row -- once FR-2
// ships, a query against live session_coordination for that marker is NOT survivorship-biased
// (the marker is specifically designed to never be deleted by cleanup_expired_coordination()).
// The original survivorship-bias finding applies to PRE-fix historical data (rows that were
// already deleted by the old cleanup policy before any marker existed) -- that data is
// genuinely, permanently unmeasurable with precision, which FR-5 now states honestly instead
// of pretending to reconstruct it. The "baseline" becomes the first POST-fix measurement
// (day-0 after FR-2 ships), not a reconstructed pre-fix number.
//
// BLOCKER-3: TS-2 lacks a negative control (a fixture whose expires_at is NOT in the past
// should NOT survive-for-the-wrong-reason) and its only static pin points at a superseded
// migration file. Added a two-armed shape matching the sibling
// tests/unit/... dead-letter-stamp-survival.test.js pattern TESTING flagged as already correct.

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Lane-appropriate TTL registry keyed by payload.kind, homed in lib/coordination/lane-contract.cjs',
    description: 'Add a per-lane TTL entry (directive/advisory/reply/suggestion) to lib/coordination/lane-contract.cjs (already the payload.kind-keyed module) as a re-keying of the existing per-message deadline machinery in lib/coordinator/reply-class.cjs (computeReplyExpectedBy, findOverdueReplyNeeded, DEFAULT_REPLY_WINDOW_MS) from its current 3-value reply_class axis to the 4-lane payload.kind axis. Do NOT introduce a second lane-keyed representation (e.g. lib/governance/gauge-registry.js) -- single representation only.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'lane-contract.cjs exports one TTL entry per payload.kind lane (directive/advisory/reply/suggestion)',
      'TTL computation reuses computeReplyExpectedBy()-equivalent logic, not a duplicate implementation',
      'No second lane-keyed TTL table/array is introduced anywhere else in the codebase'
    ]
  },
  {
    id: 'FR-2',
    requirement: 'Payload-only expired-unread stamping on TTL breach, and the DURABLE dead-letter-state source of record',
    description: 'When a session_coordination row exceeds its lane TTL unread, stamp it with a distinct payload-only marker (e.g. payload.dead_letter_reason=\'ttl_expired_unread\') mirroring lib/coordination/dead-letter-drain.js\'s buildStampPatch()/isPurgeEligible() pattern verbatim. NEVER write acknowledged_at or read_at. This marker is not just a UI nicety -- TESTING (evidence 79b9f70c) found coordination_receipts cannot represent dead-letter state at all (frozen lane enum excludes this SD\'s lanes; state column has one live value), so THIS marker, queried directly against live session_coordination, becomes FR-4\'s sole reliable measurement source going forward.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'Regression test: a row stamped expired-unread survives a cleanup_expired_coordination() pass unchanged (two-armed: a matching fixture with expires_at in the past DOES get stamped; a control fixture with expires_at NOT in the past does NOT survive-for-the-wrong-reason)',
      'The stamp function writes payload only -- zero writes to acknowledged_at or read_at columns',
      'Uses a distinct payload marker key (not payload.dead_letter, already owned by dead-letter-drain.js\'s orphan-detection sweep) to avoid double-counting in FR-4\'s gauge',
      'The static pin for the purge-eligibility predicate targets the OPERATIVE migration file, not a superseded one (tests/unit/retention/cleanup-expired-coordination-migration.test.js currently pins the superseded version per TESTING finding -- must be corrected during EXEC)'
    ]
  },
  {
    id: 'FR-3',
    requirement: 'Dead-letter alarm paging the sender\'s successor/owner via a surface OTHER than session_coordination',
    description: 'When a lane\'s unread-past-TTL count breaches a configured threshold, page the message SENDER\'s successor/owner (not the recipient/target) through one of: the quiet-tick summary line (scripts/coordinator-quiet-tick.mjs), an sms_outbound_obligations row, or the ladder\'s emitLadderDigest() function specifically (lib/periodic-liveness/ladder-escalation.mjs) -- NOT emitLadderDigest()\'s sibling emitCoordinatorRung(), which TESTING (evidence 79b9f70c) confirmed writes directly to session_coordination and would silently violate this SD\'s own hard constraint while looking PRD-compliant. This is a HARD, LOAD-BEARING constraint (Solomon + coordinator both flagged it): the alarm must never write a new session_coordination row via ANY path, including an allow-listed module\'s wrong entry point.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'The allow-listed emit surface is a specific FUNCTION (emitLadderDigest, the quiet-tick emit, or the SMS obligations insert), not a module -- if using the ladder, emitCoordinatorRung() is explicitly excluded and tested as a negative example',
      'Negative test: seeding a synthetic breached lane triggers an alarm event verified to land on the allow-listed surface with a ZERO row-count delta on session_coordination (not merely absence of error)',
      'The same test asserts the paged party is the SENDER\'s successor/owner using a THIRD-IDENTITY fixture (sender != recipient != a plain "successor" resolver that just returns the sender) -- a resolver that returns the sender unchanged must fail this test, not pass it',
      'Alarm ships with a threshold configuration that starts OBSERVE-ONLY (log/gauge only, no live paging) for an initial soak period before paging is enabled, with a genuine two-armed test (observe-mode fixture proves no page sent; enforce-mode fixture proves a page IS sent) -- not provable by a single dead code path'
    ]
  },
  {
    id: 'FR-4',
    requirement: 'Per-lane dead-letter gauge sourced from LIVE session_coordination, filtered on FR-2\'s durable expired-unread marker',
    description: 'Publish a per-lane dead-letter rate gauge/metric that queries live session_coordination filtered to rows carrying FR-2\'s payload-only expired-unread marker (NOT coordination_receipts -- TESTING evidence 79b9f70c found that table\'s lane enum is frozen to {signal, advisory, work_assignment}, excludes this SD\'s directive/advisory/reply/suggestion lanes entirely, and its single-valued state column cannot represent dead-letter state at all, making a coordination_receipts-sourced rate 0/N by construction). This works BECAUSE FR-2\'s marker is specifically designed to survive cleanup_expired_coordination() -- once FR-2 ships, a live-table query is NOT survivorship-biased the way an unmarked pre-fix query would have been. Align the gauge\'s lane taxonomy with the existing lib/coordination/lane-pending-gauge.cjs reader rather than inventing a parallel one. The full row population must be counted (not a capped/paged fetch grouped in memory, which would measure the cap, not the population).',
    priority: 'HIGH',
    acceptance_criteria: [
      'Gauge query reads live session_coordination filtered on FR-2\'s payload marker, NOT coordination_receipts',
      'Gauge lane buckets match lib/coordination/lane-pending-gauge.cjs\'s existing taxonomy (no parallel/competing bucket scheme)',
      'dispatch_suggestion lane is excluded from a naive read_at-IS-NULL dead-letter count, or explicitly annotated as structurally artifact-prone by classification, rather than reported as a real delivery failure',
      'Gauge counts the FULL row population for its denominator (an exact count query or fully-paged fetch), not a single capped fetch grouped in memory'
    ]
  },
  {
    id: 'FR-5',
    requirement: 'Honest baseline: first POST-fix measurement (day-0 after FR-2 ships), NOT a reconstructed pre-fix number',
    description: 'The SD\'s originally-stated pre-fix baseline (62% coordinator-directive, 100% dispatch_suggestion dead-letter) does NOT reproduce against the live session_coordination table (VALIDATION measured 45.8% live) and, per TESTING\'s BLOCKER-2 finding, a precise historical pre-fix number is NOT reliably reconstructible from ANY available source (session_coordination is survivorship-biased for pre-fix data because unread rows were deleted by cleanup before any marker existed; coordination_receipts cannot represent dead-letter state at all). FR-5 therefore records the FIRST reliable measurement as the one taken via FR-4\'s shipped gauge function immediately after FR-2 ships (day-0 post-fix), explicitly labeled as such -- not a retroactively-reconstructed pre-fix figure. The 30-day re-measurement then compares against this day-0 baseline using the identical gauge function and filter.',
    priority: 'HIGH',
    acceptance_criteria: [
      'The recorded baseline is explicitly labeled "day-0 post-fix" (via FR-4\'s shipped gauge), not presented as a reconstructed pre-fix number',
      'The original 62%/100% figures are documented as disproven-per-VALIDATION and structurally-unreconstructable-per-TESTING, not silently dropped or silently kept as the reported baseline',
      '30-day re-measurement uses the SAME shipped gauge function and filter as the day-0 baseline measurement (same code path, not a one-off SQL query)'
    ]
  }
];

const technical_requirements = [
  { id: 'TR-1', requirement: 'FR-2\'s expired-unread stamp mutation must be payload-only; zero writes to acknowledged_at or read_at columns', rationale: 'Those two columns are the exact predicate cleanup_expired_coordination() uses for purge eligibility -- writing either would delete the evidence FR-2 exists to preserve, and would also break FR-4\'s live-table measurement query.' },
  { id: 'TR-2', requirement: 'FR-1\'s TTL registry must live in lib/coordination/lane-contract.cjs, not a new file or lib/governance/gauge-registry.js', rationale: 'lane-contract.cjs is already the payload.kind-keyed module (validateOnSend); a second lane-keyed representation would violate single-representation and create drift risk between two configs.' },
  { id: 'TR-3', requirement: 'FR-4/FR-5\'s dead-letter measurement must query LIVE session_coordination filtered on FR-2\'s payload marker; coordination_receipts MUST NOT be used as the measurement source', rationale: 'TESTING (evidence 79b9f70c) found coordination_receipts\' lane enum (receipt-ledger.cjs:44) excludes this SD\'s payload.kind lanes and its state column cannot represent dead-letter state -- any rate computed from it is 0/N by construction, not a real measurement.' },
  { id: 'TR-4', requirement: 'FR-3\'s alarm implementation must not write any new session_coordination row as its paging mechanism, via ANY code path -- including a specific function within an otherwise-allowed module', rationale: 'A new session_coordination row would page through the exact undrained path the alarm is meant to catch failing. TESTING found emitCoordinatorRung() (within the otherwise-allowed ladder module) itself writes to session_coordination -- the allow-list must be function-scoped, not module-scoped.' },
  { id: 'TR-5', requirement: 'FR-4\'s gauge must count the full row population (exact count or fully-paged fetch), not a single capped/limited fetch grouped in memory', rationale: 'A capped fetch grouped in memory measures the cap, not the population -- demonstrated live during PLAN when an ad-hoc 2000-row-limited query against a 2832-row table returned inconsistent lane distributions across two calls in the same session.' }
];

const test_scenarios = [
  { id: 'TS-1', scenario: 'A session_coordination row past its lane TTL, unread, gets stamped expired-unread with a marker key distinct from dead-letter-drain.js\'s orphan-detection marker', test_type: 'unit', given: 'A directive-lane row older than the directive TTL, read_at IS NULL', when: 'The expiry-stamping pass runs', then: 'payload carries this SD\'s own expired-unread marker key (distinct from payload.dead_letter); acknowledged_at and read_at remain NULL' },
  { id: 'TS-2', scenario: 'Two-armed: a stamped expired-unread row survives cleanup_expired_coordination(); a not-yet-expired control row is correctly NOT stamped', test_type: 'integration', given: 'Arm A: a row stamped expired-unread per TS-1. Arm B: a row whose expires_at is NOT in the past.', when: 'The expiry-stamping pass and then cleanup_expired_coordination() both run', then: 'Arm A is stamped and survives the purge (its acknowledged_at/read_at predicate was never satisfied). Arm B is NOT stamped -- proving the pass discriminates on the real TTL condition, not merely on being called. Pin the operative (not superseded) migration/where-clause file for the purge predicate.' },
  { id: 'TS-3', scenario: 'Negative test: alarm fires on a synthetic breached lane, lands on an allow-listed FUNCTION, and produces a zero row-count delta on session_coordination; emitCoordinatorRung() is a proven negative example', test_type: 'integration', given: 'A lane with unread-past-TTL count exceeding the configured threshold', when: 'the dead-letter alarm check runs using the allow-listed emit function (emitLadderDigest, the quiet-tick emit, or the SMS obligations insert)', then: 'the alarm event lands on that function\'s real target surface, session_coordination row count is unchanged (delta=0), AND a control run using ladder-escalation.mjs\'s emitCoordinatorRung() is asserted to FAIL this same zero-delta check (proving the allow-list is function-scoped, not module-scoped)' },
  { id: 'TS-4', scenario: 'Alarm pages the sender\'s successor/owner using a third-identity fixture (sender != recipient != naive-successor-resolver-returning-sender)', test_type: 'integration', given: 'A breached lane where sender, recipient, and a naive "successor" resolver that just returns the sender are all distinct identities in the fixture', when: 'the alarm fires', then: 'the paged party matches the TRUE successor/owner role, and a control run using the naive resolver (which returns the sender unchanged) is asserted to FAIL this test' },
  { id: 'TS-5', scenario: 'Per-lane gauge reads LIVE session_coordination filtered on FR-2\'s marker, counts the full population, and matches an independent full-count query', test_type: 'unit', given: 'A session_coordination table with a known set of FR-2-marked and unmarked rows across multiple lanes, exceeding any single fetch page size', when: 'the gauge computes the dead-letter rate for a lane', then: 'the computed rate matches an independent exact-count query for that lane, and is stable across repeated invocations (no capped-fetch inconsistency)' },
  { id: 'TS-6', scenario: 'dispatch_suggestion lane is not misreported as a real delivery failure', test_type: 'unit', given: 'dispatch_suggestion rows with read_at IS NULL by structural design (no drain-set membership)', when: 'the gauge computes dead-letter rate', then: 'dispatch_suggestion is excluded or explicitly annotated as a classification artifact, not reported as a delivery-failure rate' },
  { id: 'TS-7', scenario: 'Alarm ships observe-only by default; two-armed control proves the mode switch actually gates paging', test_type: 'integration', given: 'Arm A: default configuration (observe-only). Arm B: explicit enforce-mode flag set.', when: 'a lane breaches threshold in both arms', then: 'Arm A logs/gauges the breach but sends NO page. Arm B sends a page. Both arms must be exercised by the test -- a single-mode test proves nothing about the mode switch.' }
];

const acceptance_criteria = [
  'TTL registry merged into lib/coordination/lane-contract.cjs, one entry per payload.kind lane; expired-unread stamping live and payload-only, two-armed purge-survival test passing (TS-1, TS-2)',
  'Negative test passes: an alarm fires on a synthetic breached lane and lands on an allow-listed FUNCTION (not module) OUTSIDE session_coordination with a proven zero row-count delta; a negative-example function (emitCoordinatorRung) is proven to fail the same check; paging direction is verified against a third-identity fixture (TS-3, TS-4)',
  'FR-4\'s gauge reads live session_coordination (NOT coordination_receipts) filtered on FR-2\'s marker, counts the full population, and matches an independent exact-count query; dispatch_suggestion is correctly excluded/annotated (TS-5, TS-6)',
  'Alarm ships observe-only by default with a genuine two-armed test proving the mode switch gates paging, not a single dead code path (TS-7)',
  'FR-5\'s recorded baseline is explicitly labeled day-0 post-fix (via FR-4\'s shipped gauge), with the original 62%/100% figures documented as disproven/unreconstructable rather than silently dropped'
];

const risks = [
  {
    risk: 'A miscalibrated dead-letter threshold could produce alarm noise (false pages) or, if set too high, fail to page on a genuine dead-letter spike.',
    probability: 'MEDIUM', impact: 'MEDIUM',
    mitigation: 'Start with a conservative threshold informed by the day-0 post-fix baseline (FR-5); land the alarm observe-only for an initial soak before enabling live paging.',
    rollback_plan: 'Flip the alarm\'s enable flag back to observe-only; no data loss since expired-unread rows are never deleted.'
  },
  {
    risk: 'FR-3\'s hard "different surface" constraint can be violated even through a PRD-approved MODULE, if a caller reaches the wrong FUNCTION within it -- confirmed live: ladder-escalation.mjs\'s emitCoordinatorRung() writes directly to session_coordination despite the module being an approved paging surface.',
    probability: 'MEDIUM', impact: 'HIGH',
    mitigation: 'TS-3 asserts the allow-list at FUNCTION granularity with a proven negative example (emitCoordinatorRung fails the zero-delta check); code review at EXEC must confirm only the allow-listed function is called, never its module-mate.',
    rollback_plan: 'Disable the alarm module entirely (feature-flag off); TTL stamping (FR-1/FR-2) and the gauge (FR-4) continue functioning independently.'
  },
  {
    risk: 'coordination_receipts, LEAD-phase VALIDATION\'s originally-recommended measurement source, cannot represent this SD\'s dead-letter concept at all (frozen lane enum excludes the target lanes; single-valued state column has no dead-letter state) -- confirmed by TESTING via a full-population census, not a sample.',
    probability: 'CONFIRMED (already found)', impact: 'HIGH',
    mitigation: 'FR-4/FR-5 changed to query live session_coordination filtered on FR-2\'s own durable marker instead -- resolved at PLAN, before EXEC builds a reader for a lane no writer emits.',
    rollback_plan: 'N/A -- this is the corrected design, not a risk requiring a rollback path of its own.'
  },
  {
    risk: 'Overlap/confusion with the EXISTING, differently-scoped dead-letter machinery (dead-letter-drain.js, orphan-detection for dead/gone sessions) could cause a naming collision or double-counting in the gauge.',
    probability: 'LOW', impact: 'MEDIUM',
    mitigation: 'Use a distinct payload marker key for this SD\'s expired-unread state; FR-4\'s gauge explicitly excludes/labels rows already marked by the orphan-detection path.',
    rollback_plan: 'Rename the payload marker key if a collision is discovered post-deploy; no schema migration required since this is payload-only.'
  },
  {
    risk: 'FR-2\'s expired-unread stamp could accidentally write acknowledged_at or read_at, silently deleting the exact evidence this SD exists to preserve AND breaking FR-4\'s live-table measurement query.',
    probability: 'LOW', impact: 'HIGH',
    mitigation: 'Copy dead-letter-drain.js\'s buildStampPatch()/isPurgeEligible() pattern verbatim; TS-2 is a blocking, two-armed regression test asserting purge survival with a correctly-not-stamped control.',
    rollback_plan: 'Revert the stamping function to a no-op; existing rows are unaffected since no destructive migration occurred.'
  }
];

async function main() {
  const { data: prd, error: prdReadErr } = await supabase.from('product_requirements_v2').select('metadata').eq('id', PRD_ID).single();
  if (prdReadErr) { console.error('PRD READ ERR', prdReadErr.message); process.exit(1); }
  const prdMetadata = {
    ...(prd.metadata || {}),
    testing_corrections_note: 'TESTING (PLAN phase, evidence 79b9f70c, CONDITIONAL_PASS) found 3 blocking defects in the original PRD: (1) TS-3\'s ladder allow-list included emitCoordinatorRung(), which itself writes to session_coordination -- fixed to function-scoped allow-list. (2) BLOCKER: coordination_receipts (LEAD-phase VALIDATION\'s recommended FR-4/FR-5 source) cannot represent dead-letter state at all -- frozen lane enum excludes this SD\'s lanes, single-valued state column has no dead-letter concept. FR-4/FR-5 corrected to query live session_coordination filtered on FR-2\'s own durable marker instead, which is reliable post-fix precisely because FR-2 makes that marker purge-survival by design. FR-5 reframed from a reconstructed pre-fix baseline (structurally unreconstructable per this finding) to an honestly-labeled day-0 post-fix baseline. (3) TS-2 corrected to a two-armed test with a proper negative control and the operative (not superseded) migration pin.',
  };

  const { error: prdErr } = await supabase.from('product_requirements_v2').update({
    functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, risks, metadata: prdMetadata,
  }).eq('id', PRD_ID);
  if (prdErr) { console.error('PRD UPDATE ERR', prdErr.message); process.exit(1); }
  console.log('PRD corrected (FR-4/FR-5 measurement source, TS-2/TS-3 negative controls).');

  const { data: sd, error: sdReadErr } = await supabase.from('strategic_directives_v2').select('id, key_changes, risks').eq('sd_key', SD_KEY).single();
  if (sdReadErr) { console.error('SD READ ERR', sdReadErr.message); process.exit(1); }

  const sdKeyChanges = sd.key_changes.map((kc) => {
    if (kc.change.startsWith('FR-3: per-lane dead-letter gauge')) {
      return { type: 'feature', change: 'FR-3(SD)/FR-4(PRD): per-lane dead-letter gauge/metric sourced from LIVE session_coordination filtered on FR-2\'s own durable expired-unread marker -- NOT coordination_receipts. TESTING (PLAN, evidence 79b9f70c) found coordination_receipts structurally cannot represent dead-letter state (frozen lane enum excludes this SD\'s lanes; single-valued state column). Baseline is now the honestly-labeled day-0 post-fix measurement, not a reconstructed pre-fix number (the original 62%/100% figures were already found non-reproducible by LEAD-phase VALIDATION and are now additionally confirmed structurally unreconstructable from any available source).' };
    }
    return kc;
  });
  const { error: sdErr } = await supabase.from('strategic_directives_v2').update({ key_changes: sdKeyChanges }).eq('id', sd.id);
  if (sdErr) { console.error('SD UPDATE ERR', sdErr.message); process.exit(1); }
  console.log('SD key_changes corrected to match.');
}

main();
