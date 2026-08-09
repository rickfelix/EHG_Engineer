/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-9 — visitors joins KPI_ALLOWLIST.
 *
 * WHY TWO-SIDED: an allowlist test that only asserts "visitors survives" would pass just as
 * happily against an allowlist that had stopped filtering ANYTHING — the accept case alone
 * cannot tell "visitors was allowed" from "everything is allowed". So every accept assertion
 * here is paired with a refusal that must still hold.
 */
import { describe, it, expect } from 'vitest';
import { KPI_ALLOWLIST, validateKpis } from '../../../scripts/venture-telemetry-pull.mjs';

describe('FR-9: visitors in the venture-metrics KPI allowlist', () => {
  // ACCEPT CASE FIRST — the thing chairman decision 241eaba4 actually ordered.
  it('accepts a valid integer visitors count and preserves its value', () => {
    const { kpis, dropped } = validateKpis({ visitors: 1372 });
    expect(kpis.visitors).toBe(1372);
    expect(dropped).not.toContain('visitors');
  });

  it('accepts zero — a measured zero is a real measurement, not a missing one', () => {
    const { kpis, dropped } = validateKpis({ visitors: 0 });
    expect(kpis).toHaveProperty('visitors', 0);
    expect(dropped).not.toContain('visitors');
  });

  // REFUSAL HALF — proves the entry is a real validator and not a blanket pass.
  it.each([
    ['negative', -1],
    ['non-integer', 12.5],
    ['numeric string', '400'],
    ['null', null],
    ['boolean', true],
  ])('drops a %s visitors value', (_label, value) => {
    const { kpis, dropped } = validateKpis({ visitors: value });
    expect(kpis).not.toHaveProperty('visitors');
    expect(dropped).toContain('visitors');
  });

  // THE CONTROL THAT KEEPS THE ACCEPT CASE HONEST: if this ever fails, the allowlist has
  // stopped filtering and the accept assertions above became meaningless.
  it('still drops an unknown key, so the allowlist is filtering at all', () => {
    const { kpis, dropped } = validateKpis({ visitors: 10, ip_address: '203.0.113.9' });
    expect(kpis).toHaveProperty('visitors', 10);
    expect(kpis).not.toHaveProperty('ip_address');
    expect(dropped).toContain('ip_address');
  });

  it('exposes visitors as a callable validator on the allowlist itself', () => {
    expect(typeof KPI_ALLOWLIST.visitors).toBe('function');
    expect(KPI_ALLOWLIST.visitors(5)).toBe(true);
    expect(KPI_ALLOWLIST.visitors(-5)).toBe(false);
  });

  // The allowlist is the single source of truth for what crosses the venture->platform
  // boundary, so an accidental widening is a data-minimization regression, not a style nit.
  it('adds visitors WITHOUT widening the allowlist to anything else', () => {
    expect(Object.keys(KPI_ALLOWLIST).sort()).toEqual(
      ['active_users', 'churn', 'health', 'revenue', 'signups', 'usage_volume', 'visitors'].sort()
    );
  });
});
