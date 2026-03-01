import { describe, it, expect, vi } from 'vitest';
import {
  scoreDataContracts,
  getContractCoverageSummary,
  getDimensionInfo,
} from '../../../lib/eva/data-contract-scorer.js';

function mockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table] || { data: [], error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        insert: vi.fn(() => ({ data: null, error: null })),
        then: (resolve) => resolve(data),
      };
      return chain;
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function createTestContracts() {
  return new Map([
    [1, {
      consumes: [],
      produces: {
        description: { type: 'string', minLength: 50 },
        problemStatement: { type: 'string', minLength: 20 },
      },
    }],
    [2, {
      consumes: [{ stage: 1, fields: { description: { type: 'string' } } }],
      produces: {
        compositeScore: { type: 'integer', min: 0, max: 100 },
      },
    }],
    [3, {
      consumes: [{ stage: 1, fields: {} }],
      produces: {
        analysis: { type: 'string' },
      },
    }],
  ]);
}

describe('data-contract-scorer', () => {
  describe('scoreDataContracts', () => {
    it('returns error when no supabase', async () => {
      const result = await scoreDataContracts(null);
      expect(result.score.overallCoverage).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('scores contract completeness', async () => {
      const supabase = mockSupabase();
      const contracts = createTestContracts();

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      expect(result.score.totalStages).toBe(3);
      expect(result.score.totalFields).toBe(4);
      expect(result.score.completeFields).toBe(4);
      expect(result.score.overallCoverage).toBe(100);
      expect(result.stageDetails).toHaveLength(3);
    });

    it('detects missing type definitions', async () => {
      const supabase = mockSupabase();
      const contracts = new Map([
        [1, {
          consumes: [],
          produces: {
            goodField: { type: 'string', minLength: 10 },
            badField: {},
          },
        }],
      ]);

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].field).toBe('badField');
      expect(result.gaps[0].issue).toContain('Missing type');
    });

    it('detects string fields without minLength', async () => {
      const supabase = mockSupabase();
      const contracts = new Map([
        [1, {
          consumes: [],
          produces: {
            name: { type: 'string' }, // no minLength
          },
        }],
      ]);

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      expect(result.gaps.some((g) => g.issue.includes('minLength'))).toBe(true);
    });

    it('calculates stage coverage percent', async () => {
      const supabase = mockSupabase();
      const contracts = createTestContracts(); // 3 of 25 expected

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      expect(result.score.stageCoverage).toBe(12); // 3/25 = 12%
      expect(result.score.expectedStages).toBe(25);
    });

    it('checks YAML parity when provided', async () => {
      const supabase = mockSupabase();
      const contracts = createTestContracts();
      const yamlContracts = { 1: {}, 2: {} }; // Missing stage 3

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
        yamlContracts,
      });

      expect(result.score.yamlParity).toBeDefined();
      expect(result.score.yamlParity.matched).toBe(2);
      expect(result.score.yamlParity.mismatched).toBe(1);
      expect(result.score.yamlParity.parityPercent).toBe(67);
    });

    it('handles empty contracts map', async () => {
      const supabase = mockSupabase();
      const contracts = new Map();

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      expect(result.score.totalStages).toBe(0);
      expect(result.score.overallCoverage).toBe(0);
      expect(result.stageDetails).toHaveLength(0);
    });

    it('includes per-stage detail breakdown', async () => {
      const supabase = mockSupabase();
      const contracts = createTestContracts();

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      const stage1 = result.stageDetails.find((s) => s.stage === 1);
      expect(stage1.fieldCount).toBe(2);
      expect(stage1.consumesCount).toBe(0);
      expect(stage1.coveragePercent).toBe(100);

      const stage2 = result.stageDetails.find((s) => s.stage === 2);
      expect(stage2.consumesCount).toBe(1);
    });

    it('detects invalid spec (not an object)', async () => {
      const supabase = mockSupabase();
      const contracts = new Map([
        [1, { consumes: [], produces: { badField: 'not-an-object' } }],
      ]);

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].issue).toContain('Invalid spec');
    });
  });

  describe('getContractCoverageSummary', () => {
    it('returns error when no supabase', async () => {
      const { summary, error } = await getContractCoverageSummary(null);
      expect(summary.coveragePercent).toBe(0);
      expect(error).toBeDefined();
    });

    it('returns coverage summary', async () => {
      const supabase = mockSupabase();
      const contracts = createTestContracts();

      const { summary } = await getContractCoverageSummary(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      expect(summary.coveragePercent).toBe(100);
      expect(summary.totalStages).toBe(3);
      expect(summary.totalFields).toBe(4);
    });
  });

  describe('getDimensionInfo', () => {
    it('returns V05 info', () => {
      const info = getDimensionInfo();
      expect(info.dimension).toBe('V05');
      expect(info.name).toBe('Data Contracts');
      expect(info.expectedStages).toBe(25);
    });
  });
});
