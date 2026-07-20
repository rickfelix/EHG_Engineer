/**
 * SD-LEO-INFRA-SOURCING-ENGINE-DEDUP-AUTOSTAMP-001 (child 6/10) — FR-4 unit tests.
 *
 * Verifies the dedup-autostamp wiring over the SHIPPED router:
 *   FR-1: a genuine duplicate is stamped (dedup lane + dedup_match_sd_key); a coincidental
 *         single-token overlap does NOT dedup.
 *   FR-2: an infra-shipped-but-outcome-OPEN match re-emits (re_emit=true), not terminal-duplicate;
 *         deriveOutcomeRealizedKeys keys realization off the VDR 'built' status.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveOutcomeRealizedKeys,
  stampCandidate,
  ledgerLaneColumnExists,
  autostampLedgerCandidates,
} from '../../../lib/sourcing-engine/dedup-autostamp.js';

/**
 * Minimal chainable + thenable Supabase mock. Resolves each query from (table, selectCols, _update),
 * letting us exercise the dormant-lane-column path with no DB.
 */
function makeSupabaseMock({ laneColumnExists, sds = [], ledgerRows = [] }) {
  const updates = [];
  const from = (table) => {
    const state = { table, selectCols: null, _update: null };
    const b = {
      select(cols) { state.selectCols = cols; return b; },
      limit() { return b; },
      is() { return b; },
      eq() { return b; },
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: order()/range() added so
      // fetchAllPaginated-converted call sites (the SD load + candidates load below) can
      // chain on this thenable mock like any other filter method.
      order() { return b; },
      range() { return b; },
      update(patch) { state._update = patch; return b; },
      then(resolve, reject) { return Promise.resolve(resolveResult(state)).then(resolve, reject); },
    };
    return b;
  };
  const resolveResult = (state) => {
    if (state._update) { updates.push({ table: state.table, patch: state._update }); return { data: null, error: null }; }
    if (state.table === 'conversion_ledger' && state.selectCols === 'lane') {
      return laneColumnExists
        ? { data: [], error: null }
        : { data: null, error: { code: '42703', message: 'column conversion_ledger.lane does not exist' } };
    }
    if (state.table === 'strategic_directives_v2') return { data: sds, error: null };
    if (state.table === 'conversion_ledger') return { data: ledgerRows, error: null };
    return { data: [], error: null };
  };
  return { from, _updates: updates };
}

const EXISTING = [
  { sd_key: 'SD-EXISTING-AUTH-TOKEN-VAULT-001', title: 'Auth token vault for bank read' },
  { sd_key: 'SD-EXISTING-COCKPIT-OVERVIEW-001', title: 'Operator cockpit overview shell' },
];

describe('FR-2: deriveOutcomeRealizedKeys (VDR built-status drives realization)', () => {
  const pairs = [
    { sd_key: 'SD-A', capability: 'The cockpit' },
    { sd_key: 'SD-B', capability: 'See distance-to-broke' },
    { sd_key: 'SD-C', capability: 'A queryable, structured north star' },
  ];
  const gauge = [
    { capability: 'The cockpit', status: 'built' },
    { capability: 'See distance-to-broke', status: 'partial' },
    { capability: 'A queryable, structured north star', status: 'unbuilt' },
  ];

  it('marks only capabilities the gauge scores built as realized', () => {
    const realized = deriveOutcomeRealizedKeys(pairs, gauge);
    expect(realized.has('SD-A')).toBe(true);  // built
    expect(realized.has('SD-B')).toBe(false); // partial → not realized
    expect(realized.has('SD-C')).toBe(false); // unbuilt → not realized
  });

  it('treats an SD with no capability link / no gauge entry as NOT realized (safe direction)', () => {
    expect(deriveOutcomeRealizedKeys([{ sd_key: 'SD-X', capability: 'Unmapped cap' }], gauge).has('SD-X')).toBe(false);
    expect(deriveOutcomeRealizedKeys([{ sd_key: 'SD-Y' }], gauge).has('SD-Y')).toBe(false); // missing capability
    expect(deriveOutcomeRealizedKeys([], gauge).size).toBe(0);
  });
});

