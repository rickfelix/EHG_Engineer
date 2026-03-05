/**
 * Unit tests for Real Data Adapter
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-C: FR-001
 *
 * Tests the centralized adapter that queries venture_stage_work
 * and strategic_directives_v2 for real build loop data.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  fetchBuildProgress,
  fetchSiblingSDStatuses,
  fetchQAData,
  fetchIntegrationData,
  isRealDataAvailable,
  mapSdStatusToTaskStatus,
} from '../../../../lib/eva/adapters/real-data-adapter.js';

function createMockSupabase(returnValue) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(returnValue),
            order: vi.fn().mockResolvedValue(returnValue),
          }),
          maybeSingle: vi.fn().mockResolvedValue(returnValue),
          order: vi.fn().mockResolvedValue(returnValue),
        }),
        maybeSingle: vi.fn().mockResolvedValue(returnValue),
      }),
    }),
  };
}

describe('real-data-adapter.js', () => {
  describe('fetchBuildProgress', () => {
    it('should return data when advisory_data exists with tasks', async () => {
      const supabase = createMockSupabase({
        data: {
          advisory_data: {
            tasks: [{ name: 'T1', status: 'done' }],
            total_tasks: 1,
          },
          stage_status: 'in_progress',
          health_score: 'green',
        },
        error: null,
      });

      const result = await fetchBuildProgress(supabase, 'venture-123');

      expect(result.dataAvailable).toBe(true);
      expect(result.data.tasks).toHaveLength(1);
      expect(result.data.stage_status).toBe('in_progress');
    });

    it('should return waitingFor when no data exists', async () => {
      const supabase = createMockSupabase({ data: null, error: null });

      const result = await fetchBuildProgress(supabase, 'venture-123');

      expect(result.dataAvailable).toBe(false);
      expect(result.waitingFor).toBeDefined();
      expect(result.waitingFor[0]).toContain('stage 19');
    });

    it('should return waitingFor when advisory_data has no tasks', async () => {
      const supabase = createMockSupabase({
        data: { advisory_data: { tasks: [] }, stage_status: 'pending' },
        error: null,
      });

      const result = await fetchBuildProgress(supabase, 'venture-123');

      expect(result.dataAvailable).toBe(false);
    });

    it('should throw on query error', async () => {
      const supabase = createMockSupabase({
        data: null,
        error: { message: 'connection failed' },
      });

      await expect(fetchBuildProgress(supabase, 'venture-123'))
        .rejects.toThrow('Failed to query stage 19');
    });
  });

  describe('fetchQAData', () => {
    it('should return data when stage 20 advisory_data exists', async () => {
      const supabase = createMockSupabase({
        data: {
          advisory_data: { overall_pass_rate: 95, quality_gate_passed: true },
          stage_status: 'completed',
        },
        error: null,
      });

      const result = await fetchQAData(supabase, 'venture-123');

      expect(result.dataAvailable).toBe(true);
      expect(result.data.overall_pass_rate).toBe(95);
    });

    it('should return waitingFor when no stage 20 data', async () => {
      const supabase = createMockSupabase({ data: null, error: null });

      const result = await fetchQAData(supabase, 'venture-123');

      expect(result.dataAvailable).toBe(false);
      expect(result.waitingFor[0]).toContain('stage 20');
    });
  });

  describe('fetchIntegrationData', () => {
    it('should return data when stage 21 advisory_data exists', async () => {
      const supabase = createMockSupabase({
        data: {
          advisory_data: { integrations: [{ name: 'API', status: 'pass' }] },
          stage_status: 'completed',
        },
        error: null,
      });

      const result = await fetchIntegrationData(supabase, 'venture-123');

      expect(result.dataAvailable).toBe(true);
      expect(result.data.integrations).toHaveLength(1);
    });

    it('should return waitingFor when no stage 21 data', async () => {
      const supabase = createMockSupabase({ data: null, error: null });

      const result = await fetchIntegrationData(supabase, 'venture-123');

      expect(result.dataAvailable).toBe(false);
      expect(result.waitingFor[0]).toContain('stage 21');
    });
  });

  describe('mapSdStatusToTaskStatus', () => {
    it('should map completed to done', () => {
      expect(mapSdStatusToTaskStatus('completed')).toBe('done');
    });

    it('should map draft and lead_review to pending', () => {
      expect(mapSdStatusToTaskStatus('draft')).toBe('pending');
      expect(mapSdStatusToTaskStatus('lead_review')).toBe('pending');
    });

    it('should map active statuses to in_progress', () => {
      expect(mapSdStatusToTaskStatus('plan_active')).toBe('in_progress');
      expect(mapSdStatusToTaskStatus('exec_active')).toBe('in_progress');
      expect(mapSdStatusToTaskStatus('in_progress')).toBe('in_progress');
    });

    it('should map hold/cancelled to blocked', () => {
      expect(mapSdStatusToTaskStatus('on_hold')).toBe('blocked');
      expect(mapSdStatusToTaskStatus('cancelled')).toBe('blocked');
    });

    it('should default unknown statuses to pending', () => {
      expect(mapSdStatusToTaskStatus('unknown_status')).toBe('pending');
    });
  });

  describe('isRealDataAvailable', () => {
    it('should return true when data exists for stage 19', async () => {
      const supabase = createMockSupabase({
        data: {
          advisory_data: { tasks: [{ name: 'T1' }] },
          stage_status: 'completed',
          health_score: 'green',
        },
        error: null,
      });

      const result = await isRealDataAvailable(supabase, 'venture-123', 19);
      expect(result).toBe(true);
    });

    it('should return false for unsupported stage numbers', async () => {
      const supabase = createMockSupabase({ data: null, error: null });
      const result = await isRealDataAvailable(supabase, 'venture-123', 15);
      expect(result).toBe(false);
    });
  });
});
