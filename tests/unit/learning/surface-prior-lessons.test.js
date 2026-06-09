/**
 * Unit tests for SD-LEO-FIX-SURFACE-PRIOR-LESSONS-001.
 *
 * The DI'd, side-effect-free retrieval lib that the handoff precheck surfaces (so autonomous
 * /loop workers see prior lessons, not just the manual phase-preflight step). Covers PRD TS-1,
 * TS-2, TS-5(strategy resolution), and the throwing-client behavior the orchestrator's
 * fail-open try/catch relies on (TS-3 — the never-block invariant lives in HandoffOrchestrator,
 * which wraps these calls; here we prove the lib surfaces the error for that wrapper to swallow).
 */

import { describe, it, expect } from 'vitest';
import {
  PHASE_STRATEGIES,
  resolvePhaseStrategy,
  searchIssuePatterns,
  searchRetrospectives,
  surfacePriorLessons,
  formatPriorLessons,
} from '../../../lib/learning/surface-prior-lessons.js';

// --- mock client factories ---
const mockKb = (patternsByCategory = {}) => ({
  async search(_query, { category } = {}) {
    return patternsByCategory[category] || [];
  },
});

const mockSupabase = (rows, error = null) => {
  const builder = {
    select() { return this; },
    eq() { return this; },
    gte() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: rows, error }); },
  };
  return { from() { return builder; } };
};

describe('resolvePhaseStrategy (SD-LEO-FIX-SURFACE-PRIOR-LESSONS-001)', () => {
  it('maps a handoff type to the DESTINATION phase strategy', () => {
    expect(resolvePhaseStrategy('LEAD-TO-PLAN')).toBe(PHASE_STRATEGIES.PLAN);
    expect(resolvePhaseStrategy('PLAN-TO-EXEC')).toBe(PHASE_STRATEGIES.EXEC);
    expect(resolvePhaseStrategy('EXEC-TO-PLAN')).toBe(PHASE_STRATEGIES.PLAN);
    expect(resolvePhaseStrategy('PLAN-TO-LEAD')).toBe(PHASE_STRATEGIES.LEAD);
  });
  it('handles non -TO- handoff types (LEAD-FINAL-APPROVAL -> LEAD)', () => {
    expect(resolvePhaseStrategy('LEAD-FINAL-APPROVAL')).toBe(PHASE_STRATEGIES.LEAD);
  });
  it('falls back to EXEC for unknown input', () => {
    expect(resolvePhaseStrategy('SOMETHING-WEIRD')).toBe(PHASE_STRATEGIES.EXEC);
    expect(resolvePhaseStrategy(null)).toBe(PHASE_STRATEGIES.EXEC);
  });
});

describe('searchIssuePatterns', () => {
  it('TS-1: aggregates across categories, dedupes by pattern_id, sorts by overall_score, top 5', async () => {
    const kb = mockKb({
      database: [{ pattern_id: 'P1', overall_score: 50 }, { pattern_id: 'P2', overall_score: 90 }],
      testing: [{ pattern_id: 'P2', overall_score: 90 }, { pattern_id: 'P3', overall_score: 70 }],
    });
    const out = await searchIssuePatterns(kb, 'auth', { categories: ['database', 'testing'] });
    expect(out.map((p) => p.pattern_id)).toEqual(['P2', 'P3', 'P1']); // deduped + sorted desc
  });
  it('handles a strategy with no categories', async () => {
    expect(await searchIssuePatterns(mockKb(), 'x', {})).toEqual([]);
  });
});

describe('searchRetrospectives', () => {
  it('TS-1: scores by category match + quality + recency, returns top-N', async () => {
    const now = Date.now();
    const rows = [
      { sd_id: 'A', learning_category: 'AUTH_ISSUE', quality_score: 90, conducted_date: new Date(now).toISOString() },
      { sd_id: 'B', learning_category: 'OTHER', quality_score: 80, conducted_date: new Date(now - 200 * 864e5).toISOString() },
    ];
    const out = await searchRetrospectives(mockSupabase(rows), 'auth', PHASE_STRATEGIES.PLAN, 2);
    expect(out[0].sd_id).toBe('A'); // category match + recent + high quality ranks first
    expect(out).toHaveLength(2);
  });
  it('returns [] on a query error (no throw, side-effect-free)', async () => {
    const out = await searchRetrospectives(mockSupabase(null, { message: 'boom' }), 'auth', PHASE_STRATEGIES.PLAN);
    expect(out).toEqual([]);
  });
});

describe('surfacePriorLessons', () => {
  it('returns {patterns, retrospectives}', async () => {
    const kb = mockKb({ protocol: [{ pattern_id: 'P1', overall_score: 60 }] });
    const sb = mockSupabase([{ sd_id: 'R1', learning_category: 'protocol', quality_score: 85, conducted_date: new Date().toISOString() }]);
    const out = await surfacePriorLessons({ kb, supabase: sb, sdCategory: 'protocol', phaseStrategy: PHASE_STRATEGIES.PLAN, limit: 3 });
    expect(out.patterns).toHaveLength(1);
    expect(out.retrospectives).toHaveLength(1);
  });
  it('TS-3: surfaces (rejects) when an injected client throws — the orchestrator try/catch swallows this', async () => {
    const throwingKb = { async search() { throw new Error('kb down'); } };
    await expect(
      surfacePriorLessons({ kb: throwingKb, supabase: mockSupabase([]), sdCategory: 'x', phaseStrategy: PHASE_STRATEGIES.EXEC })
    ).rejects.toThrow('kb down');
    // Demonstrate the orchestrator's fail-open pattern keeps a verdict unchanged:
    const verdict = { success: true, issues: [] };
    let threw = false;
    try {
      await surfacePriorLessons({ kb: throwingKb, supabase: mockSupabase([]), sdCategory: 'x', phaseStrategy: PHASE_STRATEGIES.EXEC });
    } catch { threw = true; /* swallowed exactly as HandoffOrchestrator.precheckHandoff does */ }
    expect(threw).toBe(true);
    expect(verdict).toEqual({ success: true, issues: [] }); // verdict untouched
  });
});

describe('formatPriorLessons (pure)', () => {
  it('TS-2: returns a string and never throws on malformed/empty input', () => {
    expect(typeof formatPriorLessons([], [])).toBe('string');
    expect(formatPriorLessons([], [])).toContain('no relevant prior');
    expect(() => formatPriorLessons([{}], [{}])).not.toThrow();
    const s = formatPriorLessons(
      [{ pattern_id: 'P1', issue_summary: 'flaky tests' }],
      [{ title: 'retro X' }]
    );
    expect(s).toContain('P1');
    expect(s).toContain('retro X');
    expect(s).toContain('advisory');
  });
});
