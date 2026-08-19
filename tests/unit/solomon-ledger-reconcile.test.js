/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-4) — outcome reconciliation reads the
 * ACTUAL downstream SD terminal status, never Solomon's self-report. Injected-stub coverage.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const require = createRequire(import.meta.url);
const {
  mapSdStatusToOutcome, reconcileBatch,
  selectNegativeBackprop, collectNegativeRefs, backPropagateNegativeOutcomes, addRefsFromMetadata,
  NEGATIVE_OUTCOME, NEGATIVE_BACKPROP_SOURCE,
  selectNotApplicableOutcomes, resolveNotApplicableOutcomes,
  computeLegCoverage, COVERAGE_FLOOR_PCT, isExpectedPreMigrationFailure, classifyZeroWriteOutcome,
} = require('../../scripts/solomon-ledger-reconcile.cjs');

// SECURITY sub-agent (EXEC phase, S1): the real write chains .eq('id').eq('outcome','unknown')
// .eq('decision','rejected').is('outcome_sd_key',null) as a compare-and-set guard. This helper
// builds a chainable mock supporting that full chain, resolving to {error, count} on the final
// predicate call (mirrors supabase-js: each .eq()/.is() returns `this` until awaited). Shared
// across describe blocks below.
function makeUpdateMock({ error = null, count = 1 } = {}) {
  const updates = [];
  const chain = (patch) => {
    const calls = [];
    const builder = {
      eq: (col, val) => { calls.push([col, val]); return builder; },
      is: (col, val) => { calls.push([col, val]); return builder; },
      then: (resolve) => resolve({ error, count }), // await-able: `await builder` resolves the final promise
    };
    Object.defineProperty(builder, '_record', { value: () => updates.push({ patch, calls }), enumerable: false });
    builder._record();
    return builder;
  };
  const sb = { from: () => ({ update: chain }) };
  return { sb, updates };
}

describe('FR-4: mapSdStatusToOutcome', () => {
  it('maps completed -> shipped_clean, cancelled -> reverted, else null (not yet terminal)', () => {
    expect(mapSdStatusToOutcome('completed')).toBe('shipped_clean');
    expect(mapSdStatusToOutcome('cancelled')).toBe('reverted');
    expect(mapSdStatusToOutcome('in_progress')).toBeNull();
    expect(mapSdStatusToOutcome('draft')).toBeNull();
    expect(mapSdStatusToOutcome(undefined)).toBeNull();
  });
});

describe('FR-4: reconcileBatch — reads the actual downstream SD, not Solomon self-report', () => {
  it('resolves a row to shipped_clean when its outcome_sd_key SD is completed', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'completed' }, error: null }) }) }) }) };
    const results = await reconcileBatch(sb, [{ id: 'row-1', outcome_sd_key: 'SD-X-001' }]);
    expect(results[0]).toMatchObject({ id: 'row-1', updated: true, outcome: 'shipped_clean' });
  });

  it('carries the resolving sdKey through for closer-of-record stamping (SD-LEO-INFRA-REWARD-SPINE-ONE-001-B)', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'completed' }, error: null }) }) }) }) };
    const results = await reconcileBatch(sb, [{ id: 'row-1', outcome_sd_key: 'SD-X-001' }]);
    expect(results[0].sdKey).toBe('SD-X-001');
  });

  it('leaves a row unresolved (unknown) when the SD is not yet terminal', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'in_progress' }, error: null }) }) }) }) };
    const results = await reconcileBatch(sb, [{ id: 'row-2', outcome_sd_key: 'SD-Y-001' }]);
    expect(results[0].updated).toBe(false);
    expect(results[0].reason).toMatch(/not yet terminal/);
  });

  it('skips rows with no outcome_sd_key without querying the DB', async () => {
    const sb = { from: () => ({ select: () => { throw new Error('should not query'); } }) };
    const results = await reconcileBatch(sb, [{ id: 'row-3', outcome_sd_key: null }]);
    expect(results[0].updated).toBe(false);
    expect(results[0].reason).toMatch(/no outcome_sd_key/);
  });

  it('is fail-open per row — one lookup failure does not abort the batch', async () => {
    let call = 0;
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              call += 1;
              if (call === 1) throw new Error('transient db error');
              return { data: { status: 'completed' }, error: null };
            },
          }),
        }),
      }),
    };
    const results = await reconcileBatch(sb, [
      { id: 'row-4', outcome_sd_key: 'SD-A-001' },
      { id: 'row-5', outcome_sd_key: 'SD-B-001' },
    ]);
    expect(results[0].updated).toBe(false);
    expect(results[0].reason).toMatch(/transient db error/);
    expect(results[1].updated).toBe(true); // second row still processed despite the first failing
    expect(results[1].outcome).toBe('shipped_clean');
  });
});

