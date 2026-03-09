/**
 * scope-snapshot.js unit tests
 * SD: SD-MAN-INFRA-SEMANTIC-VALIDATION-GATES-002
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureSnapshot, computeDelta } from '../../scripts/modules/handoff/validation/scope-snapshot.js';

describe('captureSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for null SD', () => {
    expect(captureSnapshot(null)).toBe(null);
  });

  it('captures keywords from SD fields', () => {
    const sd = {
      title: 'Database Migration Phase',
      scope: 'Update schema validation gates',
      description: 'Infrastructure improvement',
      sd_key: 'SD-TEST-001'
    };
    const snapshot = captureSnapshot(sd);

    expect(snapshot).not.toBeNull();
    expect(snapshot.keywords).toBeInstanceOf(Array);
    expect(snapshot.keywords.length).toBeGreaterThan(0);
    expect(snapshot.keyword_count).toBe(snapshot.keywords.length);
    expect(snapshot.sd_key).toBe('SD-TEST-001');
    expect(snapshot.timestamp).toBe('2026-03-09T12:00:00.000Z');
  });

  it('truncates scope_text to 500 chars', () => {
    const sd = {
      title: 'Test',
      scope: 'x'.repeat(600),
      description: ''
    };
    const snapshot = captureSnapshot(sd);
    expect(snapshot.scope_text.length).toBe(500);
  });

  it('handles empty scope gracefully', () => {
    const sd = { title: 'Database Update', scope: '', description: '' };
    const snapshot = captureSnapshot(sd);
    expect(snapshot.scope_text).toBe('');
    expect(snapshot.keywords.length).toBeGreaterThan(0); // from title
  });
});

describe('computeDelta', () => {
  it('returns not comparable for null inputs', () => {
    expect(computeDelta(null, null).comparable).toBe(false);
    expect(computeDelta(null, { keywords: [] }).comparable).toBe(false);
    expect(computeDelta({ keywords: [] }, null).comparable).toBe(false);
  });

  it('detects no change for identical snapshots', () => {
    const snapshot = { keywords: ['database', 'migration', 'schema'] };
    const delta = computeDelta(snapshot, snapshot);

    expect(delta.comparable).toBe(true);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.retained).toEqual(['database', 'migration', 'schema']);
    expect(delta.drift_score).toBe(0);
  });

  it('detects added keywords', () => {
    const before = { keywords: ['database'] };
    const after = { keywords: ['database', 'migration'] };
    const delta = computeDelta(before, after);

    expect(delta.added).toEqual(['migration']);
    expect(delta.removed).toEqual([]);
    expect(delta.retained).toEqual(['database']);
  });

  it('detects removed keywords', () => {
    const before = { keywords: ['database', 'migration'] };
    const after = { keywords: ['database'] };
    const delta = computeDelta(before, after);

    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual(['migration']);
    expect(delta.retained).toEqual(['database']);
  });

  it('calculates drift score correctly', () => {
    // Completely different: drift = 1.0
    const before = { keywords: ['alpha', 'beta'] };
    const after = { keywords: ['gamma', 'delta'] };
    const delta = computeDelta(before, after);

    expect(delta.drift_score).toBe(1);
    expect(delta.added.sort()).toEqual(['delta', 'gamma']);
    expect(delta.removed.sort()).toEqual(['alpha', 'beta']);
  });

  it('includes summary string', () => {
    const before = { keywords: ['database', 'old'] };
    const after = { keywords: ['database', 'fresh'] };
    const delta = computeDelta(before, after);

    expect(delta.summary).toContain('+1');
    expect(delta.summary).toContain('-1');
    expect(delta.summary).toContain('=1');
  });
});
