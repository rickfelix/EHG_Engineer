/**
 * Regression test for QF-20260812-281.
 *
 * countDispatchableBacklog (the "recomputed" side of KPI-3, adam-coordinator-health.mjs's
 * computeFailLoudIntegrity) applied classifyDispatchIneligibility + draftDepsSatisfied only --
 * it never called parentLeadPending, the check computeClaimableLeaves (the "self_reported" side,
 * claimable-leaves.mjs:135-137) already applies. A draft child SD of a not-yet-past-LEAD
 * orchestrator parent was therefore counted as dispatchable on this side but correctly excluded
 * on the self_reported side, manufacturing a false integrity_ok=false KPI-3 breach every tick
 * such a child existed -- continuously during an active orchestrator sprint.
 *
 * The fix also had to add parent_sd_id to ELIGIBILITY_COLUMNS: parentLeadPending(sb, row) reads
 * row.parent_sd_id, and without it selected, the row always arrives undefined and the check
 * fails open on every row regardless of the real parent state (looks wired, gates nothing) --
 * the first test below would still pass a fix that added the call but not the column.
 *
 * Seam-injected fake client only -- no live DB.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { countDispatchableBacklog } = require('../../../lib/fleet/belt-depth.cjs');

/**
 * Extends the established belt-depth fakeClient pattern (belt-depth.test.js) with the
 * parentLeadPending lookup shape: .from(...).select('status, current_phase').or(...).maybeSingle().
 * Disambiguated from the dependency lookup (.select('id, sd_key, status').or(...), no
 * .maybeSingle()) by the exact select-columns string, since both are .or() queries against the
 * same table and this fake's .from() doesn't otherwise see the table name.
 */
function fakeClient(rows, { depRows = [], parentRows = {} } = {}) {
  return {
    from: () => ({
      select: (cols) => ({
        eq: () => ({
          is: () => ({
            range: (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
          }),
        }),
        or: (filter) => {
          if (cols === 'status, current_phase') {
            const ref = filter.split('.eq.')[1]?.split(',')[0];
            const data = Object.prototype.hasOwnProperty.call(parentRows, ref) ? parentRows[ref] : null;
            return {
              then: (resolve) => resolve({ data, error: null }),
              maybeSingle: () => Promise.resolve({ data, error: null }),
            };
          }
          return Promise.resolve({ data: depRows, error: null });
        },
      }),
    }),
  };
}

const free = (i) => ({ id: `f${i}`, sd_key: `SD-FREE-${i}`, status: 'draft', metadata: {} });

describe('countDispatchableBacklog — parentLeadPending gate (QF-20260812-281)', () => {
  it('REGRESSION: excludes a draft child whose orchestrator parent has not passed LEAD', async () => {
    const rows = [
      { id: 'c1', sd_key: 'SD-CHILD-1', status: 'draft', metadata: {}, parent_sd_id: 'SD-PARENT-1' },
      free(2),
    ];
    const parentRows = { 'SD-PARENT-1': { status: 'active', current_phase: 'LEAD' } };
    const result = await countDispatchableBacklog(fakeClient(rows, { parentRows }));
    expect(result.dispatchable).toBe(1); // only free(2); the pending-parent child is excluded
    expect(result.raw).toBe(2);
    expect(result.ineligible.parent_lead_pending).toBe(1);
  });

  it('counts a draft child whose orchestrator parent HAS passed LEAD', async () => {
    const rows = [{ id: 'c1', sd_key: 'SD-CHILD-1', status: 'draft', metadata: {}, parent_sd_id: 'SD-PARENT-1' }];
    const parentRows = { 'SD-PARENT-1': { status: 'active', current_phase: 'PLAN' } };
    const result = await countDispatchableBacklog(fakeClient(rows, { parentRows }));
    expect(result.dispatchable).toBe(1);
    expect(result.ineligible).toEqual({});
  });

  it('counts a draft child whose orchestrator parent has COMPLETED', async () => {
    const rows = [{ id: 'c1', sd_key: 'SD-CHILD-1', status: 'draft', metadata: {}, parent_sd_id: 'SD-PARENT-1' }];
    const parentRows = { 'SD-PARENT-1': { status: 'completed', current_phase: 'LEAD_FINAL_APPROVAL' } };
    const result = await countDispatchableBacklog(fakeClient(rows, { parentRows }));
    expect(result.dispatchable).toBe(1);
    expect(result.ineligible).toEqual({});
  });

  it('a non-child row (no parent_sd_id) is unaffected by the new gate', async () => {
    const result = await countDispatchableBacklog(fakeClient([free(1)]));
    expect(result.dispatchable).toBe(1);
    expect(result.ineligible).toEqual({});
  });

  it('fails OPEN (still counts dispatchable) when the parent row cannot be resolved', async () => {
    // Mirrors parentLeadPending's own fail-open contract: an unresolvable/absent parent must
    // never strand the child.
    const rows = [{ id: 'c1', sd_key: 'SD-CHILD-1', status: 'draft', metadata: {}, parent_sd_id: 'SD-GONE' }];
    const result = await countDispatchableBacklog(fakeClient(rows, { parentRows: {} }));
    expect(result.dispatchable).toBe(1);
    expect(result.ineligible).toEqual({});
  });
});
