/**
 * Venture Nursery Tests
 *
 * Tests the venture nursery and feedback loop:
 * - parkVenture
 * - reactivateVenture
 * - recordSynthesisFeedback
 * - checkNurseryTriggers
 * - getNurseryHealth
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-I
 */

import { describe, test, expect, vi } from 'vitest';
import {
  parkVenture,
  reactivateVenture,
  recordSynthesisFeedback,
  checkNurseryTriggers,
  getNurseryHealth,
} from '../../lib/eva/stage-zero/venture-nursery.js';

// ── Test Data ──────────────────────────────────────────

const SAMPLE_BRIEF = {
  name: 'FutureTech AI',
  problem_statement: 'Market not ready for quantum computing tools',
  solution: 'Quantum-aware optimization platform',
  target_market: 'Enterprise R&D departments',
  origin_type: 'discovery',
  raw_chairman_intent: 'Quantum computing tools for enterprise',
  maturity: 'seed',
  metadata: {
    synthesis: {
      time_horizon: { position: 'park_and_build_later' },
      archetypes: { primary_archetype: 'first_principles_rebuilder' },
    },
  },
};

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ── Mock Supabase Factory ──────────────────────────────

function createMockSupabase(options = {}) {
  const {
    insertResult = { id: 'nursery-1', name: SAMPLE_BRIEF.name, status: 'parked' },
    insertError = null,
    selectResult = null,
    selectError = null,
    updateResult = null,
    updateError = null,
    listResult = [],
    listError = null,
  } = options;

  return {
    from: vi.fn().mockImplementation((_table) => {
      const chainable = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: insertError ? null : insertResult,
              error: insertError,
            }),
          }),
        }),
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockResolvedValue({
              data: selectError ? null : selectResult,
              error: selectError,
            }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: listError ? null : listResult,
                error: listError,
              }),
            }),
          })),
          order: vi.fn().mockReturnValue({
            data: listResult,
            error: listError,
            then: (fn) => Promise.resolve(fn({ data: listError ? null : listResult, error: listError })),
          }),
        })),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: updateError ? null : (updateResult || { ...selectResult, status: 'reactivated' }),
                error: updateError,
              }),
            }),
          }),
        }),
      };
      return chainable;
    }),
  };
}

// ── parkVenture Tests ──────────────────────────────

