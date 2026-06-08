/**
 * Unit tests — SD-FDBK-FIX-COORDINATOR-AUDIT-MJS-002
 * sourceableBacklog drops completion-flag / fleet-retro auto-captures (closure witnesses) from
 * the harness_backlog feed so the coordinator-audit SOURCE BACKLOG verdict reflects genuine work.
 */
import { describe, it, expect } from 'vitest';
import { isAutoCaptureFeedback, sourceableBacklog } from './sourceable-backlog.mjs';

describe('isAutoCaptureFeedback', () => {
  it('flags rows with metadata.flag_class as auto-captures', () => {
    expect(isAutoCaptureFeedback({ title: 'whatever', metadata: { flag_class: 'harness' } })).toBe(true);
    expect(isAutoCaptureFeedback({ title: 'x', metadata: { flag_class: 'feedback' } })).toBe(true);
  });

  it('flags completion-flag / fleet-retro / coordinator-review titles (metadata fallback)', () => {
    expect(isAutoCaptureFeedback({ title: 'Completion flag (harness) — SD-FOO-001' })).toBe(true);
    expect(isAutoCaptureFeedback({ title: 'Fleet retro — SD-BAR-002' })).toBe(true);
    expect(isAutoCaptureFeedback({ title: 'Coordinator review of SD-BAZ' })).toBe(true);
  });

  it('does NOT flag a genuine harness-backlog item', () => {
    expect(isAutoCaptureFeedback({ title: 'COORDINATION-CHANNEL BUG: messages auto-marked read', metadata: {} })).toBe(false);
    expect(isAutoCaptureFeedback({ title: 'sd-start leaves a locked orphan worktree', metadata: null })).toBe(false);
  });

  it('handles missing/empty input safely', () => {
    expect(isAutoCaptureFeedback({})).toBe(false);
    expect(isAutoCaptureFeedback({ title: '' })).toBe(false);
    expect(isAutoCaptureFeedback(null)).toBe(false);
  });
});

describe('sourceableBacklog', () => {
  it('keeps genuine items and drops auto-captures (the 101->genuine fix)', () => {
    const backlog = [
      { id: 1, title: 'Completion flag (harness) — SD-A', metadata: { flag_class: 'harness' } },
      { id: 2, title: 'Completion flag (feedback) — SD-B', metadata: { flag_class: 'feedback' } },
      { id: 3, title: 'GENUINE: coordinator inbox bug', metadata: {} },
      { id: 4, title: 'Fleet retro — SD-C' },
      { id: 5, title: 'log-harness-bug: worktree cap stalls fleet', metadata: null },
    ];
    const out = sourceableBacklog(backlog);
    expect(out.map((r) => r.id)).toEqual([3, 5]);
  });

  it('returns [] for null/empty', () => {
    expect(sourceableBacklog(null)).toEqual([]);
    expect(sourceableBacklog([])).toEqual([]);
  });
});
