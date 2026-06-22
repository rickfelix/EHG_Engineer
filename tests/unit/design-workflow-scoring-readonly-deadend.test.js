/**
 * SD-REFILL-00FKX3W0 — display-vs-navigation awareness in the design workflow scorer.
 *
 * Sub-problem 2: a READ-ONLY display surface honestly showing a terminal state (e.g. a
 * status gauge reading "awaiting cash source") was flagged as a navigation dead_end,
 * false-failing the EXEC-TO-PLAN design gate on genuine read-only UI. The existing
 * dead_end suppression only matched terminal GOAL labels (success/complete/...), not
 * honest read-only DISPLAY states. Fix: suppress dead_end for isReadOnly && !isRequiredPath,
 * while genuine required/critical read paths still flag (calculateSeverity escalates those).
 *
 * (Sub-problem 1 — cross-repo files_analyzed:0 — was already fixed in design/utils.js
 * getGitDiffFiles base..HEAD + resolveDesignRepo target-app-aware; not re-addressed here.)
 */
import { describe, it, expect } from 'vitest';
import { shouldFlag } from '../../lib/sub-agents/design/workflow-scoring.js';

describe('shouldFlag — read-only display vs navigation dead-end (SD-REFILL-00FKX3W0)', () => {
  it('does NOT flag a dead_end on a read-only, non-required display state', () => {
    const issue = { type: 'dead_end', label: 'awaiting cash source' };
    expect(shouldFlag(issue, { isReadOnly: true, isRequiredPath: false })).toBe(false);
  });

  it('STILL flags a dead_end on a read-only REQUIRED/critical path (real blocker)', () => {
    const issue = { type: 'dead_end', label: 'awaiting cash source' };
    expect(shouldFlag(issue, { isReadOnly: true, isRequiredPath: true })).toBe(true);
  });

  it('STILL flags a dead_end on an interactive (non-read-only) state', () => {
    const issue = { type: 'dead_end', label: 'order pending' };
    expect(shouldFlag(issue, { isReadOnly: false, isRequiredPath: false })).toBe(true);
  });

  it('preserves the existing terminal-goal-state suppression (label match)', () => {
    const issue = { type: 'dead_end', label: 'Success! Order complete' };
    // suppressed by the terminal-goal-state rule regardless of read-only context
    expect(shouldFlag(issue, { isReadOnly: false, isRequiredPath: false })).toBe(false);
  });

  it('does not over-suppress unrelated issue types on read-only content', () => {
    // a non-dead_end issue is unaffected by the new clause
    const issue = { type: 'circular_flow', label: 'loop' };
    expect(shouldFlag(issue, { isReadOnly: true, isRequiredPath: false })).toBe(true);
  });
});
