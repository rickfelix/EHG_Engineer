/**
 * FR-3 — a check that has never been shown to fail cannot be cited.
 * SD-LEO-INFRA-PURE-GUARD-UNWIRED-001.
 *
 * THE FIXTURE IS THE POINT. AC-1 asks for a DELIBERATELY INERT predicate, so the inert case here
 * is the real thing rather than a stand-in: a regex mangled to a BACKSPACE character, exactly as it
 * happened. It ran, it never threw, it answered honestly, and it reported 0/3 for 27 consecutive
 * passes while the underlying state changed — because "no match" is the permissive answer and the
 * permissive answer reads as health.
 */
import { describe, it, expect } from 'vitest';
import { selfTestPredicate, selfTestAll, VERDICT_KIND } from '../../../lib/governance/predicate-self-test.js';

/** The actual defect: a pattern intended as \b that became a literal backspace (\x08). */
const MANGLED = new RegExp('\x08lock\x08');
const inertPredicate = (s) => MANGLED.test(String(s));

/** What it was meant to be. */
const healthyPredicate = (s) => /\block\b/.test(String(s));

describe('AC-1 — a predicate that cannot block is REJECTED', () => {
  it('the mangled-regex predicate fails the self-test', () => {
    const r = selfTestPredicate({
      name: 'blockPattern',
      predicate: inertPredicate,
      blockingInput: 'this line contains lock and must match',
      passingInput: 'nothing here',
    });
    expect(r.capable).toBe(false);
    expect(r.missingVerdict).toBe(VERDICT_KIND.BLOCKING);
  });

  it('AC-3 — the message says WHICH verdict could not be produced', () => {
    const r = selfTestPredicate({
      name: 'blockPattern', predicate: inertPredicate,
      blockingInput: 'contains lock', passingInput: 'clean',
    });
    expect(r.detail).toMatch(/BLOCKING verdict/);
    expect(r.detail).toContain('blockPattern');
    expect(r.detail).toMatch(/permissive answer/);
  });
});

describe('AC-2 — a healthy predicate passes unmodified', () => {
  it('the intended regex demonstrates both verdicts', () => {
    // Load-bearing: without it, "everything is incapable" would satisfy AC-1 while rejecting every
    // working predicate in the codebase — the mirror failure, and just as useless.
    const r = selfTestPredicate({
      name: 'blockPattern', predicate: healthyPredicate,
      blockingInput: 'this line contains lock and must match',
      passingInput: 'nothing here',
    });
    expect(r.capable).toBe(true);
    expect(r.produced).toEqual({ blocking: true, passing: true });
  });
});

describe('the other ways a predicate can be uncitable', () => {
  it('one that blocks EVERYTHING is rejected too', () => {
    // The mirror of instance 5. Its blocks are as meaningless as the other's passes.
    const r = selfTestPredicate({ name: 'always', predicate: () => true, blockingInput: 'x', passingInput: 'y' });
    expect(r.capable).toBe(false);
    expect(r.missingVerdict).toBe(VERDICT_KIND.PASSING);
    expect(r.detail).toMatch(/blocks unconditionally/);
  });

  it('one that answers the SAME thing to everything is rejected', () => {
    // My first expectation here was 'both', and it was wrong: a constant non-boolean reads as
    // "not blocking" under the default reader, so the verdict it cannot produce is BLOCKING —
    // the same finding as instance 5, arrived at a different way.
    const r = selfTestPredicate({ name: 'mush', predicate: () => 'maybe', blockingInput: 'x', passingInput: 'y' });
    expect(r.capable).toBe(false);
    expect(r.missingVerdict).toBe(VERDICT_KIND.BLOCKING);
  });

  it('a THROWING predicate is a finding, not a pass', () => {
    // Absorbing the throw into a pass would be this SD's defect inside its own remedy.
    const r = selfTestPredicate({
      name: 'boom', predicate: () => { throw new Error('bad input'); },
      blockingInput: 'x', passingInput: 'y',
    });
    expect(r.capable).toBe(false);
    expect(r.threw).toMatch(/bad input/);
    expect(r.detail).toMatch(/THREW/);
  });

  it('NO predicate at all is not a pass', () => {
    const r = selfTestPredicate({ name: 'missing' });
    expect(r.capable).toBe(false);
    expect(r.detail).toMatch(/NOT the same as passing/);
  });

  it('never throws, whatever it is handed', () => {
    for (const bad of [undefined, null, {}, { predicate: 42 }, { predicate: () => undefined }]) {
      expect(() => selfTestPredicate(bad)).not.toThrow();
    }
  });
});

