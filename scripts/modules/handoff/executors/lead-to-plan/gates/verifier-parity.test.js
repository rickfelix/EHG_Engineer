/**
 * Tests for the Verifier-Parity Gate (precheck-only)
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECONCILE-001
 *
 * Run: node --test scripts/modules/handoff/executors/lead-to-plan/gates/verifier-parity.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createVerifierParityGate,
  evaluateVerifierParity,
  resolveEffectiveMinScore
} from './verifier-parity.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

// A fully-valid SD scores exactly 90 in validateStrategicDirective
// (30 required-fields + 20 objectives + 20 metrics + 10 principles + 10 risks)
// and passes feasibility + status. Removing any component makes valid=false.
function makeCompleteSd(overrides = {}) {
  return {
    id: 'test-uuid-0001',
    sd_key: 'SD-TEST-PARITY-001',
    title: 'Reconcile dual validation engines test SD',
    description: 'A sufficiently long description of the test strategic directive used to exercise the verifier-parity gate.',
    scope: 'IN SCOPE: the parity gate. OUT OF SCOPE: everything unrelated to LEAD-TO-PLAN.',
    strategic_objectives: ['Objective one is measurable and clear', 'Objective two is also clear'],
    key_principles: ['Backward compatible', 'Database-first'],
    priority: 'medium',
    status: 'draft',
    sd_type: 'infrastructure',
    success_metrics: [
      { metric: 'agreement', target: '100%' },
      { metric: 'regressions', target: '0' },
      { metric: 'scenarios', target: '>=3' }
    ],
    risks: [{ risk: 'under-escalation', mitigation: 'default-escalate' }],
    ...overrides
  };
}

// Mock supabase whose .from().select().limit() always resolves cleanly so
// checkEnvironmentReadiness reports ready.
function mockSupabaseOk() {
  const chain = {
    select: () => chain,
    limit: () => Promise.resolve({ data: [], error: null })
  };
  return { from: () => chain };
}

// Spy supabase that records every method call so we can assert NO writes occur.
function spySupabase() {
  const calls = [];
  const chain = {
    select: (...a) => { calls.push(['select', ...a]); return chain; },
    limit: (...a) => { calls.push(['limit', ...a]); return Promise.resolve({ data: [], error: null }); },
    eq: (...a) => { calls.push(['eq', ...a]); return chain; },
    insert: (...a) => { calls.push(['insert', ...a]); return Promise.resolve({ data: null, error: null }); },
    update: (...a) => { calls.push(['update', ...a]); return Promise.resolve({ data: null, error: null }); },
    delete: (...a) => { calls.push(['delete', ...a]); return Promise.resolve({ data: null, error: null }); },
    upsert: (...a) => { calls.push(['upsert', ...a]); return Promise.resolve({ data: null, error: null }); }
  };
  const client = {
    from: (t) => { calls.push(['from', t]); return chain; },
    rpc: (...a) => { calls.push(['rpc', ...a]); return Promise.resolve({ data: null, error: null }); }
  };
  return { calls, client };
}

const WRITE_METHODS = new Set(['insert', 'update', 'delete', 'upsert']);

// ── TS-2: complete SD passes ─────────────────────────────────────────────────
test('TS-2: a fully-complete SD passes the parity gate', async () => {
  const result = await evaluateVerifierParity(makeCompleteSd(), mockSupabaseOk());
  assert.equal(result.passed, true, `expected pass, got issues: ${result.issues.join(' | ')}`);
  assert.equal(result.issues.length, 0);
  assert.equal(result.details.completeness_percentage, 90);
  assert.equal(result.details.effective_min_score, 70); // infrastructure override
});

// ── TS-1: marginal SD fails (predicts execute SD_INCOMPLETE) ──────────────────
test('TS-1: an SD missing risks (valid=false) fails parity with SD_INCOMPLETE', async () => {
  const result = await evaluateVerifierParity(makeCompleteSd({ risks: undefined }), mockSupabaseOk());
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(i => i.startsWith('SD_INCOMPLETE')), `issues: ${result.issues.join(' | ')}`);
});

test('TS-1b: an SD with an invalid status fails parity with SD_STATUS', async () => {
  const result = await evaluateVerifierParity(makeCompleteSd({ status: 'completed' }), mockSupabaseOk());
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(i => i.startsWith('SD_STATUS')), `issues: ${result.issues.join(' | ')}`);
});

// ── TS-3: orchestrator auto-pass (IR-1 parity) ───────────────────────────────
test('TS-3: an orchestrator SD auto-passes even when otherwise incomplete', async () => {
  const incompleteOrchestrator = makeCompleteSd({
    sd_type: 'orchestrator',
    risks: undefined,
    key_principles: undefined,
    strategic_objectives: undefined,
    success_metrics: undefined,
    success_criteria: undefined
  });
  const result = await evaluateVerifierParity(incompleteOrchestrator, mockSupabaseOk());
  assert.equal(result.passed, true);
  assert.equal(result.details.orchestrator_auto_pass, true);
});

// ── TS-4: precheck-only condition (execute byte-identical) ───────────────────
test('TS-4: gate runs ONLY in precheck (condition guards on precheckMode)', () => {
  const gate = createVerifierParityGate(mockSupabaseOk());
  assert.equal(gate.name, 'GATE_VERIFIER_PARITY_PRECHECK');
  assert.equal(gate.required, true);
  assert.equal(typeof gate.condition, 'function');
  // precheck context → runs
  assert.equal(gate.condition({ precheckMode: true }), true);
  // execute-style contexts → skipped (byte-identical execute path)
  assert.equal(gate.condition({}), false);
  assert.equal(gate.condition({ precheckMode: false }), false);
  assert.equal(gate.condition(null), false);
  assert.equal(gate.condition(undefined), false);
});

// ── TS-5: side-effect-free (no DB writes; verifier never invoked) ────────────
test('TS-5: the gate performs zero DB writes (only reads)', async () => {
  const { calls, client } = spySupabase();
  const gate = createVerifierParityGate(client);
  const result = await gate.validator({ sd: makeCompleteSd(), precheckMode: true });
  assert.equal(result.passed, true);
  const writeCalls = calls.filter(c => WRITE_METHODS.has(c[0]));
  assert.deepEqual(writeCalls, [], `expected no writes, found: ${JSON.stringify(writeCalls)}`);
});

// ── TS-6: threshold parity (IR-2) — same resolution as the verifier ──────────
test('TS-6: resolveEffectiveMinScore mirrors SD_TYPE_OVERRIDES/SD_REQUIREMENTS', () => {
  assert.equal(resolveEffectiveMinScore({ sd_type: 'infrastructure' }), 70);
  assert.equal(resolveEffectiveMinScore({ sd_type: 'bugfix' }), 60);
  assert.equal(resolveEffectiveMinScore({ sd_type: 'database' }), 70);
  assert.equal(resolveEffectiveMinScore({ sd_type: 'documentation' }), 60);
  assert.equal(resolveEffectiveMinScore({ sd_type: 'refactor' }), 70);
  // No override → default minimumScore (90)
  assert.equal(resolveEffectiveMinScore({ sd_type: 'feature' }), 90);
  assert.equal(resolveEffectiveMinScore({ sd_type: 'security' }), 90);
  assert.equal(resolveEffectiveMinScore({}), 90);
  // Case-insensitive
  assert.equal(resolveEffectiveMinScore({ sd_type: 'INFRASTRUCTURE' }), 70);
});

// ── A throwing supabase surfaces as ENV_NOT_READY (checkEnvironmentReadiness
//    catches internally), NOT a crash — i.e. a real blocker, correctly reported.
test('Throwing supabase -> ENV_NOT_READY blocker (not a crash)', async () => {
  const throwingClient = { from: () => { throw new Error('boom'); } };
  const result = await evaluateVerifierParity(makeCompleteSd(), throwingClient);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(i => i.startsWith('ENV_NOT_READY')), `issues: ${result.issues.join(' | ')}`);
});

// ── Fail-open: a pure-check error must not crash/false-block precheck ─────────
test('Fail-open: validator returns pass+warning when a pure check throws', async () => {
  const gate = createVerifierParityGate(mockSupabaseOk());
  // sd=null makes validateStrategicDirective throw (it reads sd.sd_type unguarded);
  // the gate must fail-open (advisory precheck; execute is the real enforcer)
  // rather than crash the precheck run.
  const result = await gate.validator({ sd: null, precheckMode: true });
  assert.equal(result.passed, true);
  assert.ok(result.warnings.some(w => /skipped due to error/i.test(w)));
  assert.equal(result.details.errored, true);
});
