/**
 * Vitest specs for origin-criterion-gate.
 * SD-LEO-FIX-ESCALATION-COPIES-EXPECTED-001 (escalated from QF-20260906-362).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { findOriginEntry, isBindingEnabled, createOriginCriterionGate } from './origin-criterion-gate.js';

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

const ORIGIN_TEXT = 'The write succeeds and is reported as ok.';
const ORIGIN_ENTRY = {
  criterion: `Expected behavior achieved: ${ORIGIN_TEXT}`,
  measure: 'Origin text preserved verbatim (content-hash checked at LEAD-FINAL by origin-criterion-gate)',
  origin: { producer: 'qf_escalation_writer', source_qf_id: 'QF-TEST-1', content_hash: sha256(`Expected behavior achieved: ${ORIGIN_TEXT}`) },
};

describe('findOriginEntry', () => {
  it('finds the entry carrying an origin object among mixed string/object entries', () => {
    const entry = findOriginEntry([ORIGIN_ENTRY, 'Defective behavior no longer occurs: x']);
    expect(entry).toEqual(ORIGIN_ENTRY);
  });

  it('returns null when no entry carries an origin object', () => {
    expect(findOriginEntry(['Resolves: the escalated quick-fix'])).toBeNull();
    expect(findOriginEntry([{ criterion: 'x', measure: 'y' }])).toBeNull();
  });

  it('treats an empty or missing array as no origin entry, not a crash', () => {
    expect(findOriginEntry([])).toBeNull();
    expect(findOriginEntry(undefined)).toBeNull();
    expect(findOriginEntry(null)).toBeNull();
  });
});

describe('isBindingEnabled', () => {
  it('is false by default (observe-only)', () => {
    expect(isBindingEnabled({})).toBe(false);
  });

  it('is true only for the exact string "true"', () => {
    expect(isBindingEnabled({ ORIGIN_CRITERION_GATE_BINDING: 'true' })).toBe(true);
    expect(isBindingEnabled({ ORIGIN_CRITERION_GATE_BINDING: 'yes' })).toBe(false);
  });
});

describe('createOriginCriterionGate', () => {
  it('is not applicable to an SD with no source_qf_id / escalated_from_qf', async () => {
    const gate = createOriginCriterionGate();
    const result = await gate.validator({ sd: { success_criteria: [], metadata: {} } });
    expect(result.passed).toBe(true);
    expect(result.details.applicable).toBe(false);
  });

  it('passes cleanly for a carrier SD whose origin entry is intact', async () => {
    const gate = createOriginCriterionGate();
    const result = await gate.validator({
      sd: { success_criteria: [ORIGIN_ENTRY, 'Defective behavior no longer occurs: x'], metadata: { source_qf_id: 'QF-TEST-1' } },
    });
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.details).toMatchObject({ applicable: true, source_qf_id: 'QF-TEST-1' });
  });

  it('also recognizes metadata.escalated_from_qf (the alternate field name createFromQF also stamps)', async () => {
    const gate = createOriginCriterionGate();
    const result = await gate.validator({
      sd: { success_criteria: [ORIGIN_ENTRY], metadata: { escalated_from_qf: 'QF-TEST-1' } },
    });
    expect(result.passed).toBe(true);
    expect(result.details.applicable).toBe(true);
  });

  describe('missing origin entry', () => {
    it('warns (observe-only default) but does not fail the gate', async () => {
      const gate = createOriginCriterionGate();
      const result = await gate.validator({
        sd: { success_criteria: ['Resolves: the escalated quick-fix'], metadata: { source_qf_id: 'QF-TEST-1' } },
      });
      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBe(1);
      expect(result.details.reason_code).toBe('ORIGIN_CRITERION_MISSING');
      expect(result.details.bound).toBe(false);
    });

    it('refuses when ORIGIN_CRITERION_GATE_BINDING=true', async () => {
      process.env.ORIGIN_CRITERION_GATE_BINDING = 'true';
      const gate = createOriginCriterionGate();
      const result = await gate.validator({
        sd: { success_criteria: ['Resolves: the escalated quick-fix'], metadata: { source_qf_id: 'QF-TEST-1' } },
      });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details.reason_code).toBe('ORIGIN_CRITERION_MISSING');
      expect(result.details.bound).toBe(true);
    });
  });

  describe('hash-mismatched origin entry (edited since escalation)', () => {
    const editedEntry = { ...ORIGIN_ENTRY, criterion: 'Expected behavior achieved: a narrower, reworded version.' };

    it('warns (observe-only default) but does not fail the gate', async () => {
      const gate = createOriginCriterionGate();
      const result = await gate.validator({
        sd: { success_criteria: [editedEntry], metadata: { source_qf_id: 'QF-TEST-1' } },
      });
      expect(result.passed).toBe(true);
      expect(result.details.reason_code).toBe('ORIGIN_CRITERION_HASH_MISMATCH');
      expect(result.details.bound).toBe(false);
    });

    it('refuses when ORIGIN_CRITERION_GATE_BINDING=true', async () => {
      process.env.ORIGIN_CRITERION_GATE_BINDING = 'true';
      const gate = createOriginCriterionGate();
      const result = await gate.validator({
        sd: { success_criteria: [editedEntry], metadata: { source_qf_id: 'QF-TEST-1' } },
      });
      expect(result.passed).toBe(false);
      expect(result.details.reason_code).toBe('ORIGIN_CRITERION_HASH_MISMATCH');
      expect(result.details.bound).toBe(true);
    });
  });
});
