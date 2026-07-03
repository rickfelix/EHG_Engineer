/**
 * Unit tests for the operator cash/burn substrate honest-degrade logic
 * (SD-EHG-OPERATOR-RUNWAY-SUBSTRATE-001). Pure functions only — no DB.
 */
import { describe, it, expect } from 'vitest';
import {
  periodMonthOf,
  freshness,
  computeRunway,
  LIVENESS_WINDOWS_MS,
  AI_BURN_LOWER_BOUND_LABEL,
} from '../../../lib/operator/cash-burn-substrate.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-06-16T12:00:00.000Z');
const fresh = (hoursAgo) => new Date(NOW - hoursAgo * HOUR).toISOString();

describe('periodMonthOf', () => {
  it('returns the first-of-month YYYY-MM-01 for the given instant', () => {
    expect(periodMonthOf(Date.parse('2026-06-16T12:00:00Z'))).toBe('2026-06-01');
    expect(periodMonthOf(Date.parse('2026-01-31T23:59:00Z'))).toBe('2026-01-01');
  });
});

describe('freshness', () => {
  it('NULL last_synced_at is unattested (never live)', () => {
    expect(freshness(null, HOUR, NOW)).toEqual({ status: 'unattested', ageMs: null });
  });
  it('older than the window is stale', () => {
    expect(freshness(fresh(5), 3 * HOUR, NOW).status).toBe('stale');
  });
  it('within the window is live', () => {
    expect(freshness(fresh(1), 3 * HOUR, NOW).status).toBe('live');
  });
  it('an unparseable timestamp degrades to unattested, not a crash', () => {
    expect(freshness('not-a-date', HOUR, NOW).status).toBe('unattested');
  });
});

