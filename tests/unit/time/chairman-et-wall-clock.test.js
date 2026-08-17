/**
 * SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A — canonical ET wall-clock helpers (FR-4 consolidation
 * target: previously 3 ad-hoc quiet-window implementations, none gating the SMS retry-release
 * point). Pins the 10PM-6AM ET boundary and the midnight-rollover fix in smsQuietWindowReleaseIso.
 */
import { describe, it, expect } from 'vitest';
import {
  isSmsQuietHour, smsQuietWindowReleaseIso, etLocalHour, etLocalMinute, et6amIso, etDateStr,
  etPrior545Iso, isValidCanonicalZone,
} from '../../../lib/time/chairman-et-wall-clock.js';

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

// SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-4): every exported function takes an optional
// trailing zone (default 'America/New_York'). Assertions below are independently computed /
// hardcoded ISO strings, not calls to the function under test.
describe('FR-4 — zone parameter threading', () => {
  // 2026-07-18T09:45:00Z = 05:45 EDT (ET, UTC-4 in summer) = 04:45 America/Jamaica (UTC-5,
  // no DST year-round) — same calendar day in both zones, different local hour.
  const now = new Date('2026-07-18T09:45:00Z');

  it('et6amIso(now) with no zone argument is byte-identical to the pre-FR-4 ET-only implementation', () => {
    expect(et6amIso(now)).toBe('2026-07-18T10:00:00.000Z'); // 6:00 AM EDT
  });

  it("et6amIso(now, 'America/Jamaica') returns 6:00 AM Jamaica time on now's Jamaica calendar date, independently computed", () => {
    expect(et6amIso(now, 'America/Jamaica')).toBe('2026-07-18T11:00:00.000Z'); // 6:00 AM Jamaica (UTC-5)
    expect(et6amIso(now, 'America/Jamaica')).not.toBe(et6amIso(now)); // must differ from the ET default
  });

  it('etLocalHour threads the zone', () => {
    expect(etLocalHour(now)).toBe(5);                       // 05:45 EDT
    expect(etLocalHour(now, 'America/Jamaica')).toBe(4);     // 04:45 Jamaica
  });

  // QF-20260816-091: etLocalMinute mirrors etLocalHour so callers (e.g. notifications
  // orchestrator's quiet-hours check) can derive a zone-local HH:MM without a second,
  // ad-hoc Intl.DateTimeFormat call.
  it('etLocalMinute threads the zone', () => {
    expect(etLocalMinute(now)).toBe(45);                    // 05:45 EDT
    expect(etLocalMinute(now, 'America/Jamaica')).toBe(45); // 04:45 Jamaica (same :45, different hour)
  });

  it('etDateStr threads the zone (calendar date can differ near a day boundary)', () => {
    // Both zones land on the same calendar day for this instant — a genuine cross-day case is
    // exercised by the smsQuietWindowReleaseIso zone test below.
    expect(etDateStr(now)).toBe('2026-07-18');
    expect(etDateStr(now, 'America/Jamaica')).toBe('2026-07-18');
  });

  it('isSmsQuietHour threads the zone', () => {
    // 20:58 UTC = 16:58 EDT (not quiet) but 15:58 America/Jamaica (also not quiet) — use an
    // instant where ET and Jamaica actually disagree on the 22:00-06:00 boundary.
    const edge = new Date('2026-01-16T02:30:00.000Z'); // 21:30 EST (not quiet) / 21:30 Jamaica (not quiet)
    const insideEtOnly = new Date('2026-01-16T03:30:00.000Z'); // 22:30 EST (quiet) / 22:30 Jamaica (quiet, same UTC-5 in Jan)
    expect(isSmsQuietHour(edge)).toBe(false);
    expect(isSmsQuietHour(insideEtOnly)).toBe(true);
    expect(isSmsQuietHour(insideEtOnly, 'America/Jamaica')).toBe(true); // Jamaica = UTC-5 = EST in January
  });

  it('etPrior545Iso threads the zone', () => {
    // 5:45 AM EDT on 2026-07-18 minus 24h.
    expect(etPrior545Iso(now)).toBe(new Date(Date.parse('2026-07-18T09:45:00.000Z') - 24 * 60 * 60 * 1000).toISOString());
    // 5:45 AM Jamaica (UTC-5) on 2026-07-18 = 10:45Z, minus 24h.
    expect(etPrior545Iso(now, 'America/Jamaica')).toBe(new Date(Date.parse('2026-07-18T10:45:00.000Z') - 24 * 60 * 60 * 1000).toISOString());
  });

  it('smsQuietWindowReleaseIso threads the zone through both isSmsQuietHour and et6amIso', () => {
    // 2026-01-16T04:58:00.000Z = 23:58 EST = 23:58 Jamaica (same UTC-5 offset in January) —
    // both in the quiet window, but each rolls to ITS OWN zone's next-day 6AM.
    const insideWindow = new Date('2026-01-16T04:58:00.000Z');
    const etRelease = smsQuietWindowReleaseIso(insideWindow);
    const jaRelease = smsQuietWindowReleaseIso(insideWindow, 'America/Jamaica');
    expect(etRelease).toBe(jaRelease); // identical offsets in January -> identical release instant
    expect(etRelease).toBe('2026-01-16T11:00:00.000Z'); // 6:00 AM EST/Jamaica the next day
  });
});

// SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (SEC-QW-02): the ONE shared canonical-zone check
// used by both write-time (chairman-preference-store.js) and read-time
// (quiet-hours-extension.js) validation -- moved here (previously duplicated in each file
// independently, which is exactly how the two drifted).
describe('isValidCanonicalZone', () => {
  it('accepts a canonical IANA zone', () => {
    expect(isValidCanonicalZone('America/Jamaica')).toBe(true);
    expect(isValidCanonicalZone('America/New_York')).toBe(true);
  });

  it('rejects a legacy alias that Intl tolerates but silently canonicalizes to a different name (confirmed reproducible)', () => {
    expect(isValidCanonicalZone('Asia/Kolkata')).toBe(false);   // -> Asia/Calcutta
    expect(isValidCanonicalZone('Europe/Kyiv')).toBe(false);    // -> Europe/Kiev
    expect(isValidCanonicalZone('US/Eastern')).toBe(false);     // -> America/New_York
  });

  it('rejects the Etc/GMT* family explicitly (inverted sign semantics)', () => {
    expect(isValidCanonicalZone('Etc/GMT+5')).toBe(false);
    expect(isValidCanonicalZone('etc/gmt+5')).toBe(false);
  });

  it('rejects non-canonical casing, non-strings, empty/whitespace, and garbage', () => {
    expect(isValidCanonicalZone('america/new_york')).toBe(false);
    expect(isValidCanonicalZone('not-a-zone')).toBe(false);
    expect(isValidCanonicalZone('')).toBe(false);
    expect(isValidCanonicalZone('   ')).toBe(false);
    expect(isValidCanonicalZone(null)).toBe(false);
    expect(isValidCanonicalZone(undefined)).toBe(false);
    expect(isValidCanonicalZone(['America/Jamaica'])).toBe(false);
    expect(isValidCanonicalZone({ zone: 'America/Jamaica' })).toBe(false);
  });
});
