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
import { checkHeartbeatCadence, HEARTBEAT_OVERDUE_THRESHOLD_MS } from '../../../scripts/adam-quiet-tick.mjs';

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
