import { describe, it, expect } from 'vitest';
import workerCheckin from '../../scripts/worker-checkin.cjs';
import fleetQuiescence from '../../lib/coordinator/fleet-quiescence.cjs';

const { DEFAULT_IDLE_WAKEUP_SECONDS } = workerCheckin;
const { resolveRecentMin, RECENT_MIN } = fleetQuiescence;

describe('SD-LEO-INFRA-LOOP-RESUME-DELAY-SHORTEN-001: idle resume cadence', () => {
  it('DEFAULT_IDLE_WAKEUP_SECONDS is shortened to 600 (was 1200)', () => {
    expect(DEFAULT_IDLE_WAKEUP_SECONDS).toBe(600);
  });

  it('DEFAULT_IDLE_WAKEUP_SECONDS stays within the grounded [300,600] range', () => {
    expect(DEFAULT_IDLE_WAKEUP_SECONDS).toBeGreaterThanOrEqual(300);
    expect(DEFAULT_IDLE_WAKEUP_SECONDS).toBeLessThanOrEqual(600);
  });
});

describe('resolveRecentMin: quiescence window with a >=3m floor', () => {
  it('defaults to 5 when no override is provided', () => {
    expect(resolveRecentMin(undefined)).toBe(5);
    expect(resolveRecentMin('')).toBe(5);
    expect(resolveRecentMin(0)).toBe(5); // 0 is falsy -> default 5
  });

  it('honors a valid override above the floor', () => {
    expect(resolveRecentMin('10')).toBe(10);
    expect(resolveRecentMin(7)).toBe(7);
  });

  it('floors any override below 3m to 3 (avoids flash idle/active churn)', () => {
    expect(resolveRecentMin('1')).toBe(3);
    expect(resolveRecentMin('2')).toBe(3);
    expect(resolveRecentMin(3)).toBe(3);
  });

  it('the module-level RECENT_MIN respects the floor and is <= the old 20m default', () => {
    expect(RECENT_MIN).toBeGreaterThanOrEqual(3);
    expect(RECENT_MIN).toBeLessThanOrEqual(20);
  });
});
