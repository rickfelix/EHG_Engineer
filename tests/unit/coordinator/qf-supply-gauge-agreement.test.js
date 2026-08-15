/**
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 FR-4 — the gauge must agree with the action path.
 *
 * THE DEFECT. Two supply gauges counted `status IN ('open','in_progress')` while all five candidate
 * chokepoints require `status = 'open'`. So a row cleared-but-not-reopened was REPORTED AS
 * AVAILABLE SUPPLY that NO WORKER COULD CLAIM. Measured live: the gauge saw 9, workers could reach
 * 2, and 7 were invisible — 6 of them critical. That is why "the belt is empty" read true while six
 * critical items sat waiting.
 *
 * WHY THIS TEST COULD NOT EXIST BEFORE. The predicate lived only as two copies of an inline
 * query-builder chain. With no symbol to assert against, the ":496-only partial fix" — correcting
 * one gauge and leaving the primary one lying — was undetectable by any test. Extracting it is the
 * prerequisite for FR-4, not a tidiness exercise.
 *
 * DIRECTION MATTERS. The correct fix NARROWS the gauge to what a worker can claim. Widening a
 * chokepoint to accept 'in_progress' would also make these agree — and would be a serious
 * regression, letting workers self-claim held or attestation-pending rows. The final assertion pins
 * the direction so a future "fix" cannot satisfy this file the wrong way round.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { isClaimableQfSupply, CLAIMABLE_QF_STATUSES } = require_('../../../lib/coordinator/qf-supply-predicate.cjs');
const { isAutoStartableQF } = require_('../../../scripts/worker-checkin.cjs');
const { STALE_QF_DAYS } = require_('../../../lib/fleet/qf-auto-start.cjs');

const base = (over) => ({
  id: 'QF-T',
  status: 'open',
  claiming_session_id: null,
  pr_url: null,
  commit_sha: null,
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  factory_lane: false,
  routing_tier: 1,
  owner: null,
  release_condition: null,
  not_before: null,
  title: 'benign',
  description: 'benign',
  ...over,
});

describe('FR-4: gauge and chokepoint agree on the axis where they used to disagree', () => {
  const fixtures = [
    { name: 'genuinely claimable', row: base(), supply: true, claimable: true },
    { name: 'STRANDED (the defect): in_progress, no claimant, no work', row: base({ status: 'in_progress' }), supply: false, claimable: false },
    // NOTE, and it is a real asymmetry worth recording rather than papering over: isAutoStartableQF
    // does NOT inspect claiming_session_id. The claimant filter lives in the candidate QUERY
    // (worker-checkin.cjs `.is('claiming_session_id', null)`), not in the predicate. So the
    // predicate answers "is this row FIT for auto-start", and the query answers "is it FREE". The
    // gauge must apply BOTH — which is exactly why isClaimableQfSupply checks the claimant too.
    { name: 'held by a live session (fit but NOT free)', row: base({ claiming_session_id: 'sess-1' }), supply: false, claimable: true },
    { name: 'merge-witnessed, awaiting attestation', row: base({ status: 'in_progress', pr_url: 'https://x/pull/1', commit_sha: 'abc' }), supply: false, claimable: false },
    { name: 'completed', row: base({ status: 'completed' }), supply: false, claimable: false },

    // SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C FR-1 — THE FIXTURE AXIS.
    //
    // These rows are here because this suite went GREEN THROUGH A REAL REGRESSION. When
    // isAutoStartableQF began rejecting fixture QFs, a free fixture row became phantom supply —
    // COUNTED here, UNCLAIMABLE there — which is precisely what the free-row biconditional below
    // exists to catch. It caught nothing, because every row in this table was real-shaped. The
    // assertion was right; the input set could not exercise it. A correct assertion over an
    // unrepresentative population is indistinguishable from a passing one.
    //
    // Both are supply:false + claimable:false, so the biconditional now spans the fixture axis.
    { name: 'FIXTURE by id — not supply, not claimable', row: base({ id: 'QF-TEST-001' }), supply: false, claimable: false },
    { name: 'FIXTURE by title — not supply, not claimable', row: base({ title: 'ZZZ_seed row' }), supply: false, claimable: false },

    // THE OVER-EATING CONTROL, and the direction that matters here: under-counting supply makes
    // `value <= floor` MORE likely and therefore OVER-MINTS work, while wrongly excluding a real QF
    // strands it with nothing reporting it. Two live bug reports in two weeks carried titles like
    // this one (PR #6186), which is why isFixtureQf's TEST-/UAT-/DEMO title branches were removed
    // and only unambiguous ZZZ_/dunder prefixes remain. This row must stay on the supply side.
    { name: 'REAL bug report merely NAMING fixtures — still supply, still claimable', row: base({ title: 'Test-fixture ventures leak into gauges' }), supply: true, claimable: true },
  ];

  for (const f of fixtures) {
    it(`agrees for: ${f.name}`, () => {
      expect(isClaimableQfSupply(f.row)).toBe(f.supply);
      expect(isAutoStartableQF(f.row, Date.now())).toBe(f.claimable);
      // The property that actually matters: nothing is counted as supply that a worker cannot take.
      if (isClaimableQfSupply(f.row)) expect(isAutoStartableQF(f.row, Date.now())).toBe(true);

      // SD-LEO-INFRA-BOTH-BELT-GAUGES-001 — THE OTHER DIRECTION, which was unasserted.
      //
      // The line above catches PHANTOM supply (counted but unclaimable) — the original defect. It
      // is silent about INVISIBLE supply: work a worker CAN take that the gauge does not count.
      // That direction is the dangerous one for the demand gate, because a lower reading makes
      // `value <= floor` MORE likely and therefore SOURCES — under-reporting causes over-minting.
      //
      // The naive converse (claimable -> supply) is FALSE BY DESIGN, and the NOTE above says why:
      // isAutoStartableQF answers "is this row FIT for auto-start" while the candidate query
      // answers "is it FREE", so a row held by a live session is legitimately claimable-but-not-
      // supply. Asserting the bare converse would pin a fiction. Controlling for the claimant axis
      // gives the property that is actually true and actually load-bearing:
      //
      //   for a FREE row, FIT and COUNTED must agree exactly.
      //
      // HONEST SCOPE OF WHAT THIS ADDS, measured rather than asserted. I mutated the predicate to
      // `&& target_application === 'EHG'` — the exact lane narrowing this SD proposes — and three
      // tests failed, but the FIRST was line 60's `toBe(f.supply)`. The fixture table already pins
      // both predicates on all five rows, so it catches that mutation WITHOUT this block. Claiming
      // "without this the change ships green" would have been false, and it is the kind of claim a
      // test comment is never audited for.
      //
      // What this DOES add is a constraint on fixtures not yet written: a future row given
      // supply:false + claimable:true while FREE is a contradiction of the model, and the table
      // alone would happily encode it as expected behaviour — pinning the defect as the
      // requirement, which is the failure mode this suite has already hit once elsewhere.
      if (f.row.claiming_session_id === null) {
        expect(isClaimableQfSupply(f.row)).toBe(isAutoStartableQF(f.row, Date.now()));
      }
    });
  }

  it('the free-row biconditional is not vacuous — free rows exist on BOTH sides of it', () => {
    // Control for the control. If every free fixture landed on one side, the assertion above would
    // hold trivially and could never discriminate — the cannot-fail shape this suite already
    // guards against one paragraph down.
    const free = fixtures.filter((f) => f.row.claiming_session_id === null);
    expect(free.some((f) => isClaimableQfSupply(f.row))).toBe(true);
    expect(free.some((f) => !isClaimableQfSupply(f.row))).toBe(true);
  });

  it('the intersection is NON-EMPTY — an always-false gauge would trivially "agree"', () => {
    // Load-bearing control. Without it, a gauge that counts nothing satisfies every assertion above
    // while reporting the fleet permanently empty — the opposite failure, equally invisible.
    const claimable = fixtures.filter((f) => isClaimableQfSupply(f.row));
    expect(claimable.length).toBeGreaterThan(0);
  });

  it('the STRANDED row is the case that used to disagree', () => {
    // Pinning the specific regression: pre-fix the gauge counted this row (in_progress was in its
    // status list) while isAutoStartableQF rejected it. That divergence IS the defect.
    const stranded = base({ status: 'in_progress' });
    expect(['open', 'in_progress']).toContain(stranded.status); // what the OLD gauge accepted
    expect(isClaimableQfSupply(stranded)).toBe(false);          // what it reports now
    expect(isAutoStartableQF(stranded, Date.now())).toBe(false);
  });

  it('DIRECTION: the gauge narrowed to open — a chokepoint was NOT widened', () => {
    // If someone ever "fixes" agreement by teaching the chokepoints to accept in_progress, this
    // fails. That direction would let workers claim held or attestation-pending rows.
    expect(CLAIMABLE_QF_STATUSES).toEqual(['open']);
    expect(isAutoStartableQF(base({ status: 'in_progress' }), Date.now())).toBe(false);
  });
});

/**
 * SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-5) — the axes where the two predicates are
 * SUPPOSED to disagree, pinned rather than left implicit.
 *
 * A SEPARATE describe block, over its OWN fixture population — deliberately not added to
 * `fixtures` above. isClaimableQfSupply's docblock (lib/coordinator/qf-supply-predicate.cjs:62-65,
 * 82-85) already states it does NOT apply staleness/tier/factory-lane/chairman-gate, only
 * "unclaimed + open-ish status" — different question, different consumer (detectThunderingHerd).
 * Every row below is FREE (claiming_session_id: null) and status='open', so the existing free-row
 * biconditional up above (`isClaimableQfSupply === isAutoStartableQF`, guarded on
 * `claiming_session_id === null`) would break the moment any of these joined `fixtures` — that
 * collision is exactly why this is its own block, not an extension of the other one.
 *
 * The property under test is the INVERSE of FR-4's: for a FREE row on one of these axes,
 * isClaimableQfSupply (loose: coordinator supply) and isAutoStartableQF (strict: worker
 * auto-start) MUST diverge — true and false respectively. If a future change makes them agree
 * here, either the coordinator gauge quietly grew the strict checks (and needs its own FR-4-style
 * re-verification against the chokepoints) or isAutoStartableQF quietly lost one — both are
 * regressions this block exists to catch.
 */
