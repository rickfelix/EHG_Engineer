// SD-FDBK-INFRA-CONTROL-MERGE-WITHOUT-001 — TS-5, the deciding scenario.
//
// Six of this SD's seven scenarios are satisfied by an implementation that merely checks a
// seed-test is PRESENT. Only this one separates a real check from a presence-checker, so it
// is graded STANDALONE pass/fail and never averaged into an aggregate percentage. A build
// that passes six and fails this has not partially succeeded — it has shipped the blind
// implementation the SD exists to prevent.
//
// No DB, no network: pure evaluate() against a committed fixture.
import { describe, it, expect } from 'vitest';
import { evaluate } from '../../../scripts/lint/control-seed-test-lint.mjs';

const BLIND = 'tests/fixtures/control-seed-gate/blind-gauge-lint.mjs';
const onlyBlind = (p) => p === BLIND;

const blindSpec = [{
  name: 'blind-gauge-lint',
  script: BLIND,
  rootFlag: '--root',
  fixtures: [{ path: 'lib/real-defect.js', content: '// a REAL seeded defect the gauge should catch\nexport const bad = true;\n' }]
}];

describe('control-seed-test-lint — TS-5 (deciding scenario)', () => {
  it('REFUSES a deliberately blind gauge that ships a seed-test which cannot fail', () => {
    const failures = evaluate(process.cwd(), [BLIND], blindSpec, onlyBlind);
    expect(failures.some((f) => f.reason === 'SEED_DID_NOT_FIRE')).toBe(true);
  });

  it('catches it via FIRING, not via the declaration string — the presence check is fooled', () => {
    // The fixture deliberately carries "KNOWN LIMITATIONS: none known." — a shrug that
    // satisfies a string match. This asserts the gate does NOT rely on that half, because a
    // declaration check is exactly as blind as the gauge it is inspecting.
    const failures = evaluate(process.cwd(), [BLIND], blindSpec, onlyBlind);
    expect(failures.some((f) => f.reason === 'NO_KNOWN_LIMITATION')).toBe(false);
    expect(failures.some((f) => f.reason === 'SEED_DID_NOT_FIRE')).toBe(true);
  });

  it('FR-2: refuses a new control that ships with no seed-test at all', () => {
    const failures = evaluate(process.cwd(), [BLIND], [], onlyBlind);
    expect(failures.some((f) => f.reason === 'NO_SEED_TEST')).toBe(true);
  });

  it('does not fire on a diff containing no new controls', () => {
    expect(evaluate(process.cwd(), ['README.md'], blindSpec, onlyBlind)).toHaveLength(0);
  });
});
