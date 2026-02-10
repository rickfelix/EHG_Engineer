/**
 * Chairman Override Tracker Tests
 *
 * Tests for override recording, component queries, and insight generation.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-H
 */

import { describe, it, expect } from 'vitest';
import {
  recordOverride,
  getOverridesByComponent,
  generateOverrideInsights,
} from '../../../../lib/eva/stage-zero/chairman-override-tracker.js';

const silentLogger = { warn: () => {}, log: () => {}, error: () => {} };

function mockSupabase(overrides = {}) {
  return {
    from: (table) => ({
      insert: (data) => ({
        select: () => ({
          single: () => Promise.resolve({
            data: overrides.insertError ? null : {
              id: 'override-1',
              venture_id: data.venture_id,
              component: data.component,
              system_score: data.system_score,
              override_score: data.override_score,
              reason: data.reason,
              outcome: data.outcome,
            },
            error: overrides.insertError ?? null,
          }),
        }),
      }),
      select: () => ({
        eq: (col, val) => ({
          order: () => Promise.resolve({
            data: overrides.componentData ?? [
              { id: 'o1', venture_id: 'v1', component: val, system_score: '60', override_score: '85', reason: 'Network effects', outcome: 'positive', outcome_notes: null, created_at: '2026-01-01' },
              { id: 'o2', venture_id: 'v2', component: val, system_score: '70', override_score: '90', reason: 'Market timing', outcome: 'negative', outcome_notes: null, created_at: '2026-01-02' },
            ],
            error: overrides.queryError ?? null,
          }),
        }),
        order: () => Promise.resolve({
          data: overrides.allData ?? [
            { component: 'moat_architecture', system_score: '60', override_score: '85', outcome: 'positive' },
            { component: 'moat_architecture', system_score: '55', override_score: '80', outcome: 'positive' },
            { component: 'moat_architecture', system_score: '70', override_score: '90', outcome: 'positive' },
            { component: 'moat_architecture', system_score: '65', override_score: '75', outcome: 'negative' },
            { component: 'virality', system_score: '40', override_score: '30', outcome: 'positive' },
          ],
          error: overrides.queryError ?? null,
        }),
      }),
    }),
  };
}

describe('chairman-override-tracker', () => {
  describe('recordOverride', () => {
    it('stores override with system and chairman scores', async () => {
      const result = await recordOverride(
        { supabase: mockSupabase(), logger: silentLogger },
        { ventureId: 'v1', component: 'moat_architecture', systemScore: 60, overrideScore: 85, reason: 'Network effects' }
      );

      expect(result).not.toBeNull();
      expect(result.component).toBe('moat_architecture');
      expect(result.system_score).toBe(60);
      expect(result.override_score).toBe(85);
      expect(result.reason).toBe('Network effects');
    });

    it('returns null when supabase is null', async () => {
      const result = await recordOverride(
        { supabase: null, logger: silentLogger },
        { ventureId: 'v1', component: 'moat', systemScore: 60, overrideScore: 85 }
      );
      expect(result).toBeNull();
    });

    it('returns null when required fields are missing', async () => {
      const result = await recordOverride(
        { supabase: mockSupabase(), logger: silentLogger },
        { ventureId: null, component: null, systemScore: 60, overrideScore: 85 }
      );
      expect(result).toBeNull();
    });

    it('returns null on insert error', async () => {
      const sb = mockSupabase({ insertError: { message: 'test error' } });
      const result = await recordOverride(
        { supabase: sb, logger: silentLogger },
        { ventureId: 'v1', component: 'moat_architecture', systemScore: 60, overrideScore: 85 }
      );
      expect(result).toBeNull();
    });

    it('sets outcome to pending by default', async () => {
      const result = await recordOverride(
        { supabase: mockSupabase(), logger: silentLogger },
        { ventureId: 'v1', component: 'virality', systemScore: 50, overrideScore: 70 }
      );
      expect(result.outcome).toBe('pending');
    });
  });

  describe('getOverridesByComponent', () => {
    it('returns overrides for a specific component', async () => {
      const result = await getOverridesByComponent(
        { supabase: mockSupabase(), logger: silentLogger },
        'moat_architecture'
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('system_score');
      expect(result[0]).toHaveProperty('override_score');
      expect(result[0]).toHaveProperty('reason');
    });

    it('returns empty array when supabase is null', async () => {
      const result = await getOverridesByComponent(
        { supabase: null, logger: silentLogger },
        'moat_architecture'
      );
      expect(result).toEqual([]);
    });

    it('returns empty array for null component', async () => {
      const result = await getOverridesByComponent(
        { supabase: mockSupabase(), logger: silentLogger },
        null
      );
      expect(result).toEqual([]);
    });

    it('returns empty array on query error', async () => {
      const sb = mockSupabase({ queryError: { message: 'test error' } });
      const result = await getOverridesByComponent(
        { supabase: sb, logger: silentLogger },
        'moat_architecture'
      );
      expect(result).toEqual([]);
    });
  });

  describe('generateOverrideInsights', () => {
    it('generates per-component success rates', async () => {
      const result = await generateOverrideInsights(
        { supabase: mockSupabase(), logger: silentLogger }
      );

      expect(result.total_overrides).toBe(5);
      expect(result.components).toHaveProperty('moat_architecture');
      expect(result.components.moat_architecture.count).toBe(4);
      expect(result.components.moat_architecture.success_rate).toBe(75); // 3/4
      expect(result.components.moat_architecture.direction).toBe('upward');
    });

    it('calculates average delta', async () => {
      const result = await generateOverrideInsights(
        { supabase: mockSupabase(), logger: silentLogger }
      );

      // moat: (85-60) + (80-55) + (90-70) + (75-65) = 25+25+20+10 = 80, avg = 20
      expect(result.components.moat_architecture.avg_delta).toBe(20);
    });

    it('detects downward override direction', async () => {
      const result = await generateOverrideInsights(
        { supabase: mockSupabase(), logger: silentLogger }
      );

      // virality: 30 - 40 = -10 avg_delta
      expect(result.components.virality.direction).toBe('downward');
    });

    it('returns empty insights when supabase is null', async () => {
      const result = await generateOverrideInsights(
        { supabase: null, logger: silentLogger }
      );
      expect(result).toEqual({ total_overrides: 0, components: {} });
    });

    it('returns empty insights on query error', async () => {
      const sb = mockSupabase({ queryError: { message: 'test error' } });
      const result = await generateOverrideInsights(
        { supabase: sb, logger: silentLogger }
      );
      expect(result).toEqual({ total_overrides: 0, components: {} });
    });

    it('returns empty insights when no overrides exist', async () => {
      const sb = mockSupabase({ allData: [] });
      const result = await generateOverrideInsights(
        { supabase: sb, logger: silentLogger }
      );
      expect(result).toEqual({ total_overrides: 0, components: {} });
    });

    it('handles null success_rate for unresolved overrides', async () => {
      const sb = mockSupabase({
        allData: [
          { component: 'build_cost', system_score: '50', override_score: '70', outcome: 'pending' },
        ],
      });
      const result = await generateOverrideInsights(
        { supabase: sb, logger: silentLogger }
      );

      expect(result.components.build_cost.count).toBe(1);
      expect(result.components.build_cost.resolved).toBe(0);
      expect(result.components.build_cost.success_rate).toBeNull();
    });
  });
});
