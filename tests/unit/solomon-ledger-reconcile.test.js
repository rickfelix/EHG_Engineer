/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-4) — outcome reconciliation reads the
 * ACTUAL downstream SD terminal status, never Solomon's self-report. Injected-stub coverage.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { mapSdStatusToOutcome, reconcileBatch } = require('../../scripts/solomon-ledger-reconcile.cjs');

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
