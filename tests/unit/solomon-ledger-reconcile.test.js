/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-4) — outcome reconciliation reads the
 * ACTUAL downstream SD terminal status, never Solomon's self-report. Injected-stub coverage.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  mapSdStatusToOutcome, reconcileBatch,
  selectNegativeBackprop, collectNegativeRefs, backPropagateNegativeOutcomes, addRefsFromMetadata,
  NEGATIVE_OUTCOME, NEGATIVE_BACKPROP_SOURCE,
} = require('../../scripts/solomon-ledger-reconcile.cjs');

describe('FR-4: mapSdStatusToOutcome', () => {
  it('maps completed -> shipped_clean, cancelled -> reverted, else null (not yet terminal)', () => {
    expect(mapSdStatusToOutcome('completed')).toBe('shipped_clean');
    expect(mapSdStatusToOutcome('cancelled')).toBe('reverted');
    expect(mapSdStatusToOutcome('in_progress')).toBeNull();
    expect(mapSdStatusToOutcome('draft')).toBeNull();
    expect(mapSdStatusToOutcome(undefined)).toBeNull();
  });
});

describe('FR-4: reconcileBatch — reads the actual downstream SD, not Solomon self-report', () => {
  it('resolves a row to shipped_clean when its outcome_sd_key SD is completed', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'completed' }, error: null }) }) }) }) };
    const results = await reconcileBatch(sb, [{ id: 'row-1', outcome_sd_key: 'SD-X-001' }]);
    expect(results[0]).toMatchObject({ id: 'row-1', updated: true, outcome: 'shipped_clean' });
  });

  it('carries the resolving sdKey through for closer-of-record stamping (SD-LEO-INFRA-REWARD-SPINE-ONE-001-B)', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'completed' }, error: null }) }) }) }) };
    const results = await reconcileBatch(sb, [{ id: 'row-1', outcome_sd_key: 'SD-X-001' }]);
    expect(results[0].sdKey).toBe('SD-X-001');
  });

  it('leaves a row unresolved (unknown) when the SD is not yet terminal', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'in_progress' }, error: null }) }) }) }) };
    const results = await reconcileBatch(sb, [{ id: 'row-2', outcome_sd_key: 'SD-Y-001' }]);
    expect(results[0].updated).toBe(false);
    expect(results[0].reason).toMatch(/not yet terminal/);
  });

  it('skips rows with no outcome_sd_key without querying the DB', async () => {
    const sb = { from: () => ({ select: () => { throw new Error('should not query'); } }) };
    const results = await reconcileBatch(sb, [{ id: 'row-3', outcome_sd_key: null }]);
    expect(results[0].updated).toBe(false);
    expect(results[0].reason).toMatch(/no outcome_sd_key/);
  });

  it('is fail-open per row — one lookup failure does not abort the batch', async () => {
    let call = 0;
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              call += 1;
              if (call === 1) throw new Error('transient db error');
              return { data: { status: 'completed' }, error: null };
            },
          }),
        }),
      }),
    };
    const results = await reconcileBatch(sb, [
      { id: 'row-4', outcome_sd_key: 'SD-A-001' },
      { id: 'row-5', outcome_sd_key: 'SD-B-001' },
    ]);
    expect(results[0].updated).toBe(false);
    expect(results[0].reason).toMatch(/transient db error/);
    expect(results[1].updated).toBe(true); // second row still processed despite the first failing
    expect(results[1].outcome).toBe('shipped_clean');
  });
});

