/**
 * Tests for fetchJudgeVerdicts enrichment
 * SD-LEO-INFRA-S20-BUILD-REPORT-001 (Gap 4)
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchJudgeVerdicts } from '../../lib/eva/stage-templates/analysis-steps/stage-20-build-execution.js';

const logger = { log: vi.fn(), warn: vi.fn() };

function buildMockSupabase({ sds = [], sessions = [], verdicts = [], sdError = null, sessError = null, vError = null } = {}) {
  return {
    from: vi.fn((table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (fn) => {
          if (table === 'strategic_directives_v2') return fn({ data: sds, error: sdError });
          if (table === 'debate_sessions') return fn({ data: sessions, error: sessError });
          if (table === 'judge_verdicts') return fn({ data: verdicts, error: vError });
          return fn({ data: [], error: null });
        },
      };
      return chain;
    }),
  };
}

describe('fetchJudgeVerdicts()', () => {
  it('returns enrichment when venture has verdicts via debate sessions', async () => {
    const supabase = buildMockSupabase({
      sds: [{ id: 'sd-1', sd_key: 'SD-001' }],
      sessions: [{ id: 'sess-1' }],
      verdicts: [
        { verdict_type: 'synthesis', confidence_score: 0.85, summary: 'Board consensus reached', constitution_citations: [], escalation_required: false, created_at: '2026-01-01T00:00:00Z', debate_session_id: 'sess-1' },
        { verdict_type: 'synthesis', confidence_score: 0.92, summary: 'Strong alignment', constitution_citations: ['ART-1'], escalation_required: false, created_at: '2026-01-02T00:00:00Z', debate_session_id: 'sess-1' },
      ],
    });

    const result = await fetchJudgeVerdicts(supabase, 'venture-123', logger);

    expect(result).not.toBeNull();
    expect(result.verdictScore).toBeCloseTo(0.89, 1);
    expect(result.verdictCount).toBe(2);
    expect(result.verdictTypes.synthesis).toBe(2);
    expect(result.topRecommendations).toEqual(['Board consensus reached', 'Strong alignment']);
    expect(result.hasConstitutionalCitations).toBe(true);
    expect(result.dataSource).toBe('judge_verdicts');
  });

  it('returns null when venture has no SDs', async () => {
    const supabase = buildMockSupabase({ sds: [] });
    const result = await fetchJudgeVerdicts(supabase, 'venture-123', logger);
    expect(result).toBeNull();
  });

  it('returns null when SDs have no debate sessions', async () => {
    const supabase = buildMockSupabase({
      sds: [{ id: 'sd-1', sd_key: 'SD-001' }],
      sessions: [],
    });
    const result = await fetchJudgeVerdicts(supabase, 'venture-123', logger);
    expect(result).toBeNull();
  });

  it('returns null and logs warning on DB error', async () => {
    const supabase = {
      from: vi.fn(() => { throw new Error('Connection refused'); }),
    };
    const result = await fetchJudgeVerdicts(supabase, 'venture-123', logger);
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Judge verdict fetch failed'),
      expect.objectContaining({ error: 'Connection refused' }),
    );
  });
});
