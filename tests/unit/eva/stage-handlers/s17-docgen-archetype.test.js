/**
 * SD-LEO-FIX-RESOLVE-STAGE-ARCHETYPE-001 (FR-1): docGen() must call
 * generateArchetypesForAllScreens() exactly once, and a thrown error inside
 * it must be caught and logged, never propagating to fail docGen() or block
 * the S17 stage transition.
 *
 * The frozen-snapshot equivalence test (registry-equivalence.test.js) does
 * NOT exercise this call site: its s17_docgen_default_path scenario throws
 * inside generateDocs() (mock has no .like()) before execution ever reaches
 * the archetype call. This file provides the dedicated coverage the PRD
 * requires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateDocsMock = vi.fn().mockResolvedValue(undefined);
const generateArchetypesForAllScreensMock = vi.fn().mockResolvedValue([]);

vi.mock('../../../../lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js', () => ({
  generateDocs: (...args) => generateDocsMock(...args),
}));

vi.mock('../../../../lib/eva/stage-17/archetype-generator.js', () => ({
  generateArchetypesForAllScreens: (...args) => generateArchetypesForAllScreensMock(...args),
}));

const V = '00000000-0000-4000-8000-000000000001';

function makeCtx() {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { name: 'Test Venture' }, error: null }),
        }),
      }),
    }),
  };
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const ensureS17StrategySelected = vi.fn().mockResolvedValue(undefined);
  return { supabase, logger, ensureS17StrategySelected };
}

describe('SD-LEO-FIX-RESOLVE-STAGE-ARCHETYPE-001: s17.docGen() archetype call site', () => {
  beforeEach(() => {
    generateDocsMock.mockClear();
    generateArchetypesForAllScreensMock.mockClear();
    generateArchetypesForAllScreensMock.mockResolvedValue([]);
  });

  it('calls generateArchetypesForAllScreens() exactly once with the correct ventureId/supabase args', async () => {
    const { docGen } = await import('../../../../lib/eva/stage-handlers/s17.js');
    const ctx = makeCtx();

    await docGen(ctx, V);

    expect(generateArchetypesForAllScreensMock).toHaveBeenCalledTimes(1);
    expect(generateArchetypesForAllScreensMock).toHaveBeenCalledWith(V, ctx.supabase);
    expect(ctx.ensureS17StrategySelected).toHaveBeenCalledWith(V);
  });

  it('a thrown error inside generateArchetypesForAllScreens() is caught, logged, and does not propagate', async () => {
    generateArchetypesForAllScreensMock.mockRejectedValueOnce(new Error('archetype generation exploded'));
    const { docGen } = await import('../../../../lib/eva/stage-handlers/s17.js');
    const ctx = makeCtx();

    await expect(docGen(ctx, V)).resolves.toBeUndefined();

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('archetype generation failed (non-fatal): archetype generation exploded'),
    );
  });

  it('runs generateArchetypesForAllScreens() after the strategy gate (ordering)', async () => {
    const order = [];
    const ctx = makeCtx();
    ctx.ensureS17StrategySelected = vi.fn().mockImplementation(async () => { order.push('strategyGate'); });
    generateArchetypesForAllScreensMock.mockImplementation(async () => { order.push('archetypeGen'); return []; });

    const { docGen } = await import('../../../../lib/eva/stage-handlers/s17.js');
    await docGen(ctx, V);

    expect(order).toEqual(['strategyGate', 'archetypeGen']);
  });
});
