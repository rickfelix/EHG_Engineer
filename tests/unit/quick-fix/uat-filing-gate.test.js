/**
 * QF-20260807-594 — the three-sided acceptance, plus the arms that keep it from lying.
 *
 * THE RATIFIED ACCEPTANCE HAS THREE SIDES, ALL REQUIRED:
 *   (a) a synthetic MEASURED-HARM finding still files HIGH
 *   (b) a synthetic COSMETIC finding files medium
 *   (c) a genuinely NEW DISTINCT finding on a previously-filed surface STILL ARRIVES
 *
 * (c) IS VACUOUS ON ITS OWN AND THAT IS THE WHOLE TRAP. If the dedup never folds anything, (c)
 * passes trivially and the suite reports success for a gate that does nothing. So every
 * "still arrives" assertion below is paired with a "and this one DOES fold" assertion built on
 * the same code path. A one-sided dedup test cannot tell a working fold from an absent one.
 *
 * Likewise (a) and (b) are two halves of one control: a rule that downgraded EVERYTHING would
 * pass (b) alone, and a rule that downgraded NOTHING would pass (a) alone. Neither is a gate.
 */

import { describe, it, expect } from 'vitest';
import {
  applySeverityRule, hasMeasuredHarm, findingIdentity, similarity,
  findDuplicateFinding, DEFAULT_SEVERITY, DUPLICATE_THRESHOLD
} from '../../../lib/quick-fix/uat-filing-gate.js';

const MEASURED = {
  severity: 'high',
  title: 'Handoff gate blocks every new SD on first run',
  expected: 'the gate passes on a clean tree',
  actual: 'it blocks the handoff and costs roughly 40 minutes per SD across 6 seats'
};

const COSMETIC = {
  severity: 'high',
  title: 'Dashboard header spacing is inconsistent',
  expected: 'the header aligns with the table below it',
  actual: 'it sits a few pixels off and looks untidy'
};

describe('(a) measured harm still files HIGH', () => {
  it('keeps high when the filing shows a quantity attached to real work harm', () => {
    const out = applySeverityRule(MEASURED);
    expect(out.severity).toBe('high');
    expect(out.downgraded).toBe(false);
  });

  it('keeps high for safety/data classes WITHOUT demanding a stopwatch', () => {
    // Failing toward HIGH here is deliberate: requiring a number would push exactly the
    // findings that matter most into medium.
    const out = applySeverityRule({
      severity: 'critical', title: 'Session tokens written to the shared log',
      actual: 'a credential leak — anyone reading the log can reuse them'
    });
    expect(out.severity).toBe('critical');
    expect(out.downgraded).toBe(false);
  });

  it('critical is treated as elevated too, not just high', () => {
    expect(applySeverityRule({ ...COSMETIC, severity: 'critical' }).downgraded).toBe(true);
  });
});

describe('(b) cosmetic files medium — and is ROUTED, not dropped', () => {
  it('downgrades an unquantified cosmetic finding to medium', () => {
    const out = applySeverityRule(COSMETIC);
    expect(out.severity).toBe(DEFAULT_SEVERITY);
    expect(out.downgraded).toBe(true);
  });

  it('the downgrade explains itself and names the from-severity', () => {
    // A silently rewritten field is indistinguishable, to the filer, from being ignored.
    const out = applySeverityRule(COSMETIC);
    expect(out.from).toBe('high');
    expect(out.reason).toMatch(/measured harm/i);
    expect(out.reason).toMatch(/still routed/i);
  });

  it('harm ASSERTED but never quantified is not measured harm', () => {
    // The single most common false-high shape: strong words, no number.
    const out = applySeverityRule({
      severity: 'high', title: 'Search is broken', actual: 'it feels slow and sometimes breaks'
    });
    expect(out.severity).toBe(DEFAULT_SEVERITY);
    expect(out.basis).toMatch(/never quantified/i);
  });

  it('an audited override keeps the elevated severity and says so', () => {
    const out = applySeverityRule(COSMETIC, { override: 'measured on 3 seats, evidence in thread' });
    expect(out.severity).toBe('high');
    expect(out.downgraded).toBe(false);
    expect(out.reason).toMatch(/audited override/i);
  });

  it('leaves non-elevated severities completely alone', () => {
    for (const s of ['medium', 'low']) {
      expect(applySeverityRule({ ...COSMETIC, severity: s }).severity).toBe(s);
    }
  });
});

