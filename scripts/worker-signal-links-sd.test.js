// SD-REFILL-00KGB0SK: a follow-up signal (esp. spec-conflict) can carry --links-sd <KEY> so the
// coordinator dedups against an SD a review already auto-filed, instead of double-filing. These pin
// normalizeLinksSd: it accepts an SD-/QF- key shape (upper-cased) and rejects everything else
// (incl. the bare-flag `true`) so a malformed value never lands on the payload.
import { describe, it, expect } from 'vitest';
import { normalizeLinksSd } from './worker-signal.cjs';

describe('normalizeLinksSd (SD-REFILL-00KGB0SK)', () => {
  it('accepts a valid SD key and upper-cases it', () => {
    expect(normalizeLinksSd('SD-LEO-INFRA-CLAIM-RPC-HONOR-001')).toBe('SD-LEO-INFRA-CLAIM-RPC-HONOR-001');
    expect(normalizeLinksSd('sd-refill-00kgb0sk')).toBe('SD-REFILL-00KGB0SK');
  });

  it('accepts a QF key', () => {
    expect(normalizeLinksSd('QF-20260613-541')).toBe('QF-20260613-541');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLinksSd('  SD-LEO-INFRA-X-001  ')).toBe('SD-LEO-INFRA-X-001');
  });

  it('rejects the bare-flag true (no value given) -> null', () => {
    expect(normalizeLinksSd(true)).toBeNull();
  });

  it('rejects non-SD/QF or malformed strings -> null', () => {
    expect(normalizeLinksSd('not-an-sd')).toBeNull();
    expect(normalizeLinksSd('SD-')).toBeNull();
    expect(normalizeLinksSd('')).toBeNull();
    expect(normalizeLinksSd(undefined)).toBeNull();
    expect(normalizeLinksSd(42)).toBeNull();
  });
});
