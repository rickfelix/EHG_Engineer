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
    const { failures } = evaluate(process.cwd(), [BLIND], blindSpec, onlyBlind);
    expect(failures.some((f) => f.reason === 'SEED_DID_NOT_FIRE')).toBe(true);
  });

  it('catches it via FIRING, not via the declaration string — the presence check is fooled', () => {
    // The fixture deliberately carries "KNOWN LIMITATIONS: none known." — a shrug that
    // satisfies a string match. This asserts the gate does NOT rely on that half, because a
    // declaration check is exactly as blind as the gauge it is inspecting.
    const { failures } = evaluate(process.cwd(), [BLIND], blindSpec, onlyBlind);
    expect(failures.some((f) => f.reason === 'NO_KNOWN_LIMITATION')).toBe(false);
    expect(failures.some((f) => f.reason === 'SEED_DID_NOT_FIRE')).toBe(true);
  });

  it('FR-2: refuses a new control that ships with no seed-test at all', () => {
    const { failures } = evaluate(process.cwd(), [BLIND], [], onlyBlind);
    expect(failures.some((f) => f.reason === 'NO_SEED_TEST')).toBe(true);
  });

  it('does not fire on a diff containing no new controls', () => {
    expect(evaluate(process.cwd(), ['README.md'], blindSpec, onlyBlind).failures).toHaveLength(0);
  });
});

// SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001 — FR-8. THE ACCEPTANCE METRIC.
//
// The count of controls a trial ACTUALLY RAN on is the thing this SD asserts. The obvious
// implementation is `trialsRun: matched`, and it would pass every test above, because in each
// of those scenarios the two numbers happen to be equal. That is an IDENTITY-PRESERVING
// MUTANT: it satisfies the letter of the metric while measuring nothing.
//
// So the deciding case here is one where they MUST DIVERGE. A seedTest spec is MATCHED by the
// diff and then `continue`s past runTrial entirely — matched 1, trialsRun 0. A test suite
// without this case cannot tell the real count from the alias.
describe('FR-8 — trialsRun is a real count, not an alias of matched', () => {
  const SEEDTEST_SPEC = [{
    name: 'blind-gauge-lint',
    script: BLIND,
    seedTest: 'tests/unit/lint/does-not-need-to-exist.test.js',
  }];

  it('[DECIDING] a matched-but-never-trialled control makes matched != trialsRun', () => {
    const { trials, skipped } = evaluate(process.cwd(), [BLIND], SEEDTEST_SPEC, onlyBlind);
    // matched is 1 (the diff selected it) but NO trial ran — the seedTest form skips runTrial.
    expect(trials).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].file).toBe(BLIND);
    // If trialsRun were aliased to matched this would read 1 and the assertion would fail.
    expect(trials.length).not.toBe(1);
  });

  it('a control that IS trialled is recorded with its verdict', () => {
    const { trials, skipped } = evaluate(process.cwd(), [BLIND], blindSpec, onlyBlind);
    expect(trials).toHaveLength(1);
    expect(trials[0].file).toBe(BLIND);
    expect(trials[0].verdict).toBeTruthy();
    expect(skipped).toHaveLength(0);
  });

  it('[CONTROL] a diff with no controls yields zero of everything — not undefined', () => {
    // Guards the no-controls path, which previously returned before emitting any count at all.
    const r = evaluate(process.cwd(), ['README.md'], blindSpec, onlyBlind);
    expect(r.failures).toHaveLength(0);
    expect(r.trials).toHaveLength(0);
    expect(r.skipped).toHaveLength(0);
  });
});
