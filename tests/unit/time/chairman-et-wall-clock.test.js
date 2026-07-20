/**
 * SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A — canonical ET wall-clock helpers (FR-4 consolidation
 * target: previously 3 ad-hoc quiet-window implementations, none gating the SMS retry-release
 * point). Pins the 10PM-6AM ET boundary and the midnight-rollover fix in smsQuietWindowReleaseIso.
 */
import { describe, it, expect } from 'vitest';
import { isSmsQuietHour, smsQuietWindowReleaseIso, etLocalHour, et6amIso } from '../../../lib/time/chairman-et-wall-clock.js';

describe('isSmsQuietHour — 10PM-6AM ET boundary', () => {
  it('21:59 ET is NOT quiet (just before the window)', () => {
    expect(isSmsQuietHour(new Date('2026-01-16T02:59:00.000Z'))).toBe(false); // 21:59 ET (UTC-5)
  });
  it('22:00 ET IS quiet (window start)', () => {
    expect(isSmsQuietHour(new Date('2026-01-16T03:00:00.000Z'))).toBe(true); // 22:00 ET
  });
  it('05:59 ET IS quiet (just before window end)', () => {
    expect(isSmsQuietHour(new Date('2026-01-16T10:59:00.000Z'))).toBe(true); // 05:59 ET
  });
  it('06:00 ET is NOT quiet (window end)', () => {
    expect(isSmsQuietHour(new Date('2026-01-16T11:00:00.000Z'))).toBe(false); // 06:00 ET
  });
  it('midday ET is NOT quiet', () => {
    expect(isSmsQuietHour(new Date('2026-01-16T18:00:00.000Z'))).toBe(false); // 13:00 ET
  });
});

describe('smsQuietWindowReleaseIso — Solomon Pin #1 (sleep-window AT release, midnight rollover)', () => {
  it('outside the window returns null (immediate release)', () => {
    expect(smsQuietWindowReleaseIso(new Date('2026-01-16T18:00:00.000Z'))).toBeNull();
  });

  it('BEFORE midnight (e.g. 11:58 PM ET) rolls over to TOMORROW\'s 6AM ET, not a past instant', () => {
    const now = new Date('2026-01-16T04:58:00.000Z'); // 23:58 ET on 2026-01-15
    const releaseIso = smsQuietWindowReleaseIso(now);
    expect(releaseIso).toBeTruthy();
    expect(new Date(releaseIso).getTime()).toBeGreaterThan(now.getTime()); // must be in the FUTURE
    expect(etLocalHour(new Date(releaseIso))).toBe(6);
  });

  it('AFTER midnight (e.g. 2:00 AM ET) uses the SAME calendar day\'s 6AM (still upcoming)', () => {
    const now = new Date('2026-01-16T07:00:00.000Z'); // 02:00 ET on 2026-01-16
    const releaseIso = smsQuietWindowReleaseIso(now);
    expect(releaseIso).toBe(et6amIso(now)); // same-day 6AM is correct here — no rollover needed
    expect(new Date(releaseIso).getTime()).toBeGreaterThan(now.getTime());
  });
});
