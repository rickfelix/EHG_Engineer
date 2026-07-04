/**
 * SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (C-009 leaf 2, FR-2): resolvePatterns() is
 * migrated onto the canonical closeIssuePatterns() gate. Verifies the translation from
 * closeIssuePatterns()'s {resolved, deferred} shape back into resolvePatterns()'s
 * original per-pattern {pattern_id, success, error} return contract (decision-management.js
 * still relies on that shape via patternResults.filter(r => r.success)).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const closeIssuePatternsMock = vi.fn();

vi.mock('../../../lib/governance/pattern-closure.js', () => ({
  closeIssuePatterns: (...args) => closeIssuePatternsMock(...args),
}));
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({}),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

const { resolvePatterns } = await import('../../../scripts/modules/learning/improvement-appliers.js');

describe('resolvePatterns — routed through closeIssuePatterns() (FR-2)', () => {
  beforeEach(() => {
    closeIssuePatternsMock.mockClear();
  });

  it('works without a single sdId (patterns spanning multiple assigned_sd_id values), passing patternIds only', async () => {
    closeIssuePatternsMock.mockResolvedValueOnce({ resolved: ['PAT-A', 'PAT-B'], deferred: [] });

    const results = await resolvePatterns(['PAT-A', 'PAT-B'], 'imp-1');

    expect(closeIssuePatternsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patternIds: ['PAT-A', 'PAT-B'] })
    );
    expect(closeIssuePatternsMock.mock.calls[0][1].sdId).toBeUndefined();
    expect(results).toEqual([
      { pattern_id: 'PAT-A', success: true },
      { pattern_id: 'PAT-B', success: true },
    ]);
  });

  it('maps a deferred pattern back to success:false with the deferral reason', async () => {
    closeIssuePatternsMock.mockResolvedValueOnce({
      resolved: ['PAT-A'],
      deferred: [{ pattern_id: 'PAT-B', reason: 'missing prevention_checklist (no named guard/gate/test)' }],
    });

    const results = await resolvePatterns(['PAT-A', 'PAT-B'], 'imp-2');

    expect(results).toEqual([
      { pattern_id: 'PAT-A', success: true },
      { pattern_id: 'PAT-B', success: false, error: 'missing prevention_checklist (no named guard/gate/test)' },
    ]);
  });

  it('returns [] for an empty/undefined patternIds list without calling closeIssuePatterns', async () => {
    expect(await resolvePatterns([], 'imp-3')).toEqual([]);
    expect(await resolvePatterns(undefined, 'imp-3')).toEqual([]);
    expect(closeIssuePatternsMock).not.toHaveBeenCalled();
  });
});