describe('Venture Nursery - parkVenture', () => {
  test('requires supabase', async () => {
    await expect(
      parkVenture(SAMPLE_BRIEF, { reason: 'Not ready' }, { logger: silentLogger })
    ).rejects.toThrow('supabase client is required');
  });

  test('requires reason', async () => {
    const supabase = createMockSupabase();
    await expect(
      parkVenture(SAMPLE_BRIEF, {}, { supabase, logger: silentLogger })
    ).rejects.toThrow('reason is required');
  });

  test('parks venture with trigger conditions', async () => {
    const supabase = createMockSupabase({
      insertResult: {
        id: 'nursery-1',
        name: 'FutureTech AI',
        status: 'parked',
        maturity: 'seed',
      },
    });

    const result = await parkVenture(
      SAMPLE_BRIEF,
      {
        reason: 'Market not ready',
        triggerConditions: ['Quantum hardware costs drop 50%', 'First enterprise quantum deployment'],
        reviewSchedule: '90d',
      },
      { supabase, logger: silentLogger }
    );

    expect(result.id).toBe('nursery-1');
    expect(result.status).toBe('parked');

    // Verify supabase was called correctly
    const insertCall = supabase.from.mock.results[0].value.insert;
    expect(insertCall).toHaveBeenCalledWith(expect.objectContaining({
      name: 'FutureTech AI',
      status: 'parked',
      maturity: 'seed',
      parked_reason: 'Market not ready',
    }));
  });

  test('handles database error', async () => {
    const supabase = createMockSupabase({
      insertError: { message: 'Connection refused' },
    });

    await expect(
      parkVenture(SAMPLE_BRIEF, { reason: 'Test' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('Failed to park venture: Connection refused');
  });

  test('defaults to 90d review schedule', async () => {
    const supabase = createMockSupabase();

    await parkVenture(
      SAMPLE_BRIEF,
      { reason: 'Too early' },
      { supabase, logger: silentLogger }
    );

    const insertCall = supabase.from.mock.results[0].value.insert;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg.metadata.review_schedule).toBe('90d');
    expect(insertArg.metadata.next_review_date).toBeDefined();
  });
});

// ── reactivateVenture Tests ──────────────────────────────

describe('Venture Nursery - reactivateVenture', () => {
  test('requires supabase', async () => {
    await expect(
      reactivateVenture('id-1', { reason: 'Market changed' }, { logger: silentLogger })
    ).rejects.toThrow('supabase client is required');
  });

  test('requires nurseryId', async () => {
    const supabase = createMockSupabase();
    await expect(
      reactivateVenture(null, { reason: 'Test' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('nurseryId is required');
  });

  test('requires reason', async () => {
    const supabase = createMockSupabase();
    await expect(
      reactivateVenture('id-1', {}, { supabase, logger: silentLogger })
    ).rejects.toThrow('reason is required');
  });

  test('reactivates parked venture with path output', async () => {
    const supabase = createMockSupabase({
      selectResult: {
        id: 'nursery-1',
        name: 'FutureTech AI',
        problem_statement: 'Quantum tools',
        solution: 'Platform',
        target_market: 'Enterprise',
        origin_type: 'discovery',
        status: 'parked',
        metadata: { synthesis_snapshot: { archetypes: { primary: 'rebuilder' } }, trigger_conditions: ['Cost drop'] },
      },
      updateResult: {
        id: 'nursery-1',
        name: 'FutureTech AI',
        status: 'reactivated',
        metadata: {},
      },
    });

    const result = await reactivateVenture(
      'nursery-1',
      { reason: 'Quantum costs dropped', updatedContext: { new_cost: 'half' } },
      { supabase, logger: silentLogger }
    );

    expect(result.entry.status).toBe('reactivated');
    expect(result.pathOutput.origin_type).toBe('discovery');
    expect(result.pathOutput.suggested_name).toBe('FutureTech AI');
    expect(result.pathOutput.metadata.path).toBe('nursery_reeval');
    expect(result.pathOutput.raw_material.nursery_id).toBe('nursery-1');
  });

  test('rejects already reactivated venture', async () => {
    const supabase = createMockSupabase({
      selectResult: {
        id: 'nursery-1',
        name: 'FutureTech AI',
        status: 'reactivated',
        metadata: {},
      },
    });

    await expect(
      reactivateVenture('nursery-1', { reason: 'Again' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('already reactivated');
  });

  test('handles missing nursery entry', async () => {
    const supabase = createMockSupabase({
      selectError: { message: 'Not found' },
    });

    await expect(
      reactivateVenture('missing-id', { reason: 'Test' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('Nursery entry not found');
  });
});

// ── recordSynthesisFeedback Tests ──────────────────────────────

describe('Venture Nursery - recordSynthesisFeedback', () => {
  test('requires supabase', async () => {
    await expect(
      recordSynthesisFeedback({ ventureId: 'v1', outcome: 'approved' }, { logger: silentLogger })
    ).rejects.toThrow('supabase client is required');
  });

  test('requires ventureId and outcome', async () => {
    const supabase = createMockSupabase();
    await expect(
      recordSynthesisFeedback({ outcome: 'approved' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('ventureId is required');

    await expect(
      recordSynthesisFeedback({ ventureId: 'v1' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('outcome is required');
  });

  test('validates outcome values', async () => {
    const supabase = createMockSupabase();
    await expect(
      recordSynthesisFeedback(
        { ventureId: 'v1', outcome: 'invalid' },
        { supabase, logger: silentLogger }
      )
    ).rejects.toThrow('Invalid outcome');
  });

  test('records approved feedback', async () => {
    const supabase = createMockSupabase({
      insertResult: { id: 'fb-1', venture_id: 'v1', outcome: 'approved' },
    });

    const result = await recordSynthesisFeedback(
      {
        ventureId: 'v1',
        outcome: 'approved',
        synthesisData: { moat_score: 82 },
        lessons: ['Data moat worked well'],
      },
      { supabase, logger: silentLogger }
    );

    expect(result.id).toBe('fb-1');
    expect(result.outcome).toBe('approved');
  });

  test('records parked feedback', async () => {
    const supabase = createMockSupabase({
      insertResult: { id: 'fb-2', venture_id: 'v1', outcome: 'parked' },
    });

    const result = await recordSynthesisFeedback(
      { ventureId: 'v1', outcome: 'parked' },
      { supabase, logger: silentLogger }
    );

    expect(result.outcome).toBe('parked');
  });
});

// ── checkNurseryTriggers Tests ──────────────────────────────

describe('Venture Nursery - checkNurseryTriggers', () => {
  test('requires supabase', async () => {
    await expect(checkNurseryTriggers({ logger: silentLogger })).rejects.toThrow('supabase client is required');
  });

  test('returns empty when no parked items', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    };

    const result = await checkNurseryTriggers({ supabase, logger: silentLogger });
    expect(result).toHaveLength(0);
  });

  test('identifies items past review date', async () => {
    const pastDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString();

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { id: 'n1', name: 'Ready', status: 'parked', metadata: { next_review_date: pastDate, trigger_conditions: ['Market shift'] } },
                { id: 'n2', name: 'NotReady', status: 'parked', metadata: { next_review_date: futureDate, trigger_conditions: [] } },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const result = await checkNurseryTriggers({ supabase, logger: silentLogger });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
    expect(result[0].reason).toBe('scheduled_review');
  });
});

// ── getNurseryHealth Tests ──────────────────────────────

describe('Venture Nursery - getNurseryHealth', () => {
  test('requires supabase', async () => {
    await expect(getNurseryHealth({})).rejects.toThrow('supabase client is required');
  });

  test('returns empty health for no items', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    const health = await getNurseryHealth({ supabase });
    expect(health.total).toBe(0);
    expect(health.parked).toBe(0);
    expect(health.stale).toBe(0);
  });

  test('calculates health metrics correctly', async () => {
    const now = new Date();
    const recentDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
    const oldDate = new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString(); // 200 days ago

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            { id: 'n1', name: 'Fresh', status: 'parked', maturity: 'seed', metadata: { trigger_conditions: ['X'] }, created_at: recentDate },
            { id: 'n2', name: 'Stale', status: 'parked', maturity: 'sprout', metadata: {}, created_at: oldDate },
            { id: 'n3', name: 'Active', status: 'reactivated', maturity: 'seed', metadata: {}, created_at: recentDate },
          ],
          error: null,
        }),
      }),
    };

    const health = await getNurseryHealth({ supabase });
    expect(health.total).toBe(3);
    expect(health.parked).toBe(2);
    expect(health.reactivated).toBe(1);
    expect(health.stale).toBe(1); // n2 is >180 days old
    expect(health.items).toHaveLength(3);
    expect(health.items[0].has_triggers).toBe(true);
    expect(health.items[1].has_triggers).toBe(false);
  });
});
