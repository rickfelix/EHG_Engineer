import { describe, it, expect } from 'vitest';
import { registerItem, setDisposition, backlogDepth, _internals } from '../../../lib/intake/conversion-ledger.js';

// Minimal mock matching the exact Supabase chains the ledger lib uses.
//
// backlogDepth now issues TWO head-count queries against conversion_ledger:
//   (1) a PLAIN total count      ->  await db.from(...).select('id',{count,head})
//   (2) a TERMINAL count         ->  ...select('id',{count,head}).in('disposition',[...TERMINAL])
// So the head-count select() result must be BOTH awaitable (thenable, resolving to
// the total) AND expose an `.in()` that resolves to the terminal count.
function makeClient({ upsertResult, reselectResult, updateResult, totalResult, terminalResult, countResult } = {}) {
  // Back-compat: a single `countResult` answers both head-count queries.
  const total = totalResult ?? countResult;
  const terminal = terminalResult ?? countResult;
  return {
    from() {
      return {
        upsert: () => ({ select: () => Promise.resolve(upsertResult) }),
        update: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve(updateResult) }) }) }),
        select: (cols, opts) => {
          if (opts && opts.head) {
            // Thenable for the plain total count; `.in()` for the terminal count.
            const thenable = Promise.resolve(total);
            thenable.in = () => Promise.resolve(terminal);
            return thenable;
          }
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
      reselectResult: { data: { id: 'L9', source_pool: 'eva_consultant_rec', source_id: 'rec-1', disposition: 'declined' }, error: null },
    });
    const row = await registerItem(validItem, { client });
    expect(row.id).toBe('L9');
    expect(row.disposition).toBe('declined'); // not overwritten
  });

  it('registerItem rejects an invalid source_pool', async () => {
    const client = makeClient({});
    await expect(registerItem({ ...validItem, source_pool: 'bogus' }, { client })).rejects.toThrow(/source_pool/);
  });

  it('registerItem rejects a missing title', async () => {
    const client = makeClient({});
    await expect(registerItem({ source_pool: 'eva_consultant_rec', source_id: 'x' }, { client })).rejects.toThrow(/title/);
  });

  // FR-3: registerItem accepts each of the 4 NEW idea-source pools.
  it.each(['todoist_todo', 'youtube_playlist', 'ehg_folder', 'estate_corpus'])(
    'registerItem accepts the new pool %s',
    async (pool) => {
      const client = makeClient({ upsertResult: { data: [{ id: `L-${pool}`, source_pool: pool, source_id: 's1', disposition: null }], error: null } });
      const row = await registerItem({ source_pool: pool, source_id: 's1', title: 'New-pool item' }, { client });
      expect(row.id).toBe(`L-${pool}`);
      expect(row.source_pool).toBe(pool);
    }
  );

  it('setDisposition writes a terminal disposition', async () => {
    const client = makeClient({ updateResult: { data: { id: 'L1', disposition: 'converted', intake_status: 'triaged' }, error: null } });
    const row = await setDisposition('L1', { disposition: 'converted', linked_sd_key: 'SD-NEW-001' }, { client });
    expect(row.disposition).toBe('converted');
  });

  it('setDisposition rejects an invalid disposition', async () => {
    const client = makeClient({});
    await expect(setDisposition('L1', { disposition: 'bogus' }, { client })).rejects.toThrow(/disposition/);
  });

  // FR-2: deferred_to_rung is the only disposition that names (and requires) a rung.
  it('setDisposition deferred_to_rung + target_rung=v2 succeeds', async () => {
    const client = makeClient({ updateResult: { data: { id: 'L1', disposition: 'deferred_to_rung', target_rung: 'v2' }, error: null } });
    const row = await setDisposition('L1', { disposition: 'deferred_to_rung', target_rung: 'v2' }, { client });
    expect(row.disposition).toBe('deferred_to_rung');
    expect(row.target_rung).toBe('v2');
  });

  it('setDisposition deferred_to_rung throws when target_rung is missing', async () => {
    const client = makeClient({});
    await expect(setDisposition('L1', { disposition: 'deferred_to_rung' }, { client })).rejects.toThrow(/target_rung/);
  });

  it('setDisposition deferred_to_rung throws when target_rung is invalid', async () => {
    const client = makeClient({});
    await expect(setDisposition('L1', { disposition: 'deferred_to_rung', target_rung: 'v9' }, { client })).rejects.toThrow(/target_rung/);
  });

  it('setDisposition throws when a NON-deferred_to_rung disposition carries a target_rung', async () => {
    const client = makeClient({});
    await expect(setDisposition('L1', { disposition: 'declined', target_rung: 'v2' }, { client })).rejects.toThrow(/target_rung/);
  });

  it('backlogDepth returns total minus terminally-dispositioned items', async () => {
    // 10 total, 3 carry a terminal disposition -> 7 still in backlog.
    const client = makeClient({
      totalResult: { count: 10, error: null },
      terminalResult: { count: 3, error: null },
    });
    expect(await backlogDepth({ client })).toBe(7);
  });

  // FR-2 HONESTY: only the 5 TERMINAL dispositions exit the backlog. An in-flight
  // 'converted' (SD created, not yet LIVE) and a NULL (untriaged) BOTH still count;
  // 'built' (and any terminal) does NOT.
  it('backlogDepth HONESTY: converted + null count as backlog; built (terminal) does not', async () => {
    // Simulate a ledger of 3 rows: {disposition:'converted'}, {disposition:null}, {disposition:'built'}.
    // total=3; terminal-count (built only)=1 -> backlog = 3 - 1 = 2 (the converted + the null).
    const client = makeClient({
      totalResult: { count: 3, error: null },
      terminalResult: { count: 1, error: null },
    });
    expect(await backlogDepth({ client })).toBe(2);
    // Sanity: 'converted' is NOT terminal; 'built' IS.
    expect(_internals.TERMINAL_DISPOSITIONS.has('converted')).toBe(false);
    expect(_internals.TERMINAL_DISPOSITIONS.has('built')).toBe(true);
  });
});
