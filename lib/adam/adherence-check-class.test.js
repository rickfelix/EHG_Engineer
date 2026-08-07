/**
 * FR-2: a verdict must declare WHICH KIND OF GREEN it is.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001.
 *
 * THE ORIGINATING INCIDENT. A role-session adherence review returned CLEAN on the night of a
 * self-reported execution breach. Its green was honest and IRRELEVANT: it had only ever checked
 * that duties were LISTED, never that behaviour complied. A duty-green and a conduct-green render
 * identically, and the weaker one is the one that reassures.
 *
 * WHY THESE ASSERT ON THE PERSISTED FIELD, not on console output: a distinction that lives only in
 * a log line cannot be interrogated by whoever reads the row six weeks later, which is exactly when
 * it matters. Console prose would satisfy the requirement's wording and defeat its purpose.
 */
import { describe, it, expect } from 'vitest';
import {
  CHECK_CLASS, ADHERENCE_PROBES, probeSourcingCadence, bar,
} from './adherence-probes.js';

describe('every probe declares its class on the verdict itself', () => {
  it('all eight probes emit a valid check_class', () => {
    // Adam's probes all read live behaviour facts, so all eight are CONDUCT claims. If a future
    // probe is added that only checks wiring, it must say so rather than inherit this.
    for (const probe of ADHERENCE_PROBES) {
      const v = probe({});
      expect(Object.values(CHECK_CLASS)).toContain(v.check_class);
    }
  });

  it('the class survives on both the pass and the fail branch', () => {
    // A label that only appears on one branch is worse than none: the green is the branch that
    // needs interrogating.
    const pass = probeSourcingCadence({ sourcedInWindow: 3, windowDays: 1 });
    const fail = probeSourcingCadence({ sourcedInWindow: 0, windowDays: 1 });
    expect(pass.verdict).toBe('pass');
    expect(fail.verdict).toBe('fail');
    expect(pass.check_class).toBe(CHECK_CLASS.CONDUCT);
    expect(fail.check_class).toBe(CHECK_CLASS.CONDUCT);
  });

  it('an UNKNOWN verdict is still classed — a missing measurement is not a missing claim type', () => {
    const unknown = probeSourcingCadence({});
    expect(unknown.verdict).toBe('unknown');
    expect(unknown.check_class).toBe(CHECK_CLASS.CONDUCT);
  });
});

describe('THE REFUSAL — silence is never resolved into a claim', () => {
  it('an unlabelled verdict THROWS rather than defaulting', () => {
    // Neither default is safe. 'conduct' inflates every unlabelled claim; 'duty' deflates it and
    // systematically understates conduct coverage — the mirror image of the inflated denominator
    // FR-1 fixes. So the code refuses to guess.
    //
    // It throws HERE, at probe construction, and not at the DB writer: recordAdherence is
    // fail-open (warns, returns null), so a throw there would become a MISSING ROW — silent
    // coverage loss, this SD's own defect. Probes run outside that catch.
    //
    // `bar` is exported SOLELY so this refusal is reachable. Asserting only that the CHECK_CLASS
    // constant set is closed would have left the guard itself untested — a test that cannot see
    // its subject, in the SD about tests that cannot see their subject.
    for (const bad of [undefined, null, '', 'conduct ', 'CONDUCT', 'wiring', 0, {}]) {
      expect(() => bar('p', 'd', 'pass', 'x', bad), `accepted ${JSON.stringify(bad)}`).toThrow(/check_class/);
    }
  });

  it('NEGATIVE CONTROL — a VALID class does not throw', () => {
    // Without this, "throws on everything" would also pass, and the guard would block all probes.
    expect(() => bar('p', 'd', 'pass', 'x', CHECK_CLASS.CONDUCT)).not.toThrow();
    expect(() => bar('p', 'd', 'pass', 'x', CHECK_CLASS.DUTY)).not.toThrow();
    expect(bar('p', 'd', 'pass', 'x', CHECK_CLASS.DUTY).check_class).toBe('duty');
  });

  it('NEGATIVE CONTROL — a duty-class value is expressible, so the field is not a constant', () => {
    // Without this, "check_class === conduct" everywhere would also pass on an implementation that
    // hardcoded the string and could never represent the other kind of green.
    expect(CHECK_CLASS.DUTY).toBe('duty');
    expect(CHECK_CLASS.DUTY).not.toBe(CHECK_CLASS.CONDUCT);
  });
});

describe('the two greens are distinguishable by the row alone', () => {
  it('a conduct pass and a hypothetical duty pass differ in a queryable field, not in prose', () => {
    const conductPass = probeSourcingCadence({ sourcedInWindow: 1, windowDays: 1 });
    const dutyPass = { ...conductPass, check_class: CHECK_CLASS.DUTY };
    // Same verdict, same shape — the ONLY discriminator is the persisted field. That is the point.
    expect(conductPass.verdict).toBe(dutyPass.verdict);
    expect(conductPass.check_class).not.toBe(dutyPass.check_class);
  });
});
