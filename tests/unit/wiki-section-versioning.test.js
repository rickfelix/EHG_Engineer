import { describe, it, expect } from 'vitest';
import { isValidDomain, computeNextVersion, WIKI_DOMAINS } from '../../lib/wiki/section-versioning.js';

describe('EHG Wiki section versioning (SD-LEO-INFRA-EHG-WIKI-DURABLE-001)', () => {
  describe('isValidDomain', () => {
    it('accepts all 5 canonical domains', () => {
      for (const domain of WIKI_DOMAINS) {
        expect(isValidDomain(domain)).toBe(true);
      }
    });

    it('rejects an out-of-scope domain (TS-2)', () => {
      expect(isValidDomain('bogus-domain')).toBe(false);
    });
  });

  describe('computeNextVersion', () => {
    it('returns version 1 for a fresh insert (existing = null)', () => {
      expect(computeNextVersion(null, 'new content')).toBe(1);
    });

    it('increments version when content changes (TS-1)', () => {
      const existing = { content: 'old content', version: 1 };
      expect(computeNextVersion(existing, 'new content')).toBe(2);
    });

    it('leaves version unchanged when content is identical (no-op re-run)', () => {
      const existing = { content: 'same content', version: 3 };
      expect(computeNextVersion(existing, 'same content')).toBe(3);
    });

    it('increments repeatedly across sequential real changes (1 -> 2 -> 3)', () => {
      let existing = { content: 'v1', version: 1 };
      let next = computeNextVersion(existing, 'v2');
      expect(next).toBe(2);
      existing = { content: 'v2', version: next };
      next = computeNextVersion(existing, 'v3');
      expect(next).toBe(3);
    });
  });
});
