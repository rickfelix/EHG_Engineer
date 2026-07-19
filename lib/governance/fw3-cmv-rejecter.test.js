/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-D — fw3-cmv-rejecter unit suite.
 * Covers PRD TS-1..TS-5 + TESTING PLAN-gap closures (row 9a79c3c6):
 *  gap-1/TS-2: assert the EMITTED first-verdict-wins guard shape (.filter on
 *              payload->cmv_rejecter is null) — mock cannot witness row locks,
 *              so the guard's presence in the query IS the unit-tier witness;
 *              live atomicity defers to the parent per design §7.3.
 *  gap-2/TS-1: predicate exercised over UNFILTERED rows (a broken builder
 *              filter cannot ship green).
 *  gap-3/TS-3: exact boundary inclusivity (sample 9|10, rate at|above epsilon).
 *  gap-4/TS-5: malformed cmv_rejecter entries excluded — no NaN leakage.
 */
import { describe, it, expect } from 'vitest';
import {
  filterPendingFramings, buildVerdictPatch, recordVerdict,
  computeRejectRate, evaluateFakeSeparation, checkStructuralSeparation,
} from './fw3-cmv-rejecter.cjs';

const framing = (over = {}) => ({
  id: 'r1', sender_type: 'solomon',
  payload: { oracle: true, framing_class: 'instrument', body: 'framing' },
  ...over,
});

describe('TS-1 filterPendingFramings — predicate over UNFILTERED rows (gap-2)', () => {
  it('keeps only unverdicted instrument-class oracle framings', () => {
    const rows = [
      framing({ id: 'keep' }),
      framing({ id: 'pick', payload: { oracle: true, framing_class: 'pick' } }),
      framing({ id: 'verdicted', payload: { oracle: true, framing_class: 'instrument', cmv_rejecter: { verdict: 'survived' } } }),
      { id: 'worker-row', sender_type: 'worker', payload: { framing_class: 'instrument' } },
      { id: 'no-payload', sender_type: 'solomon' },
      framing({ id: 'no-class', payload: { oracle: true } }),
    ];
    expect(filterPendingFramings(rows).map((r) => r.id)).toEqual(['keep']);
  });
  it('empty world (pre-Child-A) returns [] — never an error', () => {
    expect(filterPendingFramings([])).toEqual([]);
    expect(filterPendingFramings(null)).toEqual([]);
  });
});

describe('TS-2 recordVerdict — first-verdict-wins guard shape (gap-1) + merge-not-clobber', () => {
  function mockSupabase({ payload, updateResult }) {
    const calls = { filters: [], updates: [] };
    const chain = {
      from: () => chain,
      select: (cols) => { calls.lastSelect = cols; return chain; },
      eq: () => chain,
      single: async () => ({ data: { payload }, error: null }),
      update: (patch) => { calls.updates.push(patch); return chain; },
      filter: (...args) => { calls.filters.push(args); return chain; },
    };
    // terminal .select after update/filter chain resolves the update result
    let selectCount = 0;
    const origSelect = chain.select;
    chain.select = (cols) => {
      selectCount += 1;
      if (calls.updates.length > 0) return Promise.resolve(updateResult);
      return origSelect(cols);
    };
    return { chain, calls };
  }

  it('emits the payload->cmv_rejecter IS NULL guard and preserves sibling keys', async () => {
    const { chain, calls } = mockSupabase({
      payload: { oracle: true, framing_class: 'instrument', correlation_id: 'keep-me' },
      updateResult: { data: [{ id: 'r1' }], error: null },
    });
    const r = await recordVerdict(chain, { rowId: 'r1', verdict: 'rejected', grounds: 'drifts from north-star', rejecterSession: 's-rej' });
    expect(r.ok).toBe(true);
    expect(calls.filters).toContainEqual(['payload->cmv_rejecter', 'is', null]); // the guard IS the witness
    const merged = calls.updates[0].payload;
    expect(merged.correlation_id).toBe('keep-me'); // merge-not-clobber
    expect(merged.cmv_rejecter.verdict).toBe('rejected');
  });

  it('0 matched rows → alreadyVerdicted (first verdict wins)', async () => {
    const { chain } = mockSupabase({ payload: { framing_class: 'instrument' }, updateResult: { data: [], error: null } });
    const r = await recordVerdict(chain, { rowId: 'r1', verdict: 'survived', grounds: 'traces honestly' });
    expect(r).toEqual({ ok: false, alreadyVerdicted: true });
  });

  it('pre-read short-circuit also refuses an already-verdicted row', async () => {
    const { chain, calls } = mockSupabase({
      payload: { cmv_rejecter: { verdict: 'survived' } },
      updateResult: { data: [{ id: 'r1' }], error: null },
    });
    const r = await recordVerdict(chain, { rowId: 'r1', verdict: 'rejected', grounds: 'x' });
    expect(r.alreadyVerdicted).toBe(true);
    expect(calls.updates.length).toBe(0);
  });

  it('buildVerdictPatch validates verdict vocabulary and requires grounds', () => {
    expect(() => buildVerdictPatch({ verdict: 'approved', grounds: 'x' })).toThrow(/rejected\|survived/);
    expect(() => buildVerdictPatch({ verdict: 'rejected', grounds: '  ' })).toThrow(/grounds required/);
  });
});

