import { describe, it, expect, vi } from 'vitest';

// Keep the gate's optional AI validator out of the unit test (no LLM call).
vi.mock('../../scripts/modules/handoff/human-verification-validator.js', () => ({}));

import {
  resolveSmokeTestSteps,
  validateSmokeTestSpecification,
  createSmokeTestSpecificationGate,
} from '../../scripts/modules/handoff/executors/lead-to-plan/gates/smoke-test-specification.js';
import { checkLeadToPlanPrereqs } from '../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

// SD-FDBK-FIX-FIX-SMOKE-TEST-001: the gate reads the TOP-LEVEL
// strategic_directives_v2.smoke_test_steps column; steps stranded in
// metadata.smoke_test_steps must be recovered (fallback + hoist), and every
// failure message must name the column.

const REAL_STEPS = [
  { step_number: 1, instruction: 'Open /chairman/ventures', expected_outcome: 'Venture list renders with live telemetry badges' },
  { step_number: 2, instruction: 'Click the CronGenius row', expected_outcome: 'Detail pane shows stage history' },
  { step_number: 3, instruction: 'Run node scripts/example-probe.js', expected_outcome: 'PROBE_OK printed with a non-zero count' },
];

/** Mock supabase capturing the hoist read+write chain. */
function mockSupabase({ liveTopLevel = null, readError = null, writeError = null } = {}) {
  const calls = { updates: [], filters: [] };
  const chain = (result) => ({
    select: vi.fn().mockReturnThis(),
    update: vi.fn(function (payload) { calls.updates.push(payload); return this; }),
    eq: vi.fn(function (col, val) { calls.filters.push([col, val]); return this; }),
    maybeSingle: vi.fn(async () => result),
  });
  const client = {
    from: vi.fn(() => chain({ data: readError ? null : { smoke_test_steps: liveTopLevel }, error: readError })),
  };
  // update path resolves like supabase-js: awaiting the builder returns {error}
  const origFrom = client.from;
  client.from = vi.fn(() => {
    const c = origFrom();
    // make the update().eq() chain awaitable
    c.eq = vi.fn(function (col, val) {
      calls.filters.push([col, val]);
      const self = this;
      return Object.assign(Object.create(Object.getPrototypeOf(self)), self, {
        eq: c.eq,
        maybeSingle: c.maybeSingle,
        then: (resolve) => resolve({ error: writeError }),
      });
    });
    return c;
  });
  return { client, calls };
}

describe('resolveSmokeTestSteps', () => {
  it('prefers the top-level column', () => {
    const sd = { smoke_test_steps: REAL_STEPS, metadata: { smoke_test_steps: [{ instruction: 'x', expected_outcome: 'y' }] } };
    const { steps, source } = resolveSmokeTestSteps(sd);
    expect(source).toBe('top_level');
    expect(steps).toHaveLength(3);
  });

  it('falls back to metadata.smoke_test_steps when top-level is empty', () => {
    const sd = { smoke_test_steps: null, metadata: { smoke_test_steps: REAL_STEPS } };
    const { steps, source } = resolveSmokeTestSteps(sd);
    expect(source).toBe('metadata');
    expect(steps).toHaveLength(3);
  });

  it('parses string-JSON in both locations; malformed metadata JSON -> none', () => {
    expect(resolveSmokeTestSteps({ smoke_test_steps: JSON.stringify(REAL_STEPS) }).source).toBe('top_level');
    const meta = { smoke_test_steps: null, metadata: { smoke_test_steps: JSON.stringify(REAL_STEPS) } };
    expect(resolveSmokeTestSteps(meta).source).toBe('metadata');
    expect(resolveSmokeTestSteps({ smoke_test_steps: '{not json', metadata: { smoke_test_steps: '[broken' } }).source).toBe('none');
  });
});

