/**
 * SD-LEO-INFRA-CLONE-TREE-EXCLUSION-FAIL-OPEN-LEAK-001 (FR-4) — the #5249 belt-exclusion fail-open leak.
 *
 * FR-1: fetchVentureFlags retries a transient DB fault and, when STILL unresolved, returns {unresolved:true}
 *       (distinct from null=genuinely-missing); the clone decision fails CLOSED (isUnresolvedFlags) so a DB
 *       fault can never leak an UNMARKED clone tree onto the belt. isCloneVenture is unchanged.
 * FR-2: the bidirectional reconciliation marks a leaked unmarked clone AND un-marks a wrongly-marked real
 *       venture (ground truth = seeded_from_venture_id); dry-run reports without mutating; idempotent.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  fetchVentureFlags,
  isUnresolvedFlags,
  isCloneVenture,
} from '../../../lib/eva/lifecycle-sd-bridge.js';
import { reconcileCloneTreeExclusion } from '../../../lib/coordinator/reconcile-clone-tree-exclusion.js';

// ── FR-1: fetchVentureFlags fail-closed semantics ──

function flagsClient(behavior) {
  // behavior: { error?:object, data?:object } per-attempt array, OR a single shape applied every call.
  let call = 0;
  return {
    calls: () => call,
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          const step = Array.isArray(behavior) ? (behavior[Math.min(call, behavior.length - 1)]) : behavior;
          call++;
          if (step.throw) throw new Error('db down');
          return { data: step.data ?? null, error: step.error ?? null };
        },
      };
    },
  };
}

const fast = { backoffMs: [0, 0], retries: 2 };

describe('FR-1: fetchVentureFlags fails CLOSED on a persistent fault', () => {
  it('resolves the flags on a clean read (no retry needed)', async () => {
    const c = flagsClient({ data: { is_demo: false, is_scaffolding: false, seeded_from_venture_id: 'src-1' } });
    const f = await fetchVentureFlags(c, 'v1', fast);
    expect(isUnresolvedFlags(f)).toBe(false);
    expect(isCloneVenture(f)).toBe(true);
    expect(c.calls()).toBe(1);
  });

  it('a TRANSIENT error then success resolves normally (retry worked)', async () => {
    const c = flagsClient([{ error: { message: 'timeout' } }, { data: { seeded_from_venture_id: null } }]);
    const f = await fetchVentureFlags(c, 'v1', fast);
    expect(isUnresolvedFlags(f)).toBe(false);
    expect(isCloneVenture(f)).toBe(false); // resolved real venture
    expect(c.calls()).toBe(2);
  });

  it('a PERSISTENT error returns {unresolved:true} (NOT null) -> clone decision fails CLOSED', async () => {
    const c = flagsClient({ error: { message: 'db down' } });
    const f = await fetchVentureFlags(c, 'v1', fast);
    expect(isUnresolvedFlags(f)).toBe(true);
    // the bridge marks cloneBuildTree = isCloneVenture(f) || isUnresolvedFlags(f) -> TRUE (no leak)
    expect(isCloneVenture(f) || isUnresolvedFlags(f)).toBe(true);
    expect(c.calls()).toBe(1 + fast.retries);
  });

  it('a genuinely-missing venture (no error, null data) returns null (not a clone, not unresolved)', async () => {
    const c = flagsClient({ data: null, error: null });
    const f = await fetchVentureFlags(c, 'v1', fast);
    expect(f).toBeNull();
    expect(isUnresolvedFlags(f)).toBe(false);
    expect(isCloneVenture(f)).toBe(false);
  });

  it('a thrown read also fails closed to {unresolved:true}', async () => {
    const c = flagsClient({ throw: true });
    const f = await fetchVentureFlags(c, 'v1', fast);
    expect(isUnresolvedFlags(f)).toBe(true);
  });
});

// ── FR-2: bidirectional reconciliation ──

function reconcileClient({ sds, ventures }) {
  const updates = [];
  return {
    updates,
    from(table) {
      const ctx = { table, op: 'select', payload: null, idEq: null };
      const builder = {
        select() { ctx.op = 'select'; return builder; },
        update(payload) { ctx.op = 'update'; ctx.payload = payload; return builder; },
        not() { return builder; },
        in() { return builder; },
        eq(col, val) { ctx.idEq = val; return builder; },
        // FR-6 (count-truncation discipline): the SD read paginates via fetchAllPaginated, so
        // its chain ends .order(...).range(from, to).
        order() { return builder; },
        range(from, to) {
          const rows = ctx.table === 'strategic_directives_v2' ? sds : ventures;
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        then(resolve) {
          if (ctx.op === 'update') { updates.push({ table: ctx.table, id: ctx.idEq, payload: ctx.payload }); return resolve({ error: null }); }
          return resolve({ data: ctx.table === 'strategic_directives_v2' ? sds : ventures, error: null });
        },
      };
      return builder;
    },
  };
}

const silent = () => {};

describe('FR-2: bidirectional clone-tree reconciliation', () => {
  const sds = [
    { id: 'sd-leaked', sd_key: 'SD-LEAKED', status: 'draft', metadata: { venture_id: 'v-clone' } },             // clone, unmarked -> MARK
    { id: 'sd-wrong', sd_key: 'SD-WRONG', status: 'draft', metadata: { venture_id: 'v-real', test_clone_build_tree: true } }, // real, marked -> UNMARK
    { id: 'sd-ok-clone', sd_key: 'SD-OKC', status: 'draft', metadata: { venture_id: 'v-clone2', test_clone_build_tree: true } }, // clone, marked -> no-op
    { id: 'sd-ok-real', sd_key: 'SD-OKR', status: 'draft', metadata: { venture_id: 'v-real2' } },               // real, unmarked -> no-op
  ];
  const ventures = [
    { id: 'v-clone', seeded_from_venture_id: 'src-1' },
    { id: 'v-real', seeded_from_venture_id: null },
    { id: 'v-clone2', seeded_from_venture_id: 'src-2' },
    { id: 'v-real2', seeded_from_venture_id: null },
  ];

  it('dry-run reports the corrections WITHOUT mutating', async () => {
    const c = reconcileClient({ sds, ventures });
    const r = await reconcileCloneTreeExclusion({ supabase: c, log: silent }); // dryRun defaults true
    expect(r.dryRun).toBe(true);
    expect(r.marked).toBe(1);
    expect(r.unmarked).toBe(1);
    expect(c.updates).toHaveLength(0);
  });

  it('apply marks the leaked clone + un-marks the wrongly-marked real venture (idempotent on the OK rows)', async () => {
    const c = reconcileClient({ sds, ventures });
    const r = await reconcileCloneTreeExclusion({ supabase: c, dryRun: false, log: silent });
    expect(r.marked).toBe(1);
    expect(r.unmarked).toBe(1);
    expect(c.updates).toHaveLength(2);

    const mark = c.updates.find((u) => u.id === 'sd-leaked');
    expect(mark.payload.metadata.test_clone_build_tree).toBe(true);

    const unmark = c.updates.find((u) => u.id === 'sd-wrong');
    expect('test_clone_build_tree' in unmark.payload.metadata).toBe(false); // marker removed

    // the already-correct rows (clone-marked, real-unmarked) are NOT touched
    expect(c.updates.find((u) => u.id === 'sd-ok-clone')).toBeUndefined();
    expect(c.updates.find((u) => u.id === 'sd-ok-real')).toBeUndefined();
  });

  it('missing supabase -> safe no-op with error', async () => {
    const r = await reconcileCloneTreeExclusion({ supabase: null, log: silent });
    expect(r.marked).toBe(0);
    expect(r.errors).toContain('no_supabase');
  });
});
