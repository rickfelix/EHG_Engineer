/**
 * Integration tests for advanceStage exit-gate wiring.
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A / PA-2
 *
 * Covers FR-A5 (advance blocked when repo_url IS NULL) and FR-A6 (advance
 * succeeds when repo_url + deployment_url populated). Tests use mocked Supabase
 * to verify the integration between advanceStage, checkExitGates, and
 * verifyVentureResourceUrlsPopulated.
 *
 * Why "integration" not "unit": the test exercises the full call chain
 * advanceStage -> checkExitGates -> resolveVerifier -> verifyVentureResourceUrlsPopulated
 * -> mocked supabase, asserting the cross-module contract holds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VENTURE_ID = '11111111-2222-3333-4444-555555555555';

/**
 * Build a Supabase mock that responds to:
 *   - venture_stages: returns { metadata: { gates: { exit: [...] } } }
 *   - venture_artifacts: returns { id: 'art' } if buildArtifactPresent
 *   - ventures: returns ventureRow if both repo_url + deployment_url populated, else null
 *   - rpc('fn_advance_venture_stage'): returns { success: true } unless rpcError set
 */
function buildSupabaseMock({
  exitGates = ['Application deployed', 'GitHub repo URL stored in venture_resources'],
  buildArtifactPresent = true,
  ventureRow = { repo_url: 'https://github.com/foo/bar.git', deployment_url: 'https://app.example.replit.app' },
  rpcResult = { success: true, advanced: true },
  rpcError = null,
} = {}) {
  const buildEqChain = (finalResult) => {
    const chain = {
      eq: vi.fn(() => chain),
      not: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue(finalResult),
    };
    return chain;
  };

  return {
    from: vi.fn((table) => {
      if (table === 'venture_stages') {
        return {
          select: vi.fn(() => buildEqChain({
            data: { metadata: { gates: { exit: exitGates } } },
            error: null,
          })),
        };
      }
      if (table === 'venture_artifacts') {
        return {
          select: vi.fn(() => buildEqChain({
            data: buildArtifactPresent ? { id: 'art-1' } : null,
            error: null,
          })),
        };
      }
      if (table === 'ventures') {
        return {
          select: vi.fn(() => buildEqChain({
            data: ventureRow,
            error: null,
          })),
        };
      }
      return { select: vi.fn() };
    }),
    rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: rpcError }),
  };
}

async function importAdvanceStageWithFlag(value) {
  vi.resetModules();
  if (value === undefined) {
    delete process.env.LEO_S19_EXIT_GATE_ENFORCER;
  } else {
    process.env.LEO_S19_EXIT_GATE_ENFORCER = value;
  }
  return await import('../../../lib/eva/artifact-persistence-service.js');
}

describe('advanceStage exit-gate wiring (PA-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FR-A5: advance blocked when repo_url IS NULL', () => {
    it('throws when ventures row lacks repo_url + deployment_url', async () => {
      const { advanceStage } = await importAdvanceStageWithFlag('on');
      const supabase = buildSupabaseMock({ ventureRow: null });

      await expect(advanceStage(supabase, {
        ventureId: VENTURE_ID,
        fromStage: 19,
        toStage: 20,
        handoffData: {},
      })).rejects.toThrow(/blocked by exit-gate enforcer/);

      // RPC must NOT have been called when the gate blocked
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('error message includes the failed gate name and reason', async () => {
      const { advanceStage } = await importAdvanceStageWithFlag('on');
      const supabase = buildSupabaseMock({ ventureRow: null });

      try {
        await advanceStage(supabase, {
          ventureId: VENTURE_ID,
          fromStage: 19,
          toStage: 20,
          handoffData: {},
        });
        throw new Error('Expected throw');
      } catch (err) {
        expect(err.message).toMatch(/GitHub repo URL stored/);
        expect(err.message).toMatch(/ventures\.repo_url and\/or ventures\.deployment_url not populated/);
        expect(err.message).toMatch(/Venture: 11111111/);
      }
    });

    it('throws when build_mvp_build artifact is missing (alternate gate failure)', async () => {
      const { advanceStage } = await importAdvanceStageWithFlag('on');
      const supabase = buildSupabaseMock({ buildArtifactPresent: false });

      await expect(advanceStage(supabase, {
        ventureId: VENTURE_ID,
        fromStage: 19,
        toStage: 20,
        handoffData: {},
      })).rejects.toThrow(/Application deployed/);

      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe('FR-A6: advance succeeds when repo_url + deployment_url populated (regression)', () => {
    it('proceeds to RPC when all gates satisfied', async () => {
      const { advanceStage } = await importAdvanceStageWithFlag('on');
      const supabase = buildSupabaseMock({
        ventureRow: {
          repo_url: 'https://github.com/rickfelix/commitcraft-ai.git',
          deployment_url: 'https://commitcraft-ai.replit.app',
        },
      });

      const result = await advanceStage(supabase, {
        ventureId: VENTURE_ID,
        fromStage: 19,
        toStage: 20,
        handoffData: { handoff_type: 'stage_advance' },
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ success: true, advanced: true });
      expect(supabase.rpc).toHaveBeenCalledWith('fn_advance_venture_stage', expect.objectContaining({
        p_venture_id: VENTURE_ID,
        p_from_stage: 19,
        p_to_stage: 20,
      }));
    });

    it('passes idempotencyKey through when provided', async () => {
      const { advanceStage } = await importAdvanceStageWithFlag('on');
      const supabase = buildSupabaseMock();

      await advanceStage(supabase, {
        ventureId: VENTURE_ID,
        fromStage: 19,
        toStage: 20,
        handoffData: {},
        idempotencyKey: 'idemp-123',
      });

      expect(supabase.rpc).toHaveBeenCalledWith('fn_advance_venture_stage', expect.objectContaining({
        p_idempotency_key: 'idemp-123',
      }));
    });
  });

  describe('flag OFF: gate enforcement skipped (legacy behavior)', () => {
    it('proceeds to RPC even with NULL repo_url when flag is off', async () => {
      const { advanceStage } = await importAdvanceStageWithFlag('off');
      const supabase = buildSupabaseMock({ ventureRow: null });

      const result = await advanceStage(supabase, {
        ventureId: VENTURE_ID,
        fromStage: 19,
        toStage: 20,
        handoffData: {},
      });

      expect(result.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalled();
    });
  });

  describe('regression: existing successful stage transitions unchanged', () => {
    it('no exit-gates declared for stage means no block (default-allow)', async () => {
      const { advanceStage } = await importAdvanceStageWithFlag('on');
      const supabase = buildSupabaseMock({ exitGates: [] });

      const result = await advanceStage(supabase, {
        ventureId: VENTURE_ID,
        fromStage: 5,
        toStage: 6,
        handoffData: {},
      });

      expect(result.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalled();
    });
  });
});
