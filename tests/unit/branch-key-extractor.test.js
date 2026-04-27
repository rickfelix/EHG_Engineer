import { describe, it, expect } from 'vitest';
import { extractKey, extractKeyString } from '../../scripts/lib/branch-key-extractor.js';

describe('branch-key-extractor', () => {
  describe('extractKey() — SD branch shapes', () => {
    it('parses feat/SD-* branches', () => {
      expect(extractKey('feat/SD-XYZ-001')).toEqual({ kind: 'SD', key: 'SD-XYZ-001' });
    });

    it('parses fix/SD-* branches', () => {
      expect(extractKey('fix/SD-XYZ-002')).toEqual({ kind: 'SD', key: 'SD-XYZ-002' });
    });

    it('parses refactor/SD-* branches', () => {
      expect(extractKey('refactor/SD-XYZ-004')).toEqual({ kind: 'SD', key: 'SD-XYZ-004' });
    });

    it('parses bare SD- prefix branches', () => {
      expect(extractKey('SD-XYZ-003')).toEqual({ kind: 'SD', key: 'SD-XYZ-003' });
    });

    it('parses multi-segment SD keys', () => {
      expect(extractKey('feat/SD-LEO-INFRA-PR-TRACKING-BACKFILL-001-some-slug'))
        .toEqual({ kind: 'SD', key: 'SD-LEO-INFRA-PR-TRACKING-BACKFILL-001' });
    });

    it('uppercases lowercase SD keys', () => {
      expect(extractKey('feat/sd-xyz-001')).toEqual({ kind: 'SD', key: 'SD-XYZ-001' });
    });
  });

  describe('extractKey() — QF branch shapes', () => {
    it('parses qf/QF-* branches', () => {
      expect(extractKey('qf/QF-20260101-001'))
        .toEqual({ kind: 'QF', key: 'QF-20260101-001' });
    });

    it('parses quick-fix/QF-* branches', () => {
      expect(extractKey('quick-fix/QF-20260101-002'))
        .toEqual({ kind: 'QF', key: 'QF-20260101-002' });
    });

    it('uppercases lowercase QF keys', () => {
      expect(extractKey('qf/qf-20260101-003'))
        .toEqual({ kind: 'QF', key: 'QF-20260101-003' });
    });
  });

  describe('extractKey() — non-matches', () => {
    it('returns null for unprefixed branches', () => {
      expect(extractKey('unprefixed-branch')).toBeNull();
    });

    it('returns null for malformed SD keys (no terminal segment)', () => {
      expect(extractKey('partial-SD-malformed')).toBeNull();
    });

    it('returns null for malformed QF keys (wrong date width)', () => {
      expect(extractKey('qf/QF-2026-001')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(extractKey('')).toBeNull();
      expect(extractKey(null)).toBeNull();
      expect(extractKey(undefined)).toBeNull();
    });

    it('returns null for non-string input', () => {
      expect(extractKey(42)).toBeNull();
      expect(extractKey({})).toBeNull();
    });
  });

  describe('extractKey() — precedence', () => {
    it('prefers SD when both could match', () => {
      const result = extractKey('feat/SD-XYZ-001-but-also-QF-20260101-001');
      expect(result).toEqual({ kind: 'SD', key: 'SD-XYZ-001' });
    });
  });

  describe('extractKeyString()', () => {
    it('returns just the key string', () => {
      expect(extractKeyString('feat/SD-XYZ-001')).toBe('SD-XYZ-001');
      expect(extractKeyString('qf/QF-20260101-001')).toBe('QF-20260101-001');
    });

    it('returns null for non-matches', () => {
      expect(extractKeyString('main')).toBeNull();
    });
  });
});