describe('(c) a NEW distinct finding on an already-filed surface STILL ARRIVES', () => {
  const filed = [{
    id: 'QF-EXISTING-001',
    title: 'Dashboard header spacing is inconsistent',
    expected_behavior: 'the header aligns with the table below it',
    actual_behavior: 'it sits a few pixels off and looks untidy'
  }];

  it('a genuinely different finding on the SAME surface is not folded', () => {
    const fresh = {
      title: 'Dashboard header dropdown throws on an empty venture list',
      expected: 'an empty state renders',
      actual: 'the component throws and the page goes blank'
    };
    expect(findDuplicateFinding(fresh, filed)).toBeNull();
  });

  it('CONTROL — the SAME finding IS folded, so the test above is not vacuous', () => {
    // Without this arm, "not folded" would also pass if the fold were entirely broken.
    const refiled = {
      title: 'Dashboard header spacing is inconsistent',
      expected: 'the header aligns with the table below it',
      actual: 'it sits a few pixels off and looks untidy'
    };
    const hit = findDuplicateFinding(refiled, filed);
    expect(hit).not.toBeNull();
    expect(hit.row.id).toBe('QF-EXISTING-001');
    expect(hit.score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it('a re-file with light rewording still folds — identity is not string equality', () => {
    const reworded = {
      title: 'Dashboard header spacing inconsistent',
      expected: 'header aligns with the table below it',
      actual: 'sits a few pixels off, looks untidy'
    };
    expect(findDuplicateFinding(reworded, filed)).not.toBeNull();
  });

  it('IDENTITY IS NOT SURFACE: same surface words, different claim, different identity', () => {
    // The defect this rule exists to prevent — a surface-keyed fold would silence this forever.
    const a = findingIdentity({ title: 'venture dashboard', actual: 'the export button does nothing' });
    const b = findingIdentity({ title: 'venture dashboard', actual: 'totals are off by one row' });
    expect(similarity(a, b)).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it('never folds against an empty identity', () => {
    expect(findDuplicateFinding({}, filed)).toBeNull();
    expect(findDuplicateFinding({ title: 'a of the' }, filed)).toBeNull();
  });

  it('folds against the BEST match when several are close', () => {
    const rows = [
      { id: 'FAR', title: 'unrelated thing entirely', expected_behavior: 'x', actual_behavior: 'y' },
      ...filed
    ];
    expect(findDuplicateFinding({ ...COSMETIC, expected: filed[0].expected_behavior, actual: filed[0].actual_behavior }, rows).row.id)
      .toBe('QF-EXISTING-001');
  });
});

describe('CONTROLS — the detectors can actually fire and actually refuse', () => {
  it('hasMeasuredHarm is two-sided on the same shape of input', () => {
    expect(hasMeasuredHarm('blocks the handoff for 40 minutes').measured).toBe(true);
    expect(hasMeasuredHarm('blocks the handoff sometimes').measured).toBe(false);
  });

  it('similarity is 1 for identical vocabulary and 0 for disjoint', () => {
    expect(similarity(findingTokensOf('alpha beta gamma'), findingTokensOf('gamma beta alpha'))).toBe(1);
    expect(similarity(findingTokensOf('alpha beta'), findingTokensOf('delta epsilon'))).toBe(0);
  });

  it('digits are preserved — 3 retries and 30 retries are different findings', () => {
    const a = findingIdentity({ title: 'gate allows 3 retries' });
    const b = findingIdentity({ title: 'gate allows 30 retries' });
    expect(similarity(a, b)).toBeLessThan(1);
  });

  function findingTokensOf(s) { return findingIdentity({ title: s }); }
});
