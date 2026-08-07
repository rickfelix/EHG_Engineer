/**
 * L1 portfolio-scope branch — SD-LEARN-FIX-ADDRESS-SAL-VISION-001.
 *
 * WHY A SEPARATE FILE. policy.test.js pins the sd_type matrix across 17 cases and is deliberately
 * left byte-untouched: the new parameter is optional, so if any of those 17 needed editing to stay
 * green, that would itself be evidence the change was not additive. Keeping the new cases here makes
 * that separation checkable rather than asserted.
 *
 * WHAT IS BEING GUARDED. Every SD lacking a bespoke vision is gap-filled to the whole-company
 * document at creation (pipeline.js DEFAULT_VISION_KEY = VISION-EHG-L1-001). Its dimensions are
 * constitutional pillars — automation_by_default, chairman_governance_model — that no single SD can
 * deliver, UI-producing or not. All 5 SDs in the observed FAIL population were scored against it.
 */
import { describe, it, expect } from 'vitest';
import { classifyOutcome } from '../severity-policy.js';

describe('L1 portfolio-scope branch (SD-LEARN-FIX-ADDRESS-SAL-VISION-001)', () => {
  // TS-1. Both arms in ONE test on purpose: asserting only the L1 arm would pass just as well if the
  // module had been made permissive outright. The pair is what shows the parameter is what changed.
  it('L1 does not block where the identical call without a level still FAILS', () => {
    const args = { sdType: 'feature', criticalMissing: 11, nonCriticalMissing: 0 };

    const withoutLevel = classifyOutcome(args);
    expect(withoutLevel.verdict).toBe('FAIL');
    expect(withoutLevel.passed).toBe(false);

    const withL1 = classifyOutcome({ ...args, visionLevel: 'L1' });
    expect(withL1.passed).toBe(true);
    expect(withL1.verdict).not.toBe('FAIL');
    expect(withL1.reason).toBe('vision_level_l1_portfolio_scope');
  });

  it('reports WARNING rather than PASS when L1 elements are missing', () => {
    // Non-blocking must not mean silent. An operator reading the gate needs to see that elements
    // were missing AND that the level is why it did not block — otherwise "PASS" would teach them
    // the SD satisfied a vision it was never measured against.
    const o = classifyOutcome({ sdType: 'bugfix', criticalMissing: 7, nonCriticalMissing: 2, visionLevel: 'L1' });
    expect(o.verdict).toBe('WARNING');
    expect(o.mode).toBe('warn');
    expect(o.reason).toMatch(/l1/i);
  });

  it('L1 with nothing missing is a clean PASS carrying no reason', () => {
    const o = classifyOutcome({ sdType: 'feature', criticalMissing: 0, nonCriticalMissing: 0, visionLevel: 'L1' });
    expect(o.verdict).toBe('PASS');
    expect(o.reason).toBeNull();
  });

  // TS-1 second arm. L2 is a SCOPED vision — blocking on it is legitimate and must be preserved,
  // otherwise the change is indistinguishable from disabling the gate.
  it('L2 still FAILS exactly as before for every block-mode sd_type', () => {
    for (const sdType of ['feature', 'bugfix']) {
      const o = classifyOutcome({ sdType, criticalMissing: 3, nonCriticalMissing: 0, visionLevel: 'L2' });
      expect(o.verdict, `${sdType} @ L2`).toBe('FAIL');
      expect(o.passed, `${sdType} @ L2`).toBe(false);
    }
    for (const sdType of ['database', 'security']) {
      const o = classifyOutcome({ sdType, criticalMissing: 2, nonCriticalMissing: 0, visionLevel: 'L2' });
      expect(o.verdict, `${sdType} @ L2`).toBe('FAIL');
    }
  });

  // TS-4 / TS-7. THE CONTROL THAT MATTERS. The s18 case-study fixture — the real-incident negative
  // control proving this gate still bites — is an inline mock carrying NO level field. Under an
  // allowlist its undefined level falls through to the strict path. Under a denylist
  // (`visionLevel !== 'L2'`) it would satisfy "is not L2", flip non-blocking, and delete the only
  // evidence that this change did not simply switch the gate off. This test is what makes the
  // allowlist load-bearing rather than a stylistic note in a comment.
  it('an ABSENT level falls through to the strict path — the s18-shaped case still FAILS', () => {
    const s18Shaped = { sdType: 'feature', criticalMissing: 5, nonCriticalMissing: 3 };

    expect(classifyOutcome(s18Shaped).verdict).toBe('FAIL');
    expect(classifyOutcome({ ...s18Shaped, visionLevel: undefined }).verdict).toBe('FAIL');
    expect(classifyOutcome({ ...s18Shaped, visionLevel: null }).verdict).toBe('FAIL');
  });

  it('an UNRECOGNISED level fails safe toward blocking, not toward silence', () => {
    // A level the schema does not yet have (L3, a typo, a renamed tier) must not silently disable
    // blocking. Fail-safe direction is the stricter existing behaviour.
    for (const lvl of ['L3', 'l1', 'PORTFOLIO', '']) {
      const o = classifyOutcome({ sdType: 'feature', criticalMissing: 3, nonCriticalMissing: 0, visionLevel: lvl });
      expect(o.verdict, `level=${JSON.stringify(lvl)}`).toBe('FAIL');
    }
  });

  it('skip-mode sd_types are unaffected by level — skip still wins', () => {
    // Ordering check: the skip branch is evaluated before the L1 branch, so a documentation SD
    // scored against L1 is skipped (its existing reason), not re-labelled as a portfolio warning.
    const o = classifyOutcome({ sdType: 'documentation', criticalMissing: 9, visionLevel: 'L1' });
    expect(o.skipped).toBe(true);
    expect(o.reason).toMatch(/does not produce UI/);
  });
});
