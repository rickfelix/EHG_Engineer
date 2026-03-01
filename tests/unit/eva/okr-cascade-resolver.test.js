import { describe, it, expect, vi } from 'vitest';
import {
  resolveCascade,
  getCoverageGaps,
  getCoverageSummary,
} from '../../../lib/eva/okr-cascade-resolver.js';

function mockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table] || { data: [], error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (resolve) => resolve(data),
      };
      return chain;
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('okr-cascade-resolver', () => {
  describe('resolveCascade', () => {
    it('returns empty when no supabase', async () => {
      const result = await resolveCascade(null);
      expect(result.cascade).toEqual([]);
      expect(result.totalObjectives).toBe(0);
      expect(result.error).toBe('No supabase client');
    });

    it('returns empty when no objectives', async () => {
      const supabase = mockSupabase({
        objectives: { data: [], error: null },
      });

      const result = await resolveCascade(supabase, { logger: silentLogger });
      expect(result.cascade).toEqual([]);
      expect(result.totalObjectives).toBe(0);
    });

    it('resolves single objective with no KRs', async () => {
      const supabase = mockSupabase({
        objectives: { data: [{ id: 'obj-1', title: 'Objective 1', status: 'active', vision_id: 'v-1' }], error: null },
        key_results: { data: [], error: null },
      });

      const result = await resolveCascade(supabase, { logger: silentLogger });
      expect(result.cascade).toHaveLength(1);
      expect(result.cascade[0].objectiveId).toBe('obj-1');
      expect(result.cascade[0].keyResults).toEqual([]);
      expect(result.cascade[0].coveragePercent).toBe(0);
      expect(result.cascade[0].depth).toBe(1);
    });

    it('resolves full cascade with alignments', async () => {
      const supabase = mockSupabase({
        objectives: {
          data: [{ id: 'obj-1', title: 'Autonomy', status: 'active', vision_id: 'v-1' }],
          error: null,
        },
        key_results: {
          data: [
            { id: 'kr-1', objective_id: 'obj-1', title: 'Gate pass >=85%', metric_name: 'gate_pass_rate', baseline_value: '50', current_value: '75', target_value: '85', status: 'at_risk' },
            { id: 'kr-2', objective_id: 'obj-1', title: 'Test coverage >=80%', metric_name: 'test_coverage', baseline_value: '40', current_value: '70', target_value: '80', status: 'on_track' },
          ],
          error: null,
        },
        sd_key_result_alignment: {
          data: [
            { id: 'a-1', sd_id: 'sd-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 },
            { id: 'a-2', sd_id: 'sd-2', key_result_id: 'kr-1', contribution_type: 'enabling', alignment_weight: 0.5 },
          ],
          error: null,
        },
      });

      const result = await resolveCascade(supabase, { logger: silentLogger });
      expect(result.totalObjectives).toBe(1);
      expect(result.totalKRs).toBe(2);
      expect(result.totalAlignments).toBe(2);

      const obj = result.cascade[0];
      expect(obj.keyResults).toHaveLength(2);
      expect(obj.keyResults[0].alignments).toHaveLength(2);
      expect(obj.keyResults[1].alignments).toHaveLength(0);
      // 1 of 2 KRs covered
      expect(obj.coveragePercent).toBe(50);
      expect(obj.depth).toBe(3); // Has alignments
    });

    it('calculates KR progress correctly', async () => {
      const supabase = mockSupabase({
        objectives: {
          data: [{ id: 'obj-1', title: 'Test', status: 'active', vision_id: 'v-1' }],
          error: null,
        },
        key_results: {
          data: [
            { id: 'kr-1', objective_id: 'obj-1', title: 'KR1', metric_name: 'm', baseline_value: '0', current_value: '50', target_value: '100', status: 'on_track' },
          ],
          error: null,
        },
        sd_key_result_alignment: { data: [], error: null },
      });

      const result = await resolveCascade(supabase, { logger: silentLogger });
      expect(result.cascade[0].keyResults[0].progressPercent).toBe(50);
    });

    it('handles query failures gracefully', async () => {
      const supabase = mockSupabase({
        objectives: { data: null, error: { message: 'Connection failed' } },
      });

      const result = await resolveCascade(supabase, { logger: silentLogger });
      expect(result.cascade).toEqual([]);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('getCoverageGaps', () => {
    it('returns empty when no supabase', async () => {
      const result = await getCoverageGaps(null);
      expect(result.gaps).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('detects objective with no KRs', async () => {
      const supabase = mockSupabase({
        objectives: { data: [{ id: 'obj-1', title: 'No KRs', status: 'active', vision_id: 'v-1' }], error: null },
        key_results: { data: [], error: null },
      });

      const result = await getCoverageGaps(supabase, { logger: silentLogger });
      expect(result.gaps).toHaveLength(1); // objective_no_krs (continue skips coverage check)
      expect(result.gaps[0].type).toBe('objective_no_krs');
      expect(result.gaps[0].severity).toBe('high');
    });

    it('detects KR with no alignments', async () => {
      const supabase = mockSupabase({
        objectives: { data: [{ id: 'obj-1', title: 'Obj', status: 'active', vision_id: 'v-1' }], error: null },
        key_results: { data: [{ id: 'kr-1', objective_id: 'obj-1', title: 'KR1', baseline_value: '0', current_value: '0', target_value: '100', status: 'not_started' }], error: null },
        sd_key_result_alignment: { data: [], error: null },
      });

      const result = await getCoverageGaps(supabase, { logger: silentLogger });
      const krGap = result.gaps.find((g) => g.type === 'kr_no_alignments');
      expect(krGap).toBeDefined();
      expect(krGap.severity).toBe('medium');
    });

    it('returns no gaps when fully covered', async () => {
      const supabase = mockSupabase({
        objectives: { data: [{ id: 'obj-1', title: 'Obj', status: 'active', vision_id: 'v-1' }], error: null },
        key_results: { data: [{ id: 'kr-1', objective_id: 'obj-1', title: 'KR1', baseline_value: '0', current_value: '50', target_value: '100', status: 'on_track' }], error: null },
        sd_key_result_alignment: { data: [{ id: 'a-1', sd_id: 'sd-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 }], error: null },
      });

      const result = await getCoverageGaps(supabase, { logger: silentLogger });
      expect(result.gaps).toEqual([]);
      expect(result.totalGaps).toBe(0);
    });
  });

  describe('getCoverageSummary', () => {
    it('returns zero-state when no supabase', async () => {
      const { summary, error } = await getCoverageSummary(null);
      expect(summary.overallCoverage).toBe(0);
      expect(summary.totalObjectives).toBe(0);
      expect(error).toBeDefined();
    });

    it('returns correct coverage for partial alignment', async () => {
      const supabase = mockSupabase({
        objectives: {
          data: [
            { id: 'obj-1', title: 'Covered', status: 'active', vision_id: 'v-1' },
            { id: 'obj-2', title: 'Uncovered', status: 'active', vision_id: 'v-1' },
          ],
          error: null,
        },
        key_results: {
          data: [
            { id: 'kr-1', objective_id: 'obj-1', title: 'KR1', baseline_value: '0', current_value: '50', target_value: '100', status: 'on_track' },
            { id: 'kr-2', objective_id: 'obj-2', title: 'KR2', baseline_value: '0', current_value: '0', target_value: '100', status: 'not_started' },
          ],
          error: null,
        },
        sd_key_result_alignment: {
          data: [{ id: 'a-1', sd_id: 'sd-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 }],
          error: null,
        },
      });

      const { summary } = await getCoverageSummary(supabase, { logger: silentLogger });
      expect(summary.overallCoverage).toBe(50); // 1 of 2 objectives covered
      expect(summary.objectivesCovered).toBe(1);
      expect(summary.totalObjectives).toBe(2);
      expect(summary.krsCovered).toBe(1);
      expect(summary.totalKRs).toBe(2);
      expect(summary.alignmentHealth).toBeGreaterThan(0);
      expect(summary.generatedAt).toBeDefined();
    });

    it('returns 100% for fully covered portfolio', async () => {
      const supabase = mockSupabase({
        objectives: {
          data: [{ id: 'obj-1', title: 'Full', status: 'active', vision_id: 'v-1' }],
          error: null,
        },
        key_results: {
          data: [{ id: 'kr-1', objective_id: 'obj-1', title: 'KR1', baseline_value: '0', current_value: '80', target_value: '100', status: 'on_track' }],
          error: null,
        },
        sd_key_result_alignment: {
          data: [{ id: 'a-1', sd_id: 'sd-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 }],
          error: null,
        },
      });

      const { summary } = await getCoverageSummary(supabase, { logger: silentLogger });
      expect(summary.overallCoverage).toBe(100);
      expect(summary.alignmentHealth).toBe(100); // Direct = max weight
    });
  });
});
