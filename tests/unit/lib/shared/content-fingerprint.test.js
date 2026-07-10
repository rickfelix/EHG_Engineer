import { describe, it, expect } from 'vitest';
import {
  normalize,
  fingerprint,
  severityRank,
  groupByFingerprint,
  shouldPromote
} from '../../../../lib/shared/content-fingerprint.cjs';

describe('content-fingerprint', () => {
  describe('normalize', () => {
    it('lowercases, NFKC-normalizes, and collapses whitespace', () => {
      expect(normalize('  Hello   World  ')).toBe('hello world');
    });

    it('strips control and zero-width characters', () => {
      const zeroWidthSpace = '​';
      expect(normalize(`a b${zeroWidthSpace}c`)).toBe('a bc');
    });

    it('returns empty string for non-string input', () => {
      expect(normalize(null)).toBe('');
      expect(normalize(undefined)).toBe('');
      expect(normalize(42)).toBe('');
    });

    it('truncates to 200 characters', () => {
      expect(normalize('a'.repeat(300)).length).toBe(200);
    });
  });

  describe('fingerprint', () => {
    it('is deterministic for identical type+body', () => {
      expect(fingerprint('harness', 'same body')).toBe(fingerprint('harness', 'same body'));
    });

    it('is insensitive to whitespace/case variants that normalize() collapses', () => {
      expect(fingerprint('harness', '  Same   Body  ')).toBe(fingerprint('harness', 'same body'));
    });

    it('differs across types for the same body', () => {
      expect(fingerprint('a', 'body')).not.toBe(fingerprint('b', 'body'));
    });
  });

  describe('severityRank', () => {
    it('ranks low < medium < high < critical', () => {
      expect(severityRank('low')).toBeLessThan(severityRank('medium'));
      expect(severityRank('medium')).toBeLessThan(severityRank('high'));
      expect(severityRank('high')).toBeLessThan(severityRank('critical'));
    });

    it('defaults unknown/missing severity to medium rank', () => {
      expect(severityRank(undefined)).toBe(severityRank('medium'));
      expect(severityRank('bogus')).toBe(severityRank('medium'));
    });
  });

  describe('groupByFingerprint', () => {
    const extract = (r) => ({
      type: r.type,
      body: r.body,
      groupKey: r.key,
      severity: r.severity,
      timestamp: r.ts
    });

    it('buckets rows sharing a fingerprint into one group', () => {
      const rows = [
        { type: 'x', body: 'same', key: 'a', ts: '2026-01-01T00:00:00Z' },
        { type: 'x', body: 'same', key: 'b', ts: '2026-01-02T00:00:00Z' },
        { type: 'x', body: 'different', key: 'c', ts: '2026-01-03T00:00:00Z' }
      ];
      const groups = groupByFingerprint(rows, extract);
      expect(groups.size).toBe(2);
    });

    it('tracks distinct groupKeys, first/last seen, and max severity', () => {
      const rows = [
        { type: 'x', body: 'same', key: 'a', ts: '2026-01-01T00:00:00Z', severity: 'low' },
        { type: 'x', body: 'same', key: 'a', ts: '2026-01-05T00:00:00Z', severity: 'high' },
        { type: 'x', body: 'same', key: 'b', ts: '2026-01-03T00:00:00Z', severity: 'medium' }
      ];
      const groups = groupByFingerprint(rows, extract);
      const [group] = groups.values();
      expect(group.groupKeys.size).toBe(2); // 'a' deduped, plus 'b'
      expect(group.first_seen).toBe('2026-01-01T00:00:00Z');
      expect(group.last_seen).toBe('2026-01-05T00:00:00Z');
      expect(group.max_severity).toBe('high');
    });
  });

  describe('shouldPromote', () => {
    it('promotes when groupKeys reach the threshold', () => {
      const group = { max_severity: 'low', groupKeys: new Set(['a', 'b', 'c']) };
      expect(shouldPromote(group, 3)).toBe(true);
    });

    it('does not promote below threshold without critical severity', () => {
      const group = { max_severity: 'high', groupKeys: new Set(['a']) };
      expect(shouldPromote(group, 3)).toBe(false);
    });

    it('bypasses the threshold for a single critical occurrence', () => {
      const group = { max_severity: 'critical', groupKeys: new Set(['a']) };
      expect(shouldPromote(group, 3)).toBe(true);
    });
  });
});
