// QF-20260509-070: compliance-rubric uses source-LOC against canonical 75-cap.
//
// Pre-fix: rubric loc_constraint compared `context.actualLoc` (total) against
// 50, and proper_classification used the same total against 50. Both conflated
// test LOC with source against a stale 50-cap (vs QF_HARD_LOC_CAP=75 source-only
// from QF-20260504-501 + SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001).
//
// Witnessed during QF-20260509-552 retroactive completion: actual_source_loc=25
// (well under 75) but rubric flagged escalation due to actual_loc=135 (with
// test LOC=110). False-trigger WARN verdict required --force-complete bypass
// for what should have been a clean pass.
//
// Test strategy: import QUICKFIX_RUBRIC dictionary directly and invoke the
// individual rule check functions. The full runComplianceRubric() pipeline
// shells out (execSync npm test/lint/tsc) and would time out — those rules
// are out of scope here; we test only the LOC-related rules this QF changes.

import { describe, it, expect } from 'vitest';
import { QUICKFIX_RUBRIC } from '../../../lib/quickfix-compliance-rubric.js';

function findRule(id) {
  for (const cat of Object.values(QUICKFIX_RUBRIC)) {
    const found = cat.criteria?.find(c => c.id === id);
    if (found) return found;
  }
  throw new Error(`Rule not found: ${id}`);
}

describe('QF-20260509-070: loc_constraint uses actualSourceLoc against 75-cap', () => {
  const rule = findRule('loc_constraint');

  it('passes when source LOC <= 75 even if total LOC > 75', async () => {
    const r = await rule.check({ actualLoc: 135, actualSourceLoc: 25, actualTestLoc: 110 });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(10);
    expect(r.evidence).toMatch(/Source LOC:\s*25/);
    expect(r.evidence).toMatch(/test LOC:\s*110/);
  });

  it('fails when source LOC > 75', async () => {
    const r = await rule.check({ actualSourceLoc: 80, actualTestLoc: 20 });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
  });

  it('passes at the boundary (source LOC == 75)', async () => {
    const r = await rule.check({ actualSourceLoc: 75, actualTestLoc: 0 });
    expect(r.passed).toBe(true);
  });

  it('falls back to actualLoc when actualSourceLoc absent (legacy callers)', async () => {
    const r = await rule.check({ actualLoc: 30 });
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/Source LOC:\s*30/);
  });

  it('treats undefined LOC as zero (no false-fail on missing data)', async () => {
    const r = await rule.check({});
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/Source LOC:\s*0/);
  });

  it('rule name reflects new threshold (≤75 source)', () => {
    expect(rule.name).toMatch(/≤75/);
    expect(rule.name).toMatch(/source/i);
  });
});

describe('QF-20260509-070: proper_classification uses source LOC against 75-cap', () => {
  const rule = findRule('proper_classification');

  it('passes when source LOC <= 75 even if total > 50 (closes c8273bce)', async () => {
    const r = await rule.check({
      actualLoc: 135,
      actualSourceLoc: 25,
      actualTestLoc: 110,
      filesChanged: ['scripts/foo.js']
    });
    expect(r.passed).toBe(true);
    expect(r.evidence).not.toMatch(/source LOC >75/);
  });

  it('flags escalation when source LOC > 75', async () => {
    const r = await rule.check({
      actualSourceLoc: 100,
      actualTestLoc: 0,
      filesChanged: ['scripts/foo.js']
    });
    expect(r.passed).toBe(false);
    expect(r.evidence).toMatch(/source LOC >75/);
  });

  it('falls back to actualLoc for legacy callers', async () => {
    const r = await rule.check({
      actualLoc: 30,
      filesChanged: ['scripts/foo.js']
    });
    expect(r.passed).toBe(true);
  });

  it('still flags non-LOC escalation triggers (migration files)', async () => {
    const r = await rule.check({
      actualSourceLoc: 10,
      actualTestLoc: 0,
      filesChanged: ['migrations/20260509_add_column.sql']
    });
    expect(r.passed).toBe(false);
    expect(r.evidence).toMatch(/Database migration/);
  });
});
