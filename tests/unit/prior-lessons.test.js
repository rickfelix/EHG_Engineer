// QF-20260609-457: prior-lessons retrieval extracted from phase-preflight.js so the enforced
// handoff precheck can surface issue_patterns + retrospectives to the next worker. The handoff-
// facing helper MUST be fail-open (never block the handoff). Pure unit tests, injected mocks, no DB.
import { describe, it, expect } from 'vitest';
import { searchIssuePatterns, searchRetrospectives, surfacePriorLessons } from '../../lib/learning/prior-lessons.js';

const mockKb = (patternsByCategory) => ({
  search: async (_query, { category } = {}) => patternsByCategory[category] || [],
});

// Mock the Supabase query-builder chain used by searchRetrospectives.
const mockSupabase = (result) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        gte: () => ({
          order: () => ({
            limit: async () => result,
          }),
        }),
      }),
    }),
  }),
});

describe('QF-20260609-457 prior-lessons', () => {
  it('searchIssuePatterns dedups by pattern_id and ranks by overall_score (top 5)', async () => {
    const kb = mockKb({
      process: [{ pattern_id: 'A', overall_score: 10 }, { pattern_id: 'B', overall_score: 50 }],
      database: [{ pattern_id: 'A', overall_score: 10 }, { pattern_id: 'C', overall_score: 30 }],
    });
    const out = await searchIssuePatterns(kb, 'cat', ['process', 'database']);
    expect(out.map(p => p.pattern_id)).toEqual(['B', 'C', 'A']); // A deduped, sorted desc
  });

  it('searchRetrospectives returns [] on query error (no throw)', async () => {
    const sb = mockSupabase({ data: null, error: { message: 'boom' } });
    expect(await searchRetrospectives(sb, 'cat')).toEqual([]);
  });

  it('searchRetrospectives ranks category match first', async () => {
    const now = new Date().toISOString();
    const sb = mockSupabase({ data: [
      { id: 'r1', learning_category: 'other', quality_score: 90, conducted_date: now },
      { id: 'r2', learning_category: 'database', quality_score: 90, conducted_date: now },
    ], error: null });
    const out = await searchRetrospectives(sb, 'database', 2);
    expect(out[0].id).toBe('r2');
  });

  it('surfacePriorLessons is fail-open: never throws even if BOTH halves throw', async () => {
    const throwingKb = { search: async () => { throw new Error('kb down'); } };
    const throwingSb = { from: () => { throw new Error('db down'); } };
    const res = await surfacePriorLessons(throwingSb, { category: 'x' }, { kb: throwingKb });
    expect(res).toEqual({ patterns: [], retrospectives: [] });
  });

  it('surfacePriorLessons returns surfaced patterns + retrospectives when present', async () => {
    const kb = mockKb({ process: [{ pattern_id: 'P1', overall_score: 5, issue_summary: 'x', success_rate: 80, occurrence_count: 3 }] });
    const now = new Date().toISOString();
    const sb = mockSupabase({ data: [{ id: 'R1', learning_category: 'process', quality_score: 88, conducted_date: now }], error: null });
    const res = await surfacePriorLessons(sb, { category: 'process' }, { kb });
    expect(res.patterns.map(p => p.pattern_id)).toContain('P1');
    expect(res.retrospectives.map(r => r.id)).toContain('R1');
  });
});
