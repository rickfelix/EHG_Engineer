/**
 * Vitest specs for activation-invariant-gate.
 *
 * Anchors:
 *   - Bypass via reason-text discriminator (no new flag added)
 *   - Trigger heuristic gating (not-triggered fast path)
 *   - PRD lookup + activation_test_id presence check
 *   - File existence verification
 *   - TESTING evidence row freshness + verdict + verified flag
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createActivationInvariantGate } from './activation-invariant-gate.js';
import { computeContentHash } from '../../../../../../lib/sub-agent-executor/evidence-provenance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../../..');

// Build a chainable supabase mock that resolves to { data }.
function mockSupabase(prdRow, evidenceRow) {
  return {
    from(table) {
      if (table === 'product_requirements_v2') {
        return {
          select() { return this; },
          eq() { return this; },
          limit() { return this; },
          maybeSingle: async () => ({ data: prdRow || null }),
        };
      }
      if (table === 'sub_agent_execution_results') {
        return {
          select() { return this; },
          eq() { return this; },
          gte() { return this; },
          order() { return this; },
          limit() { return this; },
          maybeSingle: async () => ({ data: evidenceRow || null }),
        };
      }
      return { select() { return this; }, eq() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null }) };
    },
  };
}

const triggeredSD = {
  id: 'test-sd-uuid',
  key_changes: [
    { type: 'database', change: 'New schema table' },
    { type: 'feature', change: 'UI panel renders worker output' },
  ],
};

const nonTriggeredSD = {
  id: 'test-sd-uuid-2',
  key_changes: [{ type: 'documentation', change: 'Update README' }],
};

describe('createActivationInvariantGate — bypass and trigger', () => {
  it('passes via bypass reason-text discriminator without checking PRD', async () => {
    const sd = {
      ...triggeredSD,
      metadata: { governance_metadata: { bypass_reason: 'ACTIV-CHAIN-DEFERRED:JIRA-123' } },
    };
    const gate = createActivationInvariantGate(mockSupabase(null, null), null);
    const result = await gate.validator({ sd, sdId: sd.id });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.bypassed).toBe(true);
    expect(result.warnings[0]).toMatch(/ACTIV-CHAIN-DEFERRED/);
  });

  it('passes (not triggered) when SD lacks schema+consumer chain', async () => {
    const gate = createActivationInvariantGate(mockSupabase(null, null), null);
    const result = await gate.validator({ sd: nonTriggeredSD, sdId: nonTriggeredSD.id });
    expect(result.passed).toBe(true);
    expect(result.details.triggered).toBe(false);
  });
});

describe('createActivationInvariantGate — triggered SD missing pieces', () => {
  it('fails when triggered but no PRD found', async () => {
    const gate = createActivationInvariantGate(mockSupabase(null, null), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/No PRD found/);
    expect(result.details.prd_missing).toBe(true);
  });

  it('fails when PRD exists but activation_test_id is null', async () => {
    const prd = { id: 'prd-uuid', sd_id: triggeredSD.id, activation_test_id: null };
    const gate = createActivationInvariantGate(mockSupabase(prd, null), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/activation_test_id is empty/);
    expect(result.details.remediation).toMatch(/PRD\.activation_test_id/);
  });

  it('fails when activation_test_id points at non-existent file', async () => {
    const prd = { id: 'prd-uuid', sd_id: triggeredSD.id, activation_test_id: 'tests/e2e/does-not-exist.spec.ts' };
    const gate = createActivationInvariantGate(mockSupabase(prd, null), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/non-existent file/);
  });

  it('fails when test file exists but no TESTING evidence row within 24h', async () => {
    const fakeTestPath = 'scripts/modules/activation-invariant/trigger-evaluator.test.js';
    expect(fs.existsSync(path.resolve(ROOT_DIR, fakeTestPath))).toBe(true);
    const prd = { id: 'prd-uuid', sd_id: triggeredSD.id, activation_test_id: fakeTestPath };
    const gate = createActivationInvariantGate(mockSupabase(prd, null), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/No TESTING sub-agent evidence/);
  });

  it('fails when TESTING evidence row exists but verdict != PASS', async () => {
    const fakeTestPath = 'scripts/modules/activation-invariant/trigger-evaluator.test.js';
    const prd = { id: 'prd-uuid', sd_id: triggeredSD.id, activation_test_id: fakeTestPath };
    const evidence = { id: 'ev-uuid', verdict: 'FAIL', confidence: 50, metadata: { activation_invariant_verified: false }, created_at: new Date().toISOString(), phase: 'LEAD-FINAL-APPROVAL' };
    const gate = createActivationInvariantGate(mockSupabase(prd, evidence), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/verdict=FAIL/);
  });

  it('fails when verdict=PASS but activation_invariant_verified=false', async () => {
    const fakeTestPath = 'scripts/modules/activation-invariant/trigger-evaluator.test.js';
    const prd = { id: 'prd-uuid', sd_id: triggeredSD.id, activation_test_id: fakeTestPath };
    const evidence = { id: 'ev-uuid', verdict: 'PASS', confidence: 90, metadata: {}, created_at: new Date().toISOString(), phase: 'LEAD-FINAL-APPROVAL' };
    const gate = createActivationInvariantGate(mockSupabase(prd, evidence), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/activation_invariant_verified=false/);
  });
});

describe('createActivationInvariantGate — happy path', () => {
  it('passes when all conditions met: triggered, PRD set, file exists, evidence verified', async () => {
    const fakeTestPath = 'scripts/modules/activation-invariant/trigger-evaluator.test.js';
    expect(fs.existsSync(path.resolve(ROOT_DIR, fakeTestPath))).toBe(true);
    const prd = { id: 'prd-uuid', sd_id: triggeredSD.id, activation_test_id: fakeTestPath };
    const evidence = { id: 'ev-uuid', verdict: 'PASS', confidence: 92, metadata: { activation_invariant_verified: true }, created_at: new Date().toISOString(), phase: 'LEAD-FINAL-APPROVAL' };
    const gate = createActivationInvariantGate(mockSupabase(prd, evidence), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.triggered).toBe(true);
    expect(result.details.evidence_id).toBe('ev-uuid');
  });
});

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D2: evidence-staleness check', () => {
  // A distinct mock: the staleness check queries sub_agent_execution_results WITHOUT the
  // TESTING-evidence-freshness query's .gte()/.eq('sub_agent_code', 'TESTING') filters, so it
  // needs its own newestEvidenceRow, separate from the (possibly absent/mismatched) TESTING
  // evidence row used by the pre-existing activation-invariant checks below it.
  function mockSupabaseWithNewestEvidence(prdRow, testingEvidenceRow, newestEvidenceRow) {
    return {
      from(table) {
        if (table === 'product_requirements_v2') {
          return { select() { return this; }, eq() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: prdRow || null }) };
        }
        if (table === 'sub_agent_execution_results') {
          let usesGte = false;
          return {
            select() { return this; },
            eq() { return this; },
            gte() { usesGte = true; return this; },
            order() { return this; },
            limit() { return this; },
            maybeSingle: async () => ({ data: (usesGte ? testingEvidenceRow : newestEvidenceRow) || null }),
          };
        }
        return { select() { return this; }, eq() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null }) };
      },
    };
  }

  afterAll(() => { delete process.env.LEO_DISABLE_LFA_STALENESS_CHECK; });

  it('fails (not triggered SD, staleness runs unconditionally) when the newest evidence is older than 72h', async () => {
    const staleRow = { id: 'stale-ev-uuid', created_at: new Date(Date.now() - 80 * 3600000).toISOString() };
    const gate = createActivationInvariantGate(mockSupabaseWithNewestEvidence(null, null, staleRow), null);
    const result = await gate.validator({ sd: nonTriggeredSD, sdId: nonTriggeredSD.id });
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/SUBAGENT_EVIDENCE_STALE/);
    expect(result.details.age_hours).toBeGreaterThanOrEqual(80);
  });

  it('passes (not triggered SD) when the newest evidence is within 72h', async () => {
    const freshRow = { id: 'fresh-ev-uuid', created_at: new Date(Date.now() - 1 * 3600000).toISOString() };
    const gate = createActivationInvariantGate(mockSupabaseWithNewestEvidence(null, null, freshRow), null);
    const result = await gate.validator({ sd: nonTriggeredSD, sdId: nonTriggeredSD.id });
    expect(result.passed).toBe(true);
  });

  it('passes when no evidence row exists at all (nothing to be stale)', async () => {
    const gate = createActivationInvariantGate(mockSupabaseWithNewestEvidence(null, null, null), null);
    const result = await gate.validator({ sd: nonTriggeredSD, sdId: nonTriggeredSD.id });
    expect(result.passed).toBe(true);
  });

  it('LEO_DISABLE_LFA_STALENESS_CHECK bypasses a genuinely stale row', async () => {
    process.env.LEO_DISABLE_LFA_STALENESS_CHECK = '1';
    const staleRow = { id: 'stale-ev-uuid', created_at: new Date(Date.now() - 200 * 3600000).toISOString() };
    const gate = createActivationInvariantGate(mockSupabaseWithNewestEvidence(null, null, staleRow), null);
    const result = await gate.validator({ sd: nonTriggeredSD, sdId: nonTriggeredSD.id });
    expect(result.passed).toBe(true);
    delete process.env.LEO_DISABLE_LFA_STALENESS_CHECK;
  });

  it('bypass reason-text discriminator short-circuits BEFORE the staleness check even runs', async () => {
    const staleRow = { id: 'stale-ev-uuid', created_at: new Date(Date.now() - 200 * 3600000).toISOString() };
    const sd = { ...triggeredSD, metadata: { governance_metadata: { bypass_reason: 'ACTIV-CHAIN-DEFERRED:JIRA-999' } } };
    const gate = createActivationInvariantGate(mockSupabaseWithNewestEvidence(null, null, staleRow), null);
    const result = await gate.validator({ sd, sdId: sd.id });
    expect(result.passed).toBe(true);
    expect(result.details.bypassed).toBe(true);
  });

  it('a query error during the staleness lookup fails OPEN (does not itself block completion)', async () => {
    const throwingSupabase = {
      from(table) {
        if (table === 'sub_agent_execution_results') {
          return {
            select() { return this; },
            eq() { return this; },
            gte() { return this; },
            order() { return this; },
            limit() { return this; },
            maybeSingle: async () => { throw new Error('connection reset'); },
          };
        }
        return { select() { return this; }, eq() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null }) };
      },
    };
    const gate = createActivationInvariantGate(throwingSupabase, null);
    const result = await gate.validator({ sd: nonTriggeredSD, sdId: nonTriggeredSD.id });
    expect(result.passed).toBe(true);
  });
});

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A: provenance grading (advisory-first rollout)', () => {
  const fakeTestPath = 'scripts/modules/activation-invariant/trigger-evaluator.test.js';
  const prd = { id: 'prd-uuid', sd_id: triggeredSD.id, activation_test_id: fakeTestPath };

  function fullyProvenancedEvidence(overrides = {}) {
    const base = {
      id: 'ev-uuid',
      verdict: 'PASS',
      confidence: 92,
      created_at: new Date().toISOString(),
      phase: 'LEAD-FINAL-APPROVAL',
      source: 'sub_agent_executor',
      invocation_id: 'inv-provenance-test',
      critical_issues: [],
      warnings: [],
      recommendations: [],
      detailed_analysis: 'analysis',
      summary: 'ok',
      ...overrides,
    };
    const contentHash = computeContentHash(base);
    return { ...base, metadata: { activation_invariant_verified: true, session_id: 'sess-provenance-test', content_hash: contentHash } };
  }

  afterAll(() => { delete process.env.SUBAGENT_EVIDENCE_PROVENANCE_MODE; });

  it('advisory (default, mode unset): a provenance-absent row still passes, with a warning naming the missing field', async () => {
    delete process.env.SUBAGENT_EVIDENCE_PROVENANCE_MODE;
    const evidence = fullyProvenancedEvidence({ source: 'manual' });
    const gate = createActivationInvariantGate(mockSupabase(prd, evidence), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(true);
    expect(result.warnings.some(w => /SUBAGENT_EVIDENCE_PROVENANCE_ABSENT/.test(w) && /source/.test(w))).toBe(true);
  });

  it('block mode: the same provenance-absent row fails the gate', async () => {
    process.env.SUBAGENT_EVIDENCE_PROVENANCE_MODE = 'block';
    const evidence = fullyProvenancedEvidence({ source: 'manual' });
    const gate = createActivationInvariantGate(mockSupabase(prd, evidence), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(false);
    delete process.env.SUBAGENT_EVIDENCE_PROVENANCE_MODE;
  });

  it('a fully-provenanced row produces no provenance warning in either mode', async () => {
    delete process.env.SUBAGENT_EVIDENCE_PROVENANCE_MODE;
    const evidence = fullyProvenancedEvidence();
    const gate = createActivationInvariantGate(mockSupabase(prd, evidence), null);
    const result = await gate.validator({ sd: triggeredSD, sdId: triggeredSD.id });
    expect(result.passed).toBe(true);
    expect(result.warnings.some(w => /SUBAGENT_EVIDENCE_PROVENANCE_ABSENT/.test(w))).toBe(false);
  });
});
