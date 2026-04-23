/**
 * tests/unit/protocol-policies/claim-ownership-mode.test.js
 *
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-002 acceptance criteria)
 */

import { describe, it, expect } from 'vitest';
import {
  resolveOwnershipMode,
  shouldReleaseOnExit,
  OWNERSHIP_MODE,
} from '../../../lib/protocol-policies/claim-ownership-mode.js';

describe('resolveOwnershipMode', () => {
  describe('rule 1: explicit override', () => {
    it('returns explicit exclusive when passed', () => {
      expect(resolveOwnershipMode({ explicit: 'exclusive' })).toBe('exclusive');
    });

    it('returns explicit cooperative when passed', () => {
      expect(resolveOwnershipMode({ explicit: 'cooperative' })).toBe('cooperative');
    });

    it('explicit override wins even when caller != holder', () => {
      expect(resolveOwnershipMode({
        explicit: 'cooperative',
        callerSessionId: 'sess-A',
        existingClaimSessionId: 'sess-B',
      })).toBe('cooperative');
    });

    it('ignores invalid explicit mode and falls through to rules', () => {
      expect(resolveOwnershipMode({
        explicit: 'garbage',
        callerSessionId: 'sess-A',
        existingClaimSessionId: 'sess-A',
      })).toBe('cooperative');
    });

    it('ignores non-string explicit and falls through to rules', () => {
      expect(resolveOwnershipMode({
        explicit: 42,
        callerSessionId: 'sess-A',
        existingClaimSessionId: 'sess-A',
      })).toBe('cooperative');
    });
  });

  describe('rule 2: caller owns existing claim → cooperative', () => {
    it('returns cooperative when caller and holder match', () => {
      expect(resolveOwnershipMode({
        callerSessionId: 'sess-XYZ',
        existingClaimSessionId: 'sess-XYZ',
      })).toBe('cooperative');
    });

    it('returns exclusive when caller and holder differ', () => {
      expect(resolveOwnershipMode({
        callerSessionId: 'sess-A',
        existingClaimSessionId: 'sess-B',
      })).toBe('exclusive');
    });
  });

  describe('rule 3: safe default exclusive', () => {
    it('returns exclusive when no opts provided', () => {
      expect(resolveOwnershipMode()).toBe('exclusive');
    });

    it('returns exclusive when opts is empty', () => {
      expect(resolveOwnershipMode({})).toBe('exclusive');
    });

    it('returns exclusive when caller is missing but holder present', () => {
      expect(resolveOwnershipMode({
        existingClaimSessionId: 'sess-B',
      })).toBe('exclusive');
    });

    it('returns exclusive when holder is missing but caller present', () => {
      expect(resolveOwnershipMode({
        callerSessionId: 'sess-A',
      })).toBe('exclusive');
    });

    it('returns exclusive when caller is empty string', () => {
      expect(resolveOwnershipMode({
        callerSessionId: '',
        existingClaimSessionId: 'sess-B',
      })).toBe('exclusive');
    });

    it('returns exclusive when holder is null', () => {
      expect(resolveOwnershipMode({
        callerSessionId: 'sess-A',
        existingClaimSessionId: null,
      })).toBe('exclusive');
    });

    it('returns exclusive when both are null', () => {
      expect(resolveOwnershipMode({
        callerSessionId: null,
        existingClaimSessionId: null,
      })).toBe('exclusive');
    });
  });

  describe('type safety: non-string inputs', () => {
    it.each([42, true, {}, [], Symbol('x')])(
      'treats non-string callerSessionId %p as absent',
      (bad) => {
        expect(resolveOwnershipMode({
          callerSessionId: bad,
          existingClaimSessionId: 'sess-X',
        })).toBe('exclusive');
      }
    );

    it.each([42, true, {}, [], Symbol('x')])(
      'treats non-string existingClaimSessionId %p as absent',
      (bad) => {
        expect(resolveOwnershipMode({
          callerSessionId: 'sess-X',
          existingClaimSessionId: bad,
        })).toBe('exclusive');
      }
    );
  });
});

describe('shouldReleaseOnExit', () => {
  it('returns true for exclusive', () => {
    expect(shouldReleaseOnExit('exclusive')).toBe(true);
  });

  it('returns false for cooperative', () => {
    expect(shouldReleaseOnExit('cooperative')).toBe(false);
  });

  it('returns false for unknown modes (safe — do not release what we don\'t understand)', () => {
    expect(shouldReleaseOnExit('garbage')).toBe(false);
    expect(shouldReleaseOnExit(null)).toBe(false);
    expect(shouldReleaseOnExit(undefined)).toBe(false);
  });
});

describe('OWNERSHIP_MODE constants', () => {
  it('exposes the two valid modes', () => {
    expect(OWNERSHIP_MODE.EXCLUSIVE).toBe('exclusive');
    expect(OWNERSHIP_MODE.COOPERATIVE).toBe('cooperative');
  });

  it('is frozen (contract guarantee)', () => {
    expect(Object.isFrozen(OWNERSHIP_MODE)).toBe(true);
  });
});
