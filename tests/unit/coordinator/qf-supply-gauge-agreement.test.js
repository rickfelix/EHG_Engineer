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
  ];

  for (const f of fixtures) {
    it(`agrees for: ${f.name}`, () => {
      expect(isClaimableQfSupply(f.row)).toBe(f.supply);
      expect(isAutoStartableQF(f.row, Date.now())).toBe(f.claimable);
      // The property that actually matters: nothing is counted as supply that a worker cannot take.
      if (isClaimableQfSupply(f.row)) expect(isAutoStartableQF(f.row, Date.now())).toBe(true);
    });
  }

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
