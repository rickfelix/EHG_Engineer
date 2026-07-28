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
