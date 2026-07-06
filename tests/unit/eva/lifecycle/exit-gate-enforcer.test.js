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
  stackDescriptor = null,
  insertedEvents,
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
      // SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-2): also backs the observe-only
      // verifiers (verifyStackDescriptorValid etc.), which select stack_descriptor.
      if (table === 'ventures') {
        return {
          select: vi.fn(() => buildEqChain({
            data: resourceRow === null ? null : { ...resourceRow, stack_descriptor: stackDescriptor },
            error: null,
          })),
        };
      }
      if (table === 'system_events') {
        return {
          insert: vi.fn((row) => {
            if (insertedEvents) insertedEvents.push(row);
            return Promise.resolve({ data: null, error: null });
          }),
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

    it('blocks with structured reason when venture_stages read fails', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({ configError: { message: 'simulated PG error' } });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(false);
      expect(result.blocked_by[0]).toMatch(/venture_stages read failed/);
      expect(result.blocked_by[0]).toMatch(/simulated PG error/);
    });
  });

  // SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-2): observe-only gates never block.
  describe('gates.exit_observe (FR-2, observe-only)', () => {
    it('a failing observe-only gate does NOT affect allowed, but is reported in would_block_by', async () => {
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({
        stageConfig: { exit: ['Application deployed', 'GitHub repo URL stored in venture_resources'], exit_observe: ['stack descriptor valid'] },
        stackDescriptor: null, // verifyStackDescriptorValid fails closed on missing descriptor
      });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(true); // binding gates (build+repo URLs) both pass
      expect(result.would_block_by).toHaveLength(1);
      expect(result.would_block_by[0]).toMatch(/stack descriptor valid/);
    });

    it('writes one system_events row per observe-only gate evaluated', async () => {
      const insertedEvents = [];
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({
        stageConfig: { exit: ['Application deployed', 'GitHub repo URL stored in venture_resources'], exit_observe: ['stack descriptor valid', 'deployment target provisioned'] },
        stackDescriptor: null,
        insertedEvents,
      });
      await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(insertedEvents).toHaveLength(2);
      expect(insertedEvents.every((e) => e.event_type === 'EXIT_GATE_OBSERVE_ONLY')).toBe(true);
      expect(insertedEvents.every((e) => e.payload.would_satisfy === false)).toBe(true);
    });

    it('a SATISFIED observe-only gate produces an empty would_block_by but still logs the evaluation', async () => {
      const insertedEvents = [];
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({
        stageConfig: { exit: ['Application deployed', 'GitHub repo URL stored in venture_resources'], exit_observe: ['stack descriptor valid'] },
        stackDescriptor: { db_provider: 'd1', deployment_target: 'cloudflare-pages', storage: 'r2' },
        insertedEvents,
      });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.would_block_by).toEqual([]);
      expect(insertedEvents).toHaveLength(1);
      expect(insertedEvents[0].payload.would_satisfy).toBe(true);
    });

    it('runs exit_observe evaluation even when gates.exit is empty (allowed=true regardless)', async () => {
      const insertedEvents = [];
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({
        stageConfig: { exit: [], exit_observe: ['stack descriptor valid'] },
        stackDescriptor: null,
        insertedEvents,
      });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.allowed).toBe(true);
      expect(result.would_block_by).toHaveLength(1);
      expect(insertedEvents).toHaveLength(1);
    });

    it('backward-compat: absent exit_observe key produces would_block_by:[] and no system_events writes', async () => {
      const insertedEvents = [];
      const { checkExitGates } = await importEnforcerWithFlag('on');
      const supabase = buildSupabaseMock({ insertedEvents });
      const result = await checkExitGates({ supabase, ventureId: VENTURE_ID, fromStage: 19 });
      expect(result.would_block_by).toEqual([]);
      expect(insertedEvents).toHaveLength(0);
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
