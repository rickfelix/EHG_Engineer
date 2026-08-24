import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scoreDataContracts,
  getContractCoverageSummary,
  getDimensionInfo,
} from '../../../lib/eva/data-contract-scorer.js';
import { _resetCacheForTest } from '../../../lib/eva/stage-governance.js';

// SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-6): scoreDataContracts now reads stage-governance.js's
// 60s-TTL-cached SSOT -- reset between tests so one test's venture_stages fixture (or lack
// thereof) cannot leak into another via the module-level cache.
beforeEach(() => {
  _resetCacheForTest();
});

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

    // SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-6): expectedStages is now SSOT-derived (26 live rows),
    // not a pinned literal -- a prior pinned "25" here silently diverged from the live 26-row
    // venture_stages table and quarantined this file for 73 days.
    it('calculates stage coverage percent', async () => {
      const ventureStagesRows = Array.from({ length: 26 }, (_, i) => ({ stage_number: i + 1, gate_type: 'none', work_type: 'artifact_only', review_mode: 'auto', is_high_consequence: false }));
      const supabase = mockSupabase({ venture_stages: { data: ventureStagesRows, error: null } });
      const contracts = createTestContracts(); // 3 of 26 expected

      const result = await scoreDataContracts(supabase, {
        logger: silentLogger,
        stageContracts: contracts,
      });

      expect(result.score.stageCoverage).toBe(12); // round(3/26 * 100) = 12%
      expect(result.score.expectedStages).toBe(26);
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
    // getDimensionInfo() is synchronous with no supabase access (matches the sibling
    // compute-posture-scorer.js/cli-authority-tracker.js convention) -- it uses the documented
    // EXPECTED_STAGES fallback literal, not the SSOT-derived value scoreDataContracts() uses.
    it('returns V05 info', () => {
      const info = getDimensionInfo();
      expect(info.dimension).toBe('V05');
      expect(info.name).toBe('Data Contracts');
      expect(info.expectedStages).toBe(26);
    });
  });
});
