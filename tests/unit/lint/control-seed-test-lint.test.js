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
import { classifySeedTrial, SEED_TRIAL, runSeedTestTrial } from '../../../scripts/audit/control-seed-test.mjs';

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

// SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001 — FR-6. A CHANGED SEED SPEC MUST RE-TRIAL ITS CONTROL.
//
// The spec file holds the seeded defect itself, so swapping a real fixture for a trivial one is
// as dangerous as neutering the control. It is a .json and the control globs match .mjs/.js/.cjs,
// so it can never be reached by widening a glob — and a PR touching only the spec used to report
// "no new controls in this diff" and exit green, with the workflow having triggered correctly.
const SPEC_PATH = 'scripts/audit/control-seed-specs.json';

describe('FR-6 — a spec-only diff still evaluates the controls that spec names', () => {
  it('[DECIDING] a diff containing ONLY the spec file selects the controls it names', () => {
    const r = evaluate(process.cwd(), [SPEC_PATH], blindSpec, onlyBlind);
    expect(r.specChanged).toBe(true);
    expect(r.selected).toContain(BLIND);
    // It must actually be EVALUATED, not merely listed — a trial ran on it.
    expect(r.trials).toHaveLength(1);
    expect(r.failures.some((f) => f.reason === 'SEED_DID_NOT_FIRE')).toBe(true);
  });

  // MEASURED IN CI (run 30950096609), which is why these exist: the first version re-trialled
  // EVERY control the spec names and surfaced 14 issues across 13 controls, of which ONE
  // belonged to the diff. The cost was never CI time — it was that any PR touching this file
  // inherits the whole corpus's health.
  const OTHER = 'scripts/lint/some-other-control.mjs';
  const twoSpecs = [blindSpec[0], { name: 'other', script: OTHER, fixtures: [{ path: 'x.js', content: 'x\n' }] }];
  const isEither = (p) => p === BLIND || p === OTHER;

  it('[DECIDING] only the control whose spec ENTRY changed is re-trialled', () => {
    // Previous spec differs for the blind gauge only; `other` is byte-identical.
    const prev = [{ ...blindSpec[0], fixtures: [{ path: 'lib/real-defect.js', content: '// WEAKENED\n' }] }, twoSpecs[1]];
    const r = evaluate(process.cwd(), [SPEC_PATH], twoSpecs, isEither, prev);
    expect(r.selected).toContain(BLIND);
    expect(r.selected).not.toContain(OTHER);
    expect(r.specBaseUnavailable).toBe(false);
  });

  it('[CONTROL] an UNCHANGED spec entry drags in nothing, even when the file changed', () => {
    // Without this, `fromSpec` could ignore prevSpecs entirely and the deciding test above
    // would still pass on the strength of the blind gauge alone.
    const r = evaluate(process.cwd(), [SPEC_PATH], twoSpecs, isEither, twoSpecs);
    expect(r.selected).not.toContain(BLIND);
    expect(r.selected).not.toContain(OTHER);
    expect(r.trials).toHaveLength(0);
  });

  it('[CONTROL] an unreadable base falls back to ALL and says so — never to none', () => {
    // The dangerous direction is selecting nothing: an empty evaluation reported as a pass is
    // this SD's entire subject. Fail wide and loud, not narrow and quiet.
    const r = evaluate(process.cwd(), [SPEC_PATH], twoSpecs, isEither, null);
    expect(r.specBaseUnavailable).toBe(true);
    expect(r.selected).toContain(BLIND);
    expect(r.selected).toContain(OTHER);
  });

  it('[CONTROL] an unrelated diff does NOT trigger the expansion', () => {
    // Without this, `specChanged` could be hardcoded true and the deciding test above would
    // still pass while the gate re-trialled the whole corpus on every PR.
    const r = evaluate(process.cwd(), ['README.md'], blindSpec, onlyBlind);
    expect(r.specChanged).toBe(false);
    expect(r.selected).not.toContain(BLIND);
    expect(r.trials).toHaveLength(0);
  });
});

// SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001 — FR-7. THE seedTest FORM MUST REQUIRE AN OBSERVED RED.
//
// These drive the PURE classifier, never runSeedTestTrial. That is not only for speed: this
// very file is the seed-test the trial runs, so a test here that invoked the trial would
// spawn a worktree to run itself. Any spec used below must therefore stay `neuter`-free.
//
// Four of the six cases are CONTROLS, because every one of them is a way this check could
// quietly become a rubber stamp while still reporting a verdict.
describe('FR-7 — an observed RED, and only for the right reason', () => {
  const REAL_RED = 'AssertionError: expected [] to have a length of 1';

  it('[DECIDING] neutered and STILL GREEN is the finding — the test asserts nothing', () => {
    const r = classifySeedTrial({ cleanExit: 0, mutationLanded: true, mutantExit: 0, neuterWhy: 'gate reports no failures' });
    expect(r.verdict).toBe(SEED_TRIAL.CANNOT_FAIL);
    expect(r.code).toBe('SURVIVED');
  });

  it('[DECIDING] green whole, red neutered, on an assertion → PROVEN_RED', () => {
    const r = classifySeedTrial({ cleanExit: 0, mutationLanded: true, mutantExit: 1, mutantOut: REAL_RED });
    expect(r.verdict).toBe(SEED_TRIAL.PROVEN_RED);
  });

  it('[CONTROL] already RED before neutering is never proof — the positive control dominates', () => {
    // The dangerous direction: a mis-wired scratch tree makes the mutant red too, so without
    // this rule the harness is most confident exactly when it is most broken. Note the inputs
    // below would otherwise read as a textbook PROVEN_RED.
    const r = classifySeedTrial({ cleanExit: 1, mutationLanded: true, mutantExit: 1, mutantOut: REAL_RED });
    expect(r.verdict).toBe(SEED_TRIAL.HARNESS_ERROR);
    expect(r.code).toBe('RED_BEFORE_NEUTER');
  });

  it('[CONTROL] a no-op mutation is an ERROR, never CANNOT_FAIL', () => {
    // This fired for real during PLAN: a mutation attempt was a silent no-op and would have
    // been published as a surviving mutant. "Neuter → still green" and "the edit never landed"
    // produce identical observations, so the harness must refuse to score rather than guess.
    const r = classifySeedTrial({ cleanExit: 0, mutationLanded: false, mutantExit: 0 });
    expect(r.verdict).toBe(SEED_TRIAL.HARNESS_ERROR);
    expect(r.code).toBe('MUTATION_NO_OP');
    expect(r.verdict).not.toBe(SEED_TRIAL.CANNOT_FAIL);
  });

  it('[CONTROL] red because the module would not LOAD is not proof of detection', () => {
    // Otherwise the weakest possible neutering — corrupting the file — passes as evidence,
    // and every seedTest control could be certified by making its source unparseable.
    const r = classifySeedTrial({ cleanExit: 0, mutationLanded: true, mutantExit: 1, mutantOut: 'Error: Failed to load url ../../../scripts/lint/x.mjs\nSyntaxError: Unexpected token' });
    expect(r.verdict).toBe(SEED_TRIAL.HARNESS_ERROR);
    expect(r.code).toBe('LOAD_CRASH');
  });

  it('[CONTROL] an unexplained red is refused rather than scored', () => {
    const r = classifySeedTrial({ cleanExit: 0, mutationLanded: true, mutantExit: 1, mutantOut: 'exited with code 1' });
    expect(r.verdict).toBe(SEED_TRIAL.HARNESS_ERROR);
    expect(r.code).toBe('UNEXPLAINED_RED');
  });
});

// SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001 — SECURITY regressions, all live-proved before being fixed.
//
// scripts/audit/control-seed-specs.json IS EDITABLE IN A PULL REQUEST, so every field it carries
// is attacker-authored input to code that writes files and spawns processes. These pin the two
// primitives SECURITY demonstrated against the first US-007 implementation.
//
// All cases return BEFORE any worktree is created, so these are fast and touch nothing.
describe('SECURITY — the spec file is untrusted input', () => {
  const base = { name: 'attack', script: 'scripts/lint/control-seed-test-lint.mjs', seedTest: 'tests/unit/lint/control-seed-test-lint.test.js' };

  it('[DECIDING] SEC-1: a neuter.file outside the control under test is refused', () => {
    // `join(wt, '../../../..')` walked straight out of the trial worktree into the real repo.
    const r = runSeedTestTrial({ ...base, neuter: { file: '../../../../etc/passwd', find: 'x', replace: 'y' } }, process.cwd());
    expect(r.verdict).toBe(SEED_TRIAL.HARNESS_ERROR);
    expect(r.code).toBe('NEUTER_FILE_NOT_SCRIPT');
  });

  it('[DECIDING] SEC-2: an EMPTY find is refused — it prepends rather than replaces', () => {
    // The sharpest edge, and it does not look like one: ''.replace matches at index 0 ALWAYS, so
    // `replace` is written unconditionally AND the mutation-landed check confirms a real change.
    // The harness then re-runs vitest in that same worktree, so the prepended text EXECUTES.
    const r = runSeedTestTrial({ ...base, neuter: { find: '', replace: 'import("child_process")' } }, process.cwd());
    expect(r.verdict).toBe(SEED_TRIAL.HARNESS_ERROR);
    expect(r.code).toBe('NEUTER_FIND_EMPTY');
  });

  it('[CONTROL] a well-formed neuter is NOT refused by these guards', () => {
    // Without this, guards that reject EVERY spec would score a perfect pass on both tests above
    // while disabling the feature entirely. It must fail for some LATER reason, never these two.
    //
    // *** THE DEPENDENCY INJECTION IS LOAD-BEARING, NOT TIDINESS. *** This is the one case that
    // gets PAST the guards, so it would otherwise reach the real body — building a git worktree
    // and running a nested vitest INSIDE this very test file, which is itself the seed-test that
    // trial runs. The first version did exactly that: standalone it passed in ~60s, but under
    // full-suite CI load it blew the 60s timeout and turned the required check red. Caught by the
    // RETRO agent reading the live PR, not by me. Stubbing `exec` makes it fail immediately at
    // the first git call, which is all this test needs — it asserts WHICH refusal did not happen.
    const explode = () => { throw new Error('stubbed: no real worktree in a unit test'); };
    const r = runSeedTestTrial(
      { ...base, neuter: { find: 'genuinely-absent-token-xyz', replace: 'z' } },
      process.cwd(),
      { exec: explode, spawn: explode },
    );
    expect(r.code).not.toBe('NEUTER_FILE_NOT_SCRIPT');
    expect(r.code).not.toBe('NEUTER_FIND_EMPTY');
    expect(r.code).toBe('HARNESS_THREW'); // reached the body, i.e. the guards let it through
  });
});
