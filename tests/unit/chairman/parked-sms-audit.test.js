/**
 * SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 — TS-1/TS-2/TS-3: the pure disposition classifier
 * (lib/chairman/parked-sms-audit.mjs). No DB, no live data.
 */
import { describe, it, expect } from 'vitest';
import { classifyParkedSmsDisposition } from '../../../lib/chairman/parked-sms-audit.mjs';

const ROW = { id: 'r1', from_phone: '+15551234567', body_raw: 'YES', parked_at: '2026-08-15T12:00:00.000Z' };

describe('classifyParkedSmsDisposition', () => {
  it('TS-1: EVIDENCE_HANDLED when a later same-phone answered log row exists', () => {
    const logs = [{ id: 'log1', from_phone: ROW.from_phone, outcome: 'answered', created_at: '2026-08-15T12:05:00.000Z' }];
    const result = classifyParkedSmsDisposition(ROW, logs);
    expect(result.disposition).toBe('EVIDENCE_HANDLED');
    expect(result.evidence).toEqual({ logRowId: 'log1', outcome: 'answered', created_at: '2026-08-15T12:05:00.000Z' });
  });

  it('TS-2: NEEDS_ADAM_REVIEW when no later answered row exists', () => {
    expect(classifyParkedSmsDisposition(ROW, []).disposition).toBe('NEEDS_ADAM_REVIEW');
  });

  it('TS-2: NEEDS_ADAM_REVIEW when the only answered row is EARLIER than parked_at', () => {
    const logs = [{ id: 'log0', from_phone: ROW.from_phone, outcome: 'answered', created_at: '2026-08-15T11:00:00.000Z' }];
    expect(classifyParkedSmsDisposition(ROW, logs).disposition).toBe('NEEDS_ADAM_REVIEW');
  });

  it('TS-2: NEEDS_ADAM_REVIEW when a later row exists but with a different outcome', () => {
    const logs = [{ id: 'log2', from_phone: ROW.from_phone, outcome: 'no_match', created_at: '2026-08-16T00:00:00.000Z' }];
    expect(classifyParkedSmsDisposition(ROW, logs).disposition).toBe('NEEDS_ADAM_REVIEW');
  });

  it('TS-3: never trusts matched_decision_id alone — a row with only that field set is still NEEDS_ADAM_REVIEW', () => {
    const logs = [{ id: 'log3', from_phone: ROW.from_phone, outcome: 'no_match', matched_decision_id: 'decision-xyz', created_at: '2026-08-16T00:00:00.000Z' }];
    expect(classifyParkedSmsDisposition(ROW, logs).disposition).toBe('NEEDS_ADAM_REVIEW');
  });

  it('picks the earliest qualifying later answered row as evidence', () => {
    const logs = [
      { id: 'late', from_phone: ROW.from_phone, outcome: 'answered', created_at: '2026-08-20T00:00:00.000Z' },
      { id: 'earliest', from_phone: ROW.from_phone, outcome: 'answered', created_at: '2026-08-15T13:00:00.000Z' },
    ];
    expect(classifyParkedSmsDisposition(ROW, logs).evidence.logRowId).toBe('earliest');
  });

  it('is defensive against missing/malformed input', () => {
    expect(classifyParkedSmsDisposition({}, []).disposition).toBe('NEEDS_ADAM_REVIEW');
    expect(classifyParkedSmsDisposition(ROW, undefined).disposition).toBe('NEEDS_ADAM_REVIEW');
    expect(classifyParkedSmsDisposition(ROW, null).disposition).toBe('NEEDS_ADAM_REVIEW');
  });
});
