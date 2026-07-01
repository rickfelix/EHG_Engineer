/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-5, TS-4, TS-5) — the accuracy +
 * cost-per-accepted-proposal rollup over solomon_advice_outcome_ledger. Pure-function coverage
 * (no DB, no console output) against the exported computeSolomonLedgerRollup.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { computeSolomonLedgerRollup } = require('../../scripts/fleet-dashboard.cjs');

describe('FR-5: computeSolomonLedgerRollup', () => {
  it('TS-4: excludes pending rows from the accuracy denominator', () => {
    const rows = [
      { decision: 'pending', outcome: 'unknown' },
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 100 },
      { decision: 'rejected', outcome: 'unknown' },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(2);       // pending excluded
    expect(r.pendingCount).toBe(1);
    expect(r.acceptedShippedClean).toBe(1);
    expect(r.accuracyPct).toBe(50);       // 1/2
  });

  it('TS-5: returns null (renderer prints "no data yet") when there are zero decided rows', () => {
    expect(computeSolomonLedgerRollup([])).toBeNull();
    expect(computeSolomonLedgerRollup([{ decision: 'pending', outcome: 'unknown' }])).toBeNull();
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

  it('treats a missing/non-finite cost_tokens as 0 rather than crashing', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean' }, // no cost_tokens field
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 50 },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.costPerAccepted).toBe(25); // (0+50)/2
  });
});
