/**
 * Tests for Cross-Venture Pattern Learning
 * SD-LEO-FEAT-CROSS-VENTURE-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeCrossVenturePatterns,
  analyzeKillStageFrequency,
  analyzeFailedAssumptions,
  analyzeSuccessPatterns,
  round2,
  MIN_VENTURES,
} from '../../../lib/eva/cross-venture-learning.js';

// ── Mock Supabase builder ──────────────────────────────────

/**
 * Build a mock supabase client that returns preconfigured data per table.
 * Each table config maps to { data, error } responses.
 * Supports chained query methods (select, eq, in, not, gte, lte, or, order, maybeSingle).
 */
function createMockDb(tableResponses = {}) {
  return {
    from: vi.fn((table) => {
      const responses = tableResponses[table] || { data: [], error: null };
      // Support array of responses for multiple calls to the same table
      const responseList = Array.isArray(responses) ? [...responses] : [responses];
      let callIndex = 0;

      function getResponse() {
        const idx = Math.min(callIndex, responseList.length - 1);
        callIndex++;
        return responseList[idx];
      }

      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn(() => {
          const resp = getResponse();
          // Return both as promise-like and chainable
          const result = Promise.resolve(resp);
          result.select = chainable.select;
          result.eq = chainable.eq;
          result.in = chainable.in;
          result.not = chainable.not;
          result.gte = chainable.gte;
          result.lte = chainable.lte;
          result.or = chainable.or;
          result.order = chainable.order;
          result.limit = chainable.limit;
          result.maybeSingle = chainable.maybeSingle;
          return result;
        }),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(() => {
          const resp = getResponse();
          return Promise.resolve(resp);
        }),
      };

      // Make each method return chainable and also resolve
      for (const method of ['select', 'eq', 'in', 'not', 'gte', 'lte', 'or', 'limit']) {
        chainable[method] = vi.fn().mockReturnValue(chainable);
      }

      // Override order to resolve with data (terminal for most queries)
      chainable.order = vi.fn(() => {
        const resp = getResponse();
        const resolved = Promise.resolve(resp);
        // Allow further chaining after order
        resolved.select = chainable.select;
        resolved.eq = chainable.eq;
        resolved.in = chainable.in;
        resolved.limit = chainable.limit;
        return resolved;
      });

      // Make chainable also act as a thenable (for queries without explicit order)
      chainable.then = (resolve, reject) => {
        const resp = getResponse();
        return Promise.resolve(resp).then(resolve, reject);
      };

      return chainable;
    }),
  };
}

// ── Test Data ──────────────────────────────────

const VENTURE_IDS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

const VENTURES_DATA = [
  { id: 'v1', name: 'Venture One', status: 'active', current_lifecycle_stage: 20, killed_at: null, created_at: '2025-01-01' },
  { id: 'v2', name: 'Venture Two', status: 'killed', current_lifecycle_stage: 5, killed_at: '2025-03-15', created_at: '2025-02-01' },
  { id: 'v3', name: 'Venture Three', status: 'archived', current_lifecycle_stage: 25, killed_at: null, created_at: '2025-03-01' },
  { id: 'v4', name: 'Venture Four', status: 'killed', current_lifecycle_stage: 3, killed_at: '2025-04-10', created_at: '2025-04-01' },
  { id: 'v5', name: 'Venture Five', status: 'active', current_lifecycle_stage: 15, killed_at: null, created_at: '2025-05-01' },
  { id: 'v6', name: 'Venture Six', status: 'paused', current_lifecycle_stage: 10, killed_at: null, created_at: '2025-06-01' },
];

// ── Tests ──────────────────────────────────

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(0.123456)).toBe(0.12);
    expect(round2(0.125)).toBe(0.13);
    expect(round2(1 / 3)).toBe(0.33);
    expect(round2(2 / 3)).toBe(0.67);
    expect(round2(1)).toBe(1);
    expect(round2(0)).toBe(0);
  });

  it('handles edge cases', () => {
    expect(round2(0.005)).toBe(0.01);
    expect(round2(0.004)).toBe(0);
    expect(round2(99.999)).toBe(100);
  });
});

