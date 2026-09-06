/**
 * Vitest specs for success-criteria-unpopulated-gate.
 * SD-LEO-FIX-LEAD-FINAL-APPROVAL-002.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  findUnpopulatedCriteria,
  validateSuccessCriteriaMeasured,
  createSuccessCriteriaUnpopulatedGate,
} from './success-criteria-unpopulated-gate.js';

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// The real, live fixture (SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001) that motivated this gate:
// its sole completion criterion (index 0, the stage-23 walk) still carried the sentinel measure
// when the SD reached status='completed' via LEAD-FINAL-APPROVAL.
const ELEVEN_001_FIXTURE = {
  success_criteria: [
    {
      criterion: 'A stage-23 walk run completes with all fourteen journeys executed and verdict PASS under the current gate literals, recorded as its launch_uat_report; this is the only completion evidence for the parent.',
      measure: '[UNPOPULATED]',
    },
    { criterion: 'CSV export works end-to-end', measure: 'VERIFIED: exported 42 rows, opened cleanly in Excel' },
    { criterion: 'Keyword suggestions render', measure: 'VERIFIED: 5 suggestions rendered for a sample query' },
    { criterion: 'JSON export works end-to-end', measure: 'VERIFIED: exported valid JSON, schema-validated' },
  ],
};

describe('findUnpopulatedCriteria', () => {
  it('names index and criterion text for each unpopulated entry', () => {
    const offending = findUnpopulatedCriteria(ELEVEN_001_FIXTURE.success_criteria);
    expect(offending).toEqual([
      { index: 0, criterion: 'A stage-23 walk run completes with all fourteen journeys executed and verdict PASS under the current gate literals, recorded as its launch_uat_report; this is the only completion evidence for the parent.' },
    ]);
  });

  it('reports nothing for a fully-populated array', () => {
    const criteria = [
      { criterion: 'Thing works', measure: 'VERIFIED: ran the thing, observed the output' },
      { criterion: 'Other thing works', measure: 'VERIFIED: measured directly' },
    ];
    expect(findUnpopulatedCriteria(criteria)).toEqual([]);
  });

  it('does NOT flag a legacy_filler entry -- that class is out of scope for this gate', () => {
    const criteria = [{ criterion: 'Real work happened', measure: 'See description for details' }];
    expect(findUnpopulatedCriteria(criteria)).toEqual([]);
  });

  it('treats an empty or missing array as nothing-to-check, not a crash', () => {
    expect(findUnpopulatedCriteria([])).toEqual([]);
    expect(findUnpopulatedCriteria(undefined)).toEqual([]);
    expect(findUnpopulatedCriteria(null)).toEqual([]);
  });

  it('handles plain-string entries (no {criterion,measure} object wrapper)', () => {
    expect(findUnpopulatedCriteria(['[UNPOPULATED]'])).toEqual([{ index: 0, criterion: '[UNPOPULATED]' }]);
  });
});

describe('validateSuccessCriteriaMeasured -- observe-only by default', () => {
  it('the real ELEVEN-001 fixture: passed:true, score:100, but the unpopulated criterion is named in warnings', () => {
    const result = validateSuccessCriteriaMeasured(ELEVEN_001_FIXTURE, {});
    expect(result.passed).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
    expect(result.max_score).toBe(100);
    expect(result.maxScore).toBe(100);
    expect(result.issues).toEqual([]);
    expect(result.warnings[0]).toContain('#0 "A stage-23 walk run completes');
    expect(result.details.offending).toHaveLength(1);
    expect(result.details.bound).toBe(false);
  });

  it('a fully-populated success_criteria reports clean -- no false positive', () => {
    const sd = { success_criteria: [{ criterion: 'X', measure: 'VERIFIED: real measured content' }] };
    const result = validateSuccessCriteriaMeasured(sd, {});
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.details.offending).toEqual([]);
  });

  it('an empty success_criteria array is treated as nothing-to-check', () => {
    const result = validateSuccessCriteriaMeasured({ success_criteria: [] }, {});
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('an explicit null sd (not just undefined) does not throw', () => {
    expect(() => validateSuccessCriteriaMeasured(null, {})).not.toThrow();
    expect(validateSuccessCriteriaMeasured(null, {}).passed).toBe(true);
  });
});

describe('validateSuccessCriteriaMeasured -- BINDING mode', () => {
  it('flips passed:false and moves the finding into issues[] when the env var is "true"', () => {
    const result = validateSuccessCriteriaMeasured(ELEVEN_001_FIXTURE, { SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING: 'true' });
    expect(result.passed).toBe(false);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.issues[0]).toContain('#0 "A stage-23 walk run completes');
    expect(result.details.bound).toBe(true);
  });

  it('a clean SD still passes even when bound (binding only matters when there is a finding)', () => {
    const sd = { success_criteria: [{ criterion: 'X', measure: 'VERIFIED: real content' }] };
    const result = validateSuccessCriteriaMeasured(sd, { SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING: 'true' });
    expect(result.passed).toBe(true);
  });

  it('any value other than the literal string "true" stays observe-only (fail-closed on the flip, not the check)', () => {
    for (const v of [undefined, '1', 'yes', 'TRUE', '']) {
      const result = validateSuccessCriteriaMeasured(ELEVEN_001_FIXTURE, { SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING: v });
      expect(result.passed, `binding=${JSON.stringify(v)}`).toBe(true);
    }
  });
});

describe('createSuccessCriteriaUnpopulatedGate', () => {
  it('wires the validator to ctx.sd and returns the gate config shape', async () => {
    const gate = createSuccessCriteriaUnpopulatedGate();
    expect(gate.name).toBe('GATE_SUCCESS_CRITERIA_UNPOPULATED');
    expect(gate.required).toBe(true);
    const result = await gate.validator({ sd: ELEVEN_001_FIXTURE });
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });
});