describe('FR-5: axes where isClaimableQfSupply and isAutoStartableQF are DELIBERATELY different', () => {
  const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const staleCreatedAt = new Date(Date.now() - (STALE_QF_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();

  const divergent = [
    { name: 'stale — older than STALE_QF_DAYS', row: base({ created_at: staleCreatedAt }) },
    { name: 'factory_lane — coordinator-dispatch only', row: base({ factory_lane: true }) },
    { name: 'chairman-gated hold', row: base({ owner: 'chairman', release_condition: 'EU-send-planned' }) },
    { name: 'TIER3_RISK_RE keyword in title', row: base({ title: 'rotate auth credentials' }) },
    { name: 'TIER3_RISK_RE keyword in description', row: base({ description: 'apply the pending schema migration' }) },
    { name: 'not_before in the future', row: base({ not_before: FUTURE }) },
  ];

  for (const f of divergent) {
    it(`diverges for: ${f.name} (supply says yes, auto-start says no)`, () => {
      expect(f.row.claiming_session_id, 'this axis only means something for a FREE row').toBeNull();
      expect(isClaimableQfSupply(f.row)).toBe(true);
      expect(isAutoStartableQF(f.row, Date.now())).toBe(false);
    });
  }

  it('CONTROL: the same base() row (no divergence override) agrees on both sides', () => {
    // Without this, "diverges" above could be true trivially because base() itself never agrees —
    // this proves the axis-specific override, not the fixture shape, is what causes each divergence.
    expect(isClaimableQfSupply(base())).toBe(true);
    expect(isAutoStartableQF(base(), Date.now())).toBe(true);
  });
});
