/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-F — fw3-abstraction-rubric unit suite.
 * Covers PRD TS-1..TS-8 + TESTING-agent PLAN-gap closures (row cfd65a13):
 *   TS-9  — multiple pick-signals simultaneously -> matched_signals holds ALL, not first-only.
 *   TS-10 — structured add_leaf signal with NO text fields at all -> instrument, no throw.
 *   TS-11 — word-boundary negative (keyword-as-substring must NOT false-positive).
 *   TS-3 split — re_root and re_partition tested independently (not conflated).
 *   TS-13 — an unrecognized sd_tree_effect value is NOT treated as add_leaf (strict ===).
 *   TS-14 — structured-false suppresses a co-occurring text match for that axis.
 *   CLI hardening — malformed --json still exits 0; --file @path variant covered.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import {
  computeFramingClass,
  stampFramingClass,
  explainFramingClass,
  evaluateCrossSystemAxis,
  evaluateSelfReversalAxis,
  evaluateNegativeSpaceAxis,
  evaluateCmvDriftAxis,
} from './fw3-abstraction-rubric.cjs';

const CLI = resolve(__dirname, '..', '..', 'scripts', 'fw3-abstraction-rubric.cjs');

describe('computeFramingClass — FR-1 fail-closed classifier', () => {
  it('TS-1: explicit add_leaf attestation with no other signal -> instrument', () => {
    const r = computeFramingClass({ sd_tree_effect: 'add_leaf' });
    expect(r.framing_class).toBe('instrument');
    expect(r.matched_signals).toEqual([]);
  });

  it('TS-2: empty candidate -> pick (fail-closed default)', () => {
    expect(computeFramingClass({}).framing_class).toBe('pick');
    expect(computeFramingClass(undefined).framing_class).toBe('pick');
    expect(computeFramingClass(null).framing_class).toBe('pick');
  });

  it('TS-3a: structural re_root alone -> pick', () => {
    const r = computeFramingClass({ sd_tree_effect: 're_root' });
    expect(r.framing_class).toBe('pick');
    expect(r.matched_signals).toContain('structural:re_root');
  });

  it('TS-3b: structural re_partition alone -> pick', () => {
    const r = computeFramingClass({ sd_tree_effect: 're_partition' });
    expect(r.framing_class).toBe('pick');
    expect(r.matched_signals).toContain('structural:re_partition');
  });

  it('TS-6: add_leaf claim plus a pick-signal simultaneously -> pick dominates', () => {
    const r = computeFramingClass({ sd_tree_effect: 'add_leaf', cmv_drift: true });
    expect(r.framing_class).toBe('pick');
    expect(r.matched_signals).toContain('cmv_drift');
  });

  it('TS-9: two distinct pick-signals fire simultaneously -> matched_signals holds BOTH', () => {
    const r = computeFramingClass({ self_reversal: true, cmv_drift: true });
    expect(r.framing_class).toBe('pick');
    expect(r.matched_signals).toEqual(expect.arrayContaining(['self_reversal', 'cmv_drift']));
    expect(r.matched_signals).toHaveLength(2);
  });

  it('SEC-FW3-02: a numeric-string cross_system_count is coerced, not silently skipped', () => {
    // A count arriving as "5" (string) must still fire the recurrence signal -- a type-mismatch
    // must never let a genuinely cross-system-recurring PICK misclassify as INSTRUMENT.
    const r = computeFramingClass({ sd_tree_effect: 'add_leaf', cross_system_count: '5' });
    expect(r.framing_class).toBe('pick');
    expect(r.matched_signals).toContain('cross_system_recurrence');
  });

  it('TS-10: structured add_leaf field with zero text fields at all -> instrument, no throw', () => {
    expect(() => computeFramingClass({ sd_tree_effect: 'add_leaf' })).not.toThrow();
    const r = computeFramingClass({ sd_tree_effect: 'add_leaf' });
    expect(r.framing_class).toBe('instrument');
  });

  it('TS-13: an unrecognized sd_tree_effect value is not treated as add_leaf', () => {
    const r = computeFramingClass({ sd_tree_effect: 'something_else' });
    expect(r.framing_class).toBe('pick'); // fail-closed default, strict === 'add_leaf' required
  });

  it('framing_class values match the design doc §6(c) wire contract exactly', () => {
    expect(['instrument', 'pick']).toContain(computeFramingClass({ sd_tree_effect: 'add_leaf' }).framing_class);
    expect(['instrument', 'pick']).toContain(computeFramingClass({}).framing_class);
  });
});