describe('FR-4 (W2, SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001): negative-outcome back-propagation', () => {
  it('selectNegativeBackprop matches ONLY on exact outcome_ref equality (never a heuristic/substring)', () => {
    const rows = [
      { id: 'a', outcome: 'unknown', outcome_ref: 'SD-REVERTED-001' },       // exact match -> flip
      { id: 'b', outcome: 'shipped_clean', outcome_ref: 'SD-REVERTED-001' }, // a later revert means it was NOT clean -> flip
      { id: 'c', outcome: 'unknown', outcome_ref: 'SD-REVERTED-001-EXTRA' }, // superset string — must NOT match
      { id: 'd', outcome: 'unknown', outcome_ref: 'SD-OTHER-002' },          // unrelated
      { id: 'e', outcome: 'unknown', outcome_ref: null },                    // no linkage
    ];
    const picks = selectNegativeBackprop(rows, new Set(['SD-REVERTED-001']));
    expect(picks.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(picks.find((p) => p.id === 'b').priorOutcome).toBe('shipped_clean');
  });

  it('never re-flips an already-negative row (idempotent) and never touches a NO_ARTIFACT sentinel', () => {
    const rows = [
      { id: 'a', outcome: 'reverted', outcome_ref: 'SD-X' },       // already negative
      { id: 'b', outcome: 'caused_rework', outcome_ref: 'SD-X' },  // already negative
      { id: 'c', outcome: 'unknown', outcome_ref: 'NO_ARTIFACT' }, // explicit no-artifact — nothing to track
      { id: 'd', outcome: 'unknown', outcome_ref: 'NO_ARTIFACT: verbal ack' },
    ];
    // even if the ref set literally contained these strings, none should be selected
    expect(selectNegativeBackprop(rows, new Set(['SD-X', 'NO_ARTIFACT', 'NO_ARTIFACT: verbal ack'])).length).toBe(0);
  });

  it('addRefsFromMetadata harvests candidate refs from a red-merge/revert signal metadata object', () => {
    const set = new Set();
    addRefsFromMetadata(set, { sha: 'abc123', sd_key: 'SD-Q', signature: 'red-merge:ci:abc123', irrelevant: 'x' });
    expect(set.has('abc123')).toBe(true);
    expect(set.has('SD-Q')).toBe(true);
    expect(set.has('red-merge:ci:abc123')).toBe(true);
    expect(set.has('x')).toBe(false); // only whitelisted keys
  });

  it('SEEDED end-to-end: a seeded revert signal back-propagates outcome=reverted onto its linked ledger row', async () => {
    // Ledger candidate rows (returned by the .not(outcome_ref is null) select).
    const ledger = [
      { id: 'row-linked', outcome: 'unknown', outcome_ref: 'SD-SEEDED-REVERT-001' },
      { id: 'row-unrelated', outcome: 'unknown', outcome_ref: 'SD-CLEAN-002' },
    ];
    const updates = [];
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: collectNegativeRefs /
    // backPropagateNegativeOutcomes now paginate via fapPaginate, which chains .order() then
    // a terminal .range() instead of the old terminal .limit().
    const sb = {
      from: (table) => {
        if (table === 'audit_log') {
          const chain = {
            select: () => chain,
            in: () => chain,
            order: () => chain,
            range: async () => ({ data: [{ event: 'SD_REVERTED', metadata: { sd_key: 'SD-SEEDED-REVERT-001' } }], error: null }),
          };
          return chain;
        }
        if (table === 'strategic_directives_v2') {
          const chain = {
            select: () => chain,
            not: () => chain,
            order: () => chain,
            range: async () => ({ data: [], error: null }),
          };
          return chain;
        }
        // solomon_advice_outcome_ledger
        const chain = {
          select: () => chain,
          not: () => chain,
          order: () => chain,
          range: async () => ({ data: ledger, error: null }),
          update: (patch) => ({ eq: (col, val) => { updates.push({ patch, col, val }); return Promise.resolve({ error: null }); } }),
        };
        return chain;
      },
    };
    const negRefs = await collectNegativeRefs(sb, {});
    expect(negRefs.has('SD-SEEDED-REVERT-001')).toBe(true);
    const res = await backPropagateNegativeOutcomes(sb, { negativeRefs: negRefs, nowIso: '2026-07-19T00:00:00Z' });
    expect(res.updated).toEqual(['row-linked']);               // only the linked row flipped
    expect(updates).toHaveLength(1);
    expect(updates[0].val).toBe('row-linked');
    expect(updates[0].patch.outcome).toBe(NEGATIVE_OUTCOME);   // 'reverted'
    expect(updates[0].patch.closed_by).toBe(NEGATIVE_BACKPROP_SOURCE); // closer-of-record stamped
    expect(updates[0].patch.closed_at).toBe('2026-07-19T00:00:00Z');
  });

  it('dryRun reports matches without writing', async () => {
    const ledger = [{ id: 'r1', outcome: 'unknown', outcome_ref: 'SD-R' }];
    let updateCalled = false;
    const sb = { from: () => {
      const chain = {
        select: () => chain,
        not: () => chain,
        order: () => chain,
        range: async () => ({ data: ledger, error: null }),
        update: () => { updateCalled = true; return { eq: () => Promise.resolve({ error: null }) }; },
      };
      return chain;
    } };
    const res = await backPropagateNegativeOutcomes(sb, { negativeRefs: new Set(['SD-R']), dryRun: true });
    expect(res.matched.map((m) => m.id)).toEqual(['r1']);
    expect(res.updated).toEqual([]);
    expect(updateCalled).toBe(false);
  });

  it('no negative refs → no-op (never queries the ledger)', async () => {
    const sb = { from: () => ({ select: () => { throw new Error('should not query'); } }) };
    const res = await backPropagateNegativeOutcomes(sb, { negativeRefs: new Set() });
    expect(res.updated).toEqual([]);
    expect(res.matched).toEqual([]);
  });
});

describe('FR-1/TR-2 (SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001): correlation-only rejected-row outcome resolution', () => {
  // Fake classifyRef mirroring lib/ledger/ref-shape.js's real shape values — kept dependency-free.
  const fakeClassifyRef = (ref) => {
    if (ref === undefined || ref === null || String(ref).trim() === '') return 'empty';
    const s = String(ref).trim();
    if (/^SD-[A-Z0-9-]+$/.test(s)) return 'eligible-sd-key';
    if (/^sd-/i.test(s)) return 'sd-key-case-drift';
    if (/^QF-/i.test(s)) return 'qf-excluded-by-design';
    if (/^[0-9a-f]{7,40}$/i.test(s)) return 'commit-sha';
    return 'narrative-prose';
  };

  describe('selectNotApplicableOutcomes (pure)', () => {
    it('TS-3: selects a rejected, no-outcome_sd_key row with an unresolvable (narrative) ref', () => {
      const rows = [{ id: 'r1', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'not going to build this' }];
      expect(selectNotApplicableOutcomes(rows, fakeClassifyRef)).toEqual([{ id: 'r1', shape: 'narrative-prose' }]);
    });

    it('TS-2/TS-3: does NOT select a rejected row whose ref IS resolvable (eligible SD key) — belongs to the artifact-tracing path', () => {
      const rows = [{ id: 'r2', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'SD-SOME-KEY-001' }];
      expect(selectNotApplicableOutcomes(rows, fakeClassifyRef)).toEqual([]);
    });

    it('does NOT select a rejected row whose ref is case-drift (still resolvable at source)', () => {
      const rows = [{ id: 'r3', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'sd-lower-case-001' }];
      expect(selectNotApplicableOutcomes(rows, fakeClassifyRef)).toEqual([]);
    });

    it('does NOT select a row that already has an outcome_sd_key — belongs to the SD-status path, not this leg', () => {
      const rows = [{ id: 'r4', decision: 'rejected', outcome_sd_key: 'SD-X-001', outcome_ref: 'irrelevant prose' }];
      expect(selectNotApplicableOutcomes(rows, fakeClassifyRef)).toEqual([]);
    });

    it('does NOT select a non-rejected row (accepted/partial/deferred/pending)', () => {
      const rows = [
        { id: 'a', decision: 'accepted', outcome_sd_key: null, outcome_ref: 'prose' },
        { id: 'b', decision: 'pending', outcome_sd_key: null, outcome_ref: 'prose' },
        { id: 'c', decision: 'partial', outcome_sd_key: null, outcome_ref: 'prose' },
      ];
      expect(selectNotApplicableOutcomes(rows, fakeClassifyRef)).toEqual([]);
    });

    it('selects an EMPTY-ref rejected row — "rejected, nothing built" is a fully determined state', () => {
      const rows = [{ id: 'r5', decision: 'rejected', outcome_sd_key: null, outcome_ref: null }];
      expect(selectNotApplicableOutcomes(rows, fakeClassifyRef)).toEqual([{ id: 'r5', shape: 'empty' }]);
    });

    it('selects commit-sha and qf-excluded shapes too (both out-of-domain for the SD-artifact-tracing path)', () => {
      const rows = [
        { id: 'r6', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'a1b2c3d4e5f6' },
        { id: 'r7', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'QF-20260101-001' },
      ];
      const picks = selectNotApplicableOutcomes(rows, fakeClassifyRef);
      expect(picks.map((p) => p.id).sort()).toEqual(['r6', 'r7']);
    });
  });

  describe('resolveNotApplicableOutcomes (integration, mocked supabase)', () => {
    it('writes outcome=not_applicable for each matched row, with the full compare-and-set predicate chain', async () => {
      const { sb, updates } = makeUpdateMock({ error: null, count: 1 });
      const rows = [{ id: 'r1', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'prose' }];
      // Inject the fake classifier by monkey-patching is unnecessary here since the module dynamically
      // imports the REAL lib/ledger/ref-shape.js — 'prose' classifies as narrative-prose there too.
      const res = await resolveNotApplicableOutcomes(sb, rows, { nowIso: '2026-08-19T00:00:00Z' });
      expect(res.matched).toHaveLength(1);
      expect(res.updated).toEqual(['r1']);
      expect(updates).toHaveLength(1);
      expect(updates[0].patch).toEqual({ outcome: 'not_applicable', closed_by: 'solomon-ledger-reconcile.cjs', closed_at: '2026-08-19T00:00:00Z' });
      expect(updates[0].calls).toEqual([['id', 'r1'], ['outcome', 'unknown'], ['decision', 'rejected'], ['outcome_sd_key', null]]);
    });

    it('S1: a lost-update (row changed since selection, count=0) is skipped, never treated as a successful write', async () => {
      const { sb } = makeUpdateMock({ error: null, count: 0 });
      const rows = [{ id: 'r1', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'prose' }];
      const res = await resolveNotApplicableOutcomes(sb, rows);
      expect(res.matched).toHaveLength(1);
      expect(res.updated).toEqual([]); // count=0 means the row no longer matched the predicates — not written
    });

    it('dryRun reports matches without writing', async () => {
      let updateCalled = false;
      const sb = { from: () => ({ update: () => { updateCalled = true; return { eq: () => Promise.resolve({ error: null }) }; } }) };
      const rows = [{ id: 'r1', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'prose' }];
      const res = await resolveNotApplicableOutcomes(sb, rows, { dryRun: true });
      expect(res.matched).toHaveLength(1);
      expect(res.updated).toEqual([]);
      expect(updateCalled).toBe(false);
    });

    it('degrades safely (fail-open) when the write fails — e.g. TR-1 migration not yet applied (Postgres 23514)', async () => {
      const { sb } = makeUpdateMock({ error: { code: '23514', message: 'new row for relation violates check constraint' }, count: 0 });
      const rows = [
        { id: 'r1', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'prose one' },
        { id: 'r2', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'prose two' },
      ];
      const res = await resolveNotApplicableOutcomes(sb, rows);
      expect(res.matched).toHaveLength(2);
      expect(res.updated).toEqual([]); // both writes failed, but the call itself never throws
      expect(res.failures).toHaveLength(2);
      expect(res.failures.every((f) => f.code === '23514')).toBe(true);
    });

    it('no matches → never calls update', async () => {
      const sb = { from: () => ({ update: () => { throw new Error('should not be called'); } }) };
      const rows = [{ id: 'r1', decision: 'accepted', outcome_sd_key: null, outcome_ref: 'prose' }];
      const res = await resolveNotApplicableOutcomes(sb, rows);
      expect(res.matched).toEqual([]);
      expect(res.updated).toEqual([]);
      expect(res.failures).toEqual([]);
    });
  });
});

describe('TS-8/TS-11 (SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001): pinned regressions for non-unit-testable behavior', () => {
  const workflowPath = path.resolve(__dirname, '../../.github/workflows/solomon-ledger-reconcile.yml');
  const scriptPath = path.resolve(__dirname, '../../scripts/solomon-ledger-reconcile.cjs');

  it('TS-8 (static pin): the GHA step declares shell: bash AND set -euo pipefail — both load-bearing, neither droppable as "just style"', () => {
    const yml = readFileSync(workflowPath, 'utf8');
    const stepIdx = yml.indexOf('name: Run reconcile');
    expect(stepIdx).toBeGreaterThan(-1);
    const step = yml.slice(stepIdx, stepIdx + 1500);
    expect(step).toMatch(/shell:\s*bash/);
    expect(step).toMatch(/set -euo pipefail/);
  });

  it('TS-11 (real invocation, no DB dependency): scripts/solomon-ledger-reconcile.cjs, run via a REAL `node` child process (not vitest transform), successfully performs the CJS-calling-ESM dynamic import into lib/ledger/ref-shape.js', () => {
    // resolveNotApplicableOutcomes(fakeSb, [], {}) always awaits the dynamic import BEFORE
    // checking rows.length -- so this exercises the exact ESM-interop path with zero DB traffic
    // (the mock supabase client is never called for an empty rows array).
    const out = execFileSync(process.execPath, ['-e', `
      const m = require(${JSON.stringify(scriptPath)});
      m.resolveNotApplicableOutcomes({ from: () => { throw new Error('should not query — rows is empty'); } }, [])
        .then((res) => { console.log('TS11_OK:' + JSON.stringify(res)); })
        .catch((err) => { console.error('TS11_FAIL:' + err.message); process.exit(1); });
    `], { encoding: 'utf8', timeout: 15000 });
    expect(out).toContain('TS11_OK:');
    expect(out).toContain('"matched":[]');
  });
});

describe('SECURITY S5 (SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001): isExpectedPreMigrationFailure', () => {
  it('all failures are Postgres 23514 (CHECK violation) -> expected pre-migration state', () => {
    expect(isExpectedPreMigrationFailure([{ code: '23514' }, { code: '23514' }])).toBe(true);
  });

  it('any failure with a different code -> a real anomaly, not expected', () => {
    expect(isExpectedPreMigrationFailure([{ code: '23514' }, { code: '08006' }])).toBe(false); // 08006 = connection failure
    expect(isExpectedPreMigrationFailure([{ code: null, message: 'network timeout' }])).toBe(false);
  });

  it('empty failures list -> not "expected" (there was nothing to be expected about)', () => {
    expect(isExpectedPreMigrationFailure([])).toBe(false);
    expect(isExpectedPreMigrationFailure(undefined)).toBe(false);
  });
});

describe('REGRESSION sub-agent (VERIFY phase, REG-M1): classifyZeroWriteOutcome', () => {
  it('all rows skipped by the lost-update guard (matched>0, updated=0, failures=[]) -> benign, NOT an error', () => {
    const res = classifyZeroWriteOutcome({ matched: [{ id: 'r1' }, { id: 'r2' }], updated: [], failures: [] });
    expect(res.status).toBe('skipped_lost_update');
    expect(res.isError).toBe(false);
    expect(res.message).toContain('lost-update guard');
  });

  it('all failures are Postgres 23514 (pre-migration) -> expected, NOT an error', () => {
    const res = classifyZeroWriteOutcome({ matched: [{ id: 'r1' }], updated: [], failures: [{ id: 'r1', code: '23514' }] });
    expect(res.status).toBe('expected_pre_migration');
    expect(res.isError).toBe(false);
  });

  it('a failure with a non-23514 code -> a real anomaly, IS an error', () => {
    const res = classifyZeroWriteOutcome({ matched: [{ id: 'r1' }], updated: [], failures: [{ id: 'r1', code: '08006' }] });
    expect(res.status).toBe('anomaly');
    expect(res.isError).toBe(true);
  });

  it('a mix of skipped (no failure entry) and a real failure -> still anomaly (failures.length>0 drives the check)', () => {
    const res = classifyZeroWriteOutcome({ matched: [{ id: 'r1' }, { id: 'r2' }], updated: [], failures: [{ id: 'r2', code: '08006' }] });
    expect(res.status).toBe('anomaly');
    expect(res.isError).toBe(true);
  });
});

describe('FR-2/TS-4 (SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001): computeLegCoverage — two-sided floor check', () => {
  // Fake summarise mirroring lib/ledger/ref-shape.js's real shape enough for these pure-function tests.
  const fakeSummarise = (rows) => ({ total: rows.length });

  it('TS-4: below-floor fires — a correlation-leg with 2/1000 resolved is flagged belowFloor', () => {
    const rows = [
      ...Array.from({ length: 2 }, (_, i) => ({ id: `r${i}`, outcome_sd_key: null, outcome: 'not_applicable' })),
      ...Array.from({ length: 998 }, (_, i) => ({ id: `u${i}`, outcome_sd_key: null, outcome: 'unknown' })),
    ];
    const c = computeLegCoverage(rows, fakeSummarise);
    expect(c.correlationLeg.total).toBe(1000);
    expect(c.correlationLeg.resolved).toBe(2);
    expect(c.correlationLeg.pct).toBe(0.2);
    expect(c.correlationLeg.belowFloor).toBe(true);
    expect(c.anyBelowFloor).toBe(true);
  });

  it('TS-4: at/above floor does NOT fire — a healthy leg must not be flagged (two-sided)', () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, outcome_sd_key: null, outcome: 'not_applicable' })),
      ...Array.from({ length: 50 }, (_, i) => ({ id: `u${i}`, outcome_sd_key: null, outcome: 'unknown' })),
    ];
    const c = computeLegCoverage(rows, fakeSummarise);
    expect(c.correlationLeg.pct).toBe(50);
    expect(c.correlationLeg.belowFloor).toBe(false);
    expect(c.anyBelowFloor).toBe(false);
  });

  it('legs are computed independently — an SD-leg failure does not mask a healthy correlation leg or vice versa', () => {
    const rows = [
      { id: 'sd1', outcome_sd_key: 'SD-X-001', outcome: 'unknown' }, // SD-leg: 0/1 resolved -> below floor
      { id: 'c1', outcome_sd_key: null, outcome: 'not_applicable' }, // correlation-leg: 1/1 resolved -> healthy
    ];
    const c = computeLegCoverage(rows, fakeSummarise);
    expect(c.sdLeg.belowFloor).toBe(true);
    expect(c.correlationLeg.belowFloor).toBe(false);
    expect(c.anyBelowFloor).toBe(true); // one bad leg is enough to trip the combined signal
  });

  it('an empty leg (total=0) is never flagged belowFloor (no divide-by-zero, no false alarm on a leg with nothing yet)', () => {
    const rows = [{ id: 'sd1', outcome_sd_key: 'SD-X-001', outcome: 'shipped_clean' }];
    const c = computeLegCoverage(rows, fakeSummarise);
    expect(c.correlationLeg.total).toBe(0);
    expect(c.correlationLeg.pct).toBeNull();
    expect(c.correlationLeg.belowFloor).toBe(false);
  });

  it('COVERAGE_FLOOR_PCT is exported and set below the known-bad 899-row baseline (~1.9%)', () => {
    expect(COVERAGE_FLOOR_PCT).toBeLessThan(1.9);
    expect(COVERAGE_FLOOR_PCT).toBeGreaterThan(0);
  });
});

