/**
 * SD-LEO-INFRA-STAGE0-GOVERNED-POSTURE-001 (FR-4): governed selection-posture
 * resolution + consumption proofs, per stage-zero-greenfield-spec.md R2.
 *
 * The load-bearing assertions:
 *  - FAIL-CLOSED: store unavailable / zero active / ambiguous / invalid weights
 *    each THROW with a distinct reason code — no silent default weights, ever.
 *  - SWITCH PROOF: the same candidate set ranks differently under Phase-1
 *    (process-proving) vs Phase-2 (success-weighted) weights.
 *  - CONSUMPTION: rankCandidates refuses to run without posture weights, and
 *    executeDiscoveryMode aborts before ranking when resolution fails.
 */

import { describe, test, expect, vi } from 'vitest';
import { resolveActivePosture, PostureResolutionError } from '../../../../lib/eva/stage-zero/profile-service.js';
import { rankCandidates, executeDiscoveryMode } from '../../../../lib/eva/stage-zero/paths/discovery-mode.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// Mirrors the migration seeds (20260710_selection_postures.sql).
const PHASE1_WEIGHTS = {
  automation_feasibility: 0.45,
  target_market_specificity: 0.25,
  strategic_fit: 0.20,
  competition_level: 0.10,
  monthly_revenue_potential: 0.0,
};
const PHASE2_WEIGHTS = {
  monthly_revenue_potential: 0.40,
  automation_feasibility: 0.20,
  target_market_specificity: 0.15,
  strategic_fit: 0.15,
  competition_level: 0.10,
};

function postureRow(overrides = {}) {
  return {
    id: 'p1',
    phase_key: 'phase_1_process_proving',
    version: 1,
    display_name: 'Phase 1 — process-proving',
    criteria: { weights: PHASE1_WEIGHTS, anti_goals: ['regulatory surface'], hard_criteria: ['full-26-stage traversability'] },
    status: 'active',
    ratified_by: 'chairman',
    ratified_at: '2026-07-10T00:00:00Z',
    expiry_condition: 'one venture completes all 26 stages through real launch/ops/revenue',
    ...overrides,
  };
}

function mockPostureStore({ rows = [postureRow()], error = null } = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: error ? null : rows, error }),
    })),
  };
}

describe('resolveActivePosture — fail-closed (FR-2)', () => {
  test('missing supabase client throws no_supabase_client', async () => {
    await expect(resolveActivePosture({ logger: silentLogger })).rejects.toThrow(PostureResolutionError);
    await expect(resolveActivePosture({ logger: silentLogger })).rejects.toMatchObject({ reason: 'no_supabase_client' });
  });

  test('store error throws store_unavailable — never falls back to defaults', async () => {
    const supabase = mockPostureStore({ error: { message: 'connection refused' } });
    await expect(resolveActivePosture({ supabase, logger: silentLogger })).rejects.toMatchObject({ reason: 'store_unavailable' });
  });

  test('zero active rows throws no_active_posture', async () => {
    const supabase = mockPostureStore({ rows: [] });
    await expect(resolveActivePosture({ supabase, logger: silentLogger })).rejects.toMatchObject({ reason: 'no_active_posture' });
  });

  test('two active rows throws ambiguous_active_posture (no arbitrary pick)', async () => {
    const supabase = mockPostureStore({ rows: [postureRow(), postureRow({ id: 'p2', phase_key: 'phase_2_success_weighted' })] });
    await expect(resolveActivePosture({ supabase, logger: silentLogger })).rejects.toMatchObject({ reason: 'ambiguous_active_posture' });
  });

  test('weights not summing to 1.0 throws invalid_posture_weights', async () => {
    const supabase = mockPostureStore({ rows: [postureRow({ criteria: { weights: { automation_feasibility: 0.5 } } })] });
    await expect(resolveActivePosture({ supabase, logger: silentLogger })).rejects.toMatchObject({ reason: 'invalid_posture_weights' });
  });

  test('missing criteria.weights throws invalid_posture_weights', async () => {
    const supabase = mockPostureStore({ rows: [postureRow({ criteria: {} })] });
    await expect(resolveActivePosture({ supabase, logger: silentLogger })).rejects.toMatchObject({ reason: 'invalid_posture_weights' });
  });

  test('happy path returns posture_version phase_key@vN and round-trips criteria', async () => {
    const supabase = mockPostureStore();
    const posture = await resolveActivePosture({ supabase, logger: silentLogger });
    expect(posture.posture_version).toBe('phase_1_process_proving@v1');
    expect(posture.criteria.weights).toEqual(PHASE1_WEIGHTS);
    expect(posture.criteria.anti_goals).toContain('regulatory surface');
    expect(posture.ratified_by).toBe('chairman');
    expect(posture.source).toBe('active');
  });
});

