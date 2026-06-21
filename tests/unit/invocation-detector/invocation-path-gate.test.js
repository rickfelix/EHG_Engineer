/**
 * SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-C (FR-3) — LEAD-FINAL invocation-path proof gate.
 * Composes the FR-1 detector + FR-2 classifier: BLOCK when autonomous-runnable code ships with
 * no live trigger. Tests the pure evaluation core + the gate shape/opt-out, and asserts the gate
 * is WIRED into the LEAD-FINAL pipeline (else it would be the very inert-gate it fights).
 */
import { describe, it, expect } from 'vitest';
import {
  createInvocationPathGate,
  evaluateInvocationViolations,
} from '../../../scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js';

// A synthetic "live" trigger source set: a cron workflow + matching loop-contract for one script.
const SOURCES = {
  pkgScripts: { 'wired': 'node scripts/clockwork/wired-loop.cjs' },
  workflows: [{
    file: '.github/workflows/wired.yml',
    content: "on:\n  schedule:\n    - cron: '0 * * * *'\njobs:\n  j:\n    steps:\n      - run: npm run wired\n",
  }],
  settings: { hooks: {} },
  loopContracts: [{ id: 'L1', timeline: { cadence: '0 * * * *' }, tasks: [{ task: 'entrypoint', file: 'scripts/clockwork/wired-loop.cjs' }] }],
  parentScripts: [],
};

describe('evaluateInvocationViolations — the FR-1 ∧ FR-2 core', () => {
  it('autonomous + has a live trigger → NO violation', () => {
    const r = evaluateInvocationViolations(['scripts/clockwork/wired-loop.cjs'], SOURCES);
    expect(r.autonomousChecked).toBe(1);
    expect(r.violations).toHaveLength(0);
  });

  it('autonomous (cron dir) + NO live trigger → VIOLATION (the WIRED-TO-FIRE catch)', () => {
    const r = evaluateInvocationViolations(['scripts/cron/orphan-runner.mjs'], SOURCES);
    expect(r.autonomousChecked).toBe(1);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].file).toBe('scripts/cron/orphan-runner.mjs');
  });

  it('a -loop suffix runner with no trigger → VIOLATION', () => {
    const r = evaluateInvocationViolations(['scripts/ghost-sweep-loop.cjs'], SOURCES);
    expect(r.violations).toHaveLength(1);
  });

  it('a NON-autonomous file (library / manual CLI) is skipped, never a violation', () => {
    const r = evaluateInvocationViolations(
      ['lib/some-util.js', 'scripts/print-report.mjs', 'tests/x.test.js'],
      SOURCES,
      () => 'export const a = 1;',
    );
    expect(r.autonomousChecked).toBe(0);
    expect(r.violations).toHaveLength(0);
  });

  it('mixes: only the unwired autonomous file violates', () => {
    const r = evaluateInvocationViolations(
      ['scripts/clockwork/wired-loop.cjs', 'scripts/cron/orphan-runner.mjs', 'lib/helper.js'],
      SOURCES,
      () => 'export const a = 1;',
    );
    expect(r.autonomousChecked).toBe(2);
    expect(r.violations.map((v) => v.file)).toEqual(['scripts/cron/orphan-runner.mjs']);
  });

  it('empty / undefined inputs are safe', () => {
    expect(evaluateInvocationViolations([], SOURCES).violations).toHaveLength(0);
    expect(evaluateInvocationViolations(undefined, undefined).violations).toHaveLength(0);
  });

  // Adversarial HIGH regression: a -loop/-sweep-named PURE LIBRARY under scripts/modules/ (no
  // runnable surface) must NOT be flagged as an autonomous runner (false violation).
  it('a scripts/modules library with a -loop name (no main) is NOT a violation', () => {
    const r = evaluateInvocationViolations(
      ['scripts/modules/prd/rewrite-loop.js', 'scripts/modules/pocock/rca-feedback-loop.js'],
      SOURCES,
      () => 'export function rewrite(){}\nexport const X = 1;', // library: exports only, no main()/argv
    );
    expect(r.autonomousChecked).toBe(0);
    expect(r.violations).toHaveLength(0);
  });
});

describe('createInvocationPathGate — gate shape & opt-out', () => {
  it('returns a required gate with the canonical name + validator', () => {
    const g = createInvocationPathGate(null);
    expect(g.name).toBe('INVOCATION_PATH_PROOF');
    expect(g.required).toBe(true);
    expect(typeof g.validator).toBe('function');
  });

  it('opts out (advisory pass) for a venture target without wiring_required', async () => {
    const g = createInvocationPathGate(null);
    const res = await g.validator({ sd: { target_application: 'rickfelix/ehg', metadata: {} } });
    expect(res.passed).toBe(true);
    expect(res.details.skipped).toBe('venture_opt_out');
  });
});

describe('gate wiring — INVOCATION_PATH_PROOF must be registered in the LEAD-FINAL pipeline', () => {
  it('gates.js exports createInvocationPathGate (it is imported + pushed)', async () => {
    const mod = await import('../../../scripts/modules/handoff/executors/lead-final-approval/gates.js');
    expect(typeof mod.createInvocationPathGate).toBe('function');
    expect(mod.createInvocationPathGate(null).name).toBe('INVOCATION_PATH_PROOF');
  });
});
