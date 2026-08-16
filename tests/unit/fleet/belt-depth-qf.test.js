// GSB-A — the QF-side reading and the invariant that keeps the SD reading unchanged.
// SD-LEO-INFRA-GATE-SIDE-BELT-001, TS-1/TS-2/TS-3.
//
// SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-3): countBeltDepth's qfDepth now comes
// from countAutoStartableQuickFixes (isAutoStartableQF), not countClaimableQuickFixes — so TS-2
// exercises a row-filtering predicate with staleness/fixture/risk checks, not a head-count. The
// fake client needed .limit() (the factory_lane-probe step) and the openUnclaimed/openClaimed
// fixtures needed a created_at, or every row reads as unparseable-age and isAutoStartableQF
// excludes all of them — countClaimableQuickFixes (still exercised directly in TS-3) never
// looked at created_at at all, so this gap was invisible before FR-3 existed.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { countDispatchableBacklog, countClaimableQuickFixes, countAutoStartableQuickFixes, countBeltDepth } = require('../../../lib/fleet/belt-depth.cjs');
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
      limit(n) { filtered = filtered.slice(0, n); return builder; },
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

// created_at must be present and fresh: isAutoStartableQF treats a missing/unparseable
// created_at as a failed age check and excludes the row (see the FR-3 note above the imports).
const FRESH_CREATED_AT = new Date().toISOString();
const openUnclaimed = (n) => Array.from({ length: n }, (_, i) => ({ id: `qf-open-${i}`, status: CLAIMABLE_QF_STATUSES[0], claiming_session_id: null, created_at: FRESH_CREATED_AT }));
const openClaimed = (n) => Array.from({ length: n }, (_, i) => ({ id: `qf-claimed-${i}`, status: CLAIMABLE_QF_STATUSES[0], claiming_session_id: `sess-${i}`, created_at: FRESH_CREATED_AT }));

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

// Adversarial-review finding (deep-tier /ship gate, PR #7040), WARNING, reproduced here:
// isAutoStartableQF itself never inspects claiming_session_id (it mirrors the worker's real
// candidate query, which relies on claim_sd flipping status atomically with the claimant) — safe
// for the worker, whose downstream claim_sd RPC call is the real arbiter, but this gauge has no
// such arbiter. Without a query-level filter, a status='open'-but-claimed row (a reachable state
// — see lib/checkin/steps/resume.cjs, lib/fleet/best-effort-release.mjs) would be over-counted,
// reopening the exact defect class SD-LEO-INFRA-GATE-SIDE-BELT-001 fixed.
describe('countAutoStartableQuickFixes — claiming_session_id exclusion (adversarial-review fix)', () => {
  it('does not count a row that is status=open but already claimed by another session', async () => {
    const client = fakeClient({ qfs: [...openUnclaimed(4), ...openClaimed(3)] });
    await expect(countAutoStartableQuickFixes(client)).resolves.toBe(4);
  });

  it('countBeltDepth inherits the same exclusion via its qfDepth reading', async () => {
    const client = fakeClient({ qfs: [...openUnclaimed(4), ...openClaimed(3)] });
    const depth = await countBeltDepth(client);
    expect(depth.qfDepth).toBe(4);
  });
});

// SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-3, TS-2 scope clause): a scoped call must
// not silently fall back to fleet-wide counting on the new row-fetch path — both the factory_lane
// probe and the paginated fetch have to carry the SAME .eq('target_application', scope) filter
// countClaimableQuickFixes already applies for its own (head-count) query.
describe('countAutoStartableQuickFixes — lane scoping', () => {
  it('counts only rows in the requested lane, not the fleet total', async () => {
    const engRow = { id: 'qf-eng', status: 'open', claiming_session_id: null, created_at: FRESH_CREATED_AT, target_application: 'EHG_Engineer' };
    const otherRow = { id: 'qf-other', status: 'open', claiming_session_id: null, created_at: FRESH_CREATED_AT, target_application: 'EHG' };
    const client = fakeClient({ qfs: [engRow, otherRow] });
    await expect(countAutoStartableQuickFixes(client, 'EHG_Engineer')).resolves.toBe(1);
    await expect(countAutoStartableQuickFixes(client, 'EHG')).resolves.toBe(1);
  });

  it('an unresolvable scope throws rather than silently counting the fleet total', async () => {
    const client = fakeClient({ qfs: openUnclaimed(3) });
    await expect(countAutoStartableQuickFixes(client, '')).rejects.toThrow(/unresolvable lane scope/);
  });

  it('an unscoped call (scope omitted) counts across all lanes, unchanged from before scoping existed', async () => {
    const engRow = { id: 'qf-eng', status: 'open', claiming_session_id: null, created_at: FRESH_CREATED_AT, target_application: 'EHG_Engineer' };
    const otherRow = { id: 'qf-other', status: 'open', claiming_session_id: null, created_at: FRESH_CREATED_AT, target_application: 'EHG' };
    const client = fakeClient({ qfs: [engRow, otherRow] });
    await expect(countAutoStartableQuickFixes(client)).resolves.toBe(2);
  });
});

// SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (TR-2/TS-4): factory_lane is a staged,
// unapplied migration (database/migrations/20260713_quick_fixes_factory_lane.sql) — selecting it
// throws Postgres 42703 in live production today. The 42703 fallback lives INSIDE
// fetchAutoStartCandidateRows (belt-depth.cjs), not left as a per-caller responsibility, mirroring
// scripts/worker-checkin.cjs's selfClaimQuickFix retry (lines ~712-747) for the SAME condition.
describe('countAutoStartableQuickFixes — factory_lane 42703 fallback (TR-2/TS-4)', () => {
  // A column-list-sensitive stub: the probe (which selects factory_lane) hits 42703; the retried
  // probe/fetch (without factory_lane) succeeds. Distinct from the generic fakeClient() above
  // because this needs to inspect WHICH columns were requested, not just filter rows.
  function factoryLaneMissingClient(rows) {
    const make = (cols) => {
      const includesFactoryLane = /(^|,)\s*factory_lane\s*(,|$)/.test(cols);
      const b = {
        _cols: cols,
        eq() { return b; },
        is() { return b; },
        limit(n) {
          if (includesFactoryLane) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column quick_fixes.factory_lane does not exist' } });
          }
          return Promise.resolve({ data: rows.slice(0, n), error: null });
        },
        range(from, to) {
          if (includesFactoryLane) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column quick_fixes.factory_lane does not exist' } });
          }
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return b;
    };
    return { from: () => ({ select: (cols) => make(cols) }) };
  }

  it('retries without factory_lane on 42703 and still counts the eligible rows', async () => {
    const rows = openUnclaimed(4); // factory_lane absent on every row -> falsy -> isAutoStartableQF admits them
    const client = factoryLaneMissingClient(rows);
    await expect(countAutoStartableQuickFixes(client)).resolves.toBe(4);
  });

  it('a non-42703 error on the probe still propagates (fail-loud is not weakened by the retry)', async () => {
    const client = { from: () => ({ select: () => ({ eq() { return this; }, is() { return this; }, limit: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'relation not found' } }) }) }) };
    await expect(countAutoStartableQuickFixes(client)).rejects.toBeTruthy();
  });

  // Adversarial-review finding (deep-tier /ship gate, PR #7040), CRITICAL, reproduced here: on
  // LIVE PRODUCTION the FIRST probe (with factory_lane) always hits 42703 -- the prior version of
  // this guard only checked the shape of THAT discarded first attempt, never the retry probe that
  // uses the column list actually fed to the real fetch. This is the scenario that matters: probe
  // #1 -> 42703 (expected, triggers the fallback), probe #2 (retry, no factory_lane) -> the
  // degenerate {data:null, error:null} shape. Must still throw, not resolve to 0.
  it('a probe that hits 42703, then a RETRY probe that resolves data=null/error=null, still THROWS', async () => {
    const client = {
      from: () => ({
        select: (cols) => {
          const includesFactoryLane = /(^|,)\s*factory_lane\s*(,|$)/.test(cols);
          const b = {
            eq() { return b; },
            is() { return b; },
            limit: () => Promise.resolve(
              includesFactoryLane
                ? { data: null, error: { code: '42703', message: 'column quick_fixes.factory_lane does not exist' } }
                : { data: null, error: null }
            ),
          };
          return b;
        },
      }),
    };
    await expect(countAutoStartableQuickFixes(client)).rejects.toThrow(/refusing to treat an unreadable quick_fixes table as empty/);
  });

  // TR-1 / SEC-GSB-1 parity: PostgREST's documented missing-relation signature is {count:null,
  // error:null} under head:true (lib/db/fetch-all-paginated.mjs's renderCount docblock). Its own
  // fetchAllPaginated defends the analogous {data:null, error:null} shape for a plain select by
  // silently coercing to [] — the exact fail-open direction this SD's whole premise is against.
  // The probe is the one place that shape is still checkable before it disappears into
  // fetchAllPaginated's loop.
  it('a probe that resolves with data=null and error=null THROWS rather than reporting 0', async () => {
    const client = { from: () => ({ select: () => ({ eq() { return this; }, is() { return this; }, limit: () => Promise.resolve({ data: null, error: null }) }) }) };
    await expect(countAutoStartableQuickFixes(client)).rejects.toThrow(/refusing to treat an unreadable quick_fixes table as empty/);
  });

  it('a probe that resolves with data=[] (genuinely empty, not null) does NOT throw', async () => {
    // Control for the control above: an empty ARRAY is a valid, distinguishable "really has zero
    // rows" signal. Only a non-array data with no error is treated as a failed measurement.
    const client = fakeClient({ qfs: [] });
    await expect(countAutoStartableQuickFixes(client)).resolves.toBe(0);
  });
});

// SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 (FR-6): verified_at is a SECOND, independently
// staged column that can be absent even when factory_lane is present (or vice versa). This is a
// separate probe stage LAYERED AFTER the factory_lane resolution above — these tests pin that it
// never re-decides factory_lane's own inclusion, only adds/omits ", verified_at" on top of it.
describe('countAutoStartableQuickFixes — verified_at layered probe (FR-6)', () => {
  // factory_lane succeeds (present, not under test here); verified_at is the ONE missing column.
  function verifiedAtMissingClient(rows) {
    const make = (cols) => {
      const includesVerifiedAt = /(^|,)\s*verified_at\s*(,|$)/.test(cols);
      const b = {
        eq() { return b; },
        is() { return b; },
        limit(n) {
          if (includesVerifiedAt) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column quick_fixes.verified_at does not exist' } });
          }
          return Promise.resolve({ data: rows.slice(0, n), error: null });
        },
        range(from, to) {
          if (includesVerifiedAt) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column quick_fixes.verified_at does not exist' } });
          }
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return b;
    };
    return { from: () => ({ select: (cols) => make(cols) }) };
  }

  it('factory_lane present, verified_at absent: still counts eligible rows via the factory_lane-resolved column list', async () => {
    const rows = openUnclaimed(3);
    const client = verifiedAtMissingClient(rows);
    await expect(countAutoStartableQuickFixes(client)).resolves.toBe(3);
  });

  it('a non-42703 error on the verified_at probe still propagates (fail-loud, not weakened by the fallback)', async () => {
    const client = {
      from: () => ({
        select: (cols) => {
          const includesVerifiedAt = /(^|,)\s*verified_at\s*(,|$)/.test(cols);
          const b = {
            eq() { return b; },
            is() { return b; },
            limit: () => Promise.resolve(
              includesVerifiedAt
                ? { data: null, error: { code: '42501', message: 'permission denied' } }
                : { data: [], error: null }
            ),
          };
          return b;
        },
      }),
    };
    await expect(countAutoStartableQuickFixes(client)).rejects.toBeTruthy();
  });

  it('a verified_at probe that resolves data=null/error=null still THROWS rather than reporting 0', async () => {
    const client = {
      from: () => ({
        select: (cols) => {
          const includesVerifiedAt = /(^|,)\s*verified_at\s*(,|$)/.test(cols);
          const b = {
            eq() { return b; },
            is() { return b; },
            limit: () => Promise.resolve(includesVerifiedAt ? { data: null, error: null } : { data: [], error: null }),
          };
          return b;
        },
      }),
    };
    await expect(countAutoStartableQuickFixes(client)).rejects.toThrow(/refusing to treat an unreadable quick_fixes table as empty/);
  });
});
