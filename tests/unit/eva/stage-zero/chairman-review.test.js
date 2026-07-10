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
import { createOrReusePendingDecision } from '../../../../lib/eva/chairman-decision-watcher.js';

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
    // .limit()/.maybeSingle() are used by the companies lookup + queue reads; without them the
    // shared mock chain threw "limit is not a function" at chairman-review.js:102 (pre-existing).
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: 'v-1', name: 'TestVenture' },
      error: null,
    }),
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

// SD-LEO-INFRA-STAGE-OPPORTUNITY-INTAKE-001 (F4): mock that distinguishes the venture
// INSERT chain (.insert().select().single()) from the idempotency LOOKUP chain
// (.select().eq().in().order().limit().maybeSingle()) so the 23505 guard can be exercised.
function makeGuardSupabase({ insertError = null, existingVenture = null, onSelect = () => {} } = {}) {
  const venturesTable = {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: insertError ? null : { id: 'v-new', name: 'TestVenture' },
          error: insertError,
        }),
      })),
    })),
    select: vi.fn(() => {
      onSelect();
      return {
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingVenture, error: null }),
              })),
            })),
          })),
        })),
      };
    }),
  };
  return {
    from: vi.fn((table) =>
      table === 'ventures'
        ? venturesTable
        : {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          },
    ),
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

    // ── SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001 acceptance canaries ──

    // Canary 1: READY NEVER SELF-APPROVES.
    it('ready path inserts a PAUSED venture awaiting the chairman — never active', async () => {
      const mockSupabase = createMockSupabase();
      await persistVentureBrief(
        { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
        { supabase: mockSupabase, logger: silentLogger },
      );
      const insertArg = mockSupabase._mockChain.insert.mock.calls[0][0];
      expect(insertArg.status).toBe('paused');
      expect(insertArg.metadata.stage_zero.awaiting_chairman_decision).toBe(true);
      expect(insertArg.metadata.stage_zero.pause_provenance.minted_by).toBe('stage0-chairman-gate');
      expect(insertArg.current_lifecycle_stage).toBe(1);
    });

    it('ready path mints the REAL pending gate at stage 0 and returns its id', async () => {
      const mockSupabase = createMockSupabase();
      const result = await persistVentureBrief(
        { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
        { supabase: mockSupabase, logger: silentLogger },
      );
      expect(createOrReusePendingDecision).toHaveBeenCalledTimes(1);
      const mintArg = createOrReusePendingDecision.mock.calls[0][0];
      expect(mintArg.stageNumber).toBe(0);
      expect(mintArg.decisionType).toBe('stage_gate');
      expect(mintArg.forceDecisionCreation).toBe(true);
      expect(mintArg.briefData.provenance.minted_by).toBe('stage0-machine');
      expect(result.stage_zero_decision_id).toBe('decision-1');
    });

    it('never writes chairman_decisions directly — no machine-forged approval row exists', async () => {
      const mockSupabase = createMockSupabase();
      await persistVentureBrief(
        { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
        { supabase: mockSupabase, logger: silentLogger },
      );
      // The ONLY decision writer on this path is the mocked real gate helper; chairman-review
      // itself must not touch the table (the forged status='approved' insert is deleted).
      expect(mockSupabase.from).not.toHaveBeenCalledWith('chairman_decisions');
    });

    it('the machine-forged approval insert is gone from the source (grep pin)', async () => {
      const fs = await import('node:fs');
      const url = await import('node:url');
      const path = await import('node:path');
      const here = path.dirname(url.fileURLToPath(import.meta.url));
      const src = fs.readFileSync(
        path.resolve(here, '../../../../lib/eva/stage-zero/chairman-review.js'),
        'utf8',
      );
      expect(src).not.toContain('Venture meets readiness criteria');
      expect(src).not.toContain("status: 'active'");
    });

    // Fail-closed mint (flaw H5 class closed): a ready venture without a pending decision must
    // never exist — mint failure compensates the venture to cancelled and rethrows.
    it('mint failure throws fail-closed and compensates the venture to cancelled', async () => {
      createOrReusePendingDecision.mockRejectedValueOnce(new Error('mint exploded'));
      const mockSupabase = createMockSupabase();
      await expect(
        persistVentureBrief(
          { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
          { supabase: mockSupabase, logger: silentLogger },
        ),
      ).rejects.toThrow(/fail-closed.*mint exploded/);
      const updateArg = mockSupabase._mockChain.update.mock.calls.find(
        (c) => c[0]?.status === 'cancelled',
      );
      expect(updateArg).toBeDefined();
      expect(updateArg[0].metadata.stage_zero.cancellation_reason).toBe('stage0_decision_mint_failed');
    });

    // Idempotent re-run wedge closure: original run died between venture insert and mint —
    // the 23505 path re-mints (reuse-safe) for a paused-awaiting existing venture.
    it('23505 re-run with a paused-awaiting venture re-mints the pending gate', async () => {
      const existingVenture = {
        id: 'v-existing',
        name: 'TestVenture',
        status: 'paused',
        metadata: { stage_zero: { awaiting_chairman_decision: true } },
      };
      const mockSupabase = makeGuardSupabase({
        insertError: { code: '23505', message: 'duplicate key value violates unique constraint "idx_ventures_unique_active_name"' },
        existingVenture,
      });
      const result = await persistVentureBrief(
        { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
        { supabase: mockSupabase, logger: silentLogger, company_id: 'co-1' },
      );
      expect(createOrReusePendingDecision).toHaveBeenCalledTimes(1);
      expect(result.stage_zero_decision_id).toBe('decision-1');
      expect(result.id).toBe('v-existing');
    });

    // SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-A (FR-3): a reseeded brief stamps provenance
    // and stays at a fresh S0; a normal brief stamps null.
    it('stamps seeded_from_venture_id + fresh S0 for a reseeded brief', async () => {
      const mockSupabase = createMockSupabase();
      await persistVentureBrief(
        { decision: 'ready', brief: { ...validBrief, origin_type: 'seeded_from_venture', seeded_from_venture_id: 'venture-1' }, validation: { valid: true, errors: [] } },
        { supabase: mockSupabase, logger: silentLogger },
      );
      const insertArg = mockSupabase._mockChain.insert.mock.calls[0][0];
      expect(insertArg.seeded_from_venture_id).toBe('venture-1');
      expect(insertArg.current_lifecycle_stage).toBe(1);
    });

    it('stamps seeded_from_venture_id = null for a normal (non-reseeded) brief', async () => {
      const mockSupabase = createMockSupabase();
      await persistVentureBrief(
        { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
        { supabase: mockSupabase, logger: silentLogger },
      );
      const insertArg = mockSupabase._mockChain.insert.mock.calls[0][0];
      expect(insertArg.seeded_from_venture_id).toBeNull();
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

      await persistVentureBrief(reviewResult, {
        supabase: mockSupabase,
        logger: silentLogger,
      });

      expect(parkVenture).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TestVenture' }),
        expect.objectContaining({ reason: expect.any(String) }),
        expect.objectContaining({ supabase: mockSupabase }),
      );
    });

    // SD-LEO-INFRA-STAGE-OPPORTUNITY-INTAKE-001 (F4): idempotency guard for stale-claim re-runs.
    it('returns the existing active venture on a 23505 unique-name collision (idempotent re-run)', async () => {
      const existingVenture = { id: 'v-existing', name: 'TestVenture', status: 'active' };
      const mockSupabase = makeGuardSupabase({
        insertError: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "idx_ventures_unique_active_name"',
        },
        existingVenture,
      });

      const result = await persistVentureBrief(
        { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
        { supabase: mockSupabase, logger: silentLogger, company_id: 'co-1' },
      );

      // Re-run completes idempotently with the venture created by the original run — NOT a throw,
      // so the queue processor records the request 'completed' instead of 'failed'.
      expect(result).toEqual(existingVenture);
    });

    it('still throws on a 23505 collision when no existing active venture is found', async () => {
      const mockSupabase = makeGuardSupabase({
        insertError: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "idx_ventures_unique_active_name"',
        },
        existingVenture: null,
      });

      await expect(
        persistVentureBrief(
          { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
          { supabase: mockSupabase, logger: silentLogger, company_id: 'co-1' },
        ),
      ).rejects.toThrow('Failed to create venture');
    });

    it('throws on a non-unique-violation DB error without attempting the idempotent lookup', async () => {
      const onSelect = vi.fn();
      const mockSupabase = makeGuardSupabase({
        insertError: { code: '23503', message: 'foreign key violation' },
        onSelect,
      });

      await expect(
        persistVentureBrief(
          { decision: 'ready', brief: validBrief, validation: { valid: true, errors: [] } },
          { supabase: mockSupabase, logger: silentLogger, company_id: 'co-1' },
        ),
      ).rejects.toThrow('Failed to create venture');
      // A non-23505 error must skip the idempotent lookup entirely.
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
