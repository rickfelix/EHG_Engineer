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
