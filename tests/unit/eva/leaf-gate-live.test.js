/**
 * Unit tests for the live venture-leaf evidence gate.
 * SD-LEO-INFRA-WIRE-PRE-BUILD-001 — FR-2 (Phase A)
 *
 * Pure unit tests: the supabase client and the phase-start anchor are injected, so
 * no DB / network. Covers the R5 structural detector (incl. fleet-safety negatives),
 * R6 freshness (the dedup-preserves-created_at case), observe-vs-enforce, and the
 * non-compliant (fresh FAIL verdict) block.
 */
import { describe, it, expect } from 'vitest';
import { evaluateLeafReadinessLive, isVentureBuildLeaf, resolveLeafEnforce, parseEnforceAllowList } from '../../../lib/eva/bridge/leaf-gate-live.js';

const PHASE_START = new Date('2026-06-04T00:00:00Z');
const FRESH = '2026-06-04T01:00:00Z'; // after phase start
const STALE = '2026-06-03T00:00:00Z'; // before phase start

// supabase double: .from(t).select(c).eq(k,v).in(k,arr) -> { data, error }
function fakeSupabase(rows, error = null) {
  const terminal = Promise.resolve({ data: rows, error });
  const chain = { select: () => chain, eq: () => chain, in: () => terminal };
  return { from: () => chain };
}
// A supabase double that explodes if queried — proves a code path never hits the DB.
const explodingSupabase = { from: () => { throw new Error('must not query DB for a non-venture SD'); } };

const ventureLeaf = {
  id: 'leaf-uuid', sd_key: 'SD-DD-SPRINT-002-C1', parent_sd_id: 'parent-uuid', sd_type: 'feature',
  metadata: { venture_id: 'v1', grandchild_index: 1, architecture_layer: 'API', generation_source: 'lifecycle_sd_bridge' },
};
const ehgInfra = { id: 'sd-x', sd_key: 'SD-LEO-INFRA-WIRE-PRE-BUILD-001', parent_sd_id: null, sd_type: 'infrastructure', metadata: {} };
const ehgInfraSupabaseMention = {
  id: 'sd-y', sd_key: 'SD-LEO-INFRA-SUPABASE-LINTER-001', parent_sd_id: 'some-parent', sd_type: 'infrastructure',
  description: 'Hardens Supabase RLS and revokes anon EXECUTE.', metadata: {}, // no venture_id => not a venture leaf
};
const childOrchestrator = { id: 'o1', sd_key: 'SD-DD-SPRINT-002-C', parent_sd_id: 'root', sd_type: 'orchestrator', metadata: { venture_id: 'v1', is_parent: true } };
const topOrchestrator = { id: 'root', sd_key: 'SD-DD-SPRINT-002', parent_sd_id: null, sd_type: 'orchestrator', metadata: { venture_id: 'v1' } };

describe('isVentureBuildLeaf (R5 structural detector)', () => {
  it('true for a venture-derived leaf that descends from an orchestrator', () => {
    expect(isVentureBuildLeaf(ventureLeaf)).toBe(true);
  });
  it('false for an EHG_Engineer SD (no venture_id) — fleet safety', () => {
    expect(isVentureBuildLeaf(ehgInfra)).toBe(false);
    expect(isVentureBuildLeaf(ehgInfraSupabaseMention)).toBe(false);
  });
  it('false for orchestrator/parent nodes', () => {
    expect(isVentureBuildLeaf(childOrchestrator)).toBe(false);
  });
  it('false for the top orchestrator (NOT keyed on !parent_sd_id)', () => {
    expect(isVentureBuildLeaf(topOrchestrator)).toBe(false);
  });
});

describe('resolveLeafEnforce — pilot-scoped enforce (SD-LEO-INFRA-WIRE-PRE-BUILD-002 FR-5 / TS-3)', () => {
  const OFF = {}; // global VENTURE_LEAF_GATE_ENFORCE unset (default-OFF)
  it('TS-3c: false for a non-enrolled venture leaf with global OFF and no metadata flag', () => {
    expect(resolveLeafEnforce(ventureLeaf, OFF, [])).toBe(false);
  });
  it('TS-3c: false for an EHG_Engineer SD even if (accidentally) in the allow-list-less env', () => {
    expect(resolveLeafEnforce(ehgInfra, OFF, [])).toBe(false);
  });
  it('TS-3b: true when the leaf sd_key is in the allow-list (global STILL OFF)', () => {
    expect(resolveLeafEnforce(ventureLeaf, OFF, ['SD-DD-SPRINT-002-C1'])).toBe(true);
  });
  it('TS-3b: true when the leaf carries metadata.venture_leaf_gate_enforce===true (global OFF)', () => {
    const enrolled = { ...ventureLeaf, metadata: { ...ventureLeaf.metadata, venture_leaf_gate_enforce: true } };
    expect(resolveLeafEnforce(enrolled, OFF, [])).toBe(true);
  });
  it('TS-3a: true when the global switch is ON (env), regardless of allow-list', () => {
    expect(resolveLeafEnforce(ventureLeaf, { VENTURE_LEAF_GATE_ENFORCE: '1' }, [])).toBe(true);
  });
  it('parseEnforceAllowList parses a CSV env var, trimming + dropping blanks', () => {
    expect(parseEnforceAllowList({ VENTURE_LEAF_GATE_ENFORCE_SD_KEYS: ' SD-A , ,SD-B ' })).toEqual(['SD-A', 'SD-B']);
    expect(parseEnforceAllowList({})).toEqual([]);
  });
  it('end-to-end: an enrolled leaf ENFORCES while a non-enrolled leaf OBSERVES (global OFF)', async () => {
    const allow = ['SD-DD-SPRINT-002-C1'];
    const enrolled = await evaluateLeafReadinessLive({ sd: ventureLeaf, supabase: fakeSupabase([]), phaseStartedAt: PHASE_START, enforce: resolveLeafEnforce(ventureLeaf, OFF, allow) });
    expect(enrolled.passed).toBe(false); // enrolled -> enforce -> blocked on missing evidence
    const other = { ...ventureLeaf, id: 'leaf-2', sd_key: 'SD-DD-SPRINT-002-C2' };
    const observed = await evaluateLeafReadinessLive({ sd: other, supabase: fakeSupabase([]), phaseStartedAt: PHASE_START, enforce: resolveLeafEnforce(other, OFF, allow) });
    expect(observed.passed).toBe(true); // non-enrolled -> observe
    expect(observed.details.would_block).toBe(true);
  });
});