describe('analyzeCrossVenturePatterns', () => {
  it('returns insufficient_data when fewer than 5 ventures', async () => {
    const db = createMockDb({
      ventures: { data: VENTURES_DATA.slice(0, 3), error: null },
    });

    const result = await analyzeCrossVenturePatterns(db);

    expect(result.status).toBe('insufficient_data');
    expect(result.minimum).toBe(5);
    expect(result.actual).toBe(3);
  });

  it('returns insufficient_data when no ventures exist', async () => {
    const db = createMockDb({
      ventures: { data: [], error: null },
    });

    const result = await analyzeCrossVenturePatterns(db);

    expect(result.status).toBe('insufficient_data');
    expect(result.minimum).toBe(MIN_VENTURES);
    expect(result.actual).toBe(0);
  });

  it('returns insufficient_data when null ventures', async () => {
    const db = createMockDb({
      ventures: { data: null, error: null },
    });

    const result = await analyzeCrossVenturePatterns(db);

    expect(result.status).toBe('insufficient_data');
    expect(result.actual).toBe(0);
  });

  it('returns insufficient_data when fewer than 2 terminal ventures', async () => {
    // 5 ventures but only 1 is terminal (killed)
    const venturesOneKill = [
      { id: 'v1', name: 'V1', status: 'active', current_lifecycle_stage: 10, killed_at: null, created_at: '2025-01-01' },
      { id: 'v2', name: 'V2', status: 'active', current_lifecycle_stage: 8, killed_at: null, created_at: '2025-02-01' },
      { id: 'v3', name: 'V3', status: 'killed', current_lifecycle_stage: 3, killed_at: '2025-03-01', created_at: '2025-03-01' },
      { id: 'v4', name: 'V4', status: 'active', current_lifecycle_stage: 5, killed_at: null, created_at: '2025-04-01' },
      { id: 'v5', name: 'V5', status: 'active', current_lifecycle_stage: 7, killed_at: null, created_at: '2025-05-01' },
    ];

    const db = createMockDb({
      ventures: { data: venturesOneKill, error: null },
    });

    const result = await analyzeCrossVenturePatterns(db);

    expect(result.status).toBe('insufficient_data');
    expect(result.reason).toMatch(/terminal/);
  });

  it('throws on database error', async () => {
    const db = createMockDb({
      ventures: { data: null, error: { message: 'connection failed' } },
    });

    await expect(analyzeCrossVenturePatterns(db)).rejects.toThrow('connection failed');
  });

  it('produces complete report with sufficient data', async () => {
    const db = createMockDb({
      ventures: { data: VENTURES_DATA, error: null },
      chairman_decisions: [
        // First call (or query): kill decisions with 'or' filter
        { data: [{ venture_id: 'v2', lifecycle_stage: 5 }, { venture_id: 'v4', lifecycle_stage: 3 }], error: null },
        // Second call: only kill decisions
        { data: [{ venture_id: 'v2', lifecycle_stage: 5 }, { venture_id: 'v4', lifecycle_stage: 3 }], error: null },
        // Third call: proceed decisions for success patterns
        { data: [{ venture_id: 'v1', lifecycle_stage: 5, decision: 'proceed', health_score: 'green' }], error: null },
      ],
      lifecycle_stage_config: {
        data: [
          { stage_number: 3, stage_name: 'Market Validation' },
          { stage_number: 5, stage_name: 'Profitability Forecast' },
        ],
        error: null,
      },
      assumption_sets: { data: [], error: null },
      venture_artifacts: { data: [], error: null },
    });

    const result = await analyzeCrossVenturePatterns(db);

    expect(result.status).toBe('complete');
    expect(result).toHaveProperty('killStageFrequency');
    expect(result).toHaveProperty('failedAssumptions');
    expect(result).toHaveProperty('successPatterns');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata.ventureCount).toBe(6);
    expect(result.metadata.generatedAt).toBeDefined();
    expect(result.metadata.moduleVersion).toBeDefined();
  });

  it('produces deterministic output for same data', async () => {
    const makeDb = () =>
      createMockDb({
        ventures: { data: VENTURES_DATA, error: null },
        chairman_decisions: [
          { data: [{ venture_id: 'v2', lifecycle_stage: 5 }], error: null },
          { data: [{ venture_id: 'v2', lifecycle_stage: 5 }], error: null },
          { data: [], error: null },
        ],
        lifecycle_stage_config: {
          data: [{ stage_number: 5, stage_name: 'Profitability Forecast' }],
          error: null,
        },
        assumption_sets: { data: [], error: null },
        venture_artifacts: { data: [], error: null },
      });

    const result1 = await analyzeCrossVenturePatterns(makeDb());
    const result2 = await analyzeCrossVenturePatterns(makeDb());

    // Remove timestamps for comparison
    const normalize = (r) => ({ ...r, metadata: { ...r.metadata, generatedAt: 'FIXED' } });
    expect(normalize(result1)).toEqual(normalize(result2));
  });
});

