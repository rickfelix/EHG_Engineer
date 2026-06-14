/**
 * Unit pins for the venture-intake gate pack G1-G6 (observe-only).
 * SD-LEO-INFRA-VENTURE-INTAKE-GATE-PACK-001 — FR-1/FR-2/FR-4/FR-6.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  evaluateG1, evaluateG2, evaluateG3, evaluateG4, evaluateG5, evaluateG6,
  evaluateIntakeGates, isPackBinding, countCalibrationEligible,
  INTAKE_GATES, INTAKE_GATES_OBSERVE_ONLY, OPTION_B_SHAPES, INTAKE_GATE_BAR_VERSION,
} from '../../../lib/eva/venture-intake-gates.js';

const libRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../lib');

// ── FR-1: per-gate pass + fail, observe-only bar shape, pure/fail-open ──────────
const PASS_FIXTURES = {
  G1: { distribution_channel: 'SEO + cold outbound to RevOps leaders' },
  G2: { pmf_signal: 42 },
  G3: { why_now: 'a regulatory change this quarter opened the lane for the first time' },
  G4: { transactional_validation: true },
  G5: { moat: 'proprietary first-party dataset with a compounding network effect' },
  G6: { monetization_shape: 'subscription' },
};
const FAIL_FIXTURES = {
  G1: {}, G2: { pmf_signal: 'we feel good about it' }, G3: { why_now: 'soon' },
  G4: {}, G5: {}, G6: { monetization_shape: 'one-time hardware sale' },
};
const EVALS = { G1: evaluateG1, G2: evaluateG2, G3: evaluateG3, G4: evaluateG4, G5: evaluateG5, G6: evaluateG6 };

describe('G1-G6 evaluators — observe-only, pass+fail, fail-open (FR-1)', () => {
  for (const gate of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']) {
    it(`${gate}: passes on evidence, fails on absence, always observe_only`, () => {
      const pass = EVALS[gate](PASS_FIXTURES[gate]);
      const fail = EVALS[gate](FAIL_FIXTURES[gate]);
      expect(pass.gate).toBe(gate);
      expect(pass.pass).toBe(true);
      expect(pass.status).toBe('pass');
      expect(fail.pass).toBe(false);
      expect(fail.status).toBe('fail');
      for (const bar of [pass, fail]) {
        expect(bar.observe_only).toBe(true);
        expect(bar.bar_version).toBe(INTAKE_GATE_BAR_VERSION);
      }
    });
  }

  it('is fail-open: a throwing input degrades to unverified, never throws', () => {
    // A getter that throws simulates infrastructure trouble inside an evaluator.
    const hostile = {}; Object.defineProperty(hostile, 'distribution_channel', { get() { throw new Error('boom'); }, enumerable: true });
    const bar = evaluateG1(hostile);
    expect(bar.status).toBe('unverified');
    expect(bar.pass).toBeNull();
  });

  it('G5 rejects a speed-only "moat" as commodity defensibility', () => {
    expect(evaluateG5({ moat: 'faster' }).pass).toBe(false);
    expect(evaluateG5({ moat: 'first-mover' }).pass).toBe(false);
  });

  it('G6 accepts only normalized Option-B shapes', () => {
    expect(evaluateG6({ monetization_shape: 'usage-based' }).pass).toBe(true); // hyphen-insensitive
    expect(evaluateG6({ business_model: 'Marketplace' }).pass).toBe(true); // case-insensitive
    expect(evaluateG6({ monetization_shape: 'ads' }).pass).toBe(false);
    expect(OPTION_B_SHAPES.has('subscription')).toBe(true);
  });
});

// ── FR-2: independent observe-only seam + DORMANT binding trigger ──────────────
describe('observe-only seam + dormant binding (FR-2)', () => {
  it('INTAKE_GATES_OBSERVE_ONLY is true and the pack emits no verdict', () => {
    expect(INTAKE_GATES_OBSERVE_ONLY).toBe(true);
    const r = evaluateIntakeGates(PASS_FIXTURES.G1, { cohortSize: 1 });
    expect(r.verdict).toBeNull();
    expect(r.observe_only).toBe(true);
    expect(r.gates).toHaveLength(6);
  });

  it('DORMANT: forcing isPackBinding true (cohort>=3) STILL emits no blocking verdict while observe-only', () => {
    const r = evaluateIntakeGates(FAIL_FIXTURES.G1, { cohortSize: 5 });
    expect(r.binding_eligible).toBe(true); // cohort seam would allow binding…
    expect(r.verdict).toBeNull(); // …but the observe-only seam keeps it dormant — NO block
  });
});

// ── FR-4: cohort trigger ──────────────────────────────────────────────────────
describe('cohort trigger (FR-4)', () => {
  it('isPackBinding flips at >=3 (n=1/2 observe-only, n=3 eligible)', () => {
    expect(isPackBinding(1)).toBe(false);
    expect(isPackBinding(2)).toBe(false);
    expect(isPackBinding(3)).toBe(true);
    expect(isPackBinding(undefined)).toBe(false);
  });

  it('countCalibrationEligible excludes workflow_scaffold ventures and dedups by id', () => {
    const rows = [
      { id: 'v1', metadata: {} },
      { id: 'v2', metadata: { venture_classification: 'workflow_scaffold' } },
      { id: 'v1', metadata: {} }, // dup
      { id: 'v3', metadata: { venture_classification: 'real' } },
    ];
    expect(countCalibrationEligible(rows)).toBe(2); // v1, v3 (v2 scaffold excluded, v1 dedup)
    expect(countCalibrationEligible([])).toBe(0);
  });
});

// ── FR-6: single-canonical-definition guard ───────────────────────────────────
describe('single-canonical-definition guard (FR-6)', () => {
  it('criterion #4 (G1 Distribution-Channel-First) evaluator is defined EXACTLY once', () => {
    const moduleSrc = readFileSync(resolve(libRoot, 'eva/venture-intake-gates.js'), 'utf8');
    const gateBarsSrc = readFileSync(resolve(libRoot, 'eva/gate-bars.js'), 'utf8');
    const intakeBarSrc = readFileSync(resolve(libRoot, 'discovery/intake-bar.js'), 'utf8');
    const defCount = (s) => (s.match(/(export\s+)?function\s+evaluateG1\b/g) || []).length;
    // The canonical module defines it once; the two composition sites IMPORT it, never redefine.
    expect(defCount(moduleSrc)).toBe(1);
    expect(defCount(gateBarsSrc)).toBe(0);
    expect(defCount(intakeBarSrc)).toBe(0);
    expect(gateBarsSrc).toMatch(/from '\.\/venture-intake-gates\.js'/);
    expect(intakeBarSrc).toMatch(/from '\.\.\/eva\/venture-intake-gates\.js'/);
    // The registry lists each gate once, in order.
    expect(INTAKE_GATES.map((g) => g.gate)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
  });
});
