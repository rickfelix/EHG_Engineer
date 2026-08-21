/**
 * SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 — TS-6: quiet-tick's parked-SMS log-line builder
 * (scripts/adam-quiet-tick.mjs's buildParkedSmsLogLines). Pure, no DB.
 */
import { describe, it, expect } from 'vitest';
import { buildParkedSmsLogLines } from '../../../scripts/adam-quiet-tick.mjs';

describe('buildParkedSmsLogLines — TS-6', () => {
  it('a fresh row produces only the routine QUIET_TICK_SMS_PARKED line', () => {
    const lines = buildParkedSmsLogLines({ id: 'r1', fromPhone: '+15551234567', ageMin: 5, body: 'YES' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('QUIET_TICK_SMS_PARKED=adam');
    expect(lines[0]).not.toContain('STALE');
  });

  it('a stale (>=24h) row produces the routine line AND a distinct STALE line', () => {
    const lines = buildParkedSmsLogLines({ id: 'r2', fromPhone: '+15559876543', ageMin: 1500, body: 'status?' });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('QUIET_TICK_SMS_PARKED=adam');
    expect(lines[0]).not.toContain('STALE');
    expect(lines[1]).toContain('QUIET_TICK_SMS_PARKED_STALE=adam');
  });

  it('preserves the row id/phone/age/body in both lines', () => {
    const lines = buildParkedSmsLogLines({ id: 'abc-123', fromPhone: '+15550001111', ageMin: 2000, body: 'please provide status' });
    for (const line of lines) {
      expect(line).toContain('abc-123');
      expect(line).toContain('+15550001111');
    }
  });
});
