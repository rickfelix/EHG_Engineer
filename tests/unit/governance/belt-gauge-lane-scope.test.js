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