describe('FR-5 (SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001): CONST-002 guardrail — outcome never derived from the reply/decision itself', () => {
  it('resolveNotApplicableOutcomes writes outcome ONLY from outcome_ref shape, never from decision or reply content — decision is read-only input, never a written column', async () => {
    const { sb, updates } = makeUpdateMock({ error: null, count: 1 });
    // Two rows with IDENTICAL decision='rejected' but DIFFERENT outcome_ref shapes -- if outcome
    // were being derived from `decision` (or any reply-adjacent field) rather than purely from
    // outcome_ref's shape, both would resolve identically. They must not.
    const rows = [
      { id: 'r1', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'unstructured prose, no artifact' }, // narrative -> not_applicable
      { id: 'r2', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'SD-STILL-RESOLVABLE-001' },          // eligible -> left alone
    ];
    const res = await resolveNotApplicableOutcomes(sb, rows);
    expect(res.matched.map((m) => m.id)).toEqual(['r1']); // only the narrative one
    expect(res.updated).toEqual(['r1']);
    expect(updates).toHaveLength(1);
    // The written patch is exactly {outcome, closed_by, closed_at} -- structurally cannot contain
    // `decision` (this function never writes it) and outcome is not one of decision's own values.
    expect(Object.keys(updates[0].patch).sort()).toEqual(['closed_at', 'closed_by', 'outcome']);
    expect(updates[0].patch.outcome).not.toBe('rejected'); // never copies decision's value into outcome
  });

  it('selectNotApplicableOutcomes never reads any reply/free-text field — only decision, outcome_sd_key, outcome_ref (structural: no other row property is ever accessed)', () => {
    const fakeClassifyRef = (ref) => (ref ? 'narrative-prose' : 'empty');
    let accessedKeys = new Set();
    const proxyRow = new Proxy(
      { id: 'r1', decision: 'rejected', outcome_sd_key: null, outcome_ref: 'prose', body: 'a reply that must never be read', reply_class: 'accepted' },
      { get(target, prop) { accessedKeys.add(prop); return target[prop]; } },
    );
    selectNotApplicableOutcomes([proxyRow], fakeClassifyRef);
    expect(accessedKeys.has('body')).toBe(false);
    expect(accessedKeys.has('reply_class')).toBe(false);
  });
});
