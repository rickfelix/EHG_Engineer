/**
 * QF-20260823-017: two invocations of `adam-opportunity-scan.cjs --scan` ~1min apart sent
 * byte-identical advisories (measured live: rows 2d924ed8/67827066, coordinator-flagged
 * 9ef97730) -- nothing deduped the second invocation against the first. alreadySurfacedToday()
 * closes it: a SURFACED entry already in today's ledger with the SAME dedup_key means the
 * second scan is re-detecting the same opportunity, not a new one.
 *
 * Regression: two consecutive invocations must produce exactly one coordination row -- proven
 * here at the pure-decision layer (main() itself is untestable, per the file's own docblocks).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { alreadySurfacedToday } = require('../../scripts/adam-opportunity-scan.cjs');

describe('alreadySurfacedToday', () => {
  const today = new Date('2026-08-23T15:30:00Z');

  it('returns false with an empty ledger (first-ever scan)', () => {
    expect(alreadySurfacedToday([], 'gate-threshold-tuning', today)).toBe(false);
  });

  it('returns false when dedupKey is null/undefined -- never suppress on an absent key', () => {
    const ledger = [{ ts: today.toISOString(), verdict: 'SURFACED', detail: 'gate-threshold-tuning' }];
    expect(alreadySurfacedToday(ledger, null, today)).toBe(false);
    expect(alreadySurfacedToday(ledger, undefined, today)).toBe(false);
  });

  // THE REGRESSION ITSELF: the exact incident shape -- a second same-day scan with the same key.
  it('QF-20260823-017 regression: a second same-day scan with the SAME dedup_key is deduped', () => {
    const firstScanEntry = { ts: '2026-08-23T15:29:00.000Z', verdict: 'SURFACED', detail: 'gate-threshold-tuning' };
    const secondScanNow = new Date('2026-08-23T15:30:05.000Z'); // ~1min later, matches the incident
    expect(alreadySurfacedToday([firstScanEntry], 'gate-threshold-tuning', secondScanNow)).toBe(true);
  });

  it('does NOT dedupe a different dedup_key on the same day (a genuinely distinct opportunity)', () => {
    const ledger = [{ ts: today.toISOString(), verdict: 'SURFACED', detail: 'gate-threshold-tuning' }];
    expect(alreadySurfacedToday(ledger, 'some-other-opportunity', today)).toBe(false);
  });

  it('does NOT dedupe the same key from a PRIOR calendar day (yesterday is not today)', () => {
    const ledger = [{ ts: '2026-08-22T23:59:00.000Z', verdict: 'SURFACED', detail: 'gate-threshold-tuning' }];
    expect(alreadySurfacedToday(ledger, 'gate-threshold-tuning', today)).toBe(false);
  });

  it('does NOT dedupe against a non-SURFACED entry with the same detail (e.g. a stale/unrelated field)', () => {
    const ledger = [{ ts: today.toISOString(), verdict: 'ADAM_OK', detail: 'gate-threshold-tuning' }];
    expect(alreadySurfacedToday(ledger, 'gate-threshold-tuning', today)).toBe(false);
  });

  it('is tolerant of malformed ledger rows (null entries, missing fields) -- never throws', () => {
    const ledger = [null, {}, { verdict: 'SURFACED' }, { ts: today.toISOString(), verdict: 'SURFACED', detail: 'gate-threshold-tuning' }];
    expect(() => alreadySurfacedToday(ledger, 'gate-threshold-tuning', today)).not.toThrow();
    expect(alreadySurfacedToday(ledger, 'gate-threshold-tuning', today)).toBe(true);
  });
});
