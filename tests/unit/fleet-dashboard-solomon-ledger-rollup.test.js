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
const { computeSolomonLedgerRollup, computeSolomonLedgerByLegAndKind } = require('../../scripts/fleet-dashboard.cjs');

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

describe('FR-5/TR-3 (W2, SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001): batch-stamp exclusion via durable marker', () => {
  it('excludes batch_stamped=true rows from BOTH the accuracy numerator and denominator', () => {
    const rows = [
      // Trustworthy contemporaneous evidence: 1 accepted+shipped_clean of 2 decided -> 50%.
      { decision: 'accepted', outcome: 'shipped_clean', created_at: '2026-07-18T00:00:00Z' },
      { decision: 'rejected', outcome: 'unknown', created_at: '2026-07-18T00:00:00Z' },
      // The 2026-07-12 retro batch — durably marked. Without exclusion these 3 unknown-outcome
      // accepts would crater accuracy to 1/5 = 20%.
      { decision: 'accepted', outcome: 'unknown', batch_stamped: true, created_at: '2026-07-12T15:00:00Z' },
      { decision: 'accepted', outcome: 'unknown', batch_stamped: true, created_at: '2026-07-12T15:00:00Z' },
      { decision: 'partial', outcome: 'unknown', batch_stamped: true, created_at: '2026-07-12T15:00:00Z' },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(2);        // batch rows excluded from the denominator
    expect(r.acceptedShippedClean).toBe(1);
    expect(r.accuracyPct).toBe(50);        // 1/2, NOT 1/5
    expect(r.batchExcludedCount).toBe(3);  // surfaced for chairman/KPI readability
  });

  it('deterministic durable marker, not a timestamp heuristic: a 07-12 row WITHOUT the marker still counts', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean', created_at: '2026-07-12T15:00:00Z' }, // no batch_stamped → included
      { decision: 'accepted', outcome: 'unknown', batch_stamped: true, created_at: '2026-07-12T15:00:00Z' },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(1);       // only the unmarked row
    expect(r.accuracyPct).toBe(100);      // 1/1
    expect(r.batchExcludedCount).toBe(1);
  });

  it('when EVERY decided row is batch-stamped, accuracy is null (no trustworthy evidence) not a misleading number', () => {
    const rows = [
      { decision: 'accepted', outcome: 'unknown', batch_stamped: true, created_at: '2026-07-12T15:00:00Z' },
      { decision: 'pending', outcome: 'unknown', created_at: '2026-07-18T00:00:00Z' },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(0);
    expect(r.accuracyPct).toBeNull();
    expect(r.pendingCount).toBe(1);
    expect(r.batchExcludedCount).toBe(1);
  });

  it('SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001 TS-9: excludes accepted+outcome=unknown from the accuracy denominator (not yet resolved, not a miss)', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean', created_at: '2026-08-19T00:00:00Z' },      // (a) counts in both num+denom
      { decision: 'accepted', outcome: 'unknown', created_at: '2026-08-19T00:00:00Z' },             // (b) excluded entirely
      { decision: 'rejected', outcome: 'not_applicable', created_at: '2026-08-19T00:00:00Z' },      // (c) counts via decision alone, never satisfies numerator
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(2);            // (b) excluded -- only (a) and (c)
    expect(r.acceptedShippedClean).toBe(1);
    expect(r.accuracyPct).toBe(50);             // 1/2, not 1/3 and not 1/2-with-b-as-a-miss
    expect(r.unresolvedAcceptedCount).toBe(1);  // (b) surfaced for observability, mirroring batchExcludedCount
  });

  it('TS-9: accepted+outcome=unknown is still counted in acceptedCount/costPerAccepted (cost was already incurred)', () => {
    const rows = [
      { decision: 'accepted', outcome: 'unknown', cost_tokens: 100, cost_captured: true, created_at: '2026-08-19T00:00:00Z' },
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 300, cost_captured: true, created_at: '2026-08-19T00:00:00Z' },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.acceptedCount).toBe(2);            // both accepted rows counted for cost purposes
    expect(r.costPerAccepted).toBe(200);        // (100+300)/2 — unaffected by the accuracy-denominator exclusion
    expect(r.decidedCount).toBe(1);             // but only the resolved one counts toward accuracy
  });

  it('TS-9: unresolvedAcceptedCount is 0 and absent-safe when all-pending (decidedCount=0 branch)', () => {
    const rows = [{ decision: 'pending', outcome: 'unknown', created_at: '2026-08-19T00:00:00Z' }];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(0);
    expect(r.unresolvedAcceptedCount).toBe(0);
  });

  it('rows with batch_stamped=false or undefined are unaffected (W3 cost tests stay green)', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 100, cost_captured: true, batch_stamped: false },
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 300, cost_captured: true },
    ];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(2);
    expect(r.acceptedCount).toBe(2);
    expect(r.costPerAccepted).toBe(200);
    expect(r.batchExcludedCount).toBe(0);
  });
});

