/**
 * Unit Tests: Venture Nursery
 *
 * Test Coverage:
 * - parkVenture: requires supabase/reason, inserts correctly, calculates review date
 * - reactivateVenture: updates status, records metadata
 * - checkNurseryTriggers: empty when no triggers, returns met conditions
 * - getNurseryHealth: returns counts
 * - recordSynthesisFeedback: inserts record
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import {
  parkVenture,
  reactivateVenture,
  recordSynthesisFeedback,
  checkNurseryTriggers,
  getNurseryHealth,
} from '../../../../lib/eva/stage-zero/venture-nursery.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

const sampleBrief = {
  name: 'Test Venture',
  problem_statement: 'A problem',
  solution: 'A solution',
  target_market: 'SMBs',
  origin_type: 'discovery',
  raw_chairman_intent: 'Make money',
  maturity: 'seed',
  metadata: { synthesis: { cross_reference: {} } },
};

function createMockSupabase(overrides = {}) {
  const insertedData = { id: 'nursery-1', ...sampleBrief, status: 'parked' };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(overrides.single || { data: insertedData, error: null }),
    order: vi.fn().mockResolvedValue(overrides.list || { data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  // insert().select().single() chain
  chain.insert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(overrides.insertResult || { data: insertedData, error: null }),
    }),
  });
  // update().eq().select().single() chain
  chain.update.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(overrides.updateResult || { data: { ...insertedData, status: 'reactivated' }, error: null }),
      }),
    }),
  });
  return { from: vi.fn(() => chain), _chain: chain };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parkVenture', () => {
  test('throws on missing supabase', async () => {
    await expect(parkVenture(sampleBrief, { reason: 'test' }, {}))
      .rejects.toThrow('supabase client is required');
  });

  test('throws on missing reason', async () => {
    await expect(parkVenture(sampleBrief, {}, { supabase: createMockSupabase(), logger: silentLogger }))
      .rejects.toThrow('reason is required');
  });

  test('throws on null params', async () => {
    await expect(parkVenture(sampleBrief, null, { supabase: createMockSupabase(), logger: silentLogger }))
      .rejects.toThrow('reason is required');
  });

  test('inserts into venture_nursery with correct data', async () => {
    const supabase = createMockSupabase();
    const result = await parkVenture(
      sampleBrief,
      { reason: 'Market not ready', triggerConditions: ['market_shift'], reviewSchedule: '30d' },
      { supabase, logger: silentLogger }
    );

    expect(supabase.from).toHaveBeenCalledWith('venture_nursery');
    expect(result).toBeDefined();
    expect(result.id).toBe('nursery-1');
  });

  test('calculates review date based on schedule', async () => {
    const supabase = createMockSupabase();
    // We verify it doesn't throw with different schedule formats
    await parkVenture(sampleBrief, { reason: 'test', reviewSchedule: '90d' }, { supabase, logger: silentLogger });
    await parkVenture(sampleBrief, { reason: 'test', reviewSchedule: '3m' }, { supabase, logger: silentLogger });
    // both should succeed without error
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});

describe('reactivateVenture', () => {
  test('throws on missing supabase', async () => {
    await expect(reactivateVenture('id-1', { reason: 'test' }, {}))
      .rejects.toThrow('supabase client is required');
  });

  test('throws on missing nurseryId', async () => {
    await expect(reactivateVenture(null, { reason: 'test' }, { supabase: createMockSupabase(), logger: silentLogger }))
      .rejects.toThrow('nurseryId is required');
  });

  test('throws on missing reason', async () => {
    await expect(reactivateVenture('id-1', {}, { supabase: createMockSupabase(), logger: silentLogger }))
      .rejects.toThrow('reason is required');
  });

  test('throws when venture already reactivated', async () => {
    const supabase = createMockSupabase({
      single: { data: { id: 'id-1', name: 'Test', status: 'reactivated', metadata: {} }, error: null },
    });
    await expect(reactivateVenture('id-1', { reason: 'test' }, { supabase, logger: silentLogger }))
      .rejects.toThrow('Venture already reactivated');
  });

  test('updates status and returns pathOutput for re-synthesis', async () => {
    const supabase = createMockSupabase({
      single: { data: { id: 'id-1', name: 'Revived', status: 'parked', problem_statement: 'Prob', solution: 'Sol', target_market: 'Market', origin_type: 'discovery', metadata: {} }, error: null },
    });
    const result = await reactivateVenture('id-1', { reason: 'Market shifted' }, { supabase, logger: silentLogger });

    expect(result.entry).toBeDefined();
    expect(result.pathOutput).toBeDefined();
    expect(result.pathOutput.suggested_name).toBe('Revived');
    expect(result.pathOutput.metadata.path).toBe('nursery_reeval');
    expect(result.pathOutput.metadata.reactivation_reason).toBe('Market shifted');
  });
});

describe('recordSynthesisFeedback', () => {
  test('throws on missing supabase', async () => {
    await expect(recordSynthesisFeedback({ ventureId: 'v1', outcome: 'approved' }, {}))
      .rejects.toThrow('supabase client is required');
  });

  test('throws on missing ventureId', async () => {
    await expect(recordSynthesisFeedback({ outcome: 'approved' }, { supabase: createMockSupabase(), logger: silentLogger }))
      .rejects.toThrow('ventureId is required');
  });

  test('throws on invalid outcome', async () => {
    await expect(recordSynthesisFeedback(
      { ventureId: 'v1', outcome: 'invalid' },
      { supabase: createMockSupabase(), logger: silentLogger }
    )).rejects.toThrow('Invalid outcome: invalid');
  });

  test('inserts feedback record into venture_synthesis_feedback', async () => {
    const supabase = createMockSupabase({
      insertResult: { data: { id: 'fb-1', venture_id: 'v1', outcome: 'approved' }, error: null },
    });
    const result = await recordSynthesisFeedback(
      { ventureId: 'v1', outcome: 'approved', lessons: ['lesson1'] },
      { supabase, logger: silentLogger }
    );
    expect(supabase.from).toHaveBeenCalledWith('venture_synthesis_feedback');
    expect(result).toBeDefined();
  });
});

describe('checkNurseryTriggers', () => {
  test('throws on missing supabase', async () => {
    await expect(checkNurseryTriggers({}))
      .rejects.toThrow('supabase client is required');
  });

  test('returns empty array when no parked items', async () => {
    const supabase = createMockSupabase({ list: { data: [], error: null } });
    const result = await checkNurseryTriggers({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  test('returns items whose review date has passed', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days from now
    const supabase = createMockSupabase({
      list: {
        data: [
          { id: 'n1', name: 'Ready', status: 'parked', metadata: { next_review_date: pastDate, trigger_conditions: ['market_shift'] } },
          { id: 'n2', name: 'Not Ready', status: 'parked', metadata: { next_review_date: futureDate } },
        ],
        error: null,
      },
    });
    const result = await checkNurseryTriggers({ supabase, logger: silentLogger });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
    expect(result[0].reason).toBe('scheduled_review');
    expect(result[0].trigger_conditions).toEqual(['market_shift']);
  });
});

describe('getNurseryHealth', () => {
  test('throws on missing supabase', async () => {
    await expect(getNurseryHealth({}))
      .rejects.toThrow('supabase client is required');
  });

  test('returns zero counts when no items', async () => {
    const chain = {
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase = { from: vi.fn(() => chain) };
    const result = await getNurseryHealth({ supabase });
    expect(result).toEqual({ total: 0, parked: 0, reactivated: 0, stale: 0, items: [] });
  });

  test('returns correct counts for mixed statuses', async () => {
    const now = new Date();
    const recent = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
    const old = new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString(); // 200 days ago (stale)
    const chain = {
      select: vi.fn().mockResolvedValue({
        data: [
          { id: '1', name: 'A', status: 'parked', maturity: 'seed', metadata: {}, created_at: recent },
          { id: '2', name: 'B', status: 'reactivated', maturity: 'seed', metadata: {}, created_at: recent },
          { id: '3', name: 'C', status: 'parked', maturity: 'seed', metadata: { trigger_conditions: ['x'] }, created_at: old },
        ],
        error: null,
      }),
    };
    const supabase = { from: vi.fn(() => chain) };
    const result = await getNurseryHealth({ supabase });
    expect(result.total).toBe(3);
    expect(result.parked).toBe(2);
    expect(result.reactivated).toBe(1);
    expect(result.stale).toBe(1);
    expect(result.items).toHaveLength(3);
    expect(result.items[2].has_triggers).toBe(true);
  });
});
