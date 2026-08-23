/**
 * QF-20260823-131: the durable hourly heartbeat cron ('heartbeat-sms' ADAM_LOOPS entry, cron
 * '14 * * * *') is the ONLY check enforcing the hourly cadence contract, and it only measures
 * the gap once per hour — a send just after :14 (e.g. :44) left the contract unenforceable
 * until the next hour's :14 tick, worst case ~90min. checkHeartbeatCadence() re-runs the SAME
 * >=55min measured-gap check from quiet-tick's own 15min cadence, so a breach is caught within
 * one quiet-tick cycle instead of waiting up to 46 more minutes.
 *
 * Regression: simulate a send at :44 and assert the next detected breach lands within 75min.
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

  it('reports nothing when the gap is under the 55min threshold', async () => {
    const sentAt = new Date('2026-08-23T15:00:00Z');
    const now = new Date(sentAt.getTime() + 30 * 60 * 1000); // 30min later
    const sb = sbWithRow({ created_at: sentAt.toISOString() });
    const result = await checkHeartbeatCadence(sb, { nowMs: now.getTime() });
    expect(result.overdueMin).toBeNull();
  });

  it('flags overdue once the gap crosses 55min', async () => {
    const sentAt = new Date('2026-08-23T15:00:00Z');
    const now = new Date(sentAt.getTime() + HEARTBEAT_OVERDUE_THRESHOLD_MS);
    const sb = sbWithRow({ created_at: sentAt.toISOString() });
    const result = await checkHeartbeatCadence(sb, { nowMs: now.getTime() });
    expect(result.overdueMin).toBe(55);
  });

  // THE REGRESSION ITSELF: a send at :44 must be detected as overdue well within 75min, not
  // left to slip to the ~90min worst case the old once-per-hour-only check allowed.
  it('QF-20260823-131 regression: a send at :44 is detected as overdue within 75min via a 15min-cadence re-check', async () => {
    const sentAt = new Date('2026-08-23T15:44:00Z'); // the exact incident shape
    const sb = sbWithRow({ created_at: sentAt.toISOString() });

    // Simulate quiet-tick's own 15min cadence ticking forward from the send time.
    let detectedAtMin = null;
    for (let elapsedMin = 15; elapsedMin <= 90; elapsedMin += 15) {
      const now = new Date(sentAt.getTime() + elapsedMin * 60 * 1000);
      const result = await checkHeartbeatCadence(sb, { nowMs: now.getTime() });
      if (result.overdueMin != null) { detectedAtMin = elapsedMin; break; }
    }

    expect(detectedAtMin).not.toBeNull();
    expect(detectedAtMin).toBeLessThanOrEqual(75);
  });

  it('read error degrades to no alarm (fail-soft, never a false positive on an unreadable ledger)', async () => {
    const sb = sbWithError();
    const result = await checkHeartbeatCadence(sb, { nowMs: Date.now() });
    expect(result.overdueMin).toBeNull();
  });
});
