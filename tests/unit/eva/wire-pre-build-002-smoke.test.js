/**
 * FR-7 — PLAN-VERIFY integration smoke (SD-LEO-INFRA-WIRE-PRE-BUILD-002).
 *
 * Exercises the live-driver / DB-reading SEAMS end-to-end through the REAL modules
 * (only the LLM client + supabase are doubles — the live LLM dispatch + real prod DB
 * are session-hosted). Proves the composed chain connects:
 *   introspect -> makePanelDriver -> enrichLeafLive -> (evidence write) -> REAL gate
 *   + capability mapper rows + pilot-scoped resolveLeafEnforce.
 * TS-4a (idempotency against the REAL sd_capabilities UNIQUE constraint) is proven
 * separately by a database-agent BEGIN..ROLLBACK prod dry-run (recorded in the SD).
 */
import { describe, it, expect } from 'vitest';
import { introspectLeafEnrichment, makePanelDriver } from '../../../lib/eva/bridge/panel-driver.js';
import { enrichLeafLive } from '../../../lib/eva/bridge/enrich-leaf-live.js';
import { evaluateLeafReadinessLive, resolveLeafEnforce } from '../../../lib/eva/bridge/leaf-gate-live.js';
import { writeLeafCapabilities, VALID_CAPABILITY_ACTIONS } from '../../../lib/eva/bridge/capability-writer.js';

const PHASE_START = new Date('2026-06-04T00:00:00Z');
const FRESH = '2026-06-04T01:00:00Z';
const ARTIFACT_TYPES = ['blueprint_data_model', 'blueprint_wireframes'];
const OPTS = { dataSensitive: true, archetype: 'algorithm-core' };
const LEAF = { id: 'leaf-uuid', sd_key: 'SD-DD-SPRINT-002-C1', parent_sd_id: 'p', sd_type: 'feature', metadata: { venture_id: 'v1' } };

const okClient = { model: 'fake', async complete() { return { content: 'authored prose' }; } };
const holdClient = { async complete() { return { content: '' }; } }; // empty -> required HOLD
const gateSupabase = (rows) => {
  const t = Promise.resolve({ data: rows, error: null });
  const c = { select: () => c, eq: () => c, in: () => t };
  return { from: () => c };
};
// capturing supabase for the capability UPSERT
function capturingSupabase() {
  const captured = { rows: null, opts: null };
  return { captured, from() { return this; }, upsert(rows, opts) { captured.rows = rows; captured.opts = opts; return Promise.resolve({ error: null }); } };
}

describe('FR-7 smoke — enriched leaf flows producer -> REAL gate -> PASS', () => {
  it('introspect resolves the manifest, the panel enriches, evidence makes the enforcing gate PASS, capabilities map to live columns', async () => {
    // 1. introspection (TS-5a) — pure, deterministic
    const intro = introspectLeafEnrichment({ artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS });
    expect(intro.requiredCodes).toContain('VENTURE_STACK');

    // 2. live enrich via the REAL orchestrator + driver; capture evidence + capabilities
    const evidence = [];
    const sb = capturingSupabase();
    const r = await enrichLeafLive({
      leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS,
      driver: makePanelDriver({ client: okClient }), supabase: sb, ventureId: 'v1',
      writeEvidence: async ({ code, verdict }) => { evidence.push({ sub_agent_code: code, created_at: FRESH, updated_at: null, verdict }); },
    });
    expect(r.status).toBe('enriched');
    expect(r.evidenceWritten).toBe(true);
    expect(r.capabilitiesWritten).toBeGreaterThan(0);

    // 3. capability rows map to the LIVE columns + action CHECK (TS-4 shape)
    for (const row of sb.captured.rows) {
      expect(row.sd_id).toBe('SD-DD-SPRINT-002-C1');
      expect(row.sd_uuid).toBe('leaf-uuid');
      expect(row.capability_key.startsWith('v1:')).toBe(true); // venture-namespaced
      expect(VALID_CAPABILITY_ACTIONS).toContain(row.action);
      expect('capability_id' in row).toBe(false);
    }
    expect(sb.captured.opts.onConflict).toBe('sd_uuid,capability_key,action');

    // 4. the produced evidence makes the ENFORCING REAL gate PASS (TS-1b)
    const enforce = resolveLeafEnforce(LEAF, {}, ['SD-DD-SPRINT-002-C1']); // enrolled, global OFF
    expect(enforce).toBe(true);
    const gate = await evaluateLeafReadinessLive({ sd: LEAF, supabase: gateSupabase(evidence), phaseStartedAt: PHASE_START, enforce });
    expect(gate.passed).toBe(true);
    expect(gate.details.present).toContain('VENTURE_STACK');
  });
});

describe('FR-7 smoke — held leaf is fail-closed; gate blocks; non-enrolled observes', () => {
  it('HOLD writes no evidence and the enforcing gate BLOCKS the leaf', async () => {
    const evidence = [];
    const r = await enrichLeafLive({
      leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS,
      driver: makePanelDriver({ client: holdClient }), ventureId: 'v1',
      writeEvidence: async ({ code }) => { evidence.push({ sub_agent_code: code }); },
      options: { maxAttemptsPerAgent: 1 },
    });
    expect(r.status).toBe('held');
    expect(r.evidenceWritten).toBe(false);
    expect(evidence).toHaveLength(0);

    const enforce = resolveLeafEnforce(LEAF, {}, ['SD-DD-SPRINT-002-C1']);
    const gate = await evaluateLeafReadinessLive({ sd: LEAF, supabase: gateSupabase([]), phaseStartedAt: PHASE_START, enforce });
    expect(gate.passed).toBe(false);
  });

  it('a NON-enrolled leaf OBSERVES (global OFF) even with no evidence — pilot scoping holds', async () => {
    const other = { ...LEAF, id: 'leaf-2', sd_key: 'SD-DD-SPRINT-002-C2' };
    const enforce = resolveLeafEnforce(other, {}, ['SD-DD-SPRINT-002-C1']); // not enrolled
    expect(enforce).toBe(false);
    const gate = await evaluateLeafReadinessLive({ sd: other, supabase: gateSupabase([]), phaseStartedAt: PHASE_START, enforce });
    expect(gate.passed).toBe(true);
    expect(gate.details.would_block).toBe(true);
  });
});
