/**
 * Unit Tests: Chairman Review
 * SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 *
 * Test Coverage:
 * - conductChairmanReview: requires supabase
 * - conductChairmanReview: returns approval for ready maturity
 * - conductChairmanReview: returns rejection/park for blocked maturity
 * - persistVentureBrief: inserts venture correctly when approved
 * - persistVentureBrief: returns venture ID
 * - persistVentureBrief: handles DB errors on insert
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock transitive deps
vi.mock('../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

// Mock interfaces
vi.mock('../../../../lib/eva/stage-zero/interfaces.js', () => ({
  validateVentureBrief: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

// Mock venture-nursery
vi.mock('../../../../lib/eva/stage-zero/venture-nursery.js', () => ({
  parkVenture: vi.fn().mockResolvedValue({ id: 'nursery-1', name: 'TestVenture' }),
}));

// Mock chairman-decision-watcher
vi.mock('../../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn().mockResolvedValue({ id: 'decision-1' }),
}));

import { conductChairmanReview, persistVentureBrief } from '../../../../lib/eva/stage-zero/chairman-review.js';
import { parkVenture } from '../../../../lib/eva/stage-zero/venture-nursery.js';

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function createMockSupabase(overrides = {}) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: 'v-1', name: 'TestVenture' },
      error: null,
    }),
    ...overrides,
  };
  return {
    from: vi.fn(() => ({ ...mockChain })),
    _mockChain: mockChain,
  };
}

const validBrief = {
  name: 'TestVenture',
  problem_statement: 'Test problem',
  solution: 'Test solution',
  target_market: 'SMBs',
  origin_type: 'discovery',
  raw_chairman_intent: 'Test problem',
  maturity: 'ready',
  metadata: {},
};

describe('ChairmanReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('conductChairmanReview', () => {
    it('should throw when supabase is not provided', async () => {
      await expect(
        conductChairmanReview(validBrief, { logger: silentLogger }),
      ).rejects.toThrow('supabase client is required');
    });

    it('should return ready decision for ready maturity', async () => {
      const mockSupabase = createMockSupabase();

      const result = await conductChairmanReview(
        { ...validBrief, maturity: 'ready' },
        { supabase: mockSupabase, logger: silentLogger },
      );

      expect(result.decision).toBe('ready');
      expect(result.brief).toBeDefined();
      expect(result.brief.raw_chairman_intent).toBe('Test problem');
      expect(result.validation).toBeDefined();
      expect(result.reviewed_at).toBeDefined();
    });

    it('should return park decision for blocked maturity', async () => {
      const mockSupabase = createMockSupabase();

      const result = await conductChairmanReview(
        { ...validBrief, maturity: 'blocked' },
        { supabase: mockSupabase, logger: silentLogger },
      );

      expect(result.decision).toBe('park');
      expect(result.brief.maturity).toBe('blocked');
    });
  });

  describe('persistVentureBrief', () => {
    it('should throw when supabase is not provided', async () => {
      await expect(
        persistVentureBrief(
          { decision: 'ready', brief: validBrief },
          { logger: silentLogger },
        ),
      ).rejects.toThrow('supabase client is required');
    });

    it('should insert venture and return record when approved', async () => {
      const mockSupabase = createMockSupabase();

      const reviewResult = {
        decision: 'ready',
        brief: validBrief,
        validation: { valid: true, errors: [] },
      };

      const result = await persistVentureBrief(reviewResult, {
        supabase: mockSupabase,
        logger: silentLogger,
      });

      expect(result.id).toBe('v-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('ventures');
    });

    it('should throw on DB error when inserting venture', async () => {
      const mockSupabase = createMockSupabase({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Unique constraint violation' },
        }),
      });

      const reviewResult = {
        decision: 'ready',
        brief: validBrief,
        validation: { valid: true, errors: [] },
      };

      await expect(
        persistVentureBrief(reviewResult, {
          supabase: mockSupabase,
          logger: silentLogger,
        }),
      ).rejects.toThrow('Failed to create venture');
    });

    it('should park venture in nursery when decision is not ready', async () => {
      const mockSupabase = createMockSupabase();

      const reviewResult = {
        decision: 'park',
        brief: { ...validBrief, maturity: 'blocked', metadata: {} },
        validation: { valid: true, errors: [] },
      };

      const result = await persistVentureBrief(reviewResult, {
        supabase: mockSupabase,
        logger: silentLogger,
      });

      expect(parkVenture).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TestVenture' }),
        expect.objectContaining({ reason: expect.any(String) }),
        expect.objectContaining({ supabase: mockSupabase }),
      );
    });
  });
});
