/**
 * SUCCESS_METRICS gate parser — operator-prefixed quantified values.
 * SD-FDBK-FIX-FIX-SUCCESS-METRICS-001
 *
 * Tests the ACTIVE consolidated gate's pure helpers (success-metrics-gate.js), NOT the legacy
 * success-metrics-achievement.js copy (dead for gate purposes; its parser is divergent).
 *
 * Defect fixed: parseMetricValue fell through to parseFloat on operator-prefixed values
 * (">=1 finding", "<5 errors", "≥3 dimensions"), returning NaN→null, so a genuinely-met goal
 * scored the non-numeric 75 instead of comparing. The fix strips a leading comparison operator
 * (ASCII + unicode) before the parseFloat fallback. Comparison INTEGRITY must hold: meetsTarget
 * extracts the operator from the raw target independently, so unmet goals still fail — including
 * unicode ≤ targets, whose operator extraction was extended in the same change (otherwise a
 * now-parsing "≤2" target would default to '>=' and invert the comparison).
 */

import { describe, it, expect } from 'vitest';
import { parseMetricValue, meetsTarget } from '../../../scripts/modules/handoff/executors/plan-to-lead/gates/success-metrics-gate.js';

describe('parseMetricValue — operator-prefixed quantified values (the fix)', () => {
  it('parses ASCII operator-prefixed values that previously returned null', () => {
    expect(parseMetricValue('>=1 finding')).toBe(1);
    expect(parseMetricValue('<5 errors')).toBe(5);
    expect(parseMetricValue('<= 2 issues')).toBe(2);   // space after operator tolerated
    expect(parseMetricValue('> 10 items')).toBe(10);
  });

  it('parses unicode operator-prefixed values (≥ / ≤)', () => {
    expect(parseMetricValue('≥3 dimensions')).toBe(3);
    expect(parseMetricValue('≤2 regressions')).toBe(2);
  });

  it('still returns null for genuinely-prose values (75-tier semantics preserved)', () => {
    expect(parseMetricValue('all gates green')).toBe(null);
    expect(parseMetricValue('verified manually')).toBe(null);
    expect(parseMetricValue('')).toBe(null);
    expect(parseMetricValue(null)).toBe(null);
  });

  it('regression-pins every previously-parsing form (unchanged results)', () => {
    expect(parseMetricValue('95%')).toBe(95);
    expect(parseMetricValue('>=90%')).toBe(90);        // pct branch already handled operators
    expect(parseMetricValue('3/5')).toBe(60);
    expect(parseMetricValue('6 of 6')).toBe(100);
    expect(parseMetricValue('6/6 FRs implemented')).toBe(100);
    expect(parseMetricValue('100% — 6 of 6')).toBe(100); // pct wins over "of"
    expect(parseMetricValue('95')).toBe(95);
    expect(parseMetricValue('3 findings')).toBe(3);
    expect(parseMetricValue('100ms')).toBe(100);
  });
});

describe('meetsTarget — comparison integrity with operator-prefixed forms', () => {
  it('met goal now compares true (was null → 75)', () => {
    expect(meetsTarget('3 findings', '>=1 finding')).toBe(true);
    expect(meetsTarget('3 findings', '≥1 finding')).toBe(true);
  });

  it('INTEGRITY: unmet goal still fails — never a false pass', () => {
    expect(meetsTarget('2 found', '>=5 findings')).toBe(false);
    expect(meetsTarget('0 found', '≥1 finding')).toBe(false);
  });

  it('direction preserved for less-than targets (ASCII and unicode)', () => {
    expect(meetsTarget('7 errors', '<5 errors')).toBe(false);
    expect(meetsTarget('2 errors', '<5 errors')).toBe(true);
    // unicode ≤: without the operator-extraction fix this would default to '>=' and INVERT
    expect(meetsTarget('5 regressions', '≤2 regressions')).toBe(false);
    expect(meetsTarget('1 regression', '≤2 regressions')).toBe(true);
  });

  it('operator-prefixed ACTUALS parse too (both sides share the parser)', () => {
    // an actual recorded as ">=3 dimensions scored" parses to 3 and compares
    expect(meetsTarget('>=3 dimensions scored', '>=3')).toBe(true);
  });

  it('prose values still yield null (non-numeric 75 tier), not a comparison', () => {
    expect(meetsTarget('all gates green', '>=1 finding')).toBe(null);
    expect(meetsTarget('3 findings', 'qualitative goal')).toBe(null);
  });
});