describe('the 4 collapsed abstraction axes — FR-2', () => {
  const axes = [
    { name: 'cross_system_recurrence', evaluate: evaluateCrossSystemAxis, structuredField: 'cross_system_count', structuredTrueVal: 2, structuredFalseVal: 0, keyword: 'systemic' },
    { name: 'self_reversal', evaluate: evaluateSelfReversalAxis, structuredField: 'self_reversal', structuredTrueVal: true, structuredFalseVal: false, keyword: 'walk back' },
    { name: 'negative_space', evaluate: evaluateNegativeSpaceAxis, structuredField: 'negative_space', structuredTrueVal: true, structuredFalseVal: false, keyword: 'never built' },
    { name: 'cmv_drift', evaluate: evaluateCmvDriftAxis, structuredField: 'cmv_drift', structuredTrueVal: true, structuredFalseVal: false, keyword: 'off-thesis' },
  ];

  for (const axis of axes) {
    describe(axis.name, () => {
      it('TS-4: fires via explicit structured field', () => {
        const candidate = { [axis.structuredField]: axis.structuredTrueVal };
        expect(axis.evaluate(candidate, '').fired).toBe(true);
      });

      it('TS-5: fires via free-text keyword match (case-insensitive)', () => {
        const text = `some context mentioning ${axis.keyword} in the framing`.toLowerCase();
        expect(axis.evaluate({}, text).fired).toBe(true);
        const upper = text.toUpperCase();
        expect(axis.evaluate({}, upper).fired).toBe(true);
      });

      it('no signal at all -> does not fire', () => {
        expect(axis.evaluate({}, 'unrelated framing text with no signal words').fired).toBe(false);
      });

      it('TS-14: explicit structured-false suppresses a co-occurring text match', () => {
        const candidate = { [axis.structuredField]: axis.structuredFalseVal };
        const text = `some context mentioning ${axis.keyword} in the framing`.toLowerCase();
        expect(axis.evaluate(candidate, text).fired).toBe(false);
      });
    });
  }

  it('TS-11: keyword-as-substring-of-a-larger-word does not false-positive (word-boundary)', () => {
    // "recurring" is a genuine substring of "nonrecurringissue" with no boundary before it.
    const r1 = evaluateCrossSystemAxis({}, 'this is a nonrecurringissue with no real signal');
    expect(r1.fired).toBe(false);
    // "systemic" as a substring of "systemically" (extra trailing word chars) must not match.
    const r2 = evaluateCrossSystemAxis({}, 'handled systemically but not flagged as systemic recurrence... actually just prose');
    // the second half DOES contain the standalone word "systemic" — sanity-check the positive case too
    expect(r2.fired).toBe(true);
    const r3 = evaluateCrossSystemAxis({}, 'handled systemically only, nothing else');
    expect(r3.fired).toBe(false);
  });
});

describe('stampFramingClass / explainFramingClass — FR-3 convenience helpers', () => {
  it('stampFramingClass returns exactly {framing_class} with no extra keys', () => {
    const r = stampFramingClass({ sd_tree_effect: 'add_leaf' });
    expect(Object.keys(r)).toEqual(['framing_class']);
    expect(r.framing_class).toBe('instrument');
  });

  it('explainFramingClass is deterministic and names every matched signal on a pick verdict', () => {
    const candidate = { self_reversal: true, cmv_drift: true };
    const a = explainFramingClass(candidate);
    const b = explainFramingClass(candidate);
    expect(a).toBe(b);
    expect(a).toContain('self_reversal');
    expect(a).toContain('cmv_drift');
  });

  it('explainFramingClass never throws on malformed/partial input', () => {
    expect(() => explainFramingClass(null)).not.toThrow();
    expect(() => explainFramingClass(undefined)).not.toThrow();
    expect(() => explainFramingClass('not-an-object')).not.toThrow();
    expect(() => explainFramingClass(42)).not.toThrow();
    expect(typeof explainFramingClass(null)).toBe('string');
  });
});

describe('CLI (scripts/fw3-abstraction-rubric.cjs) — FR-4', () => {
  it('TS-8a: --json instrument candidate prints an INSTRUMENT verdict and exits 0', () => {
    const out = execFileSync('node', [CLI, '--json', '{"sd_tree_effect":"add_leaf"}'], { encoding: 'utf8' });
    expect(out).toContain('INSTRUMENT');
  });

  it('TS-8b: --json pick candidate prints a PICK verdict naming the matched signal and exits 0', () => {
    const out = execFileSync('node', [CLI, '--json', '{"cmv_drift":true}'], { encoding: 'utf8' });
    expect(out).toContain('PICK');
    expect(out).toContain('cmv_drift');
  });

  it('malformed --json still exits 0 with a fail-soft message (never throws to the shell)', () => {
    const out = execFileSync('node', [CLI, '--json', '{not valid json'], { encoding: 'utf8' });
    expect(out).toContain('fail-soft');
  });

  it('--file @path variant reads a candidate from disk', () => {
    const tmpPath = resolve(__dirname, '.tmp-fw3-rubric-cli-test-candidate.json');
    writeFileSync(tmpPath, JSON.stringify({ sd_tree_effect: 'add_leaf' }));
    try {
      const out = execFileSync('node', [CLI, '--file', `@${tmpPath}`], { encoding: 'utf8' });
      expect(out).toContain('INSTRUMENT');
    } finally {
      unlinkSync(tmpPath);
    }
  });
});
