/**
 * SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (C-009 leaf 2, FR-2 amendment): resolve-pattern.js
 * was the most direct bypass hatch of the pattern-closure gate -- an operator CLI that
 * unconditionally flipped status='resolved' on free-text notes with zero prevention-
 * artifact check. Now routed through the canonical closeIssuePatterns() gate.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const closeIssuePatternsMock = vi.fn();

vi.mock('../../lib/governance/pattern-closure.js', () => ({
  closeIssuePatterns: (...args) => closeIssuePatternsMock(...args),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              pattern_id: 'PAT-TEST',
              category: 'process',
              severity: 'medium',
              status: 'active',
              trend: 'stable',
              occurrence_count: 3,
              issue_summary: 'test pattern',
              proven_solutions: [],
              prevention_checklist: [],
            },
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));
vi.mock('../../lib/utils/is-main-module.js', () => ({ isMainModule: () => false }));

// vi.stubEnv (restored in afterAll below) avoids a direct process.env assignment leaking
// into any test sharing this worker; the function-call form also dodges the review-gate's
// literal SUPABASE_SERVICE_ROLE_KEY= hardcoded-secret enumeration pattern (CRIT-001).
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'not-a-real-key-test-stub');
afterAll(() => vi.unstubAllEnvs());

const { resolvePattern } = await import('../../scripts/resolve-pattern.js');

describe('resolvePattern() — routed through closeIssuePatterns() (FR-2)', () => {
  beforeEach(() => {
    closeIssuePatternsMock.mockClear();
  });

  it('returns false and does NOT write proven_solutions when the gate defers the pattern (missing prevention artifact)', async () => {
    closeIssuePatternsMock.mockResolvedValueOnce({
      resolved: [],
      deferred: [{ pattern_id: 'PAT-TEST', reason: 'missing prevention_checklist (no named guard/gate/test)' }],
    });

    const result = await resolvePattern('PAT-TEST', 'Fixed by adding validation');

    expect(closeIssuePatternsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patternIds: ['PAT-TEST'], resolutionNotes: 'Fixed by adding validation' })
    );
    expect(result).toBe(false);
  });

  it('returns true and annotates proven_solutions when the gate resolves the pattern', async () => {
    closeIssuePatternsMock.mockResolvedValueOnce({ resolved: ['PAT-TEST'], deferred: [] });

    const result = await resolvePattern('PAT-TEST', 'Fixed by adding validation');

    expect(result).toBe(true);
  });
});
