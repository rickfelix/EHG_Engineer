/**
 * Tests for chairman decision stage allowlist
 * SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-B
 *
 * Verifies that createOrReusePendingDecision skips non-gate/non-review stages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/shared-services.js', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(code, msg, source) {
      super(msg);
      this.code = code;
      this.source = source;
    }
  },
}));

describe('Chairman decision stage allowlist (SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-B)', () => {
  let createOrReusePendingDecision;

  beforeEach(async () => {
    const mod = await import('../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision = mod.createOrReusePendingDecision;
  });

  const mockSupabase = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  };

  const logger = { log: vi.fn(), warn: vi.fn() };

  // Gate stages should create decisions
  for (const stage of [3, 5, 10, 13, 17, 18, 19, 20, 23, 24, 25]) {
    it(`allows decision creation for gate stage ${stage}`, async () => {
      const result = await createOrReusePendingDecision({
        ventureId: 'v1',
        stageNumber: stage,
        supabase: mockSupabase,
        logger,
      });
      expect(result.skipped).not.toBe(true);
    });
  }

  // Review stages should create decisions
  for (const stage of [7, 8, 9, 11]) {
    it(`allows decision creation for review stage ${stage}`, async () => {
      const result = await createOrReusePendingDecision({
        ventureId: 'v1',
        stageNumber: stage,
        supabase: mockSupabase,
        logger,
      });
      expect(result.skipped).not.toBe(true);
    });
  }

  // Non-gate/non-review stages should be skipped
  for (const stage of [0, 1, 2, 4, 6, 12, 14, 15, 16]) {
    it(`skips decision creation for non-gate stage ${stage}`, async () => {
      const result = await createOrReusePendingDecision({
        ventureId: 'v1',
        stageNumber: stage,
        supabase: mockSupabase,
        logger,
      });
      expect(result.skipped).toBe(true);
      expect(result.id).toBeNull();
    });
  }
});
