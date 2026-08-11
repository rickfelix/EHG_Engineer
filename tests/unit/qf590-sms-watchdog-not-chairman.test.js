// QF-20260810-590: the automated "are you still there?" watchdog is NOT the chairman. Witnessed
// 2026-08-11 01:58Z: the watchdog SMS fired QUIET_TICK_SMS_INBOUND as a chairman hard interrupt,
// triggering the full CHAIRMAN SMS CHANNEL DUTY reply path during quiet hours (reply attempts,
// gate blocks, burned the presence window diagnosing).
//
// isWatchdogBody is a pure, directly-testable predicate (unlike the emit site itself, which lives
// inside adam-quiet-tick.mjs's long tick function that reaches the network/DB) — behavioral tests
// below exercise it directly. The remaining source-pin tests mirror the qf834 suite's convention
// for asserting how the emit site and its consumer-prompt allowlist actually wire it in.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isWatchdogBody, WATCHDOG_BODY_PREFIX } from '../../scripts/adam-quiet-tick.mjs';

describe('isWatchdogBody — the witnessed watchdog body', () => {
  it('REGRESSION: matches the exact witnessed watchdog SMS', () => {
    const body = "I haven't received any text messages from you in over an hour. are you still there?";
    expect(isWatchdogBody(body)).toBe(true);
  });

  it('matches a truncated (120-char slice) watchdog body, since it is a PREFIX match', () => {
    // surfaceSmsInbound truncates body to <=120 chars; the canonical prefix (66 chars) survives.
    const body = WATCHDOG_BODY_PREFIX + ' are you still there? '.repeat(5);
    expect(isWatchdogBody(body.slice(0, 120))).toBe(true);
  });

  it('does NOT match genuine chairman text, even text that discusses the watchdog', () => {
    for (const body of [
      'yes still here, approve the SD',
      'the watchdog fired again, please check it',
      "I haven't decided yet",
      '',
    ]) {
      expect(isWatchdogBody(body)).toBe(false);
    }
  });

  it('fails closed (never matches) on non-string / missing bodies', () => {
    for (const body of [null, undefined, 42, {}]) {
      expect(isWatchdogBody(body)).toBe(false);
    }
  });
});

const raw = fs.readFileSync(path.join(process.cwd(), 'scripts/adam-quiet-tick.mjs'), 'utf8');
const src = raw
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');
const block = src.slice(src.indexOf('for (const s of smsInbound.rows)'), src.indexOf('QUIET_TICK_SMS_PARKED=adam'));

describe('QF-590 emit-site wiring — checked before the drain-flag branch, informational, never re-arms', () => {
  it('the watchdog check runs FIRST, unconditionally of smsDrainEnabled', () => {
    const watchdogIdx = block.indexOf('isWatchdogBody');
    const drainFlagIdx = block.indexOf('if (!smsDrainEnabled)');
    expect(watchdogIdx).toBeGreaterThan(-1);
    expect(drainFlagIdx).toBeGreaterThan(-1);
    expect(watchdogIdx).toBeLessThan(drainFlagIdx);
  });

  it('emits QUIET_TICK_SMS_WATCHDOG, not the hard-interrupt token, for a watchdog body', () => {
    const watchdogBranch = block.slice(block.indexOf('isWatchdogBody'), block.indexOf('if (!smsDrainEnabled)'));
    expect(watchdogBranch).toContain('QUIET_TICK_SMS_WATCHDOG=adam');
    expect(watchdogBranch).not.toContain('QUIET_TICK_SMS_INBOUND');
    expect(watchdogBranch).toContain('continue;');
  });

  it('QUIET_TICK_SMS_WATCHDOG is NOT in the NO-OP allowlist, but SMS_INBOUND still is (two-sided)', () => {
    const check = fs.readFileSync(path.join(process.cwd(), 'scripts/adam-startup-check.mjs'), 'utf8');
    const m = check.match(/If the output contains NO ([\s\S]*?QUIET_TICK_ERROR)/);
    expect(m).not.toBeNull();
    expect(m[1]).not.toContain('QUIET_TICK_SMS_WATCHDOG');
    expect(m[1]).toContain('QUIET_TICK_SMS_INBOUND');
  });

  it('the emitter and the consumer prompt both mention the token (parity-lint requirement)', () => {
    const check = fs.readFileSync(path.join(process.cwd(), 'scripts/adam-startup-check.mjs'), 'utf8');
    expect(raw).toContain('QUIET_TICK_SMS_WATCHDOG');
    expect(check).toContain('QUIET_TICK_SMS_WATCHDOG');
  });
});