describe('validateSmokeTestSpecification — metadata fallback (TS-1, TS-2, TS-3, TS-6)', () => {
  it('TS-1: passes via fallback and hoists into the empty top-level column', async () => {
    const { client, calls } = mockSupabase({ liveTopLevel: null });
    const sd = { sd_type: 'feature', sd_key: 'SD-TEST-001', smoke_test_steps: null, metadata: { smoke_test_steps: REAL_STEPS } };
    const result = await validateSmokeTestSpecification(sd, client);
    expect(result.pass).toBe(true);
    expect(result.details.stepsSource).toBe('metadata');
    expect(result.warnings.join(' ')).toMatch(/auto-hoisted|top-level/i);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].smoke_test_steps).toEqual(REAL_STEPS);
  });

  it('TS-2: passes via fallback without a client (manual-hoist warning, no throw)', async () => {
    const sd = { sd_type: 'feature', sd_key: 'SD-TEST-002', smoke_test_steps: null, metadata: { smoke_test_steps: REAL_STEPS } };
    const result = await validateSmokeTestSpecification(sd);
    expect(result.pass).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/top-level strategic_directives_v2\.smoke_test_steps/);
  });

  it('TS-1b: hoist is skipped when the live top-level column is already populated', async () => {
    const { client, calls } = mockSupabase({ liveTopLevel: REAL_STEPS });
    const sd = { sd_type: 'feature', sd_key: 'SD-TEST-003', smoke_test_steps: null, metadata: { smoke_test_steps: REAL_STEPS } };
    const result = await validateSmokeTestSpecification(sd, client);
    expect(result.pass).toBe(true);
    expect(calls.updates).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/hoist skipped/i);
  });

  it('TS-3: top-level wins — no hoist, no fallback warning', async () => {
    const { client, calls } = mockSupabase({});
    const sd = { sd_type: 'feature', sd_key: 'SD-TEST-004', smoke_test_steps: REAL_STEPS, metadata: { smoke_test_steps: [{ instruction: 'junk', expected_outcome: 'junk' }] } };
    const result = await validateSmokeTestSpecification(sd, client);
    expect(result.pass).toBe(true);
    expect(result.details.stepsSource).toBe('top_level');
    expect(calls.updates).toHaveLength(0);
    expect(result.warnings.join(' ')).not.toMatch(/metadata\.smoke_test_steps/);
  });

  it('TS-6: malformed metadata string-JSON falls through to the zero-steps failure', async () => {
    const sd = { sd_type: 'feature', sd_key: 'SD-TEST-005', smoke_test_steps: null, metadata: { smoke_test_steps: '[broken json' } };
    const result = await validateSmokeTestSpecification(sd);
    expect(result.pass).toBe(false);
  });
});

describe('zero-steps failure names the exact column (TS-4)', () => {
  it('issues and remediation cite top-level and NOT metadata.smoke_test_steps', async () => {
    const sd = { sd_type: 'feature', sd_key: 'SD-TEST-006', smoke_test_steps: null, metadata: {} };
    const result = await validateSmokeTestSpecification(sd);
    expect(result.pass).toBe(false);
    const text = result.issues.join(' ') + ' ' + result.remediation;
    expect(text).toMatch(/top-level strategic_directives_v2\.smoke_test_steps/);
    expect(text).toMatch(/NOT metadata\.smoke_test_steps/);
  });

  it('gate factory remediation names the column location', () => {
    const gate = createSmokeTestSpecificationGate();
    expect(gate.remediation).toMatch(/TOP-LEVEL strategic_directives_v2\.smoke_test_steps/);
    expect(gate.remediation).toMatch(/NOT metadata\.smoke_test_steps/);
  });
});

describe('lightweight skip unchanged (TS-7)', () => {
  it('bugfix-type SD with no steps still skips at 100', async () => {
    const result = await validateSmokeTestSpecification({ sd_type: 'bugfix', smoke_test_steps: null, metadata: {} });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.skipped).toBe(true);
  });
});

describe('prerequisite-preflight SMOKE_TEST_IN_METADATA (TS-5)', () => {
  const baseSd = {
    sd_key: 'SD-TEST-007',
    sd_type: 'feature',
    description: Array(60).fill('word').join(' '),
    success_criteria: [{ criterion: 'c', measure: 'm' }],
    key_changes: [{ change: 'c' }],
    risks: [{ risk: 'r', mitigation: 'm' }],
    strategic_objectives: ['o1'],
    success_metrics: [{ metric: 'm', target: 't' }],
  };

  it('metadata-only steps => SMOKE_TEST_IN_METADATA with a hoist one-liner (not SMOKE_TEST_MISSING)', () => {
    const issues = checkLeadToPlanPrereqs({ ...baseSd, smoke_test_steps: null, metadata: { smoke_test_steps: REAL_STEPS } });
    const codes = issues.map(i => i.code);
    expect(codes).toContain('SMOKE_TEST_IN_METADATA');
    expect(codes).not.toContain('SMOKE_TEST_MISSING');
    const issue = issues.find(i => i.code === 'SMOKE_TEST_IN_METADATA');
    expect(issue.message).toMatch(/TOP-LEVEL strategic_directives_v2\.smoke_test_steps/);
    expect(issue.remediation).toMatch(/SD-TEST-007/);
  });

  it('no steps anywhere => SMOKE_TEST_MISSING naming the top-level column', () => {
    const issues = checkLeadToPlanPrereqs({ ...baseSd, smoke_test_steps: null, metadata: {} });
    const issue = issues.find(i => i.code === 'SMOKE_TEST_MISSING');
    expect(issue).toBeTruthy();
    expect(issue.remediation).toMatch(/TOP-LEVEL strategic_directives_v2\.smoke_test_steps/);
  });

  it('valid top-level steps (including string-JSON) => no smoke issue', () => {
    const a = checkLeadToPlanPrereqs({ ...baseSd, smoke_test_steps: REAL_STEPS, metadata: {} });
    expect(a.find(i => String(i.code).startsWith('SMOKE_TEST_') && i.code !== 'SMOKE_TEST_BYPASSED')).toBeFalsy();
    const b = checkLeadToPlanPrereqs({ ...baseSd, smoke_test_steps: JSON.stringify(REAL_STEPS), metadata: {} });
    expect(b.find(i => String(i.code).startsWith('SMOKE_TEST_') && i.code !== 'SMOKE_TEST_BYPASSED')).toBeFalsy();
  });
});
