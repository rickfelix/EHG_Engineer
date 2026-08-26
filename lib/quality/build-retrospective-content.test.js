import { describe, it, expect } from 'vitest';
import { buildRetrospectiveContent } from './build-retrospective-content.js';

const OPTS = { childCompletionPhrase: 'all 2 children genuinely completed', childCount: 2 };

describe('buildRetrospectiveContent (SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001, feedback ea46e576)', () => {
  it('populates all five fields from aggregated child data, deduping duplicate object-valued entries', () => {
    const childRetros = [
      {
        key_learnings: [{ learning: 'use worktrees', category: 'process' }],
        what_went_well: ['tests passed'],
        what_needs_improvement: ['docs were thin'],
        action_items: [{ action: 'add docs', owner: 'PLAN' }],
      },
      {
        // Exact duplicate of child 1's key_learnings/action_items entries -- must collapse.
        key_learnings: [{ learning: 'use worktrees', category: 'process' }],
        what_went_well: ['tests passed', 'ci was fast'],
        what_needs_improvement: ['docs were thin', 'more coverage needed'],
        action_items: [{ action: 'add docs', owner: 'PLAN' }],
      },
    ];

    const result = buildRetrospectiveContent(childRetros, OPTS);

    expect(result.key_learnings).toEqual([{ learning: 'use worktrees', category: 'process' }]);
    expect(result.action_items).toEqual([{ action: 'add docs', owner: 'PLAN' }]);
    expect(result.what_went_well).toEqual(['tests passed', 'ci was fast']);
    expect(result.what_needs_improvement).toEqual(['docs were thin', 'more coverage needed']);
    // improvement_areas is sourced from the same needs-improvement signal, coerced to
    // plain strings (the column is text[], not jsonb).
    expect(result.improvement_areas).toEqual(['docs were thin', 'more coverage needed']);
  });

  it('falls back to labeled, non-empty content for every field when there is no child data', () => {
    const result = buildRetrospectiveContent([], OPTS);

    expect(result.what_went_well.length).toBeGreaterThan(0);
    expect(result.what_went_well[0]).toBe('All 2 children genuinely completed');
    expect(result.what_needs_improvement).toEqual(['Orchestrator artifacts should be created earlier in workflow']);
    expect(result.key_learnings.length).toBeGreaterThan(0);
    expect(result.action_items).toEqual([
      "Review the 2 child SD(s)' individual action items for orchestrator-level follow-up",
    ]);
    expect(result.improvement_areas).toEqual([
      'Orchestrator-level improvement areas were not captured from child retrospectives',
    ]);
  });

  it('handles a null/undefined childRetros array the same as empty (fail-soft on the DB read)', () => {
    const result = buildRetrospectiveContent(null, OPTS);
    expect(result.action_items).toEqual([
      "Review the 2 child SD(s)' individual action items for orchestrator-level follow-up",
    ]);
  });

  it('applies dedupeMixed consistently to key_learnings, action_items, AND improvement_areas -- not a subset', () => {
    const childRetros = [
      { key_learnings: ['a', 'a', 'b'], action_items: ['x', 'x'], what_needs_improvement: ['y', 'y', 'z'] },
    ];
    const result = buildRetrospectiveContent(childRetros, OPTS);
    expect(result.key_learnings).toEqual(['a', 'b']);
    expect(result.action_items).toEqual(['x']);
    expect(result.improvement_areas).toEqual(['y', 'z']);
  });
});
