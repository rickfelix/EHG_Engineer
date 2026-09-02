/**
 * Unit tests for lib/fleet/review-qf-risk.mjs — the ONE production call site for the
 * risk-review stamp writer (SD-LEO-FIX-SELF-CLAIM-PREDICATE-001, Solomon ruling 6580bedb).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const storeSubAgentResultsMock = vi.fn();
vi.mock('../../../lib/sub-agent-executor/results-storage.js', () => ({
  storeSubAgentResults: (...args) => storeSubAgentResultsMock(...args),
}));

const { reviewQfRisk } = await import('../../../lib/fleet/review-qf-risk.mjs');
const { computeQfRiskContentHash } = await import('../../../lib/fleet/qf-risk-review-stamp.cjs');

function mockSupabase({ qf = { id: 'qf-1', title: 'submits credentials', description: 'selector fix' }, qfError = null, existingComplianceDetails = null, stampWriteError = null } = {}) {
  const updateCalls = [];
  return {
    updateCalls,
    from: vi.fn().mockImplementation((table) => {
      if (table === 'quick_fixes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(qfError ? { data: null, error: qfError } : { data: qf, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((row) => {
            updateCalls.push(row);
            return { eq: vi.fn().mockResolvedValue({ error: stampWriteError }) };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe('reviewQfRisk', () => {
  beforeEach(() => {
    storeSubAgentResultsMock.mockReset();
    storeSubAgentResultsMock.mockResolvedValue({ id: 'sub-agent-row-1' });
  });

  test('records the SECURITY review with sd_id=null and the QF id in metadata', async () => {
    const supabase = mockSupabase();
    await reviewQfRisk(supabase, { qfId: 'qf-1', verdict: 'PASS', confidence: 95, reasoning: 'no auth logic touched', repoPath: '/repo', executedFromCwd: '/repo' });
    expect(storeSubAgentResultsMock).toHaveBeenCalledTimes(1);
    const [code, sdId, subAgent, results, options] = storeSubAgentResultsMock.mock.calls[0];
    expect(code).toBe('SECURITY');
    expect(sdId).toBeNull();
    expect(subAgent).toBeNull();
    expect(results.verdict).toBe('PASS');
    expect(results.metadata.qf_id).toBe('qf-1');
    expect(options.phase).toBe('QF_RISK_REVIEW');
  });

  test('PASS verdict stamps the QF, citing the fresh sub_agent_execution_results row id', async () => {
    const supabase = mockSupabase();
    const result = await reviewQfRisk(supabase, { qfId: 'qf-1', verdict: 'PASS', confidence: 95, reasoning: 'x', repoPath: '/repo', executedFromCwd: '/repo' });
    expect(result.ok).toBe(true);
    expect(result.stamped).toBe(true);
    expect(result.subAgentRowId).toBe('sub-agent-row-1');
    expect(supabase.updateCalls).toHaveLength(1);
    const stamp = supabase.updateCalls[0].compliance_details.risk_reviewed;
    expect(stamp.by).toBe('sub-agent-row-1');
    expect(stamp.content_hash).toBe(computeQfRiskContentHash({ title: 'submits credentials', description: 'selector fix' }));
  });

  test('FAIL verdict records the review but does NOT stamp — QF stays excluded', async () => {
    const supabase = mockSupabase();
    const result = await reviewQfRisk(supabase, { qfId: 'qf-1', verdict: 'FAIL', confidence: 80, reasoning: 'real auth change', repoPath: '/repo', executedFromCwd: '/repo' });
    expect(result.ok).toBe(true);
    expect(result.stamped).toBe(false);
    expect(supabase.updateCalls).toHaveLength(0);
  });

  test('CONDITIONAL_PASS does NOT auto-stamp — an open condition means the row is not yet clear', async () => {
    const supabase = mockSupabase();
    const result = await reviewQfRisk(supabase, { qfId: 'qf-1', verdict: 'CONDITIONAL_PASS', confidence: 70, reasoning: 'mostly fine, one open question', repoPath: '/repo', executedFromCwd: '/repo' });
    expect(result.stamped).toBe(false);
  });

  test('unknown QF: does not call storeSubAgentResults, returns an error', async () => {
    const supabase = mockSupabase({ qfError: { message: 'not found' } });
    const result = await reviewQfRisk(supabase, { qfId: 'missing', verdict: 'PASS', confidence: 90, reasoning: 'x', repoPath: '/repo', executedFromCwd: '/repo' });
    expect(result.ok).toBe(false);
    expect(storeSubAgentResultsMock).not.toHaveBeenCalled();
  });
});
