// GSB-A — the QF-side reading and the invariant that keeps the SD reading unchanged.
// SD-LEO-INFRA-GATE-SIDE-BELT-001, TS-1/TS-2/TS-3.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { countDispatchableBacklog, countClaimableQuickFixes, countBeltDepth } = require('../../../lib/fleet/belt-depth.cjs');
const { CLAIMABLE_QF_STATUSES } = require('../../../lib/coordinator/qf-supply-predicate.cjs');

/**
 * TABLE-AWARE fake. tests/helpers/supabase-chain-mock.js is deliberately NOT used: it is eager and
 * table-blind — one shared result for every table and filter — so the SD reading and the QF reading
 * would return identical rows and TS-2 could not fail. A fake that cannot distinguish the two
 * readings cannot test a change whose entire point is that they are different.
 *
 * It also RECORDS every table requested, which is what TS-1 asserts on.
 */
function fakeClient({ sds = [], qfs = [] } = {}) {
  const tablesSeen = [];
  const qfFilters = [];
  const make = (table) => {
    const rows = table === 'quick_fixes' ? qfs : sds;
    let filtered = rows;
    const builder = {
      select(_cols, opts = {}) {
        builder._head = !!opts.head;
        return builder;
      },
      eq(col, val) { filtered = filtered.filter((r) => r[col] === val); return builder; },
      is(col, val) { qfFilters.push(`is:${col}`); filtered = filtered.filter((r) => (val === null ? r[col] == null : r[col] === val)); return builder; },
      in(col, vals) { qfFilters.push(`in:${col}`); filtered = filtered.filter((r) => vals.includes(r[col])); return builder; },
      not() { return builder; },
      order() { return builder; },
      range(from, to) { filtered = filtered.slice(from, to + 1); return builder; },
      then(resolve, reject) {
        return Promise.resolve({ data: builder._head ? null : filtered, count: filtered.length, error: null })
          .then(resolve, reject);
      },
    };
    return builder;
  };
  return {
    from(table) { tablesSeen.push(table); return make(table); },
    _tablesSeen: tablesSeen,
    _qfFilters: qfFilters,
  };
}

const openUnclaimed = (n) => Array.from({ length: n }, (_, i) => ({ id: `qf-open-${i}`, status: CLAIMABLE_QF_STATUSES[0], claiming_session_id: null }));
const openClaimed = (n) => Array.from({ length: n }, (_, i) => ({ id: `qf-claimed-${i}`, status: CLAIMABLE_QF_STATUSES[0], claiming_session_id: `sess-${i}` }));

describe('TS-1 — countDispatchableBacklog never reads quick_fixes', () => {
  // BEHAVIOURAL, NOT A PINNED COUNT. The first draft of this asserted dispatchable===23; it had
  // already drifted to 22 before EXEC began, because a draft left the belt — normal movement, not a
  // regression. A test pinned to a live number fails for reasons that are not the thing it names.
  // What must never change is WHICH TABLE the gauge reads: widening it to quick_fixes would break
  // the exact-equality integrity check at scripts/adam-coordinator-health.mjs:223.
  it('requests strategic_directives_v2 and never quick_fixes', async () => {
    const client = fakeClient({ sds: [], qfs: openUnclaimed(5) });
    await countDispatchableBacklog(client);
    expect(client._tablesSeen).toContain('strategic_directives_v2');
    expect(client._tablesSeen).not.toContain('quick_fixes');
  });
});

describe('TS-3 — the QF reading excludes rows carrying a claiming_session_id', () => {
  it('counts unclaimed only, so a claimed row is not belt depth', async () => {
    const client = fakeClient({ qfs: [...openUnclaimed(4), ...openClaimed(3)] });
    expect(await countClaimableQuickFixes(client)).toBe(4);
  });

  it('applies BOTH the unclaimed filter and the status filter — via the shared predicate', async () => {
    // The predicate is owned by lib/coordinator/qf-supply-predicate.cjs. If a future edit restates
    // it locally and drops one half, this fails.
    const client = fakeClient({ qfs: openUnclaimed(2) });
    await countClaimableQuickFixes(client);
    expect(client._qfFilters).toContain('is:claiming_session_id');
    expect(client._qfFilters).toContain('in:status');
  });

  it('does NOT count a row whose status is outside CLAIMABLE_QF_STATUSES', async () => {
    const client = fakeClient({ qfs: [{ id: 'x', status: '__not_a_claimable_status__', claiming_session_id: null }] });
    expect(await countClaimableQuickFixes(client)).toBe(0);
  });
});

describe('TS-2 — the two readings are DIFFERENT numbers', () => {
  // A suite where both arms expect the same value is satisfied by an implementation that returns one
  // number twice. This scenario exists to make that implementation fail.
  it('sdDepth and qfDepth disagree on one fixture, and total is their sum', async () => {
    const sds = [
      { id: 's1', sd_key: 'SD-A', status: 'draft', sd_type: 'infrastructure', metadata: {}, target_application: 'EHG_Engineer', dependencies: null },
      { id: 's2', sd_key: 'SD-B', status: 'draft', sd_type: 'infrastructure', metadata: {}, target_application: 'EHG_Engineer', dependencies: null },
    ];
    const client = fakeClient({ sds, qfs: openUnclaimed(7) });
    const depth = await countBeltDepth(client);
    expect(depth.qfDepth).toBe(7);
    expect(depth.sdDepth).not.toBe(depth.qfDepth);
    expect(depth.total).toBe(depth.sdDepth + depth.qfDepth);
  });
});

describe('the QF gauge is FAIL-LOUD, so an unreadable belt cannot masquerade as an empty one', () => {
  it('propagates the error rather than returning 0', async () => {
    const erroring = { from: () => ({ select: () => ({ is: () => ({ in: () => Promise.resolve({ count: null, error: { code: 'PGRST205' } }) }) }) }) };
    await expect(countClaimableQuickFixes(erroring)).rejects.toBeTruthy();
  });
});

describe('SEC-GSB-1 — a NON-NUMERIC count is a failed measurement, not an empty belt', () => {
  // The dangerous branch was never the `error` one. PostgREST returns {count:null, error:null} for
  // a missing relation, and the original `typeof count === 'number' ? count : 0` turned that into a
  // genuine finite 0 — which normalizeGaugeReading accepts as valid, so decideDemand's operand
  // guards never fire and 0 <= floor resolves to SOURCED. The gate would OPEN because it could not
  // see the belt. The prior mutation set pinned the error branch and left this one unpinned.
  const nullCount = { from: () => ({ select: () => ({ is: () => ({ in: () => Promise.resolve({ count: null, error: null }) }) }) }) };
  it('THROWS on {count:null, error:null} rather than reporting 0', async () => {
    await expect(countClaimableQuickFixes(nullCount)).rejects.toThrow(/measurement FAILED/);
  });
  it('still returns a real zero when the belt is genuinely empty', async () => {
    const emptyBelt = { from: () => ({ select: () => ({ is: () => ({ in: () => Promise.resolve({ count: 0, error: null }) }) }) }) };
    // Both arms in one describe: a version that throws unconditionally fails here, and a version
    // that coerces unconditionally fails above. Neither constant survives.
    await expect(countClaimableQuickFixes(emptyBelt)).resolves.toBe(0);
  });
});
