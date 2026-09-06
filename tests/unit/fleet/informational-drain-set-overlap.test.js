/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-1/FR-5 (AC-16 / AC-18, TST-P8).
 *
 * classifyCoordinationRow checks INFORMATIONAL_KINDS BEFORE the drain-set union
 * (lib/fleet/worker-status.cjs), so any kind added to INFORMATIONAL_KINDS classifies
 * informational by precedence regardless of whether it also sits in a role's DRAIN_SET. The
 * existing disjointness assertion (tests/unit/coordination/kind-classification.test.js) can
 * therefore never observe this overlap -- it passes vacuously for any dual-membership kind.
 *
 * This test asserts the overlap is CONFINED: every kind present in BOTH INFORMATIONAL_KINDS and
 * an effective role DRAIN_SET must be a member of BACKPRESSURE_EXEMPT_KINDS (the existing,
 * documented rationale for deliberate dual membership -- a delivery receipt / fleet broadcast
 * that must always reach a busy target regardless of backlog depth, while still classifying as
 * informational rather than an open ask). An accidental future overlap outside that allowlist
 * fails here instead of passing silently.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { INFORMATIONAL_KINDS, DRAIN_SETS, BACKPRESSURE_EXEMPT_KINDS } = require('../../../lib/fleet/worker-status.cjs');

// PRE-EXISTING, out of this SD's scope: 'roll_call' sits in both INFORMATIONAL_KINDS and
// DRAIN_SETS.coordinator already, predating this SD (the /checkin availability record is
// deliberately undrained everywhere ELSE, but the coordinator's own set happens to include it).
// Fixing that pre-existing overlap is not this SD's FR-1/FR-2 scope; it is named here explicitly
// so the new assertion catches a FUTURE accidental overlap without also failing on a defect this
// SD did not introduce and is not chartered to fix.
const PRE_EXISTING_EXCEPTIONS = new Set(['roll_call']);

describe('SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 (AC-16 / AC-18): INFORMATIONAL_KINDS/DRAIN_SET overlap is confined to BACKPRESSURE_EXEMPT_KINDS (+ documented pre-existing exceptions)', () => {
  const infoSet = new Set(INFORMATIONAL_KINDS);
  const exemptSet = new Set(BACKPRESSURE_EXEMPT_KINDS);

  for (const role of Object.keys(DRAIN_SETS)) {
    it(`every kind in both INFORMATIONAL_KINDS and DRAIN_SETS.${role} is in BACKPRESSURE_EXEMPT_KINDS or the documented pre-existing exceptions`, () => {
      const overlap = DRAIN_SETS[role].filter((kind) => infoSet.has(kind));
      const unaccountedFor = overlap.filter((kind) => !exemptSet.has(kind) && !PRE_EXISTING_EXCEPTIONS.has(kind));
      expect(unaccountedFor).toEqual([]);
    });
  }

  it('signal_receipt and capped_pool_broadcast are the currently-known NEW dual-membership kinds', () => {
    const overlapAnywhere = INFORMATIONAL_KINDS.filter((kind) =>
      Object.values(DRAIN_SETS).some((set) => set.includes(kind)) && !PRE_EXISTING_EXCEPTIONS.has(kind));
    expect(overlapAnywhere.sort()).toEqual(['capped_pool_broadcast', 'signal_receipt'].sort());
  });
});