describe('computeRunway — honest degrade', () => {
  it('a null row degrades every input to unattested and withholds the runway headline', () => {
    const v = computeRunway(null, { nowMs: NOW });
    expect(v.months_of_runway).toBeNull();
    expect(v.headline).toBe('awaiting cash source');
    for (const k of ['cash', 'ai_burn', 'other_burn', 'revenue']) {
      expect(v.partials[k].value_usd).toBeNull();
      expect(v.partials[k].status).toBe('unattested');
    }
  });

  it('cash absent + ai_burn fresh: net-burn is live but runway is withheld as awaiting cash', () => {
    const row = {
      cash_usd: null, cash_last_synced_at: null,
      ai_burn_usd: 600, ai_burn_last_synced_at: fresh(1), ai_burn_is_lower_bound: true,
      other_burn_usd: null, other_burn_last_synced_at: null,
      revenue_usd: 100, revenue_last_synced_at: fresh(1), revenue_livemode: false,
    };
    const v = computeRunway(row, { nowMs: NOW });
    expect(v.months_of_runway).toBeNull();
    expect(v.headline).toBe('awaiting cash source');
    expect(v.partials.net_burn.status).toBe('live');
    expect(v.partials.net_burn.value_usd).toBe(500); // 600 + 0 - 100
  });

  it('cash + ai_burn fresh: months-of-runway renders (cash / net-burn)', () => {
    const row = {
      cash_usd: 5000, cash_last_synced_at: fresh(2),
      ai_burn_usd: 800, ai_burn_last_synced_at: fresh(1), ai_burn_is_lower_bound: true,
      other_burn_usd: 200, other_burn_last_synced_at: fresh(1),
      revenue_usd: 0, revenue_last_synced_at: fresh(1), revenue_livemode: false,
    };
    const v = computeRunway(row, { nowMs: NOW });
    expect(v.partials.net_burn.value_usd).toBe(1000); // 800 + 200 - 0
    expect(v.months_of_runway).toBe(5.0); // 5000 / 1000
    expect(v.headline).toBe('5 months of runway');
  });

  it('a STALE input is SUPPRESSED — its old value is never shown as live', () => {
    const row = {
      cash_usd: 5000, cash_last_synced_at: fresh(2),
      ai_burn_usd: 800, ai_burn_last_synced_at: fresh(10), ai_burn_is_lower_bound: true, // 10h > 3h window
      other_burn_usd: null, other_burn_last_synced_at: null,
      revenue_usd: null, revenue_last_synced_at: null,
    };
    const v = computeRunway(row, { nowMs: NOW });
    expect(v.partials.ai_burn.status).toBe('stale');
    expect(v.partials.ai_burn.value_usd).toBeNull(); // suppressed, NOT 800
    expect(v.partials.ai_burn.label).toBe('stale / not yet measurable');
    expect(v.months_of_runway).toBeNull();
    expect(v.headline).toBe('awaiting burn data');
  });

  it('ai_burn carries the lower-bound flag + label when live', () => {
    const row = {
      cash_usd: null, cash_last_synced_at: null,
      ai_burn_usd: 300, ai_burn_last_synced_at: fresh(1), ai_burn_is_lower_bound: true,
      other_burn_usd: null, other_burn_last_synced_at: null,
      revenue_usd: null, revenue_last_synced_at: null,
    };
    const v = computeRunway(row, { nowMs: NOW });
    expect(v.partials.ai_burn.is_lower_bound).toBe(true);
    expect(v.partials.ai_burn.lower_bound_label).toBe(AI_BURN_LOWER_BOUND_LABEL);
  });

  it('revenue surfaces its test-mode flag honestly', () => {
    const row = {
      cash_usd: null, cash_last_synced_at: null,
      ai_burn_usd: null, ai_burn_last_synced_at: null,
      other_burn_usd: null, other_burn_last_synced_at: null,
      revenue_usd: 25, revenue_last_synced_at: fresh(1), revenue_livemode: false,
    };
    const v = computeRunway(row, { nowMs: NOW });
    expect(v.partials.revenue.value_usd).toBe(25);
    expect(v.partials.revenue.test_mode).toBe(true);
    expect(v.partials.revenue.livemode).toBe(false);
  });

  it('net cash-positive (revenue >= burn) withholds runway rather than reporting infinite', () => {
    const row = {
      cash_usd: 5000, cash_last_synced_at: fresh(1),
      ai_burn_usd: 100, ai_burn_last_synced_at: fresh(1), ai_burn_is_lower_bound: true,
      other_burn_usd: 0, other_burn_last_synced_at: fresh(1),
      revenue_usd: 500, revenue_last_synced_at: fresh(1), revenue_livemode: true,
    };
    const v = computeRunway(row, { nowMs: NOW });
    expect(v.partials.net_burn.value_usd).toBe(-400); // 100 + 0 - 500
    expect(v.months_of_runway).toBeNull();
    expect(v.headline).toBe('net cash-positive (no burn-down)');
  });

  it('NULL-not-zero: a 0-valued cash input is distinct from an absent one and never fabricated', () => {
    // absent cash → unattested (no value); explicit 0 cash → live 0 (a real, attested zero)
    const absent = computeRunway({ cash_usd: null, cash_last_synced_at: null, ai_burn_usd: null, ai_burn_last_synced_at: null, other_burn_usd: null, other_burn_last_synced_at: null, revenue_usd: null, revenue_last_synced_at: null }, { nowMs: NOW });
    expect(absent.partials.cash.status).toBe('unattested');
    expect(absent.partials.cash.value_usd).toBeNull();
    const attestedZero = computeRunway({ cash_usd: 0, cash_last_synced_at: fresh(1), ai_burn_usd: null, ai_burn_last_synced_at: null, other_burn_usd: null, other_burn_last_synced_at: null, revenue_usd: null, revenue_last_synced_at: null }, { nowMs: NOW });
    expect(attestedZero.partials.cash.status).toBe('live');
    expect(attestedZero.partials.cash.value_usd).toBe(0);
  });

  it('a fresh sync timestamp with a null value withholds runway rather than fabricating 0 (regression)', () => {
    // cash_last_synced_at is fresh, but cash_usd was never actually recorded (null) -- this must
    // NOT be treated as a live $0 cash balance, since null/burn would otherwise coerce to 0 and
    // produce a fabricated "0 months of runway" headline.
    const row = {
      cash_usd: null, cash_last_synced_at: fresh(1),
      ai_burn_usd: 800, ai_burn_last_synced_at: fresh(1), ai_burn_is_lower_bound: true,
      other_burn_usd: null, other_burn_last_synced_at: null,
      revenue_usd: null, revenue_last_synced_at: null,
    };
    const v = computeRunway(row, { nowMs: NOW });
    expect(v.partials.cash.status).toBe('unattested');
    expect(v.partials.cash.value_usd).toBeNull();
    expect(v.partials.cash.label).toBe('not yet measured');
    expect(v.months_of_runway).toBeNull();
    expect(v.headline).toBe('awaiting cash source');
  });

  it('exposes per-input liveness windows (ai_burn/revenue hourly-tight, cash generous)', () => {
    expect(LIVENESS_WINDOWS_MS.ai_burn).toBeLessThan(LIVENESS_WINDOWS_MS.cash);
    expect(LIVENESS_WINDOWS_MS.revenue).toBe(LIVENESS_WINDOWS_MS.ai_burn);
  });
});
