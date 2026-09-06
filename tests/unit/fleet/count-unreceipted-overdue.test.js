/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-5(d) (AC-15 / TS-8,
 * ratification 49656c8c's preventive-exit-predicate: worker signals unreceipted past 30
 * minutes, asserted at zero).
 *
 * countUnreceiptedOverdue is pure over an already-fetched fetchAllOutstandingSignals() result,
 * so these tests construct that result shape directly rather than re-mocking the whole fetch.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { countUnreceiptedOverdue } = require('../../../lib/fleet/outstanding-signals.cjs');

function makeResult(signals, { receivedCheckReliable = true } = {}) {
  return { count: signals.length, shown: signals.length, signals, received_check_reliable: receivedCheckReliable };
}

describe('countUnreceiptedOverdue (FR-5(d))', () => {
  it('AC-15: reports 0 when every overdue signal has a receipt', () => {
    const result = makeResult([
      { age_minutes: 45, received: true },
      { age_minutes: 60, received: true },
    ]);
    expect(countUnreceiptedOverdue(result)).toBe(0);
  });

  it('AC-15: reports N (not 0) when N overdue signals lack a receipt', () => {
    const result = makeResult([
      { age_minutes: 45, received: false },
      { age_minutes: 60, received: false },
      { age_minutes: 10, received: false }, // under threshold — not counted
    ]);
    expect(countUnreceiptedOverdue(result)).toBe(2);
  });

  it('a signal under the 30-minute threshold, even unreceipted, is not counted', () => {
    const result = makeResult([{ age_minutes: 5, received: false }]);
    expect(countUnreceiptedOverdue(result)).toBe(0);
  });

  it('a custom ageThresholdMin is honored', () => {
    const result = makeResult([{ age_minutes: 12, received: false }]);
    expect(countUnreceiptedOverdue(result, { ageThresholdMin: 10 })).toBe(1);
    expect(countUnreceiptedOverdue(result, { ageThresholdMin: 15 })).toBe(0);
  });

  it('AC-15/TS-8: reports "unknown" (never 0) when the underlying fetch returned null', () => {
    expect(countUnreceiptedOverdue(null)).toBe('unknown');
  });

  it('AC-15/TS-8: reports "unknown" (never 0) when the receipt-existence-check itself failed, even with overdue unreceipted-looking signals present', () => {
    const result = makeResult([{ age_minutes: 45, received: false }], { receivedCheckReliable: false });
    expect(countUnreceiptedOverdue(result)).toBe('unknown');
    expect(countUnreceiptedOverdue(result)).not.toBe(0);
  });

  // CORRECTED (adversarial post-merge review, PR #8356, WARNING finding): a genuinely empty
  // result (zero outstanding signals) is now a real object with signals:[], NOT bare null (see
  // the correction in tests/unit/fleet/outstanding-signals.test.js) -- this MUST report a real 0,
  // never 'unknown', or the gauge trips on the healthiest possible fleet state.
  it("WARN-fix: reports a real 0 (never 'unknown') for a genuinely empty, verified result", () => {
    const result = { count: 0, shown: 0, oldest_age_minutes: null, signals: [], received_check_reliable: true };
    expect(countUnreceiptedOverdue(result)).toBe(0);
    expect(countUnreceiptedOverdue(result)).not.toBe('unknown');
  });
});
