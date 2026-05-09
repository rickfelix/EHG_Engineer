/**
 * Unit tests for QF-20260509-149: harness_backlog exclusion from /leo assist Phase 2.
 *
 * Backlog row 413d2b19. Witnessed 2026-05-09: 117/118 enhancements surfaced were
 * already-deferred harness_backlog rows that operator had to batch-defer manually.
 * Fix excludes them at the source (lib/quality/assist-engine.js).
 */

import { describe, it, expect } from 'vitest';
import { splitEnhancementsExcludingHarnessBacklog } from '../../lib/quality/assist-engine.js';

function row({ id, type = 'enhancement', category = null }) {
  return { id, type, category };
}

describe('QF-20260509-149: splitEnhancementsExcludingHarnessBacklog', () => {
  it('excludes type=enhancement rows with category=harness_backlog', () => {
    const enriched = [
      row({ id: 'a', category: 'harness_backlog' }),
      row({ id: 'b', category: 'enhancement' }),
      row({ id: 'c', category: 'harness_backlog' }),
      row({ id: 'd', category: null }),
    ];
    const { enhancements, skippedHarnessBacklog } = splitEnhancementsExcludingHarnessBacklog(enriched);
    expect(enhancements.map(e => e.id)).toEqual(['b', 'd']);
    expect(skippedHarnessBacklog).toBe(2);
  });

  it('does not affect type=issue rows', () => {
    const enriched = [
      row({ id: 'i1', type: 'issue', category: 'harness_backlog' }),
      row({ id: 'e1', type: 'enhancement', category: 'harness_backlog' }),
    ];
    const { enhancements, skippedHarnessBacklog } = splitEnhancementsExcludingHarnessBacklog(enriched);
    expect(enhancements).toEqual([]);
    expect(skippedHarnessBacklog).toBe(1);
  });

  it('returns empty + zero on empty input', () => {
    const { enhancements, skippedHarnessBacklog } = splitEnhancementsExcludingHarnessBacklog([]);
    expect(enhancements).toEqual([]);
    expect(skippedHarnessBacklog).toBe(0);
  });

  it('returns empty + zero on null/undefined', () => {
    expect(splitEnhancementsExcludingHarnessBacklog(null)).toEqual({ enhancements: [], skippedHarnessBacklog: 0 });
    expect(splitEnhancementsExcludingHarnessBacklog(undefined)).toEqual({ enhancements: [], skippedHarnessBacklog: 0 });
  });

  it('passes through enhancements when none are harness_backlog', () => {
    const enriched = [
      row({ id: 'e1', category: 'enhancement' }),
      row({ id: 'e2', category: 'feature_request' }),
    ];
    const { enhancements, skippedHarnessBacklog } = splitEnhancementsExcludingHarnessBacklog(enriched);
    expect(enhancements.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(skippedHarnessBacklog).toBe(0);
  });
});
