/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-5, TS-4, TS-5) — the accuracy +
 * cost-per-accepted-proposal rollup over solomon_advice_outcome_ledger. Pure-function coverage
 * (no DB, no console output) against the exported computeSolomonLedgerRollup.
 * QF-20260704-598 extends TS-5: an all-pending ledger used to render "(no data yet)", hiding
 * pending decay from the dashboard entirely until the FIRST decision was ever recorded. It now
 * returns decidedCount=0 with pending fields populated instead of null.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { computeSolomonLedgerRollup } = require('../../scripts/fleet-dashboard.cjs');

describe('FR-5: computeSolomonLedgerRollup', () => {
  it('TS-4: excludes pending rows from the accuracy denominator', () => {
    const rows = [
      { decision: 'pending', outcome: 'unknown', created_at: '2026-07-04T00:00:00Z' },
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 100, created_at: '2026-07-04T00:00:00Z' },
      { decision: 'rejected', outcome: 'unknown', created_at: '2026-07-04T00:00:00Z' },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(2);       // pending excluded
    expect(r.pendingCount).toBe(1);
    expect(r.acceptedShippedClean).toBe(1);
    expect(r.accuracyPct).toBe(50);       // 1/2
  });

  it('TS-5: returns null only when there are literally zero ledger rows', () => {
    expect(computeSolomonLedgerRollup([])).toBeNull();
  });

  it('QF-20260704-598: an all-pending ledger returns decidedCount=0 with pending/oldest-age populated (not null)', () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const rows = [
      { decision: 'pending', outcome: 'unknown', created_at: '2026-07-04T12:00:00Z' }, // 24h old
      { decision: 'pending', outcome: 'unknown', created_at: '2026-07-03T12:00:00Z' }, // 48h old (oldest)
    ];
    const r = computeSolomonLedgerRollup(rows, nowMs);
    expect(r).not.toBeNull();
    expect(r.decidedCount).toBe(0);
    expect(r.pendingCount).toBe(2);
    expect(r.oldestPendingAgeMs).toBe(48 * 60 * 60 * 1000);
    expect(r.accuracyPct).toBeNull();
    expect(r.costPerAccepted).toBeNull();
  });

  it('QF-20260704-598: oldestPendingAgeMs is null when there are zero pending rows', () => {
    const rows = [{ decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 10, created_at: '2026-07-04T00:00:00Z' }];
    const r = computeSolomonLedgerRollup(rows, Date.now());
    expect(r.pendingCount).toBe(0);
    expect(r.oldestPendingAgeMs).toBeNull();
  });

  it('computes cost-per-accepted-proposal from accepted rows only', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 100 },
      { decision: 'accepted', outcome: 'reverted', cost_tokens: 300 },
      { decision: 'rejected', outcome: 'unknown', cost_tokens: 99999 }, // never counted (not accepted)
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.acceptedCount).toBe(2);
    expect(r.costPerAccepted).toBe(200); // (100+300)/2
  });

  it('reports costPerAccepted=null when there are decided-but-zero-accepted rows (no divide-by-zero)', () => {
    const rows = [{ decision: 'rejected', outcome: 'unknown' }];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.acceptedCount).toBe(0);
    expect(r.costPerAccepted).toBeNull();
  });

  it('TR-4 (SD-...-ROLE-MEASUREMENT-INTEGRITY-001): excludes rows with no captured cost from the cost denominator (never distorts)', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean' }, // no cost_tokens — telemetry never captured
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 50 },
    ];
    const r = computeSolomonLedgerRollup(rows);
    // The uncaptured row is dropped from BOTH numerator and denominator, so cost-per-accepted is the
    // real captured cost (50), not a distorted 25. acceptedCount still reflects all accepted rows.
    expect(r.acceptedCount).toBe(2);
    expect(r.costCapturedCount).toBe(1);
    expect(r.costPerAccepted).toBe(50);
  });

  it('TR-4: a durable cost_captured=false row is excluded from cost-per-accepted (fail-soft rows never inflate spend)', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: null, cost_captured: false }, // fail-soft write
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 400, cost_captured: true },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.acceptedCount).toBe(2);
    expect(r.costCapturedCount).toBe(1);
    expect(r.costPerAccepted).toBe(400); // only the captured row counts
  });
});
