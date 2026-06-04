/**
 * Unit tests for the live leaf-enrichment orchestrator.
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 — FR-4 (TS-1b producer->REAL-gate seam; HOLD fail-closed).
 *
 * The evidence + capability writers are injected, so this is pure. TS-1b feeds the
 * written evidence into the REAL evaluateLeafReadinessLive (no mock of the gate).
 */
import { describe, it, expect } from 'vitest';
import { enrichLeafLive } from '../../../lib/eva/bridge/enrich-leaf-live.js';
import { makePanelDriver } from '../../../lib/eva/bridge/panel-driver.js';
import { evaluateLeafReadinessLive } from '../../../lib/eva/bridge/leaf-gate-live.js';

const PHASE_START = new Date('2026-06-04T00:00:00Z');
const FRESH = '2026-06-04T01:00:00Z';
const ARTIFACT_TYPES = ['blueprint_data_model', 'blueprint_wireframes'];
const OPTS = { dataSensitive: true, archetype: 'algorithm-core' };
const LEAF = { id: 'leaf-uuid', sd_key: 'SD-DD-SPRINT-002-C1', parent_sd_id: 'p', sd_type: 'feature', metadata: { venture_id: 'v1' } };

const okClient = { model: 'fake', async complete() { return { content: 'authored section prose' }; } };
const fakeSupabaseReturning = (rows) => {
  const terminal = Promise.resolve({ data: rows, error: null });
  const chain = { select: () => chain, eq: () => chain, in: () => terminal };
  return { from: () => chain };
};

describe('enrichLeafLive — FR-4 producer->gate seam (TS-1b)', () => {
  it('writes VENTURE_STACK evidence that the REAL evaluateLeafReadinessLive then reads as present', async () => {
    const written = [];
    const writeEvidence = async ({ code, verdict }) => { written.push({ sub_agent_code: code, created_at: FRESH, updated_at: null, verdict }); };
    const writeCapabilities = async () => ({ written: 3, rows: [] });
    const driver = makePanelDriver({ client: okClient });

    const r = await enrichLeafLive({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver, supabase: {}, ventureId: 'v1', writeEvidence, writeCapabilities });
    expect(r.status).toBe('enriched');
    expect(r.evidenceWritten).toBe(true);
    expect(r.capabilitiesWritten).toBe(3);
    expect(written.find((w) => w.sub_agent_code === 'VENTURE_STACK')?.verdict).toBe('PASS');

    // Feed the written evidence into the REAL gate (enforce) — it must now PASS.
    const gate = await evaluateLeafReadinessLive({ sd: LEAF, supabase: fakeSupabaseReturning(written), phaseStartedAt: PHASE_START, enforce: true });
    expect(gate.passed).toBe(true);
    expect(gate.details.present).toContain('VENTURE_STACK');
  });
});

describe('enrichLeafLive — HOLD is fail-closed (no evidence, no capabilities)', () => {
  it('a held leaf writes NEITHER evidence NOR capabilities', async () => {
    let evidenceCalls = 0, capCalls = 0;
    const writeEvidence = async () => { evidenceCalls++; };
    const writeCapabilities = async () => { capCalls++; return { written: 1 }; };
    // driver that HOLDs a required agent (empty section)
    const holdingClient = { async complete() { return { content: '' }; } };
    const driver = makePanelDriver({ client: holdingClient });

    const r = await enrichLeafLive({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver, supabase: {}, ventureId: 'v1', writeEvidence, writeCapabilities, options: { maxAttemptsPerAgent: 1 } });
    expect(r.status).toBe('held');
    expect(r.evidenceWritten).toBe(false);
    expect(r.capabilitiesWritten).toBe(0);
    expect(evidenceCalls).toBe(0);
    expect(capCalls).toBe(0);

    // And the gate (enforce) still BLOCKS the held leaf — no evidence was produced.
    const gate = await evaluateLeafReadinessLive({ sd: LEAF, supabase: fakeSupabaseReturning([]), phaseStartedAt: PHASE_START, enforce: true });
    expect(gate.passed).toBe(false);
  });

  it('skips the capability write when no supabase client is provided', async () => {
    const writeEvidence = async () => {};
    const r = await enrichLeafLive({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver: makePanelDriver({ client: okClient }), ventureId: 'v1', writeEvidence });
    expect(r.status).toBe('enriched');
    expect(r.capabilitiesWritten).toBe(0);
  });
});
