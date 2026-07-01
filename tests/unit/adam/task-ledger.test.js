/**
 * Unit pins for the Adam task-ledger CRUD + PURE rollup helpers.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-A (Child A / FR-5).
 *
 * Mocks supabase (no live DB), mirroring the adam test-stub pattern: a table-keyed chainable
 * builder whose .upsert(...).select().single() dedups on the natural key (source_kind, source_ref),
 * so the idempotency contract is exercised without a database.
 */
import { describe, it, expect } from 'vitest';
import {
  createOrUpsertNode, setStatus, setBlocker,
  rollupParentStatus, bubbleBlockers, sumTokenCost,
  STATUSES, TIERS, SOURCE_KINDS,
} from '../../../lib/adam/task-ledger.js';

/** In-memory adam_task_ledger stub. upsert dedups on (source_kind, source_ref) like the UNIQUE key. */
function makeSupabase() {
  const ledger = [];
  const keyOf = (r) => `${r.source_kind}|${r.source_ref}`;
  function from(table) {
    if (table !== 'adam_task_ledger') throw new Error(`unexpected table: ${table}`);
    return {
      upsert(row /* , opts */) {
        return {
          select() {
            return {
              single: async () => {
                const existing = ledger.find((r) => keyOf(r) === keyOf(row));
                if (existing) { Object.assign(existing, row); return { data: existing, error: null }; }
                const created = { id: `id-${ledger.length + 1}`, status: 'open', ...row };
                ledger.push(created);
                return { data: created, error: null };
              },
            };
          },
        };
      },
      update(patch) {
        return {
          eq(_col, id) {
            return {
              select() {
                return {
                  maybeSingle: async () => {
                    const row = ledger.find((r) => r.id === id);
                    if (row) Object.assign(row, patch);
                    return { data: row ?? null, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
  }
  return { from, _ledger: ledger };
}

describe('exported enums', () => {
  it('carry the CHECK-constraint domains', () => {
    expect(STATUSES).toEqual(['open', 'in_progress', 'blocked', 'done', 'cancelled']);
    expect(TIERS).toEqual(['parent', 'child']);
    expect(SOURCE_KINDS).toEqual(['advisory_thread', 'sourced_sd', 'awaited_reply', 'manual']);
  });
});

describe('createOrUpsertNode — idempotent on (source_kind, source_ref)', () => {
  it('two upserts with the same key yield exactly one node (dedup)', async () => {
    const sb = makeSupabase();
    const node = { source_kind: 'advisory_thread', source_ref: 'corr-1', tier: 'parent', title: 'Thread 1' };
    const a = await createOrUpsertNode(sb, node);
    const b = await createOrUpsertNode(sb, { ...node, title: 'Thread 1 (updated)' });
    expect(sb._ledger).toHaveLength(1);
    expect(b.id).toBe(a.id);               // same row, not a duplicate
    expect(sb._ledger[0].title).toBe('Thread 1 (updated)'); // upsert updated in place
  });

  it('distinct (source_kind, source_ref) pairs create distinct nodes', async () => {
    const sb = makeSupabase();
    await createOrUpsertNode(sb, { source_kind: 'advisory_thread', source_ref: 'c1', tier: 'parent', title: 'A' });
    await createOrUpsertNode(sb, { source_kind: 'awaited_reply', source_ref: 'c1', tier: 'parent', title: 'B' }); // same ref, other kind
    await createOrUpsertNode(sb, { source_kind: 'sourced_sd', source_ref: 'SD-1', tier: 'parent', title: 'C' });
    expect(sb._ledger).toHaveLength(3);
  });

  it('rejects a missing idempotency key or an invalid tier/title (fail-loud)', async () => {
    const sb = makeSupabase();
    await expect(createOrUpsertNode(sb, { source_kind: 'manual', tier: 'parent', title: 'x' })).rejects.toThrow(/source_ref/);
    await expect(createOrUpsertNode(sb, { source_kind: 'manual', source_ref: 'r', tier: 'bogus', title: 'x' })).rejects.toThrow(/tier/);
    await expect(createOrUpsertNode(sb, { source_kind: 'manual', source_ref: 'r', tier: 'child' })).rejects.toThrow(/title/);
  });
});

describe('setStatus / setBlocker', () => {
  it('setStatus updates the node and rejects a non-enum status', async () => {
    const sb = makeSupabase();
    const n = await createOrUpsertNode(sb, { source_kind: 'manual', source_ref: 'r1', tier: 'child', title: 'sub' });
    await setStatus(sb, n.id, 'in_progress');
    expect(sb._ledger[0].status).toBe('in_progress');
    await expect(setStatus(sb, n.id, 'nope')).rejects.toThrow(/status/);
  });
  it('setBlocker materializes and clears a blocker', async () => {
    const sb = makeSupabase();
    const n = await createOrUpsertNode(sb, { source_kind: 'manual', source_ref: 'r2', tier: 'child', title: 'sub' });
    await setBlocker(sb, n.id, 'waiting on API key');
    expect(sb._ledger[0].blocker).toBe('waiting on API key');
    await setBlocker(sb, n.id, null);
    expect(sb._ledger[0].blocker).toBeNull();
  });
});

describe('rollupParentStatus (PURE) — single-tree derivation', () => {
  it('blocked when ANY non-cancelled child is blocked', () => {
    expect(rollupParentStatus([{ status: 'in_progress' }, { status: 'blocked' }, { status: 'done' }])).toBe('blocked');
  });
  it('done when ALL non-cancelled children are done', () => {
    expect(rollupParentStatus([{ status: 'done' }, { status: 'done' }])).toBe('done');
  });
  it('cancelled children are IGNORED (all-done-among-the-rest => done)', () => {
    expect(rollupParentStatus([{ status: 'done' }, { status: 'cancelled' }])).toBe('done');
  });
  it('in_progress for a mixed open/in_progress set', () => {
    expect(rollupParentStatus([{ status: 'open' }, { status: 'in_progress' }])).toBe('in_progress');
    expect(rollupParentStatus([{ status: 'open' }, { status: 'done' }])).toBe('in_progress');
  });
  it('open when there are no effective (non-cancelled) children', () => {
    expect(rollupParentStatus([])).toBe('open');
    expect(rollupParentStatus([{ status: 'cancelled' }])).toBe('open');
    expect(rollupParentStatus(null)).toBe('open');
  });
});

describe('bubbleBlockers (PURE)', () => {
  it('surfaces an active child blocker onto the parent', () => {
    const out = bubbleBlockers([
      { id: 'k1', title: 'child A', status: 'blocked', blocker: 'awaiting chairman decision' },
      { id: 'k2', title: 'child B', status: 'in_progress' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'k1', blocker: 'awaiting chairman decision' });
  });
  it('ignores done/cancelled children and empty blockers', () => {
    const out = bubbleBlockers([
      { id: 'a', status: 'done', blocker: 'stale — resolved' },
      { id: 'b', status: 'cancelled', blocker: 'no longer relevant' },
      { id: 'c', status: 'blocked', blocker: '   ' },
      { id: 'd', status: 'blocked', blocker: 'REAL blocker' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].blocker).toBe('REAL blocker');
  });
});

describe('sumTokenCost (PURE) — coarse per-parent rollup', () => {
  it('sums numeric token_cost, ignoring cancelled + non-numeric', () => {
    expect(sumTokenCost([{ token_cost: 100 }, { token_cost: 250 }, { token_cost: null }])).toBe(350);
    expect(sumTokenCost([{ token_cost: 100 }, { token_cost: 999, status: 'cancelled' }])).toBe(100);
    expect(sumTokenCost([])).toBe(0);
  });
});