describe('FR-3 (SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001): computeSolomonLedgerByLegAndKind — by proposal_kind, by leg', () => {
  it('groups decided rows by proposal_kind, then by SD-keyed vs correlation-keyed leg, with independent accuracy per cell', () => {
    const rows = [
      { proposal_kind: 'roadmap', outcome_sd_key: 'SD-X-001', decision: 'accepted', outcome: 'shipped_clean' },
      { proposal_kind: 'roadmap', outcome_sd_key: 'SD-X-002', decision: 'accepted', outcome: 'reverted' },
      { proposal_kind: 'roadmap', outcome_sd_key: null, decision: 'rejected', outcome: 'not_applicable' },
      { proposal_kind: 'qf', outcome_sd_key: null, decision: 'accepted', outcome: 'shipped_clean' },
    ];
    const byGroup = computeSolomonLedgerByLegAndKind(rows);
    expect(byGroup.roadmap.sdLeg).toEqual({ decidedCount: 2, accuracyPct: 50 });        // 1/2 shipped_clean
    expect(byGroup.roadmap.correlationLeg).toEqual({ decidedCount: 1, accuracyPct: 0 }); // rejected, never numerator
    expect(byGroup.qf.correlationLeg).toEqual({ decidedCount: 1, accuracyPct: 100 });
    expect(byGroup.qf.sdLeg).toEqual({ decidedCount: 0, accuracyPct: null });            // no SD-keyed qf rows
  });

  it('unset proposal_kind is grouped under "(unset)" rather than silently dropped', () => {
    const rows = [{ proposal_kind: null, outcome_sd_key: null, decision: 'accepted', outcome: 'shipped_clean' }];
    const byGroup = computeSolomonLedgerByLegAndKind(rows);
    expect(byGroup['(unset)'].correlationLeg).toEqual({ decidedCount: 1, accuracyPct: 100 });
  });

  it('excludes accepted+outcome=unknown from each cell (TS-9 rule applies per-group too)', () => {
    const rows = [
      { proposal_kind: 'roadmap', outcome_sd_key: null, decision: 'accepted', outcome: 'unknown' },
      { proposal_kind: 'roadmap', outcome_sd_key: null, decision: 'accepted', outcome: 'shipped_clean' },
    ];
    const byGroup = computeSolomonLedgerByLegAndKind(rows);
    expect(byGroup.roadmap.correlationLeg).toEqual({ decidedCount: 1, accuracyPct: 100 }); // the unknown row excluded
  });

  it('excludes batch_stamped rows from each cell (same rule as the top-level rollup)', () => {
    const rows = [
      { proposal_kind: 'roadmap', outcome_sd_key: 'SD-X', decision: 'accepted', outcome: 'unknown', batch_stamped: true },
      { proposal_kind: 'roadmap', outcome_sd_key: 'SD-X', decision: 'accepted', outcome: 'shipped_clean' },
    ];
    const byGroup = computeSolomonLedgerByLegAndKind(rows);
    expect(byGroup.roadmap.sdLeg).toEqual({ decidedCount: 1, accuracyPct: 100 });
  });

  it('empty input returns an empty object, never throws', () => {
    expect(computeSolomonLedgerByLegAndKind([])).toEqual({});
    expect(computeSolomonLedgerByLegAndKind(undefined)).toEqual({});
  });
});

// SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002 (FR-3): 'unmeasurable' must behave EXACTLY like 'unknown'
// for the accuracy-denominator exclusion (TS-8 — the critical regression guard), and
// consequenceScoredAccuracyPct is a genuinely new, separately-computed lens (TS-6).
describe('FR-3: TS-8 — accuracyPct regression guard for the new unmeasurable value', () => {
  it('accuracyPct is BITWISE IDENTICAL whether a formerly-unknown accepted row is unknown or unmeasurable', () => {
    const baseRows = [
      { decision: 'accepted', outcome: 'shipped_clean', cost_tokens: 10 },
      { decision: 'accepted', outcome: 'reverted', cost_tokens: 10 },
    ];
    const beforeRows = [...baseRows, { decision: 'accepted', outcome: 'unknown', cost_tokens: 10 }];
    const afterRows = [...baseRows, { decision: 'accepted', outcome: 'unmeasurable', cost_tokens: 10 }];

    const before = computeSolomonLedgerRollup(beforeRows);
    const after = computeSolomonLedgerRollup(afterRows);
    expect(after.accuracyPct).toBe(before.accuracyPct);
    expect(after.decidedCount).toBe(before.decidedCount);
    expect(after.unresolvedAcceptedCount).toBe(before.unresolvedAcceptedCount);
  });

  it('same bitwise-identical guarantee holds for computeSolomonLedgerByLegAndKind per-leg numbers', () => {
    const baseRows = [
      { proposal_kind: 'roadmap', outcome_sd_key: null, decision: 'accepted', outcome: 'shipped_clean' },
    ];
    const beforeRows = [...baseRows, { proposal_kind: 'roadmap', outcome_sd_key: null, decision: 'accepted', outcome: 'unknown' }];
    const afterRows = [...baseRows, { proposal_kind: 'roadmap', outcome_sd_key: null, decision: 'accepted', outcome: 'unmeasurable' }];

    const before = computeSolomonLedgerByLegAndKind(beforeRows);
    const after = computeSolomonLedgerByLegAndKind(afterRows);
    expect(after.roadmap.correlationLeg).toEqual(before.roadmap.correlationLeg);
  });
});

describe('FR-3: TS-6 — consequenceScoredAccuracyPct', () => {
  it('excludes unmeasurable AND unknown from both numerator and denominator', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'reverted' },
      { decision: 'accepted', outcome: 'caused_rework' },
      { decision: 'accepted', outcome: 'unmeasurable' },
      { decision: 'accepted', outcome: 'unknown' },
    ];
    const r = computeSolomonLedgerRollup(rows);
    // 2 shipped_clean / (2 shipped_clean + 1 reverted + 1 caused_rework) = 2/4 = 50%
    expect(r.consequenceScoredAccuracyPct).toBe(50);
  });

  it('excludes batch_stamped rows from consequenceScoredAccuracyPct, matching accuracyPct\'s existing exclusion', () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'reverted' },
    ];
    const withBatchStamped = [...rows, { decision: 'accepted', outcome: 'shipped_clean', batch_stamped: true }];
    const r1 = computeSolomonLedgerRollup(rows);
    const r2 = computeSolomonLedgerRollup(withBatchStamped);
    expect(r2.consequenceScoredAccuracyPct).toBe(r1.consequenceScoredAccuracyPct);
  });

  it('is null (not 0 or NaN) when there are zero resolved-consequence rows', () => {
    const rows = [{ decision: 'accepted', outcome: 'unknown' }];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.consequenceScoredAccuracyPct).toBeNull();
  });

  it('is present (not undefined) even on the decidedCount===0 early-return branch', () => {
    const rows = [{ decision: 'pending', outcome: 'unknown', created_at: '2026-07-04T00:00:00Z' }];
    const r = computeSolomonLedgerRollup(rows);
    expect(r.decidedCount).toBe(0);
    expect(r.consequenceScoredAccuracyPct).toBeNull();
  });
});
