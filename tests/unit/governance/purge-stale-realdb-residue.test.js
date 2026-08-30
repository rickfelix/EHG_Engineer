/**
 * QF-20260830-177 — purgeStaleRealDbResidue bounds the RealDB integration-test-residue class.
 *
 * SPECIMEN: 38 chairman_decisions rows sitting pending for ~36 days, minted for ventures
 * created by tests/integration/eva/*-realdb.test.js suites whose CI runs were interrupted
 * before afterAll ran. This sweeps prior-run leftovers matching the suite's own name prefix
 * before each new run mints fresh fixtures.
 */
import { describe, it, expect, vi } from 'vitest';
import { purgeStaleRealDbResidue } from '../../../lib/governance/fixture-producer-guard.mjs';

function makeFakeSupabase({ ventures = [] } = {}) {
  const deletedFrom = {};
  const client = {
    from(table) {
      return {
        select() { return this; },
        ilike() { return this; },
        lt() { return this; },
        limit() {
          if (table === 'ventures') return Promise.resolve({ data: ventures, error: null });
          return this;
        },
        delete() { return this; },
        in(col, ids) {
          deletedFrom[table] = ids;
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { client, deletedFrom };
}

describe('purgeStaleRealDbResidue', () => {
  it('[SPECIMEN] purges stale ventures matching the prefix and every child table', async () => {
    const { client, deletedFrom } = makeFakeSupabase({
      ventures: [{ id: 'v1', name: 'HCGate-RealDB-rpc-block-1784238026383' }, { id: 'v2', name: 'HCGate-RealDB-rpc-advisory-1784238026383' }],
    });
    const result = await purgeStaleRealDbResidue(client, { namePrefix: 'HCGate-RealDB-' });
    expect(result).toEqual({ purged: 2 });
    expect(deletedFrom.ventures).toEqual(['v1', 'v2']);
    expect(deletedFrom.chairman_decisions).toEqual(['v1', 'v2']);
    expect(deletedFrom.venture_artifacts).toEqual(['v1', 'v2']);
    expect(deletedFrom.venture_stage_work).toEqual(['v1', 'v2']);
    expect(deletedFrom.venture_stage_transitions).toEqual(['v1', 'v2']);
  });

  it('[TWO-SIDED] no stale rows -> no deletes fired at all', async () => {
    const { client, deletedFrom } = makeFakeSupabase({ ventures: [] });
    const result = await purgeStaleRealDbResidue(client, { namePrefix: 'HCGate-RealDB-' });
    expect(result).toEqual({ purged: 0 });
    expect(deletedFrom).toEqual({});
  });

  it('fails soft (never throws) on a lookup error', async () => {
    const client = { from: () => ({ select() { return this; }, ilike() { return this; }, lt() { return this; }, limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) };
    const warn = vi.fn();
    const result = await purgeStaleRealDbResidue(client, { namePrefix: 'HCGate-RealDB-', logger: { warn } });
    expect(result).toEqual({ purged: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('requires a namePrefix', async () => {
    await expect(purgeStaleRealDbResidue({}, {})).rejects.toThrow('namePrefix');
  });
});