describe('FR-4 (W2, SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001): negative-outcome back-propagation', () => {
  it('selectNegativeBackprop matches ONLY on exact outcome_ref equality (never a heuristic/substring)', () => {
    const rows = [
      { id: 'a', outcome: 'unknown', outcome_ref: 'SD-REVERTED-001' },       // exact match -> flip
      { id: 'b', outcome: 'shipped_clean', outcome_ref: 'SD-REVERTED-001' }, // a later revert means it was NOT clean -> flip
      { id: 'c', outcome: 'unknown', outcome_ref: 'SD-REVERTED-001-EXTRA' }, // superset string — must NOT match
      { id: 'd', outcome: 'unknown', outcome_ref: 'SD-OTHER-002' },          // unrelated
      { id: 'e', outcome: 'unknown', outcome_ref: null },                    // no linkage
    ];
    const picks = selectNegativeBackprop(rows, new Set(['SD-REVERTED-001']));
    expect(picks.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(picks.find((p) => p.id === 'b').priorOutcome).toBe('shipped_clean');
  });

  it('never re-flips an already-negative row (idempotent) and never touches a NO_ARTIFACT sentinel', () => {
    const rows = [
      { id: 'a', outcome: 'reverted', outcome_ref: 'SD-X' },       // already negative
      { id: 'b', outcome: 'caused_rework', outcome_ref: 'SD-X' },  // already negative
      { id: 'c', outcome: 'unknown', outcome_ref: 'NO_ARTIFACT' }, // explicit no-artifact — nothing to track
      { id: 'd', outcome: 'unknown', outcome_ref: 'NO_ARTIFACT: verbal ack' },
    ];
    // even if the ref set literally contained these strings, none should be selected
    expect(selectNegativeBackprop(rows, new Set(['SD-X', 'NO_ARTIFACT', 'NO_ARTIFACT: verbal ack'])).length).toBe(0);
  });

  it('addRefsFromMetadata harvests candidate refs from a red-merge/revert signal metadata object', () => {
    const set = new Set();
    addRefsFromMetadata(set, { sha: 'abc123', sd_key: 'SD-Q', signature: 'red-merge:ci:abc123', irrelevant: 'x' });
    expect(set.has('abc123')).toBe(true);
    expect(set.has('SD-Q')).toBe(true);
    expect(set.has('red-merge:ci:abc123')).toBe(true);
    expect(set.has('x')).toBe(false); // only whitelisted keys
  });

  it('SEEDED end-to-end: a seeded revert signal back-propagates outcome=reverted onto its linked ledger row', async () => {
    // Ledger candidate rows (returned by the .not(outcome_ref is null) select).
    const ledger = [
      { id: 'row-linked', outcome: 'unknown', outcome_ref: 'SD-SEEDED-REVERT-001' },
      { id: 'row-unrelated', outcome: 'unknown', outcome_ref: 'SD-CLEAN-002' },
    ];
    const updates = [];
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: collectNegativeRefs /
    // backPropagateNegativeOutcomes now paginate via fapPaginate, which chains .order() then
    // a terminal .range() instead of the old terminal .limit().
    const sb = {
      from: (table) => {
        if (table === 'audit_log') {
          const chain = {
            select: () => chain,
            in: () => chain,
            order: () => chain,
            range: async () => ({ data: [{ event: 'SD_REVERTED', metadata: { sd_key: 'SD-SEEDED-REVERT-001' } }], error: null }),
          };
          return chain;
        }
        if (table === 'strategic_directives_v2') {
          const chain = {
            select: () => chain,
            not: () => chain,
            order: () => chain,
            range: async () => ({ data: [], error: null }),
          };
          return chain;
        }
        // solomon_advice_outcome_ledger
        const chain = {
          select: () => chain,
          not: () => chain,
          order: () => chain,
          range: async () => ({ data: ledger, error: null }),
          update: (patch) => ({ eq: (col, val) => { updates.push({ patch, col, val }); return Promise.resolve({ error: null }); } }),
        };
        return chain;
      },
    };
    const negRefs = await collectNegativeRefs(sb, {});
    expect(negRefs.has('SD-SEEDED-REVERT-001')).toBe(true);
    const res = await backPropagateNegativeOutcomes(sb, { negativeRefs: negRefs, nowIso: '2026-07-19T00:00:00Z' });
    expect(res.updated).toEqual(['row-linked']);               // only the linked row flipped
    expect(updates).toHaveLength(1);
    expect(updates[0].val).toBe('row-linked');
    expect(updates[0].patch.outcome).toBe(NEGATIVE_OUTCOME);   // 'reverted'
    expect(updates[0].patch.closed_by).toBe(NEGATIVE_BACKPROP_SOURCE); // closer-of-record stamped
    expect(updates[0].patch.closed_at).toBe('2026-07-19T00:00:00Z');
  });

  it('dryRun reports matches without writing', async () => {
    const ledger = [{ id: 'r1', outcome: 'unknown', outcome_ref: 'SD-R' }];
    let updateCalled = false;
    const sb = { from: () => {
      const chain = {
        select: () => chain,
        not: () => chain,
        order: () => chain,
        range: async () => ({ data: ledger, error: null }),
        update: () => { updateCalled = true; return { eq: () => Promise.resolve({ error: null }) }; },
      };
      return chain;
    } };
    const res = await backPropagateNegativeOutcomes(sb, { negativeRefs: new Set(['SD-R']), dryRun: true });
    expect(res.matched.map((m) => m.id)).toEqual(['r1']);
    expect(res.updated).toEqual([]);
    expect(updateCalled).toBe(false);
  });

  it('no negative refs → no-op (never queries the ledger)', async () => {
    const sb = { from: () => ({ select: () => { throw new Error('should not query'); } }) };
    const res = await backPropagateNegativeOutcomes(sb, { negativeRefs: new Set() });
    expect(res.updated).toEqual([]);
    expect(res.matched).toEqual([]);
  });
});
