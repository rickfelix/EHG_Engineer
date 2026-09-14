/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-C FR-3 (P2.3) -- TS-3/TS-4/TS-5.
 * Pure-logic tests for the shared @wire-check-exempt marker grammar.
 */
import { describe, it, expect } from 'vitest';
import {
  parseExemptMarker,
  isExemptionActive,
  isExemptionCompliant,
  BARE_MARKER_SUNSET,
} from '../../../lib/wire-check/exempt-marker-grammar.js';

describe('parseExemptMarker', () => {
  it('parses the deprecated bare format (with a colon-reason, the established convention)', () => {
    const marker = parseExemptMarker('// @wire-check-exempt: one-off DB probe\nconsole.log(1);');
    expect(marker).toEqual({ kind: 'bare' });
  });

  it('parses the new SD-key + expiry format', () => {
    const marker = parseExemptMarker('// @wire-check-exempt SD-LEO-INFRA-FOO-001 expires:2026-12-01\n');
    expect(marker).toEqual({ kind: 'dated', sdKey: 'SD-LEO-INFRA-FOO-001', expiresAt: '2026-12-01' });
  });

  it('returns null when no marker is present', () => {
    expect(parseExemptMarker('// a regular module\nexport default 1;')).toBeNull();
  });

  it('word-boundary: does not match a longer identifier', () => {
    expect(parseExemptMarker('const x = "@wire-check-exemption-policy";')).toBeNull();
  });

  it('handles undefined/empty input without throwing', () => {
    expect(parseExemptMarker(undefined)).toBeNull();
    expect(parseExemptMarker('')).toBeNull();
  });
});

describe('TS-3/TS-4: both readers agree on the new and the deprecated format (additive migration)', () => {
  it('a file with ONLY the new SD-key+expiry format is recognized as exempt (not-yet-expired)', () => {
    const now = new Date('2026-09-14T00:00:00.000Z');
    const marker = parseExemptMarker('// @wire-check-exempt SD-X-001 expires:2026-12-01\n');
    expect(isExemptionActive(marker, now)).toBe(true);
    expect(isExemptionCompliant(marker, now)).toBe(true);
  });

  it('a file with ONLY the deprecated bare marker still passes (additive, not a breaking migration)', () => {
    const now = new Date('2026-09-14T00:00:00.000Z');
    const marker = parseExemptMarker('// @wire-check-exempt: legacy one-off probe\n');
    expect(isExemptionActive(marker, now)).toBe(true);
    expect(isExemptionCompliant(marker, now)).toBe(true);
  });

  it('the bare marker stops being recognized after its sunset date', () => {
    const afterSunset = new Date(Date.parse(BARE_MARKER_SUNSET) + 24 * 60 * 60 * 1000);
    const marker = parseExemptMarker('// @wire-check-exempt: legacy one-off probe\n');
    expect(isExemptionActive(marker, afterSunset)).toBe(false);
    expect(isExemptionCompliant(marker, afterSunset)).toBe(false);
  });
});

describe('TS-5: isExemptionActive (grace-windowed) vs isExemptionCompliant (strict fail-closed) diverge on an expired dated marker', () => {
  it('isExemptionActive still honors the grace window just past expiry; isExemptionCompliant does not', () => {
    const marker = { kind: 'dated', sdKey: 'SD-X-001', expiresAt: '2026-09-01' };
    const justPastExpiry = new Date('2026-09-05T00:00:00.000Z'); // 4 days past, inside the 14-day grace window
    expect(isExemptionActive(marker, justPastExpiry)).toBe(true);
    expect(isExemptionCompliant(marker, justPastExpiry)).toBe(false);
  });

  it('isExemptionActive also fails once past the grace window', () => {
    const marker = { kind: 'dated', sdKey: 'SD-X-001', expiresAt: '2026-09-01' };
    const wellPastGrace = new Date('2026-10-01T00:00:00.000Z');
    expect(isExemptionActive(marker, wellPastGrace)).toBe(false);
    expect(isExemptionCompliant(marker, wellPastGrace)).toBe(false);
  });

  it('a not-yet-expired dated marker is active and compliant under both functions', () => {
    const marker = { kind: 'dated', sdKey: 'SD-X-001', expiresAt: '2099-01-01' };
    const now = new Date('2026-09-14T00:00:00.000Z');
    expect(isExemptionActive(marker, now)).toBe(true);
    expect(isExemptionCompliant(marker, now)).toBe(true);
  });

  it('a malformed expiry fails closed under both functions, with no grace extension', () => {
    const marker = { kind: 'dated', sdKey: 'SD-X-001', expiresAt: 'not-a-date' };
    const now = new Date('2026-09-14T00:00:00.000Z');
    expect(isExemptionActive(marker, now)).toBe(false);
    expect(isExemptionCompliant(marker, now)).toBe(false);
  });

  it('no marker (null) is inactive and non-compliant', () => {
    const now = new Date('2026-09-14T00:00:00.000Z');
    expect(isExemptionActive(null, now)).toBe(false);
    expect(isExemptionCompliant(null, now)).toBe(false);
  });
});
