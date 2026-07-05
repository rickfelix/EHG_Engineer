/**
 * Tests for Intelligence Loader
 * Part of: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-C
 */

import { describe, it, expect, vi } from 'vitest';
import { loadIntelligenceSignals } from '../../../lib/eva/intelligence-loader.js';

/**
 * Create a mock Supabase client with chainable query methods.
 */
function createMockSupabase(config = {}) {
  const {
    okrAlignments = [],
    keyResults = [],
    patterns = [],
    sds = [],
    sdResolve = null,
    okrError = null,
    patternError = null,
    sdError = null,
  } = config;

  function buildChain(finalData, finalError) {
    const single = vi.fn().mockResolvedValue({ data: finalData?.[0] ?? null, error: finalError });
    const limitFn = vi.fn().mockReturnValue({ single });
    const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
    const inFn = vi.fn().mockReturnValue({ order: orderFn, limit: limitFn });
    const notFn = vi.fn().mockReturnValue({ data: finalData, error: finalError, not: vi.fn().mockReturnValue({ data: finalData, error: finalError }) });
    const eqFn = vi.fn().mockReturnValue({
      data: finalData, error: finalError,
      limit: limitFn, single, in: inFn,
    });
    const selectFn = vi.fn().mockReturnValue({
      eq: eqFn, in: inFn, not: notFn,
      order: orderFn, limit: limitFn,
    });
    return { select: selectFn };
  }

  const fromMap = {
    okr_alignments: buildChain(okrAlignments, okrError),
    key_results: buildChain(keyResults, null),
    issue_patterns: (() => {
      const limitFn = vi.fn().mockResolvedValue({ data: patterns, error: patternError });
      const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
      const inFn = vi.fn().mockReturnValue({ order: orderFn, in: vi.fn().mockReturnValue({ order: orderFn }) });
      const selectFn = vi.fn().mockReturnValue({ in: inFn });
      return { select: selectFn };
    })(),
    strategic_directives_v2: (() => {
      // For both _loadBlocking and _resolveUuid
      const single = vi.fn().mockResolvedValue({ data: sdResolve, error: null });
      const limitFn = vi.fn().mockReturnValue({ single });
      const notFn2 = vi.fn().mockReturnValue({ data: sds, error: sdError });
      const notFn1 = vi.fn().mockReturnValue({ not: notFn2 });
      const eqFn = vi.fn().mockReturnValue({ limit: limitFn, single, not: notFn1 });
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn, not: notFn1 });
      return { select: selectFn };
    })(),
  };

  return {
    from: vi.fn((table) => fromMap[table] || buildChain([], null)),
  };
}

describe('Intelligence Loader', () => {
  describe('loadIntelligenceSignals', () => {
    it('should return all signal categories with meta', async () => {
      const supabase = createMockSupabase();
      const result = await loadIntelligenceSignals(supabase, 'SD-TEST-001');

      expect(result).toHaveProperty('okrImpact');
      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('blocking');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('loadedAt');
      expect(result.meta).toHaveProperty('errors');
      expect(Array.isArray(result.meta.errors)).toBe(true);
    });

    it('should gracefully handle okr query failure', async () => {
      const supabase = createMockSupabase({ okrError: { message: 'OKR query failed' } });
      const result = await loadIntelligenceSignals(supabase, 'SD-TEST-001');

      expect(result.okrImpact).toBeNull();
      expect(Array.isArray(result.patterns)).toBe(true);
    });

    it('should gracefully handle pattern query failure', async () => {
      const supabase = createMockSupabase({ patternError: { message: 'Pattern query failed' } });
      const result = await loadIntelligenceSignals(supabase, 'SD-TEST-001');

      expect(result.patterns).toEqual([]);
    });

    it('should return empty arrays when no data exists', async () => {
      const supabase = createMockSupabase();
      const result = await loadIntelligenceSignals(supabase, 'SD-TEST-001');

      expect(result.patterns).toEqual([]);
      expect(result.blocking.blocksCount).toBe(0);
      expect(result.blocking.blockedByCount).toBe(0);
    });

    it('should accept optional sdUuid', async () => {
      const supabase = createMockSupabase();
      const result = await loadIntelligenceSignals(supabase, 'SD-TEST-001', {
        sdUuid: 'some-uuid-123',
      });

      expect(result).toHaveProperty('meta');
    });
  });

  describe('QF-20260704-225: _loadPatterns queries real issue_patterns columns', () => {
    // pattern_key/frequency/last_seen don't exist on issue_patterns (real columns:
    // pattern_id, occurrence_count, updated_at) -- the query used to 42703 on every
    // call and silently degrade to []. These pin the corrected select/order columns
    // and the issue_summary-based keyword filter that replaced pattern_key matching.
    it('selects real issue_patterns columns (pattern_id, occurrence_count, issue_summary, updated_at) — not pattern_key/frequency/last_seen', async () => {
      const supabase = createMockSupabase({ patterns: [] });
      await loadIntelligenceSignals(supabase, 'SD-TEST-001');

      const selectCall = supabase.from('issue_patterns').select.mock.calls[0][0];
      expect(selectCall).toContain('pattern_id');
      expect(selectCall).toContain('occurrence_count');
      expect(selectCall).toContain('issue_summary');
      expect(selectCall).toContain('updated_at');
      expect(selectCall).not.toContain('pattern_key');
      expect(selectCall).not.toContain('frequency');
      expect(selectCall).not.toContain('last_seen');
    });

    it('surfaces no patterns error when the query succeeds (regression guard for the 42703)', async () => {
      const supabase = createMockSupabase({
        patterns: [{ id: '1', pattern_id: 'PAT-1', severity: 'high', occurrence_count: 3, status: 'active', category: 'eva_drift', issue_summary: 'EVA vision drift detected', updated_at: '2026-07-01T00:00:00Z' }],
      });
      const result = await loadIntelligenceSignals(supabase, 'SD-TEST-001');

      expect(result.meta.errors.some(e => e.startsWith('patterns:'))).toBe(false);
      expect(result.patterns).toHaveLength(1);
    });

    it('keyword-filters the fallback set using issue_summary (the pattern_key replacement)', async () => {
      const supabase = createMockSupabase({
        patterns: [
          { id: '1', pattern_id: 'PAT-1', severity: 'high', occurrence_count: 5, status: 'active', category: 'handoff_failure', issue_summary: 'EVA vision alignment gap' },
          { id: '2', pattern_id: 'PAT-2', severity: 'high', occurrence_count: 4, status: 'active', category: 'handoff_failure', issue_summary: 'Unrelated gate timeout' },
        ],
      });
      const result = await loadIntelligenceSignals(supabase, 'SD-TEST-001');

      expect(result.patterns.map(p => p.id)).toEqual(['1']);
    });
  });
});
