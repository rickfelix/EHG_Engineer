/**
 * Tests for Multi-Dimensional Experiment Extensions
 * SD-CLOSE-EXPERIMENT-FEEDBACK-LOOP-ORCH-001-B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('multi-dimensional experiments', () => {
  let createDimensionExperiment, getActiveExperimentForDimension;
  let checkEnrollmentConflict, transitionExperiment, EXPERIMENT_DIMENSIONS;
  let mockSupabase, deps;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../lib/eva/experiments/multi-dimensional.js');
    createDimensionExperiment = mod.createDimensionExperiment;
    getActiveExperimentForDimension = mod.getActiveExperimentForDimension;
    checkEnrollmentConflict = mod.checkEnrollmentConflict;
    transitionExperiment = mod.transitionExperiment;
    EXPERIMENT_DIMENSIONS = mod.EXPERIMENT_DIMENSIONS;

    mockSupabase = {
      from: vi.fn(),
    };
    deps = { supabase: mockSupabase, logger: { log: vi.fn(), warn: vi.fn() } };
  });

  // ─── createDimensionExperiment ──────────────────────────────────

  describe('createDimensionExperiment', () => {
    it('validates dimension is in allowed set', async () => {
      const result = await createDimensionExperiment(deps, {
        name: 'Test',
        hypothesis: 'H1',
        dimension: 'invalid_dimension',
        variants: [{ key: 'a' }, { key: 'b' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid dimension');
    });

    it('requires name and hypothesis', async () => {
      const result = await createDimensionExperiment(deps, {
        dimension: 'profile',
        variants: [{ key: 'a', prompt_name: 'p1' }, { key: 'b', prompt_name: 'p2' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('name and hypothesis are required');
    });

    it('requires at least 2 variants', async () => {
      const result = await createDimensionExperiment(deps, {
        name: 'Test',
        hypothesis: 'H1',
        dimension: 'profile',
        variants: [{ key: 'a', prompt_name: 'p1' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least 2 variants');
    });

    it('validates profile variants require prompt_name', async () => {
      const result = await createDimensionExperiment(deps, {
        name: 'Test',
        hypothesis: 'H1',
        dimension: 'profile',
        variants: [{ key: 'a', prompt_name: 'p1' }, { key: 'b' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('prompt_name');
    });

    it('validates canary_split variants require split_percentage', async () => {
      const result = await createDimensionExperiment(deps, {
        name: 'Test',
        hypothesis: 'H1',
        dimension: 'canary_split',
        variants: [{ key: 'a', split_percentage: 50 }, { key: 'b' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('split_percentage');
    });

    it('rejects canary_split out of range', async () => {
      const result = await createDimensionExperiment(deps, {
        name: 'Test',
        hypothesis: 'H1',
        dimension: 'canary_split',
        variants: [
          { key: 'a', split_percentage: 50 },
          { key: 'b', split_percentage: 150 },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('split_percentage');
    });

    it('validates gate_threshold variants require threshold_score', async () => {
      const result = await createDimensionExperiment(deps, {
        name: 'Test',
        hypothesis: 'H1',
        dimension: 'gate_threshold',
        variants: [{ key: 'a', threshold_score: 70 }, { key: 'b' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('threshold_score');
    });

    it('creates experiment with valid profile dimension', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-1', name: 'Test', status: 'draft' },
              error: null,
            }),
          }),
        }),
      });

      const result = await createDimensionExperiment(deps, {
        name: 'Profile Test',
        hypothesis: 'Prompt A performs better',
        dimension: 'profile',
        variants: [
          { key: 'champion', prompt_name: 'eval_v3' },
          { key: 'challenger', prompt_name: 'eval_v4' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('exp-1');
    });

    it('creates experiment with valid gate_threshold dimension', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-2', name: 'Threshold Test', status: 'draft' },
              error: null,
            }),
          }),
        }),
      });

      const result = await createDimensionExperiment(deps, {
        name: 'Threshold Test',
        hypothesis: 'Lower threshold improves throughput',
        dimension: 'gate_threshold',
        variants: [
          { key: 'strict', threshold_score: 80 },
          { key: 'relaxed', threshold_score: 60 },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('stores experiment_dimension in config', async () => {
      let capturedPayload;
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockImplementation(payload => {
          capturedPayload = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'exp-3', ...payload },
                error: null,
              }),
            }),
          };
        }),
      });

      await createDimensionExperiment(deps, {
        name: 'Test',
        hypothesis: 'H1',
        dimension: 'canary_split',
        variants: [
          { key: 'low', split_percentage: 10 },
          { key: 'high', split_percentage: 50 },
        ],
      });

      expect(capturedPayload.config.experiment_dimension).toBe('canary_split');
    });
  });

  // ─── checkEnrollmentConflict ────────────────────────────────────

  describe('checkEnrollmentConflict', () => {
    it('returns no conflict when venture has no assignments', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const result = await checkEnrollmentConflict(deps, {
        ventureId: 'v-1',
        dimension: 'profile',
      });

      expect(result.conflict).toBe(false);
    });

    it('detects same-dimension conflict', async () => {
      // First call: experiment_assignments lookup
      const assignmentsQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ experiment_id: 'exp-existing' }],
            error: null,
          }),
        }),
      };

      // Second call: experiments lookup
      const experimentsQuery = {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: 'exp-existing',
                config: { experiment_dimension: 'profile' },
                status: 'running',
              }],
              error: null,
            }),
          }),
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(assignmentsQuery)
        .mockReturnValueOnce(experimentsQuery);

      const result = await checkEnrollmentConflict(deps, {
        ventureId: 'v-1',
        dimension: 'profile',
      });

      expect(result.conflict).toBe(true);
      expect(result.existingExperimentId).toBe('exp-existing');
    });

    it('allows cross-dimension enrollment', async () => {
      const assignmentsQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ experiment_id: 'exp-profile' }],
            error: null,
          }),
        }),
      };

      const experimentsQuery = {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: 'exp-profile',
                config: { experiment_dimension: 'profile' },
                status: 'running',
              }],
              error: null,
            }),
          }),
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(assignmentsQuery)
        .mockReturnValueOnce(experimentsQuery);

      // Enrolling in gate_threshold while already in profile — should be allowed
      const result = await checkEnrollmentConflict(deps, {
        ventureId: 'v-1',
        dimension: 'gate_threshold',
      });

      expect(result.conflict).toBe(false);
    });
  });

  // ─── transitionExperiment ───────────────────────────────────────

  describe('transitionExperiment', () => {
    it('allows draft → running', async () => {
      const updateChain = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'exp-1', status: 'running', started_at: '2026-03-12T00:00:00Z' },
                error: null,
              }),
            }),
          }),
        }),
      };

      const selectChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-1', status: 'draft' },
              error: null,
            }),
          }),
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(updateChain);

      const result = await transitionExperiment(deps, 'exp-1', 'running');
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('running');
    });

    it('allows running → completed', async () => {
      const selectChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-1', status: 'running' },
              error: null,
            }),
          }),
        }),
      };

      const updateChain = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'exp-1', status: 'completed' },
                error: null,
              }),
            }),
          }),
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(updateChain);

      const result = await transitionExperiment(deps, 'exp-1', 'completed');
      expect(result.success).toBe(true);
    });

    it('allows completed → archived', async () => {
      const selectChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-1', status: 'completed' },
              error: null,
            }),
          }),
        }),
      };

      const updateChain = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'exp-1', status: 'archived' },
                error: null,
              }),
            }),
          }),
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(updateChain);

      const result = await transitionExperiment(deps, 'exp-1', 'archived');
      expect(result.success).toBe(true);
    });

    it('rejects draft → archived (invalid transition)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-1', status: 'draft' },
              error: null,
            }),
          }),
        }),
      });

      const result = await transitionExperiment(deps, 'exp-1', 'archived');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    it('rejects draft → completed (must go through running)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-1', status: 'draft' },
              error: null,
            }),
          }),
        }),
      });

      const result = await transitionExperiment(deps, 'exp-1', 'completed');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    it('rejects running → draft (no backward transitions)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-1', status: 'running' },
              error: null,
            }),
          }),
        }),
      });

      const result = await transitionExperiment(deps, 'exp-1', 'draft');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    it('returns error for non-existent experiment', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'not found' },
            }),
          }),
        }),
      });

      const result = await transitionExperiment(deps, 'nonexistent', 'running');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ─── EXPERIMENT_DIMENSIONS ──────────────────────────────────────

  describe('EXPERIMENT_DIMENSIONS', () => {
    it('contains exactly three dimensions', () => {
      expect(EXPERIMENT_DIMENSIONS.size).toBe(3);
      expect(EXPERIMENT_DIMENSIONS.has('profile')).toBe(true);
      expect(EXPERIMENT_DIMENSIONS.has('canary_split')).toBe(true);
      expect(EXPERIMENT_DIMENSIONS.has('gate_threshold')).toBe(true);
    });
  });
});