describe('THE OBJECT ARM — the shape real gate predicates actually return', () => {
  // Every fixture above uses a bare boolean or a string, so deleting the entire object-reading arm
  // of the default reader survived the suite. That arm is the LIVE one: this module is scoped to
  // predicates feeding gates, alarms and handoff evidence, and those return verdict objects. Losing
  // it would read `{blocked:true}` as PASSING and declare a working gate incapable of blocking —
  // a false alarm, which is how an alarm gets muted.
  const cases = [
    ['blocked flag', { blocked: true }, { blocked: false }],
    ['ok flag', { ok: false }, { ok: true }],
    ['verdict string', { verdict: 'fail' }, { verdict: 'pass' }],
    ['verdict block', { verdict: 'block' }, { verdict: 'allow' }],
  ];
  for (const [label, blockingResult, passingResult] of cases) {
    it(`reads a ${label} verdict object as blocking`, () => {
      const r = selfTestPredicate({
        name: label,
        predicate: (s) => (s === 'bad' ? blockingResult : passingResult),
        blockingInput: 'bad', passingInput: 'good',
      });
      expect(r.capable).toBe(true);
      expect(r.produced).toEqual({ blocking: true, passing: true });
    });
  }

  it('an INHERITED blocked flag does not count as a produced verdict', () => {
    // Otherwise a polluted prototype certifies any predicate as discriminating.
    Object.prototype.blocked = true;   // eslint-disable-line no-extend-native
    try {
      const r = selfTestPredicate({ name: 'p', predicate: () => ({}), blockingInput: 'x', passingInput: 'y' });
      expect(r.capable).toBe(false);
      expect(r.missingVerdict).toBe(VERDICT_KIND.BLOCKING);
    } finally {
      delete Object.prototype.blocked;
    }
  });
});

describe('it really never throws, and never quietly certifies', () => {
  it('an INHERITED predicate is not a supplied one', () => {
    Object.prototype.predicate = (s) => s === 'x';   // eslint-disable-line no-extend-native
    try {
      const r = selfTestPredicate({ name: 'missing' });
      expect(r.capable).toBe(false);
      expect(r.detail).toMatch(/NOT the same as passing/);
    } finally {
      delete Object.prototype.predicate;
    }
  });

  it('a throw that is not an Error still reports, rather than escaping', () => {
    // `String(Object.create(null))` itself throws, so the error-formatting path was the escape.
    for (const thrown of [Object.create(null), { get message() { throw new Error('nested'); } }, 'plain string', 42, null]) {
      const r = selfTestPredicate({
        name: 'boom', predicate: () => { throw thrown; }, blockingInput: 'x', passingInput: 'y',
      });
      expect(r.capable).toBe(false);
      expect(typeof r.threw).toBe('string');
    }
  });

  it('a spec whose fields are booby-trapped getters cannot escape', () => {
    const hostile = { get name() { throw new Error('name'); }, predicate: () => true };
    expect(() => selfTestPredicate(hostile)).not.toThrow();
  });

  it('an ASYNC predicate is reported as unjudgeable — not as passing, and without killing the run', () => {
    // The worst of the set: a returned Promise is an object with no `.blocked`, so it read as the
    // PASSING verdict; and with nothing attached to catch it, an async-throwing predicate returned
    // {capable:false, threw:null} and then took the whole process down at the microtask checkpoint
    // — inside a module whose docblock promises it never throws.
    const r = selfTestPredicate({
      name: 'asyncGate',
      predicate: async () => { throw new Error('boom'); },
      blockingInput: 'x', passingInput: 'y',
    });
    expect(r.capable).toBe(false);
    expect(r.asyncResult).toBe(true);
    expect(r.produced.passing).toBe(false);   // an unjudged result is NOT the passing verdict
    expect(r.detail).toMatch(/PROMISE/);
  });

  it('a getter-swapped predicate cannot assemble a citation from two different functions', () => {
    // TOCTOU: spec.predicate was read three times, so a getter could hand over a blocking-only
    // predicate and then a passing-only one and the PAIR would certify as "demonstrated BOTH".
    let n = 0;
    const spec = {
      name: 'swapper',
      get predicate() { n += 1; return n >= 2 ? () => false : () => true; },
      blockingInput: 'x', passingInput: 'y',
    };
    const r = selfTestPredicate(spec);
    expect(r.capable).toBe(false);
  });
});

describe('the suite reports unconditionally', () => {
  it('counts capable and incapable, zeros included', () => {
    const a = selfTestAll([
      { name: 'good', predicate: healthyPredicate, blockingInput: 'has lock', passingInput: 'clean' },
      { name: 'bad', predicate: inertPredicate, blockingInput: 'has lock', passingInput: 'clean' },
    ]);
    expect(a.summary).toBe('PREDICATE SELF-TEST: capable=1 incapable=1');
    expect(a.incapable.map((r) => r.name)).toEqual(['bad']);
  });

  it('an all-healthy suite still prints incapable=0', () => {
    const a = selfTestAll([{ name: 'good', predicate: healthyPredicate, blockingInput: 'has lock', passingInput: 'clean' }]);
    expect(a.summary).toContain('incapable=0');
  });
});
