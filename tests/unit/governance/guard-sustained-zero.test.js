/**
 * FR-2 — a gate that has never blocked anything is not a passing gate, it is an unplugged one.
 * SD-LEO-INFRA-PURE-GUARD-UNWIRED-001.
 *
 * THE ALARM MUST DISCRIMINATE, and that is most of what these tests are about. An alarm that fires
 * on everything is muted within a week, and a muted alarm is the silence it was built to break. So
 * every firing case here is paired with a case that must NOT fire.
 *
 * THE THIRD STATE IS THE SUBTLE PART. The FR names its own known failure mode: an alarm that cannot
 * SEE blocking events reports diligence as neglect. A guard nobody observed and a guard that
 * observed nothing both present as zero. Collapsing them produces false alarms; so UNKNOWN is a
 * first-class verdict that is neither health nor alarm.
 */
import { describe, it, expect } from 'vitest';
import { classifyGuard, assessGuards, GUARD_HEALTH } from '../../../lib/governance/guard-sustained-zero.js';

describe('SUSPECT — observed, ran, never blocked', () => {
  it('a guard that ran and blocked zero times is SUSPECT, not healthy', () => {
    // AC-1. This is the whole thesis: it ran 27 times, nothing was missing, and it never once
    // blocked — the shape of a predicate whose regex compiled to a backspace character.
    const r = classifyGuard({ guard: 'staleCheck', observations: 27, blocked: 0 }, '7d');
    expect(r.state).toBe(GUARD_HEALTH.SUSPECT);
    expect(r.detail).toContain('staleCheck');
    expect(r.detail).toContain('7d');
    expect(r.detail).toMatch(/unplugged/);
  });

  it('names WHICH input was missing so a consumer need not re-derive it', () => {
    // AC-4. "Something is wrong with waveAlignmentTerm" is not actionable; "it took the no-data
    // branch 12x because `waves` was absent" is.
    const r = classifyGuard({
      guard: 'waveAlignmentTerm', observations: 12, blocked: 0,
      permissiveNoData: 12, missingInput: 'waves',
    }, '7d');
    expect(r.state).toBe(GUARD_HEALTH.SUSPECT);
    expect(r.missingInput).toBe('waves');
    expect(r.detail).toContain("'waves'");
    expect(r.detail).toContain('12x');
  });
});

describe('HEALTHY — the negative control, so the alarm is proven to discriminate', () => {
  it('a guard that HAS blocked in the window is healthy', () => {
    // AC-2, and load-bearing: without it, "everything is suspect" would satisfy every assertion
    // above while making the alarm worthless.
    const r = classifyGuard({ guard: 'realGate', observations: 40, blocked: 3 }, '7d');
    expect(r.state).toBe(GUARD_HEALTH.HEALTHY);
    expect(r.detail).toContain('3/40');
  });

  it('a single block in a large window is still healthy — it demonstrably CAN block', () => {
    // The claim is about capability, not frequency. A rarely-triggered gate is not a broken one.
    expect(classifyGuard({ guard: 'g', observations: 1000, blocked: 1 }).state).toBe(GUARD_HEALTH.HEALTHY);
  });
});

describe('UNKNOWN — the state that stops diligence being reported as neglect', () => {
  it('no observation record is UNKNOWN, not suspect and not healthy', () => {
    // AC-3. If this collapsed into SUSPECT, every unmeasured guard would raise a false alarm and
    // the whole report would be muted. If it collapsed into HEALTHY, the silence returns.
    for (const rec of [{ guard: 'g' }, { guard: 'g', observations: null, blocked: null }]) {
      const r = classifyGuard(rec, '7d');
      expect(r.state).toBe(GUARD_HEALTH.UNKNOWN);
      expect(r.detail).toMatch(/NOT MEASURED/);
      expect(r.detail).toMatch(/NOT health/);
    }
  });

  it('OBSERVED-ZERO-TIMES is UNKNOWN and says so distinctly from never-measured', () => {
    // AC-3's sharp edge: "we watched and it never ran" is a different fact from "we never watched",
    // and both differ from "it ran and never blocked". Three facts, three renderings.
    const r = classifyGuard({ guard: 'g', observations: 0, blocked: 0 }, '7d');
    expect(r.state).toBe(GUARD_HEALTH.UNKNOWN);
    expect(r.detail).toMatch(/OBSERVED 0 times/);
    expect(r.detail).not.toMatch(/NOT MEASURED/);
  });

  it('THE DISCRIMINATION — measured-zero-blocks and unmeasured render differently', () => {
    const suspect = classifyGuard({ guard: 'g', observations: 5, blocked: 0 }, '7d');
    const unknown = classifyGuard({ guard: 'g', observations: null, blocked: null }, '7d');
    expect(suspect.state).not.toBe(unknown.state);
    expect(suspect.detail).not.toBe(unknown.detail);
  });
});