describe('FR-1: stampCandidate dedup stamping', () => {
  it('stamps a genuine duplicate onto the dedup lane with the matched sd_key', () => {
    const stamp = stampCandidate(
      { title: 'Auth token vault for bank read' }, // exact-title dup of EXISTING[0]
      { existing: EXISTING },
    );
    expect(stamp.lane).toBe('dedup');
    expect(stamp.dedup_match_sd_key).toBe('SD-EXISTING-AUTH-TOKEN-VAULT-001');
  });

  it('does NOT dedup a coincidental single-token overlap', () => {
    const stamp = stampCandidate(
      { title: 'Auth audit log retention policy' }, // shares only "auth" with EXISTING[0]
      { existing: EXISTING },
    );
    expect(stamp.lane).not.toBe('dedup');
    expect(stamp.dedup_match_sd_key).toBeNull();
    expect(stamp.re_emit).toBe(false);
  });
});

describe('FR-2: stampCandidate re-emit rule (infra shipped != outcome realized)', () => {
  it('re-emits to the outcome-gated lane when the matched SD is shipped but its outcome is NOT realized', () => {
    const stamp = stampCandidate(
      { title: 'Operator cockpit overview shell' }, // dup of EXISTING[1]
      {
        existing: EXISTING,
        shippedInfraKeys: new Set(['SD-EXISTING-COCKPIT-OVERVIEW-001']),
        outcomeRealizedKeys: new Set(), // cockpit shipped but capability not yet 'built'
      },
    );
    // C2: a re-emit is durable OPEN work, not a terminal dup → routed to outcome-gated (a valid
    // FIXED_LANE) while keeping dedup_match_sd_key as the back-reference, so the signal isn't lost.
    expect(stamp.lane).toBe('outcome-gated');
    expect(stamp.dedup_match_sd_key).toBe('SD-EXISTING-COCKPIT-OVERVIEW-001');
    expect(stamp.re_emit).toBe(true); // NOT terminally closed — still-open realization work
  });

  it('does NOT re-emit when the matched SD is shipped AND outcome-realized (terminal duplicate)', () => {
    const stamp = stampCandidate(
      { title: 'Operator cockpit overview shell' },
      {
        existing: EXISTING,
        shippedInfraKeys: new Set(['SD-EXISTING-COCKPIT-OVERVIEW-001']),
        outcomeRealizedKeys: new Set(['SD-EXISTING-COCKPIT-OVERVIEW-001']),
      },
    );
    expect(stamp.lane).toBe('dedup'); // terminal dup stays on the dedup lane
    expect(stamp.re_emit).toBe(false); // realized → genuine terminal duplicate
  });
});

describe('C1: dormant-safe runner (conversion_ledger.lane migration unapplied)', () => {
  it('ledgerLaneColumnExists returns false on a 42703 column-missing error', async () => {
    expect(await ledgerLaneColumnExists(makeSupabaseMock({ laneColumnExists: false }))).toBe(false);
  });

  it('ledgerLaneColumnExists returns true when the column is present', async () => {
    expect(await ledgerLaneColumnExists(makeSupabaseMock({ laneColumnExists: true }))).toBe(true);
  });

  it('forces dry-run and persists NOTHING when the lane column is dormant, but still computes stamps', async () => {
    const sb = makeSupabaseMock({
      laneColumnExists: false,
      sds: [{ sd_key: 'SD-EXISTING-COCKPIT-OVERVIEW-001', title: 'Operator cockpit overview shell', status: 'completed', metadata: {} }],
      ledgerRows: [{ id: 'L1', source_id: 's1', title: 'Operator cockpit overview shell', disposition: null, rung: null, dedup_match_sd_key: null }],
    });
    const res = await autostampLedgerCandidates({ supabase: sb, io: {} });
    expect(res.lane_column_missing).toBe(true);
    expect(res.dry_run).toBe(true);
    expect(sb._updates.length).toBe(0); // hard guarantee: zero writes while dormant
    expect(res.stamped).toBe(1);        // computed anyway (observable the moment the migration lands)
    expect(res.dedup).toBe(1);          // matched the existing shipped SD
    expect(res.re_emit).toBe(1);        // shipped-but-not-realized → re-emit signal preserved
  });
});
