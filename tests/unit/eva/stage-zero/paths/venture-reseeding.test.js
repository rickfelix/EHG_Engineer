/**
 * Unit Tests: Stage 0 Venture Reseeding path (clean-clone seed-and-re-run)
 * SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-A (FR-2/FR-4/FR-5)
 */
import { describe, test, expect, vi } from 'vitest';
import { executeVentureReseeding } from '../../../../../lib/eva/stage-zero/paths/venture-reseeding.js';
import { validatePathOutput } from '../../../../../lib/eva/stage-zero/interfaces.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

/** Mock supabase whose ventures.select().eq().single() resolves to `source`. */
function mockSupabase(source, { error = null } = {}) {
  const tables = [];
  const api = (table) => {
    tables.push(table);
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      single: vi.fn(async () => ({ data: source, error })),
    };
    return chain;
  };
  return { from: vi.fn(api), _tables: tables };
}

const SOURCE = {
  id: 'venture-1',
  name: 'Acme',
  problem_statement: 'SMBs cannot reconcile invoices fast',
  solution: 'AI reconciliation agent',
  target_market: 'SMB finance teams',
  archetype: 'b2b_saas',
  raw_chairman_intent: 'reconcile faster',
  moat_strategy: 'data network effects',
  metadata: { stage_zero: { solution: 'AI reconciliation agent' } },
};

describe('executeVentureReseeding (FR-2)', () => {
  test('produces a valid PathOutput seeded from the source venture durable thesis', async () => {
    const supabase = mockSupabase(SOURCE);
    const out = await executeVentureReseeding({ source_venture_id: 'venture-1' }, { supabase, logger: silentLogger });

    expect(validatePathOutput(out).valid).toBe(true);
    expect(out.origin_type).toBe('seeded_from_venture');
    expect(out.suggested_problem).toBe(SOURCE.problem_statement);
    expect(out.suggested_solution).toBe(SOURCE.solution);
    expect(out.target_market).toBe(SOURCE.target_market);
    expect(out.suggested_name).toMatch(/clean clone/i);
    // provenance carried for the persist stamping (FR-3)
    expect(out.metadata.seeded_from_venture_id).toBe('venture-1');
    expect(out.raw_material.source_venture_id).toBe('venture-1');
    expect(out.raw_material.durable_thesis.archetype).toBe('b2b_saas');
  });

  test('reads only the ventures thesis row — never stage_N / venture_stage_work', async () => {
    const supabase = mockSupabase(SOURCE);
    await executeVentureReseeding({ source_venture_id: 'venture-1' }, { supabase, logger: silentLogger });
    // exactly one table touched, and it is `ventures` (no stage-row tables)
    expect(supabase._tables).toEqual(['ventures']);
  });

  test('falls back to metadata.stage_zero.solution when the column is empty', async () => {
    const supabase = mockSupabase({ ...SOURCE, solution: '' });
    const out = await executeVentureReseeding({ source_venture_id: 'venture-1' }, { supabase, logger: silentLogger });
    expect(out.suggested_solution).toBe('AI reconciliation agent');
  });
});

describe('fail-loud guards (FR-4)', () => {
  test('throws when source_venture_id is missing', async () => {
    await expect(executeVentureReseeding({}, { supabase: mockSupabase(SOURCE), logger: silentLogger }))
      .rejects.toThrow(/source_venture_id is required/);
  });

  test('throws when supabase is absent', async () => {
    await expect(executeVentureReseeding({ source_venture_id: 'v' }, { logger: silentLogger }))
      .rejects.toThrow(/supabase client is required/);
  });

  test('throws when the source venture is not found', async () => {
    const supabase = mockSupabase(null, { error: { message: 'no rows' } });
    await expect(executeVentureReseeding({ source_venture_id: 'ghost' }, { supabase, logger: silentLogger }))
      .rejects.toThrow(/source venture not found/);
  });

  test('throws when the source venture has no durable thesis', async () => {
    const supabase = mockSupabase({ ...SOURCE, problem_statement: '', solution: '', metadata: {} });
    await expect(executeVentureReseeding({ source_venture_id: 'venture-1' }, { supabase, logger: silentLogger }))
      .rejects.toThrow(/no durable thesis/);
  });
});
