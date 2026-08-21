/**
 * SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 — TS-6: quiet-tick's parked-SMS STALE escalation wiring.
 *
 * The emit lives inline inside adam-quiet-tick.mjs's main() loop (a function that reaches the
 * network/DB), so — mirroring tests/unit/qf590-sms-watchdog-not-chairman.test.js's own
 * established convention for this exact file — this is a structural, source-text test: it
 * confirms the QUIET_TICK_SMS_PARKED_STALE emit is present, gated on isStaleParkedSms, and
 * positioned AFTER the routine QUIET_TICK_SMS_PARKED line within the smsParked loop. The
 * DECISION logic itself (the threshold) is fully unit-tested in isolation by
 * tests/unit/governance/parked-sms-stall.test.js — this test only proves the wiring.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raw = fs.readFileSync(path.join(process.cwd(), 'scripts/adam-quiet-tick.mjs'), 'utf8');
const block = raw.slice(raw.indexOf('for (const s of smsParked.rows)'), raw.indexOf('for (const p of outboundSilence.probed)'));

describe('quiet-tick parked-SMS STALE escalation — TS-6', () => {
  it('the block was located and is non-trivial', () => {
    expect(block.length).toBeGreaterThan(100);
  });

  it('emits the routine QUIET_TICK_SMS_PARKED line unconditionally', () => {
    expect(block).toContain('QUIET_TICK_SMS_PARKED=adam');
  });

  it('emits a distinct QUIET_TICK_SMS_PARKED_STALE line, gated on isStaleParkedSms, AFTER the routine line', () => {
    const routineIdx = block.indexOf('QUIET_TICK_SMS_PARKED=adam');
    const staleIdx = block.indexOf('QUIET_TICK_SMS_PARKED_STALE=adam');
    const gateIdx = block.indexOf('isStaleParkedSms(');
    expect(staleIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(routineIdx).toBeLessThan(gateIdx);
    expect(gateIdx).toBeLessThan(staleIdx);
  });

  it('imports isStaleParkedSms from the pure predicate module', () => {
    expect(raw).toContain("import { isStaleParkedSms } from '../lib/governance/parked-sms-stall.mjs'");
  });
});
