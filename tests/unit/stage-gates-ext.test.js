/**
 * Unit tests for Stage Gates Extension
 * SD-LEO-INFRA-STAGE-GATES-EXT-001
 *
 * Tests kill gates, promotion gates, existing gate preservation,
 * Filter Engine integration, and chairman summary generation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateStageGate,
  getGateType,
  KILL_GATE_STAGES,
  SOFT_KILL_STAGES,
  PROMOTION_GATE_STAGES,
  GATE_TYPE,
  GATE_STATUS,
  FILTER_PREFERENCE_KEYS,
  _internal,
} from '../../lib/agents/modules/venture-state-machine/stage-gates.js';

const {
  evaluateKillGate,
  evaluatePromotionGate,
  resolveGateContext,
  buildSummary,
} = _internal;

// ── Test Helpers ────────────────────────────────────────────────────

const silentLogger = {
  log: () => {},
  debug: () => {},
  error: () => {},
  info: () => {},
};

function createMockSupabase(overrides = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    from: vi.fn((table) => {
      if (overrides[table]) return overrides[table];
      return { ...defaultChain };
    }),
  };
}

function createPreferenceRows(prefs) {
  return prefs.map(([key, value, valueType]) => ({
    id: `pref-${key}`,
    preference_key: key,
    preference_value: value,
    value_type: valueType || 'number',
    source: 'test',
    updated_at: new Date().toISOString(),
  }));
}

// ── Configuration Tests ─────────────────────────────────────────────

describe('Gate Configuration', () => {
  it('defines correct kill gate stages', () => {
    expect(KILL_GATE_STAGES).toEqual(new Set([3, 5, 13, 24]));
  });

  it('defines correct promotion gate stages', () => {
    expect(PROMOTION_GATE_STAGES).toEqual(new Set([17, 18, 23]));
  });

  it('kill and promotion stages do not overlap', () => {
    for (const stage of KILL_GATE_STAGES) {
      expect(PROMOTION_GATE_STAGES.has(stage)).toBe(false);
    }
  });

  it('exports GATE_TYPE enum', () => {
    expect(GATE_TYPE.EXISTING).toBe('EXISTING');
    expect(GATE_TYPE.KILL).toBe('KILL');
    expect(GATE_TYPE.PROMOTION).toBe('PROMOTION');
  });

  it('exports GATE_STATUS enum', () => {
    expect(GATE_STATUS.PASS).toBe('PASS');
    expect(GATE_STATUS.FAIL).toBe('FAIL');
    expect(GATE_STATUS.REQUIRES_CHAIRMAN_DECISION).toBe('REQUIRES_CHAIRMAN_DECISION');
    expect(GATE_STATUS.REQUIRES_CHAIRMAN_APPROVAL).toBe('REQUIRES_CHAIRMAN_APPROVAL');
    expect(GATE_STATUS.ERROR).toBe('ERROR');
  });

  it('GATE_TYPE is frozen', () => {
    expect(Object.isFrozen(GATE_TYPE)).toBe(true);
  });

  it('GATE_STATUS is frozen', () => {
    expect(Object.isFrozen(GATE_STATUS)).toBe(true);
  });
});

// ── getGateType Tests ───────────────────────────────────────────────

describe('getGateType', () => {
  it('returns KILL for kill gate stages', () => {
    for (const stage of [3, 5, 13, 24]) {
      const result = getGateType(stage);
      expect(result).toEqual({ isGated: true, gateType: GATE_TYPE.KILL });
    }
  });

  it('returns PROMOTION for promotion gate stages', () => {
    for (const stage of [17, 18, 23]) {
      const result = getGateType(stage);
      expect(result).toEqual({ isGated: true, gateType: GATE_TYPE.PROMOTION });
    }
  });

  it('returns not gated for other stages', () => {
    for (const stage of [1, 2, 4, 6, 7, 8, 9, 10, 11, 14, 15, 16, 19, 20, 21, 25, 26]) {
      const result = getGateType(stage);
      expect(result).toEqual({ isGated: false, gateType: null });
    }
  });
});

// ── validateStageGate Routing Tests ─────────────────────────────────

describe('validateStageGate routing', () => {
  it('routes 5->6 to Financial Viability Gate (existing)', async () => {
    const supabase = createMockSupabase({
      venture_artifacts: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await validateStageGate(supabase, 'v1', 5, 6, { logger: silentLogger });
    expect(result.gate_name).toBe('FINANCIAL_VIABILITY');
    expect(result.passed).toBe(false);
  });

  it('routes 22->23 to UAT Signoff Gate (existing)', async () => {
    const supabase = createMockSupabase({
      venture_artifacts: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await validateStageGate(supabase, 'v1', 22, 23, { logger: silentLogger });
    expect(result.gate_name).toBe('UAT_SIGNOFF');
  });

  it('routes 23->24 to Deployment Health Gate (existing)', async () => {
    const supabase = createMockSupabase({
      venture_artifacts: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await validateStageGate(supabase, 'v1', 23, 24, { logger: silentLogger });
    expect(result.gate_name).toBe('DEPLOYMENT_HEALTH');
  });

  it('routes to kill gate for kill gate stages', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    });

    // Stage 2->3 should route to kill gate
    const result = await validateStageGate(supabase, 'v1', 2, 3, {
      logger: silentLogger,
      stageOutput: { score: 9 }, // high score = all pass
    });
    expect(result.gate_name).toBe('KILL_GATE_STAGE_3');
    expect(result.gateType).toBe(GATE_TYPE.KILL);
  });

  it('routes to promotion gate for promotion gate stages', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    });

    const result = await validateStageGate(supabase, 'v1', 16, 17, {
      logger: silentLogger,
      stageOutput: { score: 9 },
    });
    expect(result.gate_name).toBe('PROMOTION_GATE_STAGE_17');
    expect(result.gateType).toBe(GATE_TYPE.PROMOTION);
  });

  it('returns no gate for ungated transitions', async () => {
    const supabase = createMockSupabase();
    const result = await validateStageGate(supabase, 'v1', 6, 7, { logger: silentLogger });
    expect(result.passed).toBe(true);
    expect(result.gate_name).toBe(null);
  });
});

// ── Kill Gate Tests ─────────────────────────────────────────────────

describe('Kill Gate (evaluateKillGate)', () => {
  it('returns PASS when all Filter Engine thresholds pass', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: createPreferenceRows([
            ['filter.cost_max_usd', 50000, 'number'],
            ['filter.min_score', 5, 'number'],
          ]),
          error: null,
        }),
      },
    });

    const result = await evaluateKillGate(supabase, 'v1', 2, 3, {
      chairmanId: 'ch1',
      stageOutput: { cost: 1000, score: 8 },
      logger: silentLogger,
    });

    expect(result.status).toBe(GATE_STATUS.PASS);
    expect(result.passed).toBe(true);
    expect(result.gateType).toBe(GATE_TYPE.KILL);
    expect(result.details.correlationId).toBeDefined();
    expect(result.details.evaluatedThresholds).toEqual([]);
  });

  it('returns REQUIRES_CHAIRMAN_DECISION when cost threshold fails', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: createPreferenceRows([
            ['filter.cost_max_usd', 5000, 'number'],
          ]),
          error: null,
        }),
      },
    });

    const result = await evaluateKillGate(supabase, 'v1', 4, 5, {
      chairmanId: 'ch1',
      stageOutput: { cost: 20000, score: 8 },
      logger: silentLogger,
    });

    expect(result.status).toBe(GATE_STATUS.REQUIRES_CHAIRMAN_DECISION);
    expect(result.passed).toBe(false);
    expect(result.details.evaluatedThresholds.length).toBeGreaterThan(0);
    expect(result.details.evaluatedThresholds[0].thresholdId).toBe('cost_threshold');
  });

  // SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 (FR-3): S3 is a SOFT kill — advisory, non-blocking.
  it('S3 (soft kill stage) does NOT block on a threshold failure — advisory, passed:true', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: createPreferenceRows([['filter.cost_max_usd', 5000, 'number']]),
          error: null,
        }),
      },
    });
    const result = await evaluateKillGate(supabase, 'v1', 2, 3, {
      chairmanId: 'ch1',
      stageOutput: { cost: 20000, score: 8 }, // cost over threshold -> would fail at a hard gate
      logger: silentLogger,
    });
    // FR-3: at S3 the venture PROCEEDS (passed:true) with an ADVISORY verdict, deferring the
    // authoritative kill to S5. The failing threshold is still recorded (enriches S5).
    expect(result.passed).toBe(true);
    expect(result.advisory).toBe(true);
    expect(result.status).toBe(GATE_STATUS.ADVISORY);
    expect(result.details.evaluatedThresholds.length).toBeGreaterThan(0);
  });

  it('S5 (authoritative) STILL blocks on a threshold failure (FR-3 — S5 unchanged)', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: createPreferenceRows([['filter.cost_max_usd', 5000, 'number']]),
          error: null,
        }),
      },
    });
    const result = await evaluateKillGate(supabase, 'v1', 4, 5, {
      chairmanId: 'ch1',
      stageOutput: { cost: 20000, score: 8 },
      logger: silentLogger,
    });
    expect(result.passed).toBe(false);
    expect(result.status).toBe(GATE_STATUS.REQUIRES_CHAIRMAN_DECISION);
  });

  it('SOFT_KILL_STAGES is exactly {3}; S3 remains a KILL gate type', () => {
    expect(SOFT_KILL_STAGES).toEqual(new Set([3]));
    expect(getGateType(3).gateType).toBe(GATE_TYPE.KILL);
  });

  it('returns REQUIRES_CHAIRMAN_DECISION when score is low', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: createPreferenceRows([
            ['filter.min_score', 7, 'number'],
          ]),
          error: null,
        }),
      },
    });

    const result = await evaluateKillGate(supabase, 'v1', 12, 13, {
      chairmanId: 'ch1',
      stageOutput: { score: 4 },
      logger: silentLogger,
    });

    expect(result.status).toBe(GATE_STATUS.REQUIRES_CHAIRMAN_DECISION);
    expect(result.passed).toBe(false);
  });

  it('returns ERROR and fails closed on exception', async () => {
    const supabase = {
      from: vi.fn(() => { throw new Error('DB connection lost'); }),
    };

    const result = await evaluateKillGate(supabase, 'v1', 2, 3, {
      chairmanId: 'ch1',
      stageOutput: {},
      logger: silentLogger,
    });

    expect(result.status).toBe(GATE_STATUS.ERROR);
    expect(result.passed).toBe(false);
    expect(result.details.error).toBe('DB connection lost');
    expect(result.details.correlationId).toBeDefined();
  });

  it('works without chairmanId (uses defaults)', async () => {
    const supabase = createMockSupabase();

    const result = await evaluateKillGate(supabase, 'v1', 2, 3, {
      stageOutput: { score: 9, cost: 100 },
      logger: silentLogger,
    });

    // With defaults, high score and low cost should pass
    expect(result.gateType).toBe(GATE_TYPE.KILL);
    expect(result.gate_name).toBe('KILL_GATE_STAGE_3');
  });

  it('includes correlationId in all results', async () => {
    const supabase = createMockSupabase();

    const result = await evaluateKillGate(supabase, 'v1', 2, 3, {
      stageOutput: { score: 9 },
      logger: silentLogger,
    });

    expect(result.details.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

// ── Promotion Gate Tests ────────────────────────────────────────────

describe('Promotion Gate (evaluatePromotionGate)', () => {
  it('returns REQUIRES_CHAIRMAN_APPROVAL when all thresholds pass', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: createPreferenceRows([
            ['filter.cost_max_usd', 50000, 'number'],
            ['filter.min_score', 5, 'number'],
          ]),
          error: null,
        }),
      },
    });

    const result = await evaluatePromotionGate(supabase, 'v1', 16, 17, {
      chairmanId: 'ch1',
      stageOutput: { cost: 1000, score: 8 },
      logger: silentLogger,
    });

    // Promotion gates always require Chairman approval, even when thresholds pass
    expect(result.status).toBe(GATE_STATUS.REQUIRES_CHAIRMAN_APPROVAL);
    expect(result.passed).toBe(false);
    expect(result.gateType).toBe(GATE_TYPE.PROMOTION);
  });

  it('returns FAIL when HIGH-severity threshold fails', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: createPreferenceRows([
            ['filter.cost_max_usd', 5000, 'number'],
          ]),
          error: null,
        }),
      },
    });

    const result = await evaluatePromotionGate(supabase, 'v1', 16, 17, {
      chairmanId: 'ch1',
      stageOutput: { cost: 20000, score: 8 },
      logger: silentLogger,
    });

    expect(result.status).toBe(GATE_STATUS.FAIL);
    expect(result.passed).toBe(false);
    expect(result.details.evaluatedThresholds.some(t => t.severity === 'HIGH')).toBe(true);
  });

  it('returns REQUIRES_CHAIRMAN_APPROVAL with MEDIUM triggers (not FAIL)', async () => {
    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: createPreferenceRows([
            ['filter.min_score', 7, 'number'],
            ['filter.cost_max_usd', 50000, 'number'],
          ]),
          error: null,
        }),
      },
    });

    const result = await evaluatePromotionGate(supabase, 'v1', 17, 18, {
      chairmanId: 'ch1',
      stageOutput: { cost: 1000, score: 5 }, // Low score = MEDIUM severity
      logger: silentLogger,
    });

    // MEDIUM severity doesn't block, but still needs Chairman approval
    expect(result.status).toBe(GATE_STATUS.REQUIRES_CHAIRMAN_APPROVAL);
    expect(result.passed).toBe(false);
  });

  it('returns ERROR and fails closed on exception', async () => {
    const supabase = {
      from: vi.fn(() => { throw new Error('Timeout'); }),
    };

    const result = await evaluatePromotionGate(supabase, 'v1', 16, 17, {
      chairmanId: 'ch1',
      stageOutput: {},
      logger: silentLogger,
    });

    expect(result.status).toBe(GATE_STATUS.ERROR);
    expect(result.passed).toBe(false);
    expect(result.details.error).toBe('Timeout');
  });

  it('includes stage and correlationId in result', async () => {
    const supabase = createMockSupabase();

    const result = await evaluatePromotionGate(supabase, 'v1', 22, 23, {
      stageOutput: { score: 9 },
      logger: silentLogger,
    });

    expect(result.details.stage).toBe(23);
    expect(result.details.correlationId).toBeDefined();
  });
});

// ── buildSummary Tests (FR-5) ───────────────────────────────────────

describe('buildSummary (FR-5: <=240 chars)', () => {
  it('generates PASS summary', () => {
    const summary = buildSummary(GATE_TYPE.KILL, 3, GATE_STATUS.PASS, []);
    expect(summary).toContain('Kill gate');
    expect(summary).toContain('stage 3');
    expect(summary).toContain('PASSED');
    expect(summary.length).toBeLessThanOrEqual(240);
  });

  it('generates FAIL summary', () => {
    const thresholds = [{ thresholdId: 'cost_threshold' }];
    const summary = buildSummary(GATE_TYPE.PROMOTION, 16, GATE_STATUS.FAIL, thresholds);
    expect(summary).toContain('Promotion gate');
    expect(summary).toContain('BLOCKED');
    expect(summary).toContain('1 threshold(s)');
    expect(summary.length).toBeLessThanOrEqual(240);
  });

  it('generates REQUIRES_CHAIRMAN_DECISION summary', () => {
    const thresholds = [{ thresholdId: 'cost_threshold' }, { thresholdId: 'low_score' }];
    const summary = buildSummary(GATE_TYPE.KILL, 5, GATE_STATUS.REQUIRES_CHAIRMAN_DECISION, thresholds);
    expect(summary).toContain('2 threshold(s) failed');
    expect(summary).toContain('Chairman decision');
    expect(summary.length).toBeLessThanOrEqual(240);
  });

  it('generates REQUIRES_CHAIRMAN_APPROVAL summary with issues', () => {
    const thresholds = [{ thresholdId: 'low_score' }];
    const summary = buildSummary(GATE_TYPE.PROMOTION, 17, GATE_STATUS.REQUIRES_CHAIRMAN_APPROVAL, thresholds);
    expect(summary).toContain('1 minor issue(s)');
    expect(summary).toContain('Chairman approval');
    expect(summary.length).toBeLessThanOrEqual(240);
  });

  it('generates REQUIRES_CHAIRMAN_APPROVAL summary without issues', () => {
    const summary = buildSummary(GATE_TYPE.PROMOTION, 22, GATE_STATUS.REQUIRES_CHAIRMAN_APPROVAL, []);
    expect(summary).toContain('All thresholds met');
    expect(summary).toContain('Chairman approval');
    expect(summary.length).toBeLessThanOrEqual(240);
  });

  it('generates ERROR summary', () => {
    const summary = buildSummary(GATE_TYPE.KILL, 13, GATE_STATUS.ERROR, []);
    expect(summary).toContain('System error');
    expect(summary.length).toBeLessThanOrEqual(240);
  });

  it('truncates to 240 chars if longer', () => {
    // Create a scenario that would exceed 240 chars
    const longThresholds = Array(50).fill({ thresholdId: 'x' });
    const summary = buildSummary(GATE_TYPE.KILL, 3, GATE_STATUS.REQUIRES_CHAIRMAN_DECISION, longThresholds);
    expect(summary.length).toBeLessThanOrEqual(240);
  });
});

// ── resolveGateContext Tests ────────────────────────────────────────

describe('resolveGateContext', () => {
  it('loads preferences when chairmanId provided', async () => {
    const prefRows = createPreferenceRows([
      ['filter.cost_max_usd', 10000, 'number'],
      ['filter.min_score', 7, 'number'],
    ]);

    const supabase = createMockSupabase({
      chairman_preferences: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: prefRows, error: null }),
      },
    });

    const { preferences } = await resolveGateContext(supabase, 'v1', 3, {
      chairmanId: 'ch1',
      stageOutput: {},
    });

    expect(preferences['filter.cost_max_usd']).toBe(10000);
    expect(preferences['filter.min_score']).toBe(7);
  });

  it('returns empty preferences when no chairmanId', async () => {
    const supabase = createMockSupabase();

    const { preferences } = await resolveGateContext(supabase, 'v1', 3, {
      stageOutput: {},
    });

    expect(preferences).toEqual({});
  });

  it('builds stageInput from stageOutput', async () => {
    const supabase = createMockSupabase();

    const { stageInput } = await resolveGateContext(supabase, 'v1', 3, {
      stageOutput: {
        cost: 5000,
        score: 7,
        technologies: ['React'],
        vendors: ['AWS'],
        description: 'Test stage',
        patterns: ['microservices'],
        priorPatterns: ['monolith'],
        constraints: { budget: 10000 },
        approvedConstraints: { budget: 10000 },
      },
    });

    expect(stageInput.stage).toBe('3');
    expect(stageInput.cost).toBe(5000);
    expect(stageInput.score).toBe(7);
    expect(stageInput.technologies).toEqual(['React']);
    expect(stageInput.vendors).toEqual(['AWS']);
    expect(stageInput.description).toBe('Test stage');
    expect(stageInput.patterns).toEqual(['microservices']);
    expect(stageInput.priorPatterns).toEqual(['monolith']);
  });

  it('defaults missing stageOutput fields', async () => {
    const supabase = createMockSupabase();

    const { stageInput } = await resolveGateContext(supabase, 'v1', 3, {
      stageOutput: {},
    });

    expect(stageInput.technologies).toEqual([]);
    expect(stageInput.vendors).toEqual([]);
    expect(stageInput.description).toBe('');
    expect(stageInput.patterns).toEqual([]);
    expect(stageInput.priorPatterns).toEqual([]);
    expect(stageInput.constraints).toEqual({});
    expect(stageInput.approvedConstraints).toEqual({});
  });

  // QF-20260710-941 (Solomon H4, Delta ledger): reader/writer shape contract.
  // The live writer (scripts/stage-zero-queue-processor.js -> executeStageZero)
  // nests rubric_scores/confidence under result.brief.metadata.forecast and
  // venture_score under result.brief.metadata — never at result's top level.
  describe('stage0Score fallback (SHAPE-DRIFT class)', () => {
    const RUBRIC_SCORES = {
      market_opportunity: { score: 4, rationale: 'Strong' },
      revenue_viability: { score: 3, rationale: 'Moderate' },
      unit_economics: { score: 3, rationale: 'Moderate' },
      execution_feasibility: { score: 4, rationale: 'Strong' },
      competitive_defensibility: { score: 2, rationale: 'Weak' },
    };

    function mockStageZeroRequests(resultRow) {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: resultRow ? { result: resultRow } : null, error: null }),
      };
    }

    it('reads rubric_scores from the LIVE nested shape (result.brief.metadata.forecast)', async () => {
      const supabase = createMockSupabase({
        stage_zero_requests: mockStageZeroRequests({
          brief: { metadata: { forecast: { rubric_scores: RUBRIC_SCORES, confidence: 70 }, venture_score: 55 } },
        }),
      });

      const { stageInput } = await resolveGateContext(supabase, 'v1', 5, { stageOutput: {} });

      expect(stageInput.score).toBeGreaterThan(0);
      expect(stageInput.score).not.toBeUndefined();
    });

    it('falls back to venture_score from the LIVE nested shape when no rubric_scores present', async () => {
      const supabase = createMockSupabase({
        stage_zero_requests: mockStageZeroRequests({
          brief: { metadata: { venture_score: 80 } },
        }),
      });

      const { stageInput } = await resolveGateContext(supabase, 'v1', 5, { stageOutput: {} });

      expect(stageInput.score).toBe(8); // 80/10
    });

    it('still reads the legacy flat top-level shape (backward compatibility)', async () => {
      const supabase = createMockSupabase({
        stage_zero_requests: mockStageZeroRequests({
          rubric_scores: RUBRIC_SCORES,
          confidence: 70,
        }),
      });

      const { stageInput } = await resolveGateContext(supabase, 'v1', 5, { stageOutput: {} });

      expect(stageInput.score).toBeGreaterThan(0);
      expect(stageInput.score).not.toBeUndefined();
    });

    it('leaves stage0Score undefined when neither shape has a score (no silent wrong value)', async () => {
      const supabase = createMockSupabase({
        stage_zero_requests: mockStageZeroRequests({ brief: { metadata: {} } }),
      });

      const { stageInput } = await resolveGateContext(supabase, 'v1', 5, { stageOutput: {} });

      expect(stageInput.score).toBeUndefined();
    });

    it('does not query stage_zero_requests when stageOutput.score is already provided', async () => {
      const stageZeroTable = mockStageZeroRequests({ brief: { metadata: { venture_score: 80 } } });
      const supabase = createMockSupabase({ stage_zero_requests: stageZeroTable });

      const { stageInput } = await resolveGateContext(supabase, 'v1', 5, { stageOutput: { score: 6 } });

      expect(stageInput.score).toBe(6);
      expect(stageZeroTable.maybeSingle).not.toHaveBeenCalled();
    });
  });
});

// ── Existing Gate Preservation (FR-4) ───────────────────────────────

describe('Existing Gate Preservation (FR-4)', () => {
  it('Financial Viability Gate returns correct structure on missing artifact', async () => {
    const { validateFinancialViabilityGate } = _internal;
    const supabase = createMockSupabase({
      venture_artifacts: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await validateFinancialViabilityGate(supabase, 'v1');
    expect(result.passed).toBe(false);
    expect(result.gate_name).toBe('FINANCIAL_VIABILITY');
    // SD-LEO-INFRA-S5-FINANCIAL-GATE-FUTURE-ARTIFACT-BUG-001: the first check is
    // now the S5-appropriate financial_model_exists (truth_financial_model).
    expect(result.checks[0].check).toBe('financial_model_exists');
    expect(result.checks[0].passed).toBe(false);
  });

  // SD-LEO-INFRA-S5-FINANCIAL-GATE-FUTURE-ARTIFACT-BUG-001: the S5 financial gate
  // must pass on the S5 truth_financial_model alone (not require S7/S8 artifacts),
  // still pass when future-stage artifacts are present, and fail only when NO
  // financial artifact exists. Build a venture_artifacts mock that resolves
  // per artifact_type via the .eq('artifact_type', T) filter.
  function financialArtifactsMock(present) {
    return {
      venture_artifacts: {
        _type: null,
        select() { return this; },
        eq(col, val) { if (col === 'artifact_type') this._type = val; return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle() {
          const has = present.includes(this._type);
          this._type = null;
          return Promise.resolve({
            data: has ? { artifact_data: { revenueStreams: [{ name: 'r1' }] }, created_at: '2026-01-01T00:00:00Z' } : null,
            error: null,
          });
        },
      },
    };
  }

  it('Financial Viability Gate PASSES at S5 with only truth_financial_model (no future artifacts)', async () => {
    const { validateFinancialViabilityGate } = _internal;
    const supabase = createMockSupabase(financialArtifactsMock(['truth_financial_model']));
    const result = await validateFinancialViabilityGate(supabase, 'v1');
    expect(result.passed).toBe(true);
    expect(result.checks.find(c => c.check === 'financial_model_exists')?.passed).toBe(true);
  });

  it('Financial Viability Gate FAILS when NO financial artifact of any kind exists', async () => {
    const { validateFinancialViabilityGate } = _internal;
    const supabase = createMockSupabase(financialArtifactsMock([]));
    const result = await validateFinancialViabilityGate(supabase, 'v1');
    expect(result.passed).toBe(false);
    expect(result.details.message).toBe('No financial artifacts found');
  });

  it('Financial Viability Gate PASSES when future-stage artifacts are present (lenient intent preserved)', async () => {
    const { validateFinancialViabilityGate } = _internal;
    const supabase = createMockSupabase(financialArtifactsMock(['engine_pricing_model', 'engine_business_model_canvas']));
    const result = await validateFinancialViabilityGate(supabase, 'v1');
    expect(result.passed).toBe(true);
    expect(result.checks.find(c => c.check === 'pricing_model_exists')?.passed).toBe(true);
  });

  it('UAT Signoff Gate returns correct structure on missing artifact', async () => {
    const { validateUATSignoffGate } = _internal;
    const supabase = createMockSupabase({
      venture_artifacts: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await validateUATSignoffGate(supabase, 'v1');
    expect(result.passed).toBe(false);
    expect(result.gate_name).toBe('UAT_SIGNOFF');
    expect(result.checks[0].check).toBe('test_report_exists');
  });

  it('Deployment Health Gate returns correct structure on missing artifact', async () => {
    const { validateDeploymentHealthGate } = _internal;
    const supabase = createMockSupabase({
      venture_artifacts: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await validateDeploymentHealthGate(supabase, 'v1');
    expect(result.passed).toBe(false);
    expect(result.gate_name).toBe('DEPLOYMENT_HEALTH');
    expect(result.checks[0].check).toBe('runbook_exists');
  });
});

// ── FILTER_PREFERENCE_KEYS Tests ────────────────────────────────────

describe('FILTER_PREFERENCE_KEYS', () => {
  it('contains all expected preference keys', () => {
    expect(FILTER_PREFERENCE_KEYS).toContain('filter.cost_max_usd');
    expect(FILTER_PREFERENCE_KEYS).toContain('filter.min_score');
    expect(FILTER_PREFERENCE_KEYS).toContain('filter.approved_tech_list');
    expect(FILTER_PREFERENCE_KEYS).toContain('filter.approved_vendor_list');
    expect(FILTER_PREFERENCE_KEYS).toContain('filter.pivot_keywords');
  });

  it('has exactly 5 keys', () => {
    expect(FILTER_PREFERENCE_KEYS.length).toBe(5);
  });
});
