/**
 * QF-20260823-131: the durable hourly heartbeat cron ('heartbeat-sms' ADAM_LOOPS entry, cron
 * '14 * * * *') is the ONLY check enforcing the hourly cadence contract, and it only measures
 * the gap once per hour — a send just after :14 (e.g. :44) left the contract unenforceable
 * until the next hour's :14 tick. checkHeartbeatCadence() re-runs the SAME
 * HEARTBEAT_OVERDUE_THRESHOLD_MS measured-gap check from quiet-tick's own 15min cadence, so a
 * breach is caught within one quiet-tick cycle instead of waiting for the next hourly tick.
 *
 * The threshold itself moved from 55min to 175min (chairman verbal 2026-08-28, 3-hourly
 * cadence contract) — this file derives its expectations from HEARTBEAT_OVERDUE_THRESHOLD_MS
 * rather than hardcoding minutes, so a future threshold change cannot silently strand this test.
 *
 * Regression: simulate a send at :44 and assert the next detected breach lands within one
 * 15min quiet-tick cycle of the threshold itself.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkHeartbeatCadence, HEARTBEAT_OVERDUE_THRESHOLD_MS, formatHeartbeatCadenceLine } from '../../../scripts/adam-quiet-tick.mjs';
import { inQuietHours } from '../../../lib/comms/adam-outbound/rubric-engine/lint.js';

function readBuilder(data) {
  const b = {
    select: () => b,
    eq: () => b,
    order: () => b,
    limit: () => b,
    then: (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return b;
}

function sbWithRow(row) {
  return { from: () => readBuilder(row ? [row] : []) };
}

function sbWithError() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.reject(new Error('boom')) }) }) }),
    }),
  };
}

describe('checkHeartbeatCadence', () => {
  it('reports nothing when no heartbeat_status row has ever been sent (cold start, never a false alarm)', async () => {
    const sb = sbWithRow(null);
    const result = await checkHeartbeatCadence(sb, { nowMs: Date.now() });
    expect(result.overdueMin).toBeNull();
  });

  it('reports nothing when the gap is under the threshold', async () => {
    const sentAt = new Date('2026-08-23T15:00:00Z');
    const now = new Date(sentAt.getTime() + HEARTBEAT_OVERDUE_THRESHOLD_MS - 5 * 60 * 1000); // 5min short of the threshold
    const sb = sbWithRow({ created_at: sentAt.toISOString() });
    const result = await checkHeartbeatCadence(sb, { nowMs: now.getTime() });
    expect(result.overdueMin).toBeNull();
  });

  it('flags overdue once the gap crosses the threshold', async () => {
    const sentAt = new Date('2026-08-23T15:00:00Z');
    const now = new Date(sentAt.getTime() + HEARTBEAT_OVERDUE_THRESHOLD_MS);
    const sb = sbWithRow({ created_at: sentAt.toISOString() });
    const result = await checkHeartbeatCadence(sb, { nowMs: now.getTime() });
    expect(result.overdueMin).toBe(HEARTBEAT_OVERDUE_THRESHOLD_MS / 60000);
  });

  // THE REGRESSION ITSELF: a send at :44 must be detected as overdue within one 15min
  // quiet-tick cycle of the threshold, not left to slip to the next hourly-cron-only check.
  it('QF-20260823-131 regression: a send at :44 is detected as overdue within one quiet-tick cycle of the threshold', async () => {
    const sentAt = new Date('2026-08-23T15:44:00Z'); // the exact incident shape
    const sb = sbWithRow({ created_at: sentAt.toISOString() });
    const thresholdMin = HEARTBEAT_OVERDUE_THRESHOLD_MS / 60000;
    const cadenceMin = 15;
    const boundMin = thresholdMin + cadenceMin;

    // Simulate quiet-tick's own 15min cadence ticking forward from the send time.
    let detectedAtMin = null;
    for (let elapsedMin = cadenceMin; elapsedMin <= boundMin; elapsedMin += cadenceMin) {
      const now = new Date(sentAt.getTime() + elapsedMin * 60 * 1000);
      const result = await checkHeartbeatCadence(sb, { nowMs: now.getTime() });
      if (result.overdueMin != null) { detectedAtMin = elapsedMin; break; }
    }

    expect(detectedAtMin).not.toBeNull();
    expect(detectedAtMin).toBeLessThanOrEqual(boundMin);
  });

  it('read error degrades to no alarm (fail-soft, never a false positive on an unreadable ledger)', async () => {
    const sb = sbWithError();
    const result = await checkHeartbeatCadence(sb, { nowMs: Date.now() });
    expect(result.overdueMin).toBeNull();
  });
});

// QF-20260906-942: the gauge and the send gate must never disagree about whether a send is
// possible. During the 22:00-06:00 ET quiet window the gate WILL drop the send, so the line
// must switch from an actionable instruction to an informational suppression, matching the
// established QUIET_TICK_STALL_SUPPRESSED / QUIET_TICK_SMS_SUPPRESSED convention.
describe('formatHeartbeatCadenceLine', () => {
  it('returns null when there is no overdue gap (nothing to print)', () => {
    expect(formatHeartbeatCadenceLine(null, false)).toBeNull();
    expect(formatHeartbeatCadenceLine(null, true)).toBeNull();
  });

  it('outside quiet hours: emits the actionable OVERDUE line instructing an immediate send', () => {
    const line = formatHeartbeatCadenceLine(180, false);
    expect(line).toContain('QUIET_TICK_HEARTBEAT_OVERDUE=adam gapMin=180');
    expect(line).toContain('send NOW');
    expect(line).not.toContain('SUPPRESSED');
  });

  it('inside quiet hours: emits the informational SUPPRESSED line, never the actionable one', () => {
    const line = formatHeartbeatCadenceLine(180, true);
    expect(line).toContain('QUIET_TICK_HEARTBEAT_SUPPRESSED=adam gapMin=180');
    expect(line).toContain('22:00-06:00 ET quiet window');
    expect(line).not.toContain('send NOW');
    expect(line).not.toContain('QUIET_TICK_HEARTBEAT_OVERDUE');
  });

  // QF-20260905-680: ratification 7010e20f fixed the cadence to SET-SCHEDULE ET slots,
  // superseding the ">=170min gap since last send" rule (9eebe200) this line used to cite as
  // the primary cadence contract, rather than the overdue-only backstop it actually is.
  it('names the fixed ET slot + ratification 7010e20f, not the superseded "3-hourly cadence contract" wording', () => {
    const outside = formatHeartbeatCadenceLine(180, false);
    const inside = formatHeartbeatCadenceLine(180, true);
    for (const line of [outside, inside]) {
      expect(line).toContain('7010e20f');
      expect(line).not.toContain('3-hourly heartbeat cadence contract');
      expect(line).not.toContain('chairman verbal 2026-08-28');
    }
    expect(outside).toContain('overdue backstop');
  });
});

// QF-20260907-365: PR #8458 wired inQuietHours() into the heartbeat cadence line but called it
// with NO arguments. lint.js defaults the context to {}, so etHour() finds neither nowHourET nor
// a Date/finite-number now and throws by design ('the engine must never GUESS quiet-hours' —
// lint.js:80, correct behavior, NOT to be relaxed). The throw at adam-quiet-tick.mjs:1588 aborts
// the whole tick body BEFORE the inbox lines at :1682 are ever reached — QUIET_TICK_ERROR fires
// every tick, QUIET_TICK_HEARTBEAT_OVERDUE never prints, and the summary's dir:N inbox count
// silently disagrees with zero emitted QUIET_TICK_INBOX_DIRECTIVE lines. Fixed call site passes
// { now: Date.now() }, mirroring the exact working shape from this QF's own reproduction steps.
describe('inQuietHours call-site contract (QF-20260907-365 regression)', () => {
  it('throws when called with no context (the engine must never guess quiet-hours) — documents WHY a bare call is unsafe', () => {
    expect(() => inQuietHours()).toThrow(/quiet-hours needs context/);
  });

  it('does not throw when called with { now: Date.now() } — the fixed call-site shape', () => {
    expect(() => inQuietHours({ now: Date.now() })).not.toThrow();
    expect(typeof inQuietHours({ now: Date.now() })).toBe('boolean');
  });

  it('adam-quiet-tick.mjs never calls inQuietHours() bare — pins the call site so the regression cannot silently reappear', () => {
    const scriptPath = fileURLToPath(new URL('../../../scripts/adam-quiet-tick.mjs', import.meta.url));
    const src = readFileSync(scriptPath, 'utf8');
    // Only real CALL sites (a non-comment line invoking the imported function), never prose —
    // line 632's doc comment legitimately says "inQuietHours() result" in English. Every actual
    // call in this file must pass a non-empty argument; a bare zero-arg call throws
    // unconditionally (see above) and would silently truncate every line the tick emits after it.
    const callSites = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .filter((line) => /inQuietHours\(/.test(line));
    expect(callSites.length).toBeGreaterThan(0); // sanity: the call site still exists
    for (const line of callSites) {
      expect(line).not.toMatch(/inQuietHours\(\s*\)/);
    }
  });
});