describe('analyzeKillStageFrequency', () => {
  it('returns empty array when no kill decisions', async () => {
    const db = createMockDb({
      chairman_decisions: [
        { data: [], error: null },
        { data: [], error: null },
      ],
    });

    const result = await analyzeKillStageFrequency(db, VENTURE_IDS);
    expect(result).toEqual([]);
  });

  it('ranks stages by kill count descending', async () => {
    const db = createMockDb({
      chairman_decisions: [
        // First call: or query for kill decisions/recommendations
        {
          data: [
            { venture_id: 'v1', lifecycle_stage: 3 },
            { venture_id: 'v2', lifecycle_stage: 5 },
            { venture_id: 'v3', lifecycle_stage: 3 },
            { venture_id: 'v4', lifecycle_stage: 3 },
          ],
          error: null,
        },
        // Second call: actual kill decisions only
        {
          data: [
            { venture_id: 'v1', lifecycle_stage: 3 },
            { venture_id: 'v2', lifecycle_stage: 5 },
            { venture_id: 'v3', lifecycle_stage: 3 },
            { venture_id: 'v4', lifecycle_stage: 3 },
          ],
          error: null,
        },
      ],
      lifecycle_stage_config: {
        data: [
          { stage_number: 3, stage_name: 'Market Validation' },
          { stage_number: 5, stage_name: 'Profitability Forecast' },
        ],
        error: null,
      },
    });

    const result = await analyzeKillStageFrequency(db, VENTURE_IDS);

    expect(result.length).toBe(2);
    expect(result[0].stage).toBe(3);
    expect(result[0].killCount).toBe(3);
    expect(result[0].stageName).toBe('Market Validation');
    expect(result[1].stage).toBe(5);
    expect(result[1].killCount).toBe(1);
  });

  it('computes kill rates correctly', async () => {
    const ids = ['v1', 'v2', 'v3', 'v4']; // 4 ventures
    const db = createMockDb({
      chairman_decisions: [
        { data: [{ venture_id: 'v1', lifecycle_stage: 5 }], error: null },
        { data: [{ venture_id: 'v1', lifecycle_stage: 5 }], error: null },
      ],
      lifecycle_stage_config: {
        data: [{ stage_number: 5, stage_name: 'Profitability Forecast' }],
        error: null,
      },
    });

    const result = await analyzeKillStageFrequency(db, ids);

    expect(result[0].killRate).toBe(0.25); // 1/4
  });

  it('throws on database error', async () => {
    const db = createMockDb({
      chairman_decisions: { data: null, error: { message: 'query failed' } },
    });

    await expect(analyzeKillStageFrequency(db, VENTURE_IDS)).rejects.toThrow('query failed');
  });
});

