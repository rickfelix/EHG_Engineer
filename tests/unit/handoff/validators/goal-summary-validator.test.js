import { describe, it, expect } from 'vitest';
import { validateGoalSummary } from '../../../../scripts/modules/handoff/validators/goal-summary-validator.js';

describe('validateGoalSummary', () => {
  it('returns score 0 when prd is missing', async () => {
    const result = await validateGoalSummary({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.max_score).toBe(100);
    expect(result.issues).toContain('Goal summary is missing');
    expect(result.details.length).toBe(0);
  });

  it('returns score 0 when goal_summary is empty string', async () => {
    const result = await validateGoalSummary({ prd: { goal_summary: '' } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('returns score 100 for valid concise summary', async () => {
    const result = await validateGoalSummary({
      prd: { goal_summary: 'Implement JWT authentication with refresh token support.' }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details.maxLength).toBe(300);
  });

  it('returns score 70 when summary exceeds 300 chars', async () => {
    const longSummary = 'A'.repeat(301);
    const result = await validateGoalSummary({
      prd: { goal_summary: longSummary }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(70);
    expect(result.issues[0]).toContain('301 chars');
    expect(result.issues[0]).toContain('max 300');
    expect(result.details.length).toBe(301);
  });

  it('passes summary exactly at 300 chars', async () => {
    const exactSummary = 'A'.repeat(300);
    const result = await validateGoalSummary({
      prd: { goal_summary: exactSummary }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.length).toBe(300);
  });

  it('falls back to executive_summary when goal_summary is missing', async () => {
    const result = await validateGoalSummary({
      prd: { executive_summary: 'Fallback executive summary content.' }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.length).toBe(35);
  });

  it('prefers goal_summary over executive_summary', async () => {
    const result = await validateGoalSummary({
      prd: {
        goal_summary: 'Primary goal summary.',
        executive_summary: 'Fallback executive summary that is much longer.'
      }
    });
    expect(result.details.length).toBe(21);
  });

  it('returns score 0 when both goal_summary and executive_summary are null', async () => {
    const result = await validateGoalSummary({
      prd: { goal_summary: null, executive_summary: null }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });
});
