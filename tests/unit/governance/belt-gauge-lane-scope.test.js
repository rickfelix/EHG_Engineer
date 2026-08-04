// SD-LEO-INFRA-BOTH-BELT-GAUGES-001 — TS-8: the scoped path refuses rather than under-reports.
//
// WHY EVERY ASSERTION HERE IS TWO-SIDED. The failure this guards is a SILENT UNDERCOUNT, and an
// undercount is a perfectly ordinary-looking number. `expect(...).not.toBe(145)` cannot tell a
// throw from a 0, and 0 is the dangerous answer: the demand gate compares `value <= floor`, so 0
// SOURCES. A test that only checks "not the happy value" would pass on the exact defect.
//
// The gate itself is NOT scoped and must never be (FR-1). Everything here is the reporting path.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { openQfMintGate } from '../../../lib/governance/qf-mint-gate.mjs';
import { DEMAND_DECISION } from '../../../lib/governance/demand-gate.js';

const require_ = createRequire(import.meta.url);
const { countClaimableQuickFixes, countDispatchableBacklog } =
  require_('../../../lib/fleet/belt-depth.cjs');

/**
 * Stub modelling BOTH shapes this module uses: a head-count (`{count}` awaited directly) and a
 * paginated row fetch (`.range()` per page). `laneRows` feeds the ambiguity guard's read.
 */
function stub({ count = 0, laneRows = [], sdRows = null } = {}) {
  const calls = { eq: [], tables: [] };
  const make = (table) => {
    let page = 0;
    const chain = {
      select() { return chain; },
      eq(col, val) { calls.eq.push([col, val]); return chain; },
      is() { return chain; },
      in() { return chain; },
      range() {
        // One page then empty, so fetchAllPaginated terminates.
        const rows = page++ === 0 ? (table === 'quick_fixes' ? laneRows : (sdRows || [])) : [];
        return Promise.resolve({ data: rows, count, error: null });
      },
      then(res) { return Promise.resolve({ data: [], count, error: null }).then(res); },
    };
    return chain;
  };
  return { from(t) { calls.tables.push(t); return make(t); }, __calls: calls };
}

describe('TS-8a — an unresolvable scope THROWS, and specifically does not return 0', () => {
  for (const bad of ['', '   ', '!!!', 42, {}, []]) {
    it(`rejects ${JSON.stringify(bad)} rather than guessing`, async () => {
      // SIDE ONE: it throws.
      await expect(countClaimableQuickFixes(stub({ count: 9 }), bad)).rejects.toThrow(/unresolvable lane/i);
      // SIDE TWO: it did not merely return something falsy. Captured explicitly, because a
      // function that returned 0 would satisfy "did not return 9" just as well as a throw does.
      let returned = 'DID_NOT_RETURN';
      try { returned = await countClaimableQuickFixes(stub({ count: 9 }), bad); } catch { /* expected */ }
      expect(returned).toBe('DID_NOT_RETURN');
      expect(returned).not.toBe(0);
    });
  }

  it('the SD gauge refuses on the same axis', async () => {
    await expect(countDispatchableBacklog(stub({ sdRows: [] }), '')).rejects.toThrow(/unresolvable lane/i);
  });
});

describe('TS-8b — an AMBIGUOUS lane refuses rather than counting one spelling', () => {
  // MEASURED 2026-08-04: quick_fixes has 1343 rows and ZERO variant lanes, so .eq() is correct
  // there TODAY. That is SAFE BY COINCIDENCE — nothing enforces the tidiness. This test is the
  // enforcement: the moment a second spelling appears, the scoped read refuses.
  it('two spellings of one lane => throw naming both', async () => {
    const s = stub({ count: 5, laneRows: [{ target_application: 'EHG' }, { target_application: 'ehg' }] });
    await expect(countClaimableQuickFixes(s, 'EHG')).rejects.toThrow(/AMBIGUOUS/);
  });

  it('POSITIVE CONTROL — a single spelling does NOT throw, so the guard is not always-on', async () => {
    // Without this, the assertion above passes just as well against a guard that refuses
    // everything, which would be a different bug wearing the same green.
    const s = stub({ count: 5, laneRows: [{ target_application: 'EHG' }, { target_application: 'EHG' }] });
    await expect(countClaimableQuickFixes(s, 'EHG')).resolves.toBe(5);
    expect(s.__calls.eq).toContainEqual(['target_application', 'EHG']);
  });

  it('a DIFFERENT lane sharing no normal form does not trigger ambiguity', async () => {
    const s = stub({ count: 2, laneRows: [{ target_application: 'EHG' }, { target_application: 'EHG_Engineer' }] });
    await expect(countClaimableQuickFixes(s, 'EHG')).resolves.toBe(2);
  });
});

