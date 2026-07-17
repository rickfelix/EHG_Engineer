/**
 * SD-LEO-INFRA-STAGE-GROUNDING-INJECTOR-001 FR-3 — governed chairman_constraints
 * write path. These tests assert the GOVERNANCE INVARIANT directly against the
 * real code path (not a masked mock): a constraint is written into
 * chairman_constraints ONLY after the fn_is_chairman authority check AND the
 * RLS-gated pending->ratified update both succeed. A non-chairman / failed-gate
 * caller must never reach the chairman_constraints insert.
 *
 * (The end-to-end live evolve-loop against the real proposals table is verified
 * after the chairman applies the staged migration; pre-apply, the write path
 * cannot touch a table that does not exist, so the governance logic is proven
 * here with an instrumented client that records every table/operation.)
 */
import { describe, it, expect } from 'vitest';
import {
  proposeConstraintFromOutcome,
  ratifyProposedConstraint,
} from '../../../lib/eva/stage-zero/synthesis/chairman-constraints.js';

// Instrumented supabase double: records every .from(table) op and .rpc call so
// tests can assert WHICH tables were written and in what order.
function makeSpySupabase({ isChairman = false, pendingProposal = null } = {}) {
  const ops = []; // { table, op }
  const rpcCalls = [];
  const client = {
    rpc: async (name) => {
      rpcCalls.push(name);
      return { data: name === 'fn_is_chairman' ? isChairman : null, error: null };
    },
    from(table) {
      const qb = { table, op: null };
      const resolve = () => {
        if (qb.op === 'insert' && table === 'chairman_constraints_proposals') return { data: { id: 'prop-1' }, error: null };
        if (qb.op === 'insert' && table === 'chairman_constraints') return { data: { id: 'constraint-1' }, error: null };
        if (qb.op === 'update' && table === 'chairman_constraints_proposals') return { data: pendingProposal, error: null };
        return { data: null, error: null };
      };
      qb.insert = (row) => { qb.op = 'insert'; qb.row = row; ops.push({ table, op: 'insert' }); return qb; };
      qb.update = (row) => { qb.op = 'update'; qb.row = row; ops.push({ table, op: 'update' }); return qb; };
      qb.eq = () => qb;
      qb.select = () => qb;
      qb.single = async () => resolve();
      qb.then = (onOk) => onOk(resolve()); // supports `await from().update().eq()` (back-link)
      return qb;
    },
  };
  return { client, ops, rpcCalls };
}

const CONSTRAINT = { constraint_key: 'evolve_test', name: 'Evolve test', weight: 5 };

describe('proposeConstraintFromOutcome (FR-3)', () => {
  it('stages a pending proposal and NEVER writes an active constraint', async () => {
    const { client, ops } = makeSpySupabase();
    const res = await proposeConstraintFromOutcome(client, { constraint: CONSTRAINT, source: 'kill_gate', sourceRef: 'kg-1' });
    expect(res.proposalId).toBe('prop-1');
    // Only the proposals table is written; chairman_constraints is never touched.
    expect(ops).toEqual([{ table: 'chairman_constraints_proposals', op: 'insert' }]);
    expect(ops.some((o) => o.table === 'chairman_constraints')).toBe(false);
  });

  it('rejects an unknown proposal source', async () => {
    const { client } = makeSpySupabase();
    await expect(proposeConstraintFromOutcome(client, { constraint: CONSTRAINT, source: 'self' })).rejects.toThrow(/source must be/);
  });
});

describe('ratifyProposedConstraint (FR-3 governance gate)', () => {
  it('BLOCKS a non-chairman caller and NEVER writes to chairman_constraints', async () => {
    const { client, ops } = makeSpySupabase({ isChairman: false, pendingProposal: { id: 'prop-1', ...CONSTRAINT } });
    await expect(ratifyProposedConstraint(client, { proposalId: 'prop-1' })).rejects.toThrow(/only a chairman/);
    // The authority gate fails first — no update, no constraint insert.
    expect(ops).toEqual([]);
  });

  it('ABORTS (no constraint write) when the gated update affects 0 rows', async () => {
    // Chairman authority passes, but the RLS-gated update returns no row (not pending / not permitted).
    const { client, ops } = makeSpySupabase({ isChairman: true, pendingProposal: null });
    await expect(ratifyProposedConstraint(client, { proposalId: 'prop-1' })).rejects.toThrow(/not ratifiable/);
    // Update was attempted, but chairman_constraints was never inserted.
    expect(ops).toEqual([{ table: 'chairman_constraints_proposals', op: 'update' }]);
    expect(ops.some((o) => o.table === 'chairman_constraints')).toBe(false);
  });

  it('promotes into chairman_constraints ONLY after both gates pass', async () => {
    const { client, ops, rpcCalls } = makeSpySupabase({ isChairman: true, pendingProposal: { id: 'prop-1', ...CONSTRAINT } });
    const res = await ratifyProposedConstraint(client, { proposalId: 'prop-1', ratifiedBy: 'chair-uid' });
    expect(res).toEqual({ proposalId: 'prop-1', constraintId: 'constraint-1' });
    // Order proves governance: authority check, then gated update, then the constraint insert.
    expect(rpcCalls).toContain('fn_is_chairman');
    const insertIntoConstraints = ops.findIndex((o) => o.table === 'chairman_constraints' && o.op === 'insert');
    const gatedUpdate = ops.findIndex((o) => o.table === 'chairman_constraints_proposals' && o.op === 'update');
    expect(gatedUpdate).toBeGreaterThanOrEqual(0);
    expect(insertIntoConstraints).toBeGreaterThan(gatedUpdate);
  });
});
