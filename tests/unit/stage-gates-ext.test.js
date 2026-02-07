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
    expect(KILL_GATE_STAGES).toEqual(new Set([3, 5, 13, 23]));
  });

  it('defines correct promotion gate stages', () => {
    expect(PROMOTION_GATE_STAGES).toEqual(new Set([16, 17, 22]));
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
    for (const stage of [3, 5, 13, 23]) {
      const result = getGateType(stage);
      expect(result).toEqual({ isGated: true, gateType: GATE_TYPE.KILL });
    }
  });

  it('returns PROMOTION for promotion gate stages', () => {
    for (const stage of [16, 17, 22]) {
      const result = getGateType(stage);
      expect(result).toEqual({ isGated: true, gateType: GATE_TYPE.PROMOTION });
    }
  });

  it('returns not gated for other stages', () => {
    for (const stage of [1, 2, 4, 6, 7, 8, 9, 10, 11, 14, 15, 18, 19, 20, 24, 25]) {
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

  it('routes 21->22 to UAT Signoff Gate (existing)', async () => {
    const supabase = createMockSupabase({
      venture_artifacts: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await validateStageGate(supabase, 'v1', 21, 22, { logger: silentLogger });
    expect(result.gate_name).toBe('UAT_SIGNOFF');
  });

  it('routes 22->23 to Deployment Health Gate (existing)', async () => {
    const supabase = createMockSupabase({
      venture_artifacts: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await validateStageGate(supabase, 'v1', 22, 23, { logger: silentLogger });
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

    const result = await validateStageGate(supabase, 'v1', 15, 16, {
      logger: silentLogger,
      stageOutput: { score: 9 },
    });
    expect(result.gate_name).toBe('PROMOTION_GATE_STAGE_16');
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

    const result = await evaluatePromotionGate(supabase, 'v1', 15, 16, {
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

    const result = await evaluatePromotionGate(supabase, 'v1', 15, 16, {
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

    const result = await evaluatePromotionGate(supabase, 'v1', 16, 17, {
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

    const result = await evaluatePromotionGate(supabase, 'v1', 15, 16, {
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

    const result = await evaluatePromotionGate(supabase, 'v1', 21, 22, {
      stageOutput: { score: 9 },
      logger: silentLogger,
    });

    expect(result.details.stage).toBe(22);
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
    expect(result.checks[0].check).toBe('pricing_model_exists');
    expect(result.checks[0].passed).toBe(false);
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
