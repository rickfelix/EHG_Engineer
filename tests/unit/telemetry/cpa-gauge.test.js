/**
 * SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 FR-1 — the CPA gauge's pure computation.
 *
 * Every "reports a number" case is paired with a "does not fabricate a number" case, per this
 * repo's honest-gauge convention (funnel-gauge.mjs, venture-activation-gate.js).
 */
import { describe, it, expect } from 'vitest';
import { computeCpaGaugeState } from '../../../lib/telemetry/cpa-gauge.mjs';

describe('FR-1: computeCpaGaugeState never fabricates a number', () => {
  it('TS-2: returns no_writer_yet with a null value when zero rows exist', () => {
    const result = computeCpaGaugeState({ dailyRollupRows: [] });
    expect(result.state).toBe('no_writer_yet');
    expect(result.value_cents_per_conversion).toBeNull();
    expect(result.reason).toMatch(/no daily_rollups rows/);
  });

  it('TS-2b: treats a missing/undefined rows argument the same as an empty array', () => {
    const result = computeCpaGaugeState({ dailyRollupRows: undefined });
    expect(result.state).toBe('no_writer_yet');
    expect(result.value_cents_per_conversion).toBeNull();
  });

  it('TS-1: returns a real, non-fabricated CPA number when spend and conversions exist', () => {
    const result = computeCpaGaugeState({
      dailyRollupRows: [{ spend_cents: 10000, conversions: 20 }],
    });
    expect(result.state).toBe('live');
    expect(result.value_cents_per_conversion).toBe(500);
  });

  it('TS-3: reports spend-with-zero-conversions as unmeasurable, never 0 and never Infinity', () => {
    const result = computeCpaGaugeState({
      dailyRollupRows: [{ spend_cents: 5000, conversions: 0 }],
    });
    expect(result.state).toBe('live');
    expect(result.value_cents_per_conversion).toBeNull();
    expect(result.value_cents_per_conversion).not.toBe(0);
    expect(Number.isFinite(result.value_cents_per_conversion)).toBe(false);
    expect(result.reason).toMatch(/zero conversions/);
  });

  it('treats a row with zero spend and zero conversions the same as spend-with-zero-conversions, not as no_writer_yet', () => {
    // A writer DID run (a row exists) — it just recorded nothing. Distinct from no rows at all.
    const result = computeCpaGaugeState({
      dailyRollupRows: [{ spend_cents: 0, conversions: 0 }],
    });
    expect(result.state).toBe('live');
    expect(result.value_cents_per_conversion).toBeNull();
  });

  it('TS-7: sums across multiple rows rather than using only the last row', () => {
    const result = computeCpaGaugeState({
      dailyRollupRows: [
        { spend_cents: 3000, conversions: 5 },
        { spend_cents: 7000, conversions: 15 },
      ],
    });
    expect(result.state).toBe('live');
    // (3000 + 7000) / (5 + 15) = 500 -- if this were last-row-only it would be 7000/15 = 467
    expect(result.value_cents_per_conversion).toBe(500);
  });

  it('handles rows with missing spend_cents/conversions fields as 0, not NaN', () => {
    const result = computeCpaGaugeState({
      dailyRollupRows: [{ spend_cents: 10000, conversions: 20 }, {}],
    });
    expect(result.state).toBe('live');
    expect(result.value_cents_per_conversion).toBe(500);
    expect(Number.isNaN(result.value_cents_per_conversion)).toBe(false);
  });

  it('rounds to the nearest whole cent rather than returning a fractional value', () => {
    const result = computeCpaGaugeState({
      dailyRollupRows: [{ spend_cents: 1000, conversions: 3 }],
    });
    expect(Number.isInteger(result.value_cents_per_conversion)).toBe(true);
  });
});
