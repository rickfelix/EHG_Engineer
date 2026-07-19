/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H (FR-3) — undelivered-escalation detector.
 * Precedent: coordinator-quiet-tick-directive-wake.test.js chained-builder stub.
 * PLAN TESTING gap closures (row d3090722):
 *  GAP-3: POSITIVE-match test — with zero framing_class rows in the pre-Child-A
 *         world, a wrong literal/operator would be permanently masked by the
 *         fail-soft false; a stubbed matching row must resolve to true.
 *  GAP-4: NULL check uses .is('delivered_at', null) (never .eq — PostgREST
 *         renders eq.null, which never matches).
 *  (c):   14d cutoff is .gte (inclusive) and the argument is now-14d exactly
 *         (deterministic via the nowMs seam).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  hasUndeliveredChairmanEscalation,
  ESCALATION_WINDOW_MS,
} = require('../../../lib/coordinator/undelivered-escalation.cjs');

/** Chained-builder stub recording every filter call; resolves at .limit(). */
function buildStub({ data = [], error = null, throwOn = null } = {}) {
  const calls = { from: [], select: [], eq: [], is: [], gte: [], limit: [] };
  const builder = {
    select: (cols) => { calls.select.push(cols); return builder; },
    eq: (col, val) => { calls.eq.push([col, val]); return builder; },
    is: (col, val) => { calls.is.push([col, val]); return builder; },
    gte: (col, val) => { calls.gte.push([col, val]); return builder; },
    limit: (n) => { calls.limit.push(n); return Promise.resolve({ data, error }); },
  };
  const sb = {
    from: (table) => {
      if (throwOn === 'from') throw new Error('client exploded');
      calls.from.push(table);
      return builder;
    },
  };
  return { sb, calls };
}

describe('hasUndeliveredChairmanEscalation', () => {
  const NOW = 1_800_000_000_000; // fixed for a deterministic cutoff

  it('emits the exact pick-class predicate shape (GAP-4 + cutoff boundary)', async () => {
    const { sb, calls } = buildStub({ data: [] });
    await hasUndeliveredChairmanEscalation(sb, { nowMs: NOW });
    expect(calls.from).toEqual(['session_coordination']);
    expect(calls.eq).toContainEqual(['sender_type', 'solomon']);
    expect(calls.eq).toContainEqual(['payload->>framing_class', 'pick']);
    expect(calls.is).toContainEqual(['delivered_at', null]); // .is, never .eq null
    expect(calls.gte).toEqual([['created_at', new Date(NOW - ESCALATION_WINDOW_MS).toISOString()]]);
    expect(calls.limit).toEqual([1]);
  });

  it('POSITIVE match: a stubbed undelivered pick-class row resolves true (GAP-3 anti-masking)', async () => {
    const { sb } = buildStub({ data: [{ id: 'row-1' }] });
    await expect(hasUndeliveredChairmanEscalation(sb, { nowMs: NOW })).resolves.toBe(true);
  });

  it('zero rows (pre-Child-A world) → false', async () => {
    const { sb } = buildStub({ data: [] });
    await expect(hasUndeliveredChairmanEscalation(sb, { nowMs: NOW })).resolves.toBe(false);
  });

  it('query error → false (fail-soft, never holds the tick hostage)', async () => {
    const { sb } = buildStub({ data: null, error: { message: 'boom' } });
    await expect(hasUndeliveredChairmanEscalation(sb, { nowMs: NOW })).resolves.toBe(false);
  });

  it('throwing client → false (fail-soft)', async () => {
    const { sb } = buildStub({ throwOn: 'from' });
    await expect(hasUndeliveredChairmanEscalation(sb, { nowMs: NOW })).resolves.toBe(false);
  });
});
