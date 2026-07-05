/**
 * Unit tests for QF-20260704-993: needs_decision completion_flag exclusion from
 * /leo assist Phase 1's autonomous issue stream.
 *
 * scripts/capture-completion-flags.js stamps needs_decision flags with type='issue'
 * (category='completion_flag') for general inbox visibility. Confirmed live: all 86
 * rows in the issues stream were category='completion_flag' with zero genuine bugs --
 * Phase 1's autonomous fix-retry loop was attempting code fixes for pure decision items.
 * Fix excludes them at the source (lib/quality/assist-engine.js).
 */

import { describe, it, expect } from 'vitest';
import { filterIssuesExcludingNeedsDecision, NEEDS_DECISION_CATEGORY } from '../../lib/quality/assist-engine.js';

function row({ id, type = 'issue', category = null }) {
  return { id, type, category };
}

describe('QF-20260704-993: filterIssuesExcludingNeedsDecision', () => {
  it('excludes type=issue rows with category=completion_flag', () => {
    const enriched = [
      row({ id: 'a', category: 'completion_flag' }),
      row({ id: 'b', category: 'bug' }),
      row({ id: 'c', category: 'completion_flag' }),
      row({ id: 'd', category: null }),
    ];
    const { issues, skippedNeedsDecision } = filterIssuesExcludingNeedsDecision(enriched);
    expect(issues.map(e => e.id)).toEqual(['b', 'd']);
    expect(skippedNeedsDecision).toBe(2);
  });

  it('does not affect type=enhancement rows', () => {
    const enriched = [
      row({ id: 'e1', type: 'enhancement', category: 'completion_flag' }),
      row({ id: 'i1', type: 'issue', category: 'completion_flag' }),
    ];
    const { issues, skippedNeedsDecision } = filterIssuesExcludingNeedsDecision(enriched);
    expect(issues).toEqual([]);
    expect(skippedNeedsDecision).toBe(1);
  });

  it('returns empty + zero on empty input', () => {
    const { issues, skippedNeedsDecision } = filterIssuesExcludingNeedsDecision([]);
    expect(issues).toEqual([]);
    expect(skippedNeedsDecision).toBe(0);
  });

  it('returns empty + zero on null/undefined', () => {
    expect(filterIssuesExcludingNeedsDecision(null)).toEqual({ issues: [], skippedNeedsDecision: 0 });
    expect(filterIssuesExcludingNeedsDecision(undefined)).toEqual({ issues: [], skippedNeedsDecision: 0 });
  });

  it('passes through issues when none are completion_flag', () => {
    const enriched = [
      row({ id: 'i1', category: 'bug' }),
      row({ id: 'i2', category: 'regression' }),
    ];
    const { issues, skippedNeedsDecision } = filterIssuesExcludingNeedsDecision(enriched);
    expect(issues.map(e => e.id)).toEqual(['i1', 'i2']);
    expect(skippedNeedsDecision).toBe(0);
  });

  it('exports the NEEDS_DECISION_CATEGORY constant used by capture-completion-flags.js', () => {
    expect(NEEDS_DECISION_CATEGORY).toBe('completion_flag');
  });
});