describe('TS-6b — the REAL gauge, run across the floor (FR-5)', () => {
  // FR-5 AS WRITTEN WOULD HAVE BEEN A NO-OP, and saying so is the point of this block.
  //
  // The ruling was: "TS-6's fixture MUST STRADDLE THE FLOOR or the identity-preserving mutation is
  // invisible." Correct diagnosis, wrong lever. TS-6 asserts gauge IDENTITY
  // (expect(seenGauge).toBe(countClaimableQuickFixes)) while STUBBING `measure`, so the gauge is
  // captured and never called. Its `decision()` helper hardcodes BOTH gauge_value:1 AND the
  // decision, so changing that 1 to a 7 changes nothing any assertion can observe — it is a
  // fixture for a stub, not an input to a comparison. Editing it would have produced literal
  // compliance and zero additional discrimination.
  //
  // The mutation actually feared is one INSIDE countClaimableQuickFixes that preserves its
  // identity — a lane narrowing being the live candidate. Identity assertions cannot see it and
  // neither can a stubbed measure. The only thing that can is running the REAL gauge through the
  // REAL measureDemand with a count that MOVES ACROSS THE FLOOR, which is what these two do:
  // omitting `measure` lets defaultMeasure run, and omitting `gauge` lets the real gauge run.
  // FILTER-AWARE ON PURPOSE. A stub that returns a fixed count no matter what is applied to it
  // cannot see a lane narrowing at all — the mutation would add .eq('target_application', ...),
  // the count would come back unchanged, and this whole block would stay green while proving
  // nothing. Modelling the filter's EFFECT is what makes the floor-straddle discriminating:
  // an unscoped read returns `count`, a lane-scoped one returns the smaller `scopedCount`, and
  // the verdict flips across the floor exactly as it would in production.
  const gateStub = (count, scopedCount = count) => ({
    from: () => {
      let scoped = false;
      const c = {
        select: () => c,
        eq: (col) => { if (col === 'target_application') scoped = true; return c; },
        is: () => c, in: () => c,
        then: (r) => Promise.resolve({ data: [], count: scoped ? scopedCount : count, error: null }).then(r),
      };
      return c;
    },
  });

  it('a real reading ABOVE the floor withholds — and a LANE NARROWING would flip it', async () => {
    // scopedCount 1 is the trap being set: if a future edit teaches countClaimableQuickFixes to
    // filter by target_application, this stub returns 1 instead of 7, 1 <= 3 SOURCES, and this
    // assertion fails. That is the identity-preserving mutation ruling (7) was aimed at, and it
    // is caught here rather than in TS-6, which cannot see it.
    const { allowed, demand } = await openQfMintGate(gateStub(7, 1), {
      engine: 'fr5', env: { BELT_DEMAND_FLOOR: '3' }, record: async () => {}, log: () => {},
    });
    expect(demand.gauge_value).toBe(7);
    expect(demand.decision).toBe(DEMAND_DECISION.WITHHELD);
    expect(allowed).toBe(false);
  });

  it('a real reading AT OR BELOW the floor sources — the fixture straddles', async () => {
    // The other side. Without it the pair above is satisfied by a gauge that always reads high,
    // which is precisely the "cannot see a mutation that preserves what it asserts" trap.
    const { allowed, demand } = await openQfMintGate(gateStub(2), {
      engine: 'fr5', env: { BELT_DEMAND_FLOOR: '3' }, record: async () => {}, log: () => {},
    });
    expect(demand.gauge_value).toBe(2);
    expect(demand.decision).toBe(DEMAND_DECISION.SOURCED);
    expect(allowed).toBe(true);
  });
});

describe('TS-8c — the SD gauge absorbs spelling variants instead of dropping them', () => {
  // The measured asymmetry, pinned: strategic_directives_v2 is the table that ACTUALLY carries
  // variants (6 lanes, 22 rows), and it is the gauge that holds its rows — so normalising in
  // memory makes a scoped SD reading exact by construction. A .eq() here would have dropped them.
  it('EHG and ehg both count toward the EHG lane', async () => {
    const rows = [
      { id: 1, sd_key: 'A', sd_type: 'feature', status: 'draft', metadata: {}, target_application: 'EHG', dependencies: null },
      { id: 2, sd_key: 'B', sd_type: 'feature', status: 'draft', metadata: {}, target_application: 'ehg', dependencies: null },
      { id: 3, sd_key: 'C', sd_type: 'feature', status: 'draft', metadata: {}, target_application: 'EHG_Engineer', dependencies: null },
    ];
    const res = await countDispatchableBacklog(stub({ sdRows: rows }), 'EHG');
    // raw is post-scope: the two EHG spellings, NOT the Engineer row.
    expect(res.raw).toBe(2);
  });

  it('CONTROL — the same fixture unscoped sees all three, so the filter is doing the work', async () => {
    const rows = [
      { id: 1, sd_key: 'A', sd_type: 'feature', status: 'draft', metadata: {}, target_application: 'EHG', dependencies: null },
      { id: 2, sd_key: 'B', sd_type: 'feature', status: 'draft', metadata: {}, target_application: 'ehg', dependencies: null },
      { id: 3, sd_key: 'C', sd_type: 'feature', status: 'draft', metadata: {}, target_application: 'EHG_Engineer', dependencies: null },
    ];
    const res = await countDispatchableBacklog(stub({ sdRows: rows }));
    expect(res.raw).toBe(3);
  });
});
