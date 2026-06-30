/**
 * SD-LEO-INFRA-PILOT-VENTURE-GUARD-001 (FR-2)
 *
 * The venture-build SD generator (convertSprintToSDs) must SKIP pilot/test-fixture
 * ventures BEFORE any DB write, and must be FAIL-SAFE: skip only when an isolation
 * marker (is_scaffolding / is_demo) is EXPLICITLY true; a real venture (both
 * flags false/null) generates normally so it is never silently un-built.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isPilotFixtureVenture,
  fetchVentureFlags,
  convertSprintToSDs,
} from '../../../lib/eva/lifecycle-sd-bridge.js';

describe('isPilotFixtureVenture (pure predicate)', () => {
  it('is true when is_scaffolding is explicitly true', () => {
    expect(isPilotFixtureVenture({ is_scaffolding: true, is_demo: false })).toBe(true);
  });
  it('is true when is_demo is explicitly true', () => {
    expect(isPilotFixtureVenture({ is_scaffolding: false, is_demo: true })).toBe(true);
  });
  it('is true when both markers are true', () => {
    expect(isPilotFixtureVenture({ is_scaffolding: true, is_demo: true })).toBe(true);
  });
  it('is FALSE when both markers are false (fail-safe: real venture generates)', () => {
    expect(isPilotFixtureVenture({ is_scaffolding: false, is_demo: false })).toBe(false);
  });
  it('is FALSE for null / undefined / non-object (fail-safe)', () => {
    expect(isPilotFixtureVenture(null)).toBe(false);
    expect(isPilotFixtureVenture(undefined)).toBe(false);
    expect(isPilotFixtureVenture('true')).toBe(false);
    expect(isPilotFixtureVenture(123)).toBe(false);
  });
  it('does not coerce truthy non-boolean marker values', () => {
    // Only an explicit === true triggers the gate (defensive against stray truthy strings)
    expect(isPilotFixtureVenture({ is_scaffolding: 1, is_demo: 'yes' })).toBe(false);
  });
});

describe('fetchVentureFlags', () => {
  const flagsClient = (row) => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
        })),
      })),
    })),
  });

  it('returns normalized booleans for a venture row', async () => {
    const flags = await fetchVentureFlags(flagsClient({ is_demo: true, is_scaffolding: false }), 'v-1');
    // SD-LEO-INFRA-CLONE-BUILD-TREE-BELT-EXCLUSION-001: fetchVentureFlags now also surfaces
    // seeded_from_venture_id (null here — this row carries no seed) for clone detection.
    expect(flags).toEqual({ is_demo: true, is_scaffolding: false, seeded_from_venture_id: null });
  });
  it('returns null when the venture row is absent', async () => {
    const flags = await fetchVentureFlags(flagsClient(null), 'v-missing');
    expect(flags).toBeNull();
  });
  it('returns null (no DB call) when ventureId is falsy', async () => {
    const client = flagsClient({ is_demo: true });
    const flags = await fetchVentureFlags(client, null);
    expect(flags).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
  // SD-LEO-INFRA-CLONE-TREE-EXCLUSION-FAIL-OPEN-LEAK-001 (FR-1): a persistent query fault now FAILS CLOSED.
  // It used to return null ('not a clone' -> a clone tree leaked onto the belt on a DB fault). It now
  // retries and, when STILL unresolved, returns the {unresolved:true} sentinel so the bridge clone decision
  // marks the tree (excluded) instead of leaking it. The pilot-skip guard is UNAFFECTED (the sentinel has
  // no is_demo/is_scaffolding, so isPilotFixtureVenture stays false -> a real venture is never un-built).
  it('returns the {unresolved:true} sentinel (fail-CLOSED) when the query persistently throws', async () => {
    const throwingClient = { from: () => { throw new Error('db down'); } };
    const flags = await fetchVentureFlags(throwingClient, 'v-err', { backoffMs: [0, 0], retries: 2 });
    expect(flags).toEqual({ unresolved: true });
    expect(isPilotFixtureVenture(flags)).toBe(false); // pilot-skip guard unaffected by the sentinel
  });
});

describe('convertSprintToSDs: pilot/test-fixture gate', () => {
  const stageOutput = {
    sprint_name: 'Test Sprint',
    sprint_goal: 'goal',
    sprint_duration_days: 7,
    sd_bridge_payloads: [{ title: 'Item 1', description: 'd' }],
  };

  beforeEach(() => vi.clearAllMocks());

  it('SKIPS generation for a pilot venture and performs ZERO DB work', async () => {
    const supabase = { from: vi.fn(() => { throw new Error('no DB work should occur on pilot skip'); }) };
    const result = await convertSprintToSDs(
      { stageOutput, ventureContext: { id: 'v-pilot', name: 'DataDistill' } },
      { supabase, fetchVentureFlags: async () => ({ is_scaffolding: true, is_demo: false }), logger: { log: vi.fn(), warn: vi.fn() } },
    );
    expect(result.created).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('SD-LEO-INFRA-PILOT-VENTURE-GUARD-001');
    expect(result.orchestratorKey).toBeNull();
    expect(result.childKeys).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('PROCEEDS past the gate for a non-pilot venture (both flags false)', async () => {
    // Mock just enough for findExistingOrchestrator to short-circuit on an existing
    // orchestrator — a NON-null orchestratorKey proves the pilot gate did not fire.
    const sdtChain = {
      select: () => sdtChain,
      eq: () => sdtChain,
      limit: () => Promise.resolve({ data: [{ id: 'orch-1', sd_key: 'SD-EXISTING-ORCH-001' }], error: null }),
      order: () => Promise.resolve({ data: [], error: null }),
    };
    const supabase = { from: vi.fn(() => sdtChain) };
    const result = await convertSprintToSDs(
      { stageOutput, ventureContext: { id: 'v-real', name: 'RealVenture' } },
      { supabase, fetchVentureFlags: async () => ({ is_scaffolding: false, is_demo: false }), logger: { log: vi.fn(), warn: vi.fn() } },
    );
    expect(result.skipped).not.toBe(true);
    expect(result.orchestratorKey).toBe('SD-EXISTING-ORCH-001');
    expect(supabase.from).toHaveBeenCalled();
  });

  it('PROCEEDS past the gate when flags are null (fetch failed — fail-safe)', async () => {
    const sdtChain = {
      select: () => sdtChain,
      eq: () => sdtChain,
      limit: () => Promise.resolve({ data: [{ id: 'orch-2', sd_key: 'SD-EXISTING-ORCH-002' }], error: null }),
      order: () => Promise.resolve({ data: [], error: null }),
    };
    const supabase = { from: vi.fn(() => sdtChain) };
    const result = await convertSprintToSDs(
      { stageOutput, ventureContext: { id: 'v-real-2', name: 'RealVenture2' } },
      { supabase, fetchVentureFlags: async () => null, logger: { log: vi.fn(), warn: vi.fn() } },
    );
    expect(result.skipped).not.toBe(true);
    expect(result.orchestratorKey).toBe('SD-EXISTING-ORCH-002');
  });
});
