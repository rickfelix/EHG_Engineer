/**
 * Unit tests for lib/skunkworks/signal-readers/venture-portfolio.js
 * Tests stale venture detection, stuck venture detection, and portfolio concentration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readVenturePortfolioSignals } from '../../../lib/skunkworks/signal-readers/venture-portfolio.js';

function mockSupabase(data, error = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

describe('readVenturePortfolioSignals', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty array when query errors (fail-open)', async () => {
    const supabase = mockSupabase(null, { message: 'timeout' });
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
    expect(silentLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('timeout')
    );
  });

  it('returns empty array when no active ventures', async () => {
    const supabase = mockSupabase([]);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('returns empty array when ventures is null', async () => {
    const supabase = mockSupabase(null);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  // --- Stale venture detection ---

  it('detects stale ventures (>30 days since update)', async () => {
    const ventures = [
      { id: 'v1', name: 'StaleVenture', status: 'active', current_lifecycle_stage: 3, ai_score: 70, updated_at: daysAgo(45), created_at: daysAgo(90) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stale = result.find(s => s.title.includes('Stale venture'));
    expect(stale).toBeDefined();
    expect(stale.type).toBe('venture_portfolio');
    expect(stale.evidence.venture_name).toBe('StaleVenture');
    expect(stale.evidence.days_inactive).toBeGreaterThan(30);
  });

  it('does not flag ventures updated within 30 days', async () => {
    const ventures = [
      { id: 'v1', name: 'FreshVenture', status: 'active', current_lifecycle_stage: 5, ai_score: 80, updated_at: daysAgo(10), created_at: daysAgo(60) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stale = result.find(s => s.title.includes('Stale venture'));
    expect(stale).toBeUndefined();
  });

  it('uses created_at as fallback when updated_at is null', async () => {
    const ventures = [
      { id: 'v1', name: 'NoUpdateVenture', status: 'active', current_lifecycle_stage: 1, ai_score: 60, updated_at: null, created_at: daysAgo(50) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stale = result.find(s => s.title.includes('Stale venture'));
    expect(stale).toBeDefined();
    expect(stale.evidence.days_inactive).toBeGreaterThanOrEqual(49);
  });

  it('caps stale venture priority at 85', async () => {
    const ventures = [
      { id: 'v1', name: 'AncientVenture', status: 'active', current_lifecycle_stage: 2, ai_score: 55, updated_at: daysAgo(200), created_at: daysAgo(300) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stale = result.find(s => s.title.includes('Stale venture'));
    expect(stale).toBeDefined();
    expect(stale.priority).toBeLessThanOrEqual(85);
  });

  it('calculates stale priority as 40 + daysInactive (capped at 85)', async () => {
    const ventures = [
      { id: 'v1', name: 'V50', status: 'active', current_lifecycle_stage: 3, ai_score: 70, updated_at: daysAgo(50), created_at: daysAgo(100) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stale = result.find(s => s.title.includes('Stale venture'));
    expect(stale).toBeDefined();
    // 40 + 50 = 90, capped at 85
    expect(stale.priority).toBe(85);
  });

  // --- Stuck venture detection ---

  it('detects stuck early-stage ventures with low scores', async () => {
    const ventures = [
      { id: 'v1', name: 'StuckVenture', status: 'active', current_lifecycle_stage: 1, ai_score: 30, updated_at: daysAgo(5), created_at: daysAgo(20) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stuck = result.find(s => s.title.includes('Low-scoring early-stage'));
    expect(stuck).toBeDefined();
    expect(stuck.evidence.stage).toBe(1);
    expect(stuck.evidence.synthesis_score).toBe(30);
    expect(stuck.priority).toBe(60);
  });

  it('does not flag early-stage ventures with good scores', async () => {
    const ventures = [
      { id: 'v1', name: 'GoodEarly', status: 'active', current_lifecycle_stage: 2, ai_score: 75, updated_at: daysAgo(5), created_at: daysAgo(20) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stuck = result.find(s => s.title.includes('Low-scoring early-stage'));
    expect(stuck).toBeUndefined();
  });

  it('does not flag later-stage ventures with low scores', async () => {
    const ventures = [
      { id: 'v1', name: 'LaterStage', status: 'active', current_lifecycle_stage: 5, ai_score: 30, updated_at: daysAgo(5), created_at: daysAgo(20) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stuck = result.find(s => s.title.includes('Low-scoring early-stage'));
    expect(stuck).toBeUndefined();
  });

  it('does not flag venture when ai_score is null', async () => {
    const ventures = [
      { id: 'v1', name: 'NoScore', status: 'active', current_lifecycle_stage: 1, ai_score: null, updated_at: daysAgo(5), created_at: daysAgo(20) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const stuck = result.find(s => s.title.includes('Low-scoring early-stage'));
    expect(stuck).toBeUndefined();
  });

  // --- Portfolio concentration ---

  it('detects portfolio concentration when >60% in one stage (min 3 ventures)', async () => {
    const ventures = [
      { id: 'v1', name: 'A', status: 'active', current_lifecycle_stage: 1, ai_score: 70, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v2', name: 'B', status: 'active', current_lifecycle_stage: 1, ai_score: 65, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v3', name: 'C', status: 'active', current_lifecycle_stage: 1, ai_score: 60, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v4', name: 'D', status: 'active', current_lifecycle_stage: 5, ai_score: 80, updated_at: daysAgo(5), created_at: daysAgo(10) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const conc = result.find(s => s.title.includes('Portfolio concentration'));
    expect(conc).toBeDefined();
    expect(conc.evidence.concentration_pct).toBe(75);
    expect(conc.evidence.stage).toBe(1);
    expect(conc.priority).toBe(55);
  });

  it('does not flag concentration when evenly distributed', async () => {
    const ventures = [
      { id: 'v1', name: 'A', status: 'active', current_lifecycle_stage: 1, ai_score: 70, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v2', name: 'B', status: 'active', current_lifecycle_stage: 2, ai_score: 70, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v3', name: 'C', status: 'active', current_lifecycle_stage: 3, ai_score: 70, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v4', name: 'D', status: 'active', current_lifecycle_stage: 4, ai_score: 70, updated_at: daysAgo(5), created_at: daysAgo(10) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const conc = result.find(s => s.title.includes('Portfolio concentration'));
    expect(conc).toBeUndefined();
  });

  it('does not flag concentration with fewer than 3 ventures', async () => {
    const ventures = [
      { id: 'v1', name: 'A', status: 'active', current_lifecycle_stage: 1, ai_score: 70, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v2', name: 'B', status: 'active', current_lifecycle_stage: 1, ai_score: 65, updated_at: daysAgo(5), created_at: daysAgo(10) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const conc = result.find(s => s.title.includes('Portfolio concentration'));
    expect(conc).toBeUndefined();
  });

  it('returns empty array on thrown exception (fail-open)', async () => {
    const supabase = {
      from: vi.fn(() => { throw new Error('crash'); }),
    };
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('includes stage_distribution in concentration evidence', async () => {
    const ventures = [
      { id: 'v1', name: 'A', status: 'active', current_lifecycle_stage: 2, ai_score: 70, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v2', name: 'B', status: 'active', current_lifecycle_stage: 2, ai_score: 65, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v3', name: 'C', status: 'active', current_lifecycle_stage: 2, ai_score: 60, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v4', name: 'D', status: 'active', current_lifecycle_stage: 2, ai_score: 55, updated_at: daysAgo(5), created_at: daysAgo(10) },
      { id: 'v5', name: 'E', status: 'active', current_lifecycle_stage: 5, ai_score: 80, updated_at: daysAgo(5), created_at: daysAgo(10) },
    ];
    const supabase = mockSupabase(ventures);
    const result = await readVenturePortfolioSignals({ supabase, logger: silentLogger });

    const conc = result.find(s => s.title.includes('Portfolio concentration'));
    expect(conc).toBeDefined();
    expect(conc.evidence.stage_distribution).toBeDefined();
    expect(conc.evidence.total_ventures).toBe(5);
  });
});