describe('analyzeFailedAssumptions', () => {
  it('returns empty array when no assumption data', async () => {
    const db = createMockDb({
      assumption_sets: { data: [], error: null },
    });

    const result = await analyzeFailedAssumptions(db, VENTURE_IDS);
    expect(result).toEqual([]);
  });

  it('identifies low-confidence assumptions as failures', async () => {
    const db = createMockDb({
      assumption_sets: {
        data: [
          {
            venture_id: 'v1',
            status: 'validated',
            market_assumptions: {
              tam_size: { value: '10B', confidence: 0.3, source: 'estimate' },
              growth_rate: { value: '20%', confidence: 0.8, source: 'report' },
            },
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: null,
            calibration_report: null,
          },
          {
            venture_id: 'v2',
            status: 'validated',
            market_assumptions: {
              tam_size: { value: '5B', confidence: 0.2, source: 'guess' },
            },
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: null,
            calibration_report: null,
          },
        ],
        error: null,
      },
    });

    const result = await analyzeFailedAssumptions(db, VENTURE_IDS);

    // tam_size appears in 2 ventures with low confidence (<0.5)
    const tamPattern = result.find((p) => p.pattern === 'tam_size');
    expect(tamPattern).toBeDefined();
    expect(tamPattern.affectedVentures).toEqual(['v1', 'v2']);
    expect(tamPattern.frequency).toBe(2);

    // growth_rate should NOT appear (confidence 0.8 >= 0.5)
    const growthPattern = result.find((p) => p.pattern === 'growth_rate');
    expect(growthPattern).toBeUndefined();
  });

  it('identifies invalidated assumption sets', async () => {
    const db = createMockDb({
      assumption_sets: {
        data: [
          {
            venture_id: 'v1',
            status: 'invalidated',
            market_assumptions: {
              market_fit: { value: 'yes', confidence: 0.9, source: 'survey' },
            },
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: null,
            calibration_report: null,
          },
        ],
        error: null,
      },
    });

    const result = await analyzeFailedAssumptions(db, VENTURE_IDS);

    // Even high-confidence items are failures if the set is invalidated
    const pattern = result.find((p) => p.pattern === 'market_fit');
    expect(pattern).toBeDefined();
    expect(pattern.category).toBe('market');
  });

  it('captures calibration error patterns', async () => {
    const db = createMockDb({
      assumption_sets: {
        data: [
          {
            venture_id: 'v1',
            status: 'validated',
            market_assumptions: {},
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: null,
            calibration_report: { error_direction: 'optimistic', error_magnitude: 0.7 },
          },
          {
            venture_id: 'v2',
            status: 'validated',
            market_assumptions: {},
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: null,
            calibration_report: { error_direction: 'optimistic', error_magnitude: 0.6 },
          },
        ],
        error: null,
      },
    });

    const result = await analyzeFailedAssumptions(db, VENTURE_IDS);

    const optimisticPattern = result.find((p) => p.pattern === 'optimistic');
    expect(optimisticPattern).toBeDefined();
    expect(optimisticPattern.category).toBe('calibration');
    expect(optimisticPattern.frequency).toBe(2);
    expect(optimisticPattern.confidence).toBe(0.65); // avg of 0.7 and 0.6
  });

  it('sorts by frequency descending', async () => {
    const db = createMockDb({
      assumption_sets: {
        data: [
          {
            venture_id: 'v1',
            status: 'invalidated',
            market_assumptions: { a: { value: 1, confidence: 0.1 } },
            competitor_assumptions: { b: { value: 2, confidence: 0.1 } },
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: null,
            calibration_report: null,
          },
          {
            venture_id: 'v2',
            status: 'invalidated',
            market_assumptions: { a: { value: 1, confidence: 0.2 } },
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: null,
            calibration_report: null,
          },
          {
            venture_id: 'v3',
            status: 'invalidated',
            market_assumptions: { a: { value: 1, confidence: 0.3 } },
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: null,
            calibration_report: null,
          },
        ],
        error: null,
      },
    });

    const result = await analyzeFailedAssumptions(db, VENTURE_IDS);

    // 'a' appears in 3 ventures, 'b' in 1
    expect(result[0].pattern).toBe('a');
    expect(result[0].frequency).toBe(3);
  });

  it('throws on database error', async () => {
    const db = createMockDb({
      assumption_sets: { data: null, error: { message: 'assumptions query failed' } },
    });

    await expect(analyzeFailedAssumptions(db, VENTURE_IDS)).rejects.toThrow('assumptions query failed');
  });
});

