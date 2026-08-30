/**
 * QF-20260830-874 — 14 inbound chairman SMS specimens over 8 days landed at exactly 1600
 * characters, every one ending mid-word, nothing marking the row as clipped. This fixture
 * pins the shared detector: a 1600-char body renders with an explicit possibly-truncated
 * marker, and nothing shorter (or longer, which cannot happen but must not false-positive)
 * is flagged.
 */
import { describe, it, expect } from 'vitest';
import { isPossiblyClippedSmsBody, withClippedMarker } from '../../../lib/chairman/sms-clipped-detector.js';

describe('QF-20260830-874: SMS clipped-body detector', () => {
  it('a body of exactly 1600 chars (the measured Twilio concatenation cap) is flagged possibly clipped', () => {
    expect(isPossiblyClippedSmsBody('a'.repeat(1600))).toBe(true);
  });

  it('two-sided: a body of 1599 or 1601 chars is NOT flagged (only the exact tell counts)', () => {
    expect(isPossiblyClippedSmsBody('a'.repeat(1599))).toBe(false);
    expect(isPossiblyClippedSmsBody('a'.repeat(1601))).toBe(false);
  });

  it('a short, ordinary body is not flagged', () => {
    expect(isPossiblyClippedSmsBody('yes, approve')).toBe(false);
  });

  it('non-string / null bodies never throw and are not flagged', () => {
    expect(isPossiblyClippedSmsBody(null)).toBe(false);
    expect(isPossiblyClippedSmsBody(undefined)).toBe(false);
  });

  it('withClippedMarker prepends the marker only for a 1600-char body, leaving the original text otherwise', () => {
    const clipped = 'a'.repeat(1600);
    const normal = 'ok, approved';
    expect(withClippedMarker(clipped)).toMatch(/^\[POSSIBLY CLIPPED at 1600 chars\] /);
    expect(withClippedMarker(normal)).toBe(normal);
  });
});
