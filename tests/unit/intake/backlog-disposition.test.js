/**
 * SD-LEO-INFRA-BACKLOG-DISPOSITION-COLUMN-WORKFLOW-001 (FR-5)
 * Pure tests for the backlog disposition classifier + the conversion_ledger feeder set.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyDisposition,
  convertedSdKeySet,
  VALID_DISPOSITIONS,
  DISPOSITION_BY_COMPLETION,
} from '../../../lib/intake/backlog-disposition.mjs';

describe('classifyDisposition — completion_status mapping', () => {
  it('COMPLETED → BUILD', () => {
    expect(classifyDisposition({ completion_status: 'COMPLETED' })).toBe('BUILD');
  });
  it('CANCELLED → CANCEL', () => {
    expect(classifyDisposition({ completion_status: 'CANCELLED' })).toBe('CANCEL');
  });
  it('UTILIZED_ELSEWHERE → REFERENCE', () => {
    expect(classifyDisposition({ completion_status: 'UTILIZED_ELSEWHERE' })).toBe('REFERENCE');
  });
  it('NOT_STARTED / IN_PROGRESS / DEFERRED → null (genuinely undecided)', () => {
    expect(classifyDisposition({ completion_status: 'NOT_STARTED' })).toBeNull();
    expect(classifyDisposition({ completion_status: 'IN_PROGRESS' })).toBeNull();
    expect(classifyDisposition({ completion_status: 'DEFERRED' })).toBeNull();
  });
  it('unknown/missing status → null', () => {
    expect(classifyDisposition({ completion_status: 'WAT' })).toBeNull();
    expect(classifyDisposition({})).toBeNull();
    expect(classifyDisposition(null)).toBeNull();
  });
  it('only ever returns a valid disposition or null', () => {
    for (const s of ['COMPLETED', 'CANCELLED', 'UTILIZED_ELSEWHERE', 'NOT_STARTED', 'x']) {
      const d = classifyDisposition({ completion_status: s });
      expect(d === null || VALID_DISPOSITIONS.includes(d)).toBe(true);
    }
  });
});

describe('classifyDisposition — conversion_ledger feeder (fills only undecided)', () => {
  const converted = new Set(['SD-FROM-INTAKE-1']);
  it('a converted-from-intake SD with an UNDECIDED status → BUILD', () => {
    expect(classifyDisposition({ completion_status: 'NOT_STARTED', sd_id: 'SD-FROM-INTAKE-1' }, converted)).toBe('BUILD');
  });
  it('completion_status is AUTHORITATIVE — the feeder never overrides a decided status', () => {
    // CANCELLED stays CANCEL even if the SD was converted from intake.
    expect(classifyDisposition({ completion_status: 'CANCELLED', sd_id: 'SD-FROM-INTAKE-1' }, converted)).toBe('CANCEL');
  });
  it('a non-converted undecided item stays null', () => {
    expect(classifyDisposition({ completion_status: 'NOT_STARTED', sd_id: 'SD-OTHER' }, converted)).toBeNull();
  });
  it('tolerates a non-Set feeder arg', () => {
    expect(classifyDisposition({ completion_status: 'NOT_STARTED', sd_id: 'x' }, undefined)).toBeNull();
  });
});

describe('convertedSdKeySet', () => {
  it('includes only converted rows that carry a linked_sd_key', () => {
    const set = convertedSdKeySet([
      { disposition: 'converted', linked_sd_key: 'SD-A' },
      { disposition: 'converted', linked_sd_key: null },   // no key → excluded
      { disposition: 'dismissed', linked_sd_key: 'SD-B' }, // not converted → excluded
      { disposition: 'deferred', linked_sd_key: 'SD-C' },  // not converted → excluded
    ]);
    expect([...set]).toEqual(['SD-A']);
  });
  it('empty/undefined ledger → empty set (dormant feeder is honest)', () => {
    expect(convertedSdKeySet([]).size).toBe(0);
    expect(convertedSdKeySet(undefined).size).toBe(0);
  });
});

describe('DISPOSITION_BY_COMPLETION map invariant', () => {
  it('every mapped value is a valid disposition', () => {
    for (const v of Object.values(DISPOSITION_BY_COMPLETION)) {
      expect(VALID_DISPOSITIONS).toContain(v);
    }
  });
});
