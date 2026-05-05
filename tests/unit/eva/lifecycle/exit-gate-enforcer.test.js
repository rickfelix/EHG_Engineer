/**
 * Unit tests for lib/eva/lifecycle/exit-gate-enforcer.
 *
 * SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-2 / FR-5
 *
 * Covers:
 *   - allow when both gates satisfied
 *   - block when build_mvp_build artifact missing
 *   - block when venture_resources.repo_url is null
 *   - block when venture_resources.deployment_url is null
 *   - flag OFF skips enforcement (legacy behavior)
 *   - empty gates.exit array → allow
 *   - missing verifier for prose gate string → skip with WARN, allow
 *   - lifecycle_stage_config read failure → block with structured reason
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to control process.env.LEO_S19_EXIT_GATE_ENFORCER per test, but the
// enforcer reads it at module-load. Use vi.resetModules + dynamic import.
const VENTURE_ID = '11111111-2222-3333-4444-555555555555';

function buildSupabaseMock({
  stageConfig = { exit: ['Application deployed', 'GitHub repo URL stored in venture_resources'] },
  buildArtifactPresent = true,
  resourceRow = { repo_url: 'https://github.com/foo/bar', deployment_url: 'https://app.example.replit.app' },
  configError = null,
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
      if (table === 'lifecycle_stage_config') {
        return {
          select: vi.fn(() => buildEqChain({
            data: configError ? null : { metadata: { gates: stageConfig } },
            error: configError,
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
      // SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A PA-2: verifier now queries
      // ventures (not venture_resources — those columns never existed live).
      if (table === 'ventures') {
        return {
          select: vi.fn(() => buildEqChain({
            data: resourceRow,
            error: null,
          })),
        };
      }
      return { select: vi.fn() };
    }),
  };
}

async function importEnforcerWithFlag(value) {
  vi.resetModules();
  if (value === undefined) {
    delete process.env.LEO_S19_EXIT_GATE_ENFORCER;
  } else {
    process.env.LEO_S19_EXIT_GATE_ENFORCER = value;
  }
  return await import('../../../../lib/eva/lifecycle/exit-gate-enforcer.js');
}

describe('exit-gate-enforcer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('flag enforcement (TR-3)', () => {
    it('default flag (unset) is treated as ON / enforced', async () => {
      const { getEnforcementFlag } = await importEnforcerWithFlag(undefined);
      const flag = getEnforcementFlag();
      expect(flag.enforced).toBe(true);
      expect(flag.value).toBe('on');
    });

    it('flag=off short-circuits enforcement and returns allowed=true with flag_enforced=false', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('off');
      const supabase = buildSupabaseMock();
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(true);
      expect(result.flag_enforced).toBe(false);
      expect(result.gates_checked).toEqual([]);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('flag=on enforces and reports flag_enforced=true', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock();
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.flag_enforced).toBe(true);
    });
  });

  describe('S19 happy path (AC-FR2-1: both gates passed)', () => {
    it('allows advance when build_mvp_build present AND venture_resources URLs populated', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock();
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(true);
      expect(result.blocked_by).toEqual([]);
      expect(result.gates_checked).toEqual([
        'Application deployed',
        'GitHub repo URL stored in venture_resources',
      ]);
      expect(result.stage_number).toBe(19);
    });
  });

  describe('S19 blocking cases (AC-FR2-1)', () => {
    it('blocks when build_mvp_build artifact missing', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({ buildArtifactPresent: false });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(false);
      expect(result.blocked_by).toHaveLength(1);
      expect(result.blocked_by[0]).toMatch(/Application deployed/);
      expect(result.blocked_by[0]).toMatch(/build_mvp_build/);
    });

    it('blocks when venture_resources row absent (repo_url + deployment_url unpopulated)', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      // Simulate the .not().not() filter returning no row when either column is null.
      const supabase = buildSupabaseMock({ resourceRow: null });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(false);
      expect(result.blocked_by).toHaveLength(1);
      expect(result.blocked_by[0]).toMatch(/GitHub repo URL stored/);
      // SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A PA-2: verifier message now uses
      // 'ventures.' prefix since the table source moved from venture_resources to ventures.
      expect(result.blocked_by[0]).toMatch(/ventures\.repo_url and\/or ventures\.deployment_url not populated/);
    });

    it('blocks with multiple reasons when both gates fail', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({
        buildArtifactPresent: false,
        resourceRow: null,
      });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(false);
      expect(result.blocked_by).toHaveLength(2);
    });
  });

  describe('config / verifier edge cases', () => {
    it('returns allowed=true when gates.exit array is empty', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({ stageConfig: { exit: [] } });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(true);
      expect(result.gates_checked).toEqual([]);
    });

    it('returns allowed=true when gates.exit is missing (no metadata.gates key)', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({ stageConfig: undefined });
      // Override the from() to return metadata without gates.exit key.
      supabase.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
          })),
        })),
      }));
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(true);
    });

    it('skips unknown gate strings (no verifier registered) with a WARN, still allows', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({
        stageConfig: { exit: ['Frobnicate the widget cache'] },
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(true);
      expect(result.gates_checked).toEqual(['Frobnicate the widget cache']);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('blocks with structured reason when lifecycle_stage_config read fails', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({ configError: { message: 'simulated PG error' } });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(false);
      expect(result.blocked_by[0]).toMatch(/lifecycle_stage_config read failed/);
      expect(result.blocked_by[0]).toMatch(/simulated PG error/);
    });
  });

  describe('AC-FR2-4: structured payload shape', () => {
    it('returns {allowed, blocked_by[], gates_checked[], stage_number, flag_enforced}', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock();
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result).toEqual(expect.objectContaining({
        allowed: expect.any(Boolean),
        blocked_by: expect.any(Array),
        gates_checked: expect.any(Array),
        stage_number: 19,
        flag_enforced: expect.any(Boolean),
      }));
    });
  });
});
