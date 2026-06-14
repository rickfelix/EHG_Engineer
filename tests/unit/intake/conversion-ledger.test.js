import { describe, it, expect } from 'vitest';
import { registerItem, setDisposition, backlogDepth } from '../../../lib/intake/conversion-ledger.js';

// Minimal mock matching the exact Supabase chains the ledger lib uses.
function makeClient({ upsertResult, reselectResult, updateResult, countResult } = {}) {
  return {
    from() {
      return {
        upsert: () => ({ select: () => Promise.resolve(upsertResult) }),
        update: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve(updateResult) }) }) }),
        select: (cols, opts) => {
          if (opts && opts.head) return { is: () => Promise.resolve(countResult) };
          return { eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(reselectResult) }) }) };
        },
      };
    },
  };
}

const validItem = { source_pool: 'eva_consultant_rec', source_id: 'rec-1', title: 'Some signal', normalized_priority: 'high' };

describe('conversion-ledger lib', () => {
  it('registerItem returns the freshly-inserted row', async () => {
    const client = makeClient({ upsertResult: { data: [{ id: 'L1', ...validItem, disposition: null }], error: null } });
    const row = await registerItem(validItem, { client });
    expect(row.id).toBe('L1');
    expect(row.disposition).toBeNull();
  });

  it('registerItem is idempotent — returns the EXISTING row (disposition preserved) on conflict', async () => {
    const client = makeClient({
      upsertResult: { data: [], error: null }, // conflict -> nothing inserted
      reselectResult: { data: { id: 'L9', source_pool: 'eva_consultant_rec', source_id: 'rec-1', disposition: 'dismissed' }, error: null },
    });
    const row = await registerItem(validItem, { client });
    expect(row.id).toBe('L9');
    expect(row.disposition).toBe('dismissed'); // not overwritten
  });

  it('registerItem rejects an invalid source_pool', async () => {
    const client = makeClient({});
    await expect(registerItem({ ...validItem, source_pool: 'bogus' }, { client })).rejects.toThrow(/source_pool/);
  });

  it('registerItem rejects a missing title', async () => {
    const client = makeClient({});
    await expect(registerItem({ source_pool: 'eva_consultant_rec', source_id: 'x' }, { client })).rejects.toThrow(/title/);
  });

  it('setDisposition writes a terminal disposition', async () => {
    const client = makeClient({ updateResult: { data: { id: 'L1', disposition: 'converted', intake_status: 'triaged' }, error: null } });
    const row = await setDisposition('L1', { disposition: 'converted', linked_sd_key: 'SD-NEW-001' }, { client });
    expect(row.disposition).toBe('converted');
  });

  it('setDisposition rejects an invalid disposition', async () => {
    const client = makeClient({});
    await expect(setDisposition('L1', { disposition: 'bogus' }, { client })).rejects.toThrow(/disposition/);
  });

  it('backlogDepth returns the count of un-dispositioned items', async () => {
    const client = makeClient({ countResult: { count: 7, error: null } });
    expect(await backlogDepth({ client })).toBe(7);
  });
});