describe('posture consumption (FR-3)', () => {
  const v2 = '2025-12-trend-scanner-v2';
  const candidates = [
    // Revenue monster: huge GROUNDED revenue (declared E1 with a source, since
    // SD-LEO-INFRA-STAGE0-EVIDENCE-GRADING-001 flattens ungrounded E0 revenue),
    // middling automation, vague market, low competition.
    { name: 'RevenueMonster', prompt_version: v2, automation_feasibility: 5, monthly_revenue_potential: '$500K/month', target_market: 'everyone', competition_level: 'low', evidence: { monthly_revenue_potential: { grade: 'E1', sources: ['fixture://market-sizing-report'] } } },
    // Simple bot: highly automatable, specific market, tiny GROUNDED revenue
    // (process-proving scale — under Phase-2's 0.40 revenue weight this must lose
    // to the grounded revenue monster; under Phase-1's 0.0 revenue weight it must
    // win on simplicity).
    { name: 'SimpleBot', prompt_version: v2, automation_feasibility: 10, monthly_revenue_potential: '$100/month', target_market: 'B2B SaaS startups with 50-200 employees in fintech', competition_level: 'low', evidence: { monthly_revenue_potential: { grade: 'E1', sources: ['fixture://pilot-invoice'] } } },
  ];

  test('rankCandidates without weights throws (no hardcoded posture constants)', () => {
    expect(() => rankCandidates(candidates)).toThrow(/posture weights/);
    expect(() => rankCandidates(candidates, {})).toThrow(/posture weights/);
  });

  test('SWITCH PROOF: Phase-1 vs Phase-2 postures rank the same candidates differently', () => {
    const underPhase1 = rankCandidates(candidates, { weights: PHASE1_WEIGHTS });
    const underPhase2 = rankCandidates(candidates, { weights: PHASE2_WEIGHTS });
    // Phase-1 (simplicity dominates, revenue weight 0): the simple, automatable candidate wins.
    expect(underPhase1[0].name).toBe('SimpleBot');
    // Phase-2 (success-weighted, revenue 0.40): the revenue-dominant candidate wins.
    expect(underPhase2[0].name).toBe('RevenueMonster');
    expect(underPhase1[0].name).not.toBe(underPhase2[0].name);
  });

  test('executeDiscoveryMode fails closed: posture resolution failure aborts with no ranking output', async () => {
    // Strategy + posture store both served by one table-aware mock; posture store empty.
    const strategyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { strategy_key: 'trend_scanner', name: 'Trend Scanner', is_active: true }, error: null }),
      order: vi.fn().mockResolvedValue({ data: [{ strategy_key: 'trend_scanner', is_active: true }], error: null }),
    };
    const postureChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn((table) => (table === 'selection_postures' ? postureChain : strategyChain)) };
    const llmClient = {
      _model: 'test-model',
      complete: vi.fn().mockResolvedValue(JSON.stringify([
        { name: 'V1', problem_statement: 'p', solution: 's', target_market: 'm', automation_feasibility: 8, competition_level: 'low', monthly_revenue_potential: '$5K/month' },
        { name: 'V2', problem_statement: 'p', solution: 's', target_market: 'm', automation_feasibility: 7, competition_level: 'low', monthly_revenue_potential: '$4K/month' },
        { name: 'V3', problem_statement: 'p', solution: 's', target_market: 'm', automation_feasibility: 6, competition_level: 'low', monthly_revenue_potential: '$3K/month' },
      ])),
    };

    await expect(
      executeDiscoveryMode({ strategy: 'trend_scanner' }, { supabase, logger: silentLogger, llmClient })
    ).rejects.toMatchObject({ name: 'PostureResolutionError', reason: 'no_active_posture' });
  });
});