describe('analyzeSuccessPatterns', () => {
  const SUCCESSFUL_VENTURES = [
    { id: 'v1', current_lifecycle_stage: 20, status: 'active' },
    { id: 'v3', current_lifecycle_stage: 25, status: 'archived' },
  ];

  const ALL_VENTURES = [
    ...SUCCESSFUL_VENTURES,
    { id: 'v2', current_lifecycle_stage: 5, status: 'killed' },
    { id: 'v4', current_lifecycle_stage: 3, status: 'killed' },
    { id: 'v5', current_lifecycle_stage: 15, status: 'active' },
  ];

  it('returns empty array when no successful ventures', async () => {
    const lowStageVentures = [
      { id: 'v1', current_lifecycle_stage: 5, status: 'killed' },
      { id: 'v2', current_lifecycle_stage: 3, status: 'killed' },
    ];

    const db = createMockDb({
      venture_artifacts: { data: [], error: null },
      chairman_decisions: { data: [], error: null },
    });

    const result = await analyzeSuccessPatterns(db, ['v1', 'v2'], lowStageVentures);
    expect(result).toEqual([]);
  });

  it('identifies common artifact types in successful ventures', async () => {
    const db = createMockDb({
      venture_artifacts: {
        data: [
          { venture_id: 'v1', artifact_type: 'business_model_canvas', quality_score: 85 },
          { venture_id: 'v3', artifact_type: 'business_model_canvas', quality_score: 90 },
          { venture_id: 'v1', artifact_type: 'competitive_analysis', quality_score: 80 },
          { venture_id: 'v3', artifact_type: 'competitive_analysis', quality_score: 75 },
        ],
        error: null,
      },
      chairman_decisions: { data: [], error: null },
    });

    const result = await analyzeSuccessPatterns(db, VENTURE_IDS, ALL_VENTURES);

    expect(result.length).toBeGreaterThanOrEqual(2);
    const bmcPattern = result.find((p) => p.pattern.includes('business_model_canvas'));
    expect(bmcPattern).toBeDefined();
    expect(bmcPattern.type).toBe('artifact');
    expect(bmcPattern.confidence).toBe(0.67); // 2/3 successful ventures (v1@20, v3@25, v5@15+active)
  });

  it('filters out artifacts appearing in fewer than 2 ventures', async () => {
    const db = createMockDb({
      venture_artifacts: {
        data: [
          { venture_id: 'v1', artifact_type: 'rare_artifact', quality_score: 95 },
        ],
        error: null,
      },
      chairman_decisions: { data: [], error: null },
    });

    const result = await analyzeSuccessPatterns(db, VENTURE_IDS, ALL_VENTURES);

    const rarePattern = result.find((p) => p.pattern.includes('rare_artifact'));
    expect(rarePattern).toBeUndefined();
  });

  it('sorts by confidence descending', async () => {
    const db = createMockDb({
      venture_artifacts: {
        data: [
          { venture_id: 'v1', artifact_type: 'a_type', quality_score: 80 },
          { venture_id: 'v3', artifact_type: 'a_type', quality_score: 80 },
          { venture_id: 'v1', artifact_type: 'b_type', quality_score: 80 },
          { venture_id: 'v3', artifact_type: 'b_type', quality_score: 80 },
        ],
        error: null,
      },
      chairman_decisions: { data: [], error: null },
    });

    const result = await analyzeSuccessPatterns(db, VENTURE_IDS, ALL_VENTURES);

    // Both have same confidence, should be sorted alphabetically
    if (result.length >= 2) {
      expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
    }
  });
});

describe('output format', () => {
  it('complete report has correct top-level keys', async () => {
    const db = createMockDb({
      ventures: { data: VENTURES_DATA, error: null },
      chairman_decisions: [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      lifecycle_stage_config: { data: [], error: null },
      assumption_sets: { data: [], error: null },
      venture_artifacts: { data: [], error: null },
    });

    const result = await analyzeCrossVenturePatterns(db);

    expect(result.status).toBe('complete');
    expect(Array.isArray(result.killStageFrequency)).toBe(true);
    expect(Array.isArray(result.failedAssumptions)).toBe(true);
    expect(Array.isArray(result.successPatterns)).toBe(true);
    expect(result.metadata).toHaveProperty('generatedAt');
    expect(result.metadata).toHaveProperty('ventureCount');
    expect(typeof result.metadata.generatedAt).toBe('string');
    expect(typeof result.metadata.ventureCount).toBe('number');
  });

  it('metadata includes moduleVersion and options', async () => {
    const db = createMockDb({
      ventures: { data: VENTURES_DATA, error: null },
      chairman_decisions: [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      lifecycle_stage_config: { data: [], error: null },
      assumption_sets: { data: [], error: null },
      venture_artifacts: { data: [], error: null },
    });

    const result = await analyzeCrossVenturePatterns(db, { dateFrom: '2025-01-01' });

    expect(result.metadata.moduleVersion).toBeDefined();
    expect(result.metadata.options.dateFrom).toBe('2025-01-01');
    expect(result.metadata.options.dateTo).toBeNull();
  });

  it('insufficient_data report has correct structure', async () => {
    const db = createMockDb({
      ventures: { data: VENTURES_DATA.slice(0, 2), error: null },
    });

    const result = await analyzeCrossVenturePatterns(db);

    expect(result).toEqual({
      status: 'insufficient_data',
      minimum: MIN_VENTURES,
      actual: 2,
    });
  });
});
