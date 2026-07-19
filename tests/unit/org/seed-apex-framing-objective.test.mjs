/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H (FR-1) — apex-framing objective seed.
 * PLAN TESTING gap closures (row d3090722):
 *  (b)/TS-1: SELECT-first WITNESS — the objective pre-read must use
 *            .is('venture_id', null) (an .eq null renders venture_id=eq.null in
 *            PostgREST and reintroduces the NULLs-distinct duplicate defect),
 *            and run 2 must perform ZERO objective inserts.
 *  GAP-1:    guards are ADVISORY — evaluateObjective yields warnings with
 *            passed=true, NOT blocking violations (don't copy the blocking
 *            precedent from objective-guard-registry.test.mjs).
 *  GAP-2:    guard-identity assertions — the tripped entries must carry the two
 *            seeded guard_keys, so a zero/wrong-guard seed cannot pass.
 */
import { describe, it, expect } from 'vitest';
import {
  seedApexFramingObjective,
  APEX_OBJECTIVE_KEY,
  APEX_OBJECTIVE_STATEMENT,
  APEX_OBJECTIVE_METRIC,
  APEX_GUARDS,
} from '../../../lib/org/apex-framing-objective.mjs';
import { evaluateObjective } from '../../../lib/org/objective-guard-registry.mjs';

/** Stub covering both tables: objective select-chain + insert, guard upsert-chain. */
function buildStub({ existingObjectiveRows = [] } = {}) {
  const calls = { objectiveIs: [], objectiveEq: [], objectiveInserts: [], guardUpserts: [] };
  const objectiveBuilder = {
    select: () => objectiveBuilder,
    is: (col, val) => { calls.objectiveIs.push([col, val]); return objectiveBuilder; },
    eq: (col, val) => { calls.objectiveEq.push([col, val]); return objectiveBuilder; },
    limit: () => Promise.resolve({ data: existingObjectiveRows, error: null }),
  };
  const guardBuilder = {
    select: () => guardBuilder,
    maybeSingle: () => Promise.resolve({ data: { id: 'g' }, error: null }),
  };
  const sb = {
    from: (table) => {
      if (table === 'org_objective_registry') {
        return {
          ...objectiveBuilder,
          insert: (row) => { calls.objectiveInserts.push(row); return Promise.resolve({ error: null }); },
        };
      }
      if (table === 'org_guard_registry') {
        return { upsert: (row, opts) => { calls.guardUpserts.push([row, opts]); return guardBuilder; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { sb, calls };
}

describe('TS-1 seedApexFramingObjective — SELECT-first idempotency under NULLs-distinct', () => {
  it('empty world: witnesses .is(venture_id, null) pre-read, inserts the NULL-venture objective once, upserts both guards on guard_key', async () => {
    const { sb, calls } = buildStub({ existingObjectiveRows: [] });
    const r = await seedApexFramingObjective(sb);
    expect(r.objectiveSeeded).toBe(true);
    expect(calls.objectiveIs).toContainEqual(['venture_id', null]); // .is — the guard-shape witness
    expect(calls.objectiveEq).toContainEqual(['objective_key', APEX_OBJECTIVE_KEY]);
    expect(calls.objectiveInserts).toHaveLength(1);
    expect(calls.objectiveInserts[0]).toMatchObject({ venture_id: null, objective_key: APEX_OBJECTIVE_KEY, mode: 'advisory' });
    expect(calls.guardUpserts).toHaveLength(2);
    for (const [, opts] of calls.guardUpserts) expect(opts).toEqual({ onConflict: 'guard_key' });
  });

  it('second run (row exists): performs ZERO objective inserts — no NULLs-distinct duplicate', async () => {
    const { sb, calls } = buildStub({ existingObjectiveRows: [{ id: 'obj-1' }] });
    const r = await seedApexFramingObjective(sb);
    expect(r.objectiveSeeded).toBe(false);
    expect(calls.objectiveInserts).toHaveLength(0);
    expect(calls.guardUpserts).toHaveLength(2); // guards stay idempotent by guard_key
  });
});

describe('TS-4 objective content + advisory guard evaluation (GAP-1/GAP-2)', () => {
  it('statement encodes the four §5 components and the NOT-ship-value anti-objective; metric is downstream-only', () => {
    expect(APEX_OBJECTIVE_STATEMENT).toContain('negative-space');
    expect(APEX_OBJECTIVE_STATEMENT).toContain('SYMMETRICALLY');
    expect(APEX_OBJECTIVE_STATEMENT).toContain('compounded');
    expect(APEX_OBJECTIVE_STATEMENT).toContain('CMV');
    expect(APEX_OBJECTIVE_STATEMENT).toContain("NOT 'which framings shipped value'");
    expect(APEX_OBJECTIVE_METRIC).toContain('downstream-only');
    expect(APEX_GUARDS.map((g) => g.guardKey)).toEqual([
      'apex-framing-decline-rate-high',
      'apex-framing-dissent-preservation',
    ]);
    for (const g of APEX_GUARDS) {
      expect(g.guardType).toBe('anti_goodhart');
      expect(g.mode).toBe('advisory');
    }
  });

  it('advisory guards WARN (passed stays true) on gaming signals, carrying both seeded guard_keys', async () => {
    const guardRows = APEX_GUARDS.map((g) => ({
      guard_key: g.guardKey, guard_type: g.guardType, mode: g.mode, status: 'active',
    }));
    const emitStub = () => {};
    const res = await evaluateObjective({}, {
      objectiveKey: APEX_OBJECTIVE_KEY,
      observation: { claimsTargetMet: true, gamingSignals: ['framings-emitted'] },
    }, { loadGuardsFn: async () => guardRows, emitFn: emitStub });
    expect(res.passed).toBe(true); // advisory mode never blocks (GAP-1)
    expect(res.violations).toHaveLength(0);
    expect(res.warnings.map((w) => w.guardKey).sort()).toEqual([
      'apex-framing-decline-rate-high',
      'apex-framing-dissent-preservation',
    ]);
  });

  it('a clean observation trips nothing', async () => {
    const guardRows = APEX_GUARDS.map((g) => ({
      guard_key: g.guardKey, guard_type: g.guardType, mode: g.mode, status: 'active',
    }));
    const res = await evaluateObjective({}, {
      objectiveKey: APEX_OBJECTIVE_KEY,
      observation: { claimsTargetMet: true, gamingSignals: [] },
    }, { loadGuardsFn: async () => guardRows, emitFn: () => {} });
    expect(res.passed).toBe(true);
    expect(res.warnings).toHaveLength(0);
  });
});
