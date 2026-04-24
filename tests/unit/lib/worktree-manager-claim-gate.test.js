import { describe, it, expect } from 'vitest';
import { assertClaimForWorktree } from '../../../lib/worktree-manager.js';

describe('assertClaimForWorktree (QF-20260424-674)', () => {
  it('is a no-op for ADHOC work regardless of claim state', () => {
    expect(() => assertClaimForWorktree({ workType: 'ADHOC', claimedBy: null })).not.toThrow();
    expect(() => assertClaimForWorktree({ workType: 'ADHOC', claimedBy: 'someone', sessionId: 'me' })).not.toThrow();
  });

  it('throws CLAIM_NOT_HELD for QF when no session is holding the claim', () => {
    try {
      assertClaimForWorktree({ workType: 'QF', claimedBy: null, sessionId: 'sess-1' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('CLAIM_NOT_HELD');
      expect(err.message).toMatch(/UNCLAIMED/);
    }
  });

  it('throws CLAIM_NOT_HELD for SD when a different session holds the claim', () => {
    try {
      assertClaimForWorktree({ workType: 'SD', claimedBy: 'other-sess', sessionId: 'me' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('CLAIM_NOT_HELD');
      expect(err.message).toMatch(/other-sess/);
    }
  });

  it('passes for QF when claim matches current session', () => {
    expect(() =>
      assertClaimForWorktree({ workType: 'QF', claimedBy: 'sess-1', sessionId: 'sess-1' })
    ).not.toThrow();
  });

  it('throws when sessionId is missing for non-ADHOC work', () => {
    try {
      assertClaimForWorktree({ workType: 'QF', claimedBy: 'sess-1' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('CLAIM_NOT_HELD');
      expect(err.message).toMatch(/MISSING/);
    }
  });
});
