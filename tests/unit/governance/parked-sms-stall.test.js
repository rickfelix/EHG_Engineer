/**
 * SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 — TS-5: the pure stale-parked-SMS predicate
 * (lib/governance/parked-sms-stall.mjs). No DB, no live data.
 */
import { describe, it, expect } from 'vitest';
import { isStaleParkedSms, DEFAULT_STALE_PARKED_MINUTES } from '../../../lib/governance/parked-sms-stall.mjs';

describe('isStaleParkedSms — TS-5', () => {
  it('default threshold is 24h in minutes', () => {
    expect(DEFAULT_STALE_PARKED_MINUTES).toBe(1440);
  });

  it('true at exactly the threshold (inclusive)', () => {
    expect(isStaleParkedSms(1440)).toBe(true);
  });

  it('true just over the threshold', () => {
    expect(isStaleParkedSms(1441)).toBe(true);
  });

  it('false just under the threshold', () => {
    expect(isStaleParkedSms(1439)).toBe(false);
  });

  it('false for a fresh row', () => {
    expect(isStaleParkedSms(5)).toBe(false);
  });

  it('respects a custom threshold', () => {
    expect(isStaleParkedSms(61, 60)).toBe(true);
    expect(isStaleParkedSms(59, 60)).toBe(false);
  });

  it('is defensive against non-finite input', () => {
    expect(isStaleParkedSms(NaN)).toBe(false);
    expect(isStaleParkedSms(undefined)).toBe(false);
    expect(isStaleParkedSms(1500, NaN)).toBe(false);
  });
});