describe('TS-3 evaluateFakeSeparation — trip matrix + boundaries (gap-3)', () => {
  const cfg = { minSample: 10, epsilon: 0.05 };
  const rate = (sample, rejected) => ({ sample, rejected, rejectRate: sample ? rejected / sample : null });

  it('trips at sample>=minSample and rate<=epsilon', () => {
    expect(evaluateFakeSeparation(rate(10, 0), cfg).count).toBe(1);
    expect(evaluateFakeSeparation(rate(20, 1), cfg).count).toBe(1); // 0.05 exactly → inclusive trip
  });
  it('never trips below minSample regardless of rate', () => {
    expect(evaluateFakeSeparation(rate(9, 0), cfg).count).toBe(0);  // boundary: 9 vs 10
    expect(evaluateFakeSeparation(rate(3, 0), cfg).count).toBe(0);
  });
  it('does not trip on a healthy reject rate', () => {
    expect(evaluateFakeSeparation(rate(20, 8), cfg).count).toBe(0); // 0.4
    expect(evaluateFakeSeparation(rate(20, 2), cfg).count).toBe(0); // 0.1 just above epsilon
  });
  it('zero-sample world returns count=0 cleanly (fail-soft pre-Child-A)', () => {
    const r = evaluateFakeSeparation(rate(0, 0), cfg);
    expect(r.count).toBe(0);
    expect(r.rejectRate).toBeNull();
  });
});

describe('TS-4 checkStructuralSeparation', () => {
  it('refuses when the invoker IS the active Solomon (CONST-002)', () => {
    const r = checkStructuralSeparation({ invokerSession: 'sol-1', activeSolomonSession: 'sol-1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('proposer cannot be its own rejecter');
  });
  it('fail-closed on an unresolvable invoker', () => {
    expect(checkStructuralSeparation({ invokerSession: null, activeSolomonSession: 'sol-1' }).ok).toBe(false);
  });
  it('passes a genuinely separate session (incl. no live Solomon)', () => {
    expect(checkStructuralSeparation({ invokerSession: 'w-1', activeSolomonSession: 'sol-1' }).ok).toBe(true);
    expect(checkStructuralSeparation({ invokerSession: 'w-1', activeSolomonSession: null }).ok).toBe(true);
  });
});

describe('TS-5 computeRejectRate — purity + malformed exclusion (gap-4)', () => {
  it('counts only well-formed instrument verdicts; malformed never leak NaN', () => {
    const rows = [
      { payload: { framing_class: 'instrument', cmv_rejecter: { verdict: 'rejected' } } },
      { payload: { framing_class: 'instrument', cmv_rejecter: { verdict: 'survived' } } },
      { payload: { framing_class: 'instrument', cmv_rejecter: {} } },              // malformed: no verdict
      { payload: { framing_class: 'instrument', cmv_rejecter: { verdict: 'ok' } } }, // malformed vocabulary
      { payload: { framing_class: 'pick', cmv_rejecter: { verdict: 'rejected' } } }, // pick-class excluded
      { payload: { framing_class: 'instrument' } },                                 // unverdicted
      {},
    ];
    const r = computeRejectRate(rows);
    expect(r).toEqual({ sample: 2, rejected: 1, rejectRate: 0.5 });
    expect(Number.isNaN(r.rejectRate)).toBe(false);
  });
  it('deterministic and null at sample 0', () => {
    expect(computeRejectRate([])).toEqual({ sample: 0, rejected: 0, rejectRate: null });
  });
});