describe('evaluateLeafReadinessLive (FR-2)', () => {
  it('non-venture SD => no-op pass, never queries the DB', async () => {
    const r = await evaluateLeafReadinessLive({ sd: ehgInfra, supabase: explodingSupabase, phaseStartedAt: PHASE_START });
    expect(r.passed).toBe(true);
    expect(r.details.skipReason).toBe('NOT_VENTURE_LEAF');
  });

  it('TS-R5b: an EHG_Engineer Supabase-mentioning SD is NEVER blocked, even when enforcing', async () => {
    const r = await evaluateLeafReadinessLive({ sd: ehgInfraSupabaseMention, supabase: explodingSupabase, phaseStartedAt: PHASE_START, enforce: true });
    expect(r.passed).toBe(true);
    expect(r.details.skipReason).toBe('NOT_VENTURE_LEAF');
  });

  it('venture leaf with fresh PASSING VENTURE_STACK evidence => pass', async () => {
    const sb = fakeSupabase([{ sub_agent_code: 'VENTURE_STACK', created_at: FRESH, updated_at: null, verdict: 'PASS' }]);
    const r = await evaluateLeafReadinessLive({ sd: ventureLeaf, supabase: sb, phaseStartedAt: PHASE_START, enforce: true });
    expect(r.passed).toBe(true);
    expect(r.details.present).toContain('VENTURE_STACK');
  });

  it('TS-R5a: venture leaf with NO evidence + enforce => blocked (SUBAGENT_EVIDENCE_MISSING)', async () => {
    const r = await evaluateLeafReadinessLive({ sd: ventureLeaf, supabase: fakeSupabase([]), phaseStartedAt: PHASE_START, enforce: true });
    expect(r.passed).toBe(false);
    expect(r.issues.join(' ')).toMatch(/SUBAGENT_EVIDENCE_MISSING/);
    expect(r.details.missing).toContain('VENTURE_STACK');
  });

  it('observe mode (enforce=false): missing evidence => pass with WOULD-BLOCK warning', async () => {
    const r = await evaluateLeafReadinessLive({ sd: ventureLeaf, supabase: fakeSupabase([]), phaseStartedAt: PHASE_START, enforce: false });
    expect(r.passed).toBe(true);
    expect(r.details.would_block).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/WOULD BLOCK/);
  });

  it('TS-R6: a re-run row (old created_at, fresh updated_at) counts as FRESH', async () => {
    // storeSubAgentResults dedup strips created_at on update and only bumps updated_at.
    const sb = fakeSupabase([{ sub_agent_code: 'VENTURE_STACK', created_at: STALE, updated_at: FRESH, verdict: 'PASS' }]);
    const r = await evaluateLeafReadinessLive({ sd: ventureLeaf, supabase: sb, phaseStartedAt: PHASE_START, enforce: true });
    expect(r.passed).toBe(true);
    expect(r.details.present).toContain('VENTURE_STACK');
  });

  it('genuinely stale row (created_at AND updated_at before phase start) => missing/blocked', async () => {
    const sb = fakeSupabase([{ sub_agent_code: 'VENTURE_STACK', created_at: STALE, updated_at: STALE, verdict: 'PASS' }]);
    const r = await evaluateLeafReadinessLive({ sd: ventureLeaf, supabase: sb, phaseStartedAt: PHASE_START, enforce: true });
    expect(r.passed).toBe(false);
    expect(r.details.missing).toContain('VENTURE_STACK');
  });

  it('fresh but FAILING verdict => blocked as VENTURE_STACK_NON_COMPLIANT', async () => {
    const sb = fakeSupabase([{ sub_agent_code: 'VENTURE_STACK', created_at: FRESH, updated_at: null, verdict: 'FAIL' }]);
    const r = await evaluateLeafReadinessLive({ sd: ventureLeaf, supabase: sb, phaseStartedAt: PHASE_START, enforce: true });
    expect(r.passed).toBe(false);
    expect(r.issues.join(' ')).toMatch(/VENTURE_STACK_NON_COMPLIANT/);
    expect(r.details.non_compliant).toContain('VENTURE_STACK');
  });
});