describe('AC-4 — FR-2 consumes FR-3: an INERT zero is not a QUIET zero', () => {
  it('a zero from a predicate PROVEN unable to block reports INERT, not SUSPECT', () => {
    // The distinction changes what an operator does. SUSPECT means "go find out why this never
    // fired". INERT means "it could not have fired; fix the predicate" — a different, shorter job.
    const r = classifyGuard({
      guard: 'blockPattern', observations: 27, blocked: 0,
      selfTest: { capable: false, missingVerdict: 'blocking' },
    }, '7d');
    expect(r.state).toBe(GUARD_HEALTH.INERT);
    expect(r.detail).toMatch(/cannot produce its blocking verdict/);
    expect(r.detail).toMatch(/could not have blocked/);
  });

  it('NEGATIVE CONTROL — the same zero with a CAPABLE predicate stays SUSPECT', () => {
    // Without this, everything with a selfTest field would read as INERT and the pairing would
    // explain away every genuine sustained zero — worse than not pairing at all.
    const r = classifyGuard({
      guard: 'blockPattern', observations: 27, blocked: 0,
      selfTest: { capable: true, missingVerdict: null },
    }, '7d');
    expect(r.state).toBe(GUARD_HEALTH.SUSPECT);
  });

  it('no self-test at all leaves the verdict SUSPECT — absence is not exoneration', () => {
    const r = classifyGuard({ guard: 'g', observations: 27, blocked: 0 }, '7d');
    expect(r.state).toBe(GUARD_HEALTH.SUSPECT);
  });

  it('a capable predicate that DID block is still healthy — the self-test does not override facts', () => {
    const r = classifyGuard({
      guard: 'g', observations: 10, blocked: 2, selfTest: { capable: false },
    }, '7d');
    expect(r.state).toBe(GUARD_HEALTH.HEALTHY);
  });
});

describe('the report emits every guard, zeros included', () => {
  it('counts are unconditional — a counter that appears only when non-zero recreates the ambiguity', () => {
    // The lesson carried from worker-signal-starvation.cjs: `promoted=0` omitted reads identically
    // to "nothing needs attention", which is how the original starvation stayed invisible.
    const a = assessGuards([
      { guard: 'healthy1', observations: 10, blocked: 2 },
      { guard: 'suspect1', observations: 10, blocked: 0 },
      { guard: 'unknown1' },
    ], '7d');
    expect(a.summary).toBe('GUARD SUSTAINED-ZERO (7d): healthy=1 suspect=1 inert=0 unknown=1');
    expect(a.results).toHaveLength(3);
  });

  it('an all-healthy population still prints its zeros', () => {
    const a = assessGuards([{ guard: 'g', observations: 5, blocked: 1 }], '7d');
    expect(a.summary).toContain('suspect=0');
    expect(a.summary).toContain('unknown=0');
  });

  it('an empty population is not an error and not a pass', () => {
    const a = assessGuards([], '7d');
    expect(a.results).toEqual([]);
    expect(a.summary).toContain('healthy=0');
  });
});

describe('malformed input degrades to UNKNOWN rather than to health', () => {
  it('non-numeric counts are unmeasured, never optimistic', () => {
    // The direction matters: coercing junk to 0 would make a broken feed indistinguishable from a
    // guard that ran and passed — the permissive answer, which is this SD's entire subject.
    for (const bad of ['5', NaN, {}, [], true, -0.5 / 0]) {
      expect(classifyGuard({ guard: 'g', observations: bad, blocked: 0 }).state).toBe(GUARD_HEALTH.UNKNOWN);
      expect(classifyGuard({ guard: 'g', observations: 5, blocked: bad }).state).toBe(GUARD_HEALTH.UNKNOWN);
    }
  });

  it('a guard with no name still reports rather than vanishing', () => {
    expect(classifyGuard({ observations: 5, blocked: 0 }).guard).toBe('(unnamed)');
  });
});
