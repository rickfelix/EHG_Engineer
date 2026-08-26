import { describe, it, expect } from 'vitest';
import { isFalseCompletion } from './false-completion-predicate.js';

describe('isFalseCompletion', () => {
  it('flags status=completed with a non-COMPLETED current_phase', () => {
    expect(isFalseCompletion({ status: 'completed', current_phase: 'PLAN_PRD' })).toBe(true);
  });

  it('does not flag a genuinely completed SD', () => {
    expect(isFalseCompletion({ status: 'completed', current_phase: 'COMPLETED' })).toBe(false);
  });

  it('does not flag a non-completed SD regardless of current_phase', () => {
    expect(isFalseCompletion({ status: 'in_progress', current_phase: 'PLAN_PRD' })).toBe(false);
  });
});
