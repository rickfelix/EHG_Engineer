// SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D (FR-4 / TS-3) — a DEFERRED parent must still gate its children.
//
// THE DEFECT: gatherCapacityInputs fetches non-terminal SDs with
// .not('status','in','("completed","cancelled","deferred")'). A parent whose status is 'deferred' is
// therefore ABSENT from the in-memory byId/byKey maps, and parentLeadPendingVerdict(undefined) returns
// false BY DESIGN (lib/fleet/claim-eligibility.cjs:570-571) — so the children of a deferred parent were
// counted as dispatchable belt. Same fail-open over-count this SD fixed in the check-in gauge, second
// surface.
//
// STUB FIDELITY IS THE WHOLE TEST. The established fakeClient in
// tests/unit/capacity-forecaster-belt-extent.test.js implements .not() and .in() as NO-OPS returning
// every row, so a deferred parent stays visible in the main fetch and the defect CANNOT reproduce —
// a test written against that fake passes against the bug. The TESTING sub-agent measured exactly that
// and flagged it. This fixture therefore models the DB-side filter for real: .not() excludes, and .in()
// restricts to the requested refs.
import { describe, it, expect } from 'vitest';
import { gatherCapacityInputs } from '../../scripts/lib/capacity-inputs.mjs';

const PARENT_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function faithfulClient({ sds = [], sessions = [] } = {}) {
  const reads = [];
  const table = (rows, name) => {
    let out = rows.slice();
    const b = {
      select() { return b; },
      eq() { return b; },
      is() { return b; },
      gte() { return b; },
      order() { return b; },
      limit(n) { out = out.slice(0, n); return b; },
      // REAL .not('status','in','("a","b")') — the filter whose absence hides the defect.
      not(col, op, val) {
        if (col === 'status' && op === 'in') {
          const excluded = String(val).replace(/[()"]/g, '').split(',').map((s) => s.trim());
          out = out.filter((r) => !excluded.includes(r[col]));
        }
        return b;
      },
      // REAL .in(col, refs) — the parent-resolution read must only return what it asked for.
      in(col, refs) {
        reads.push({ table: name, col, refs: [...refs] });
        out = out.filter((r) => Array.isArray(refs) && refs.includes(r[col]));
        return b;
      },
      range(from, to) { return Promise.resolve({ data: out.slice(from, to + 1), error: null }); },
      then(res) { return Promise.resolve({ data: out, error: null }).then(res); },
    };
    return b;
  };
  return {
    reads,
    from(name) {
      if (name === 'strategic_directives_v2') return table(sds, name);
      if (name === 'claude_sessions') return table(sessions, name);
      return table([], name);
    },
  };
}

const leaf = (key, extra = {}) => ({
  id: `id-${key}`, sd_key: key, title: `${key} title`,
  description: `A genuinely dispatchable leaf for ${key}, long enough not to read as a bare shell.`,
  status: 'active', sd_type: 'bugfix', current_phase: 'LEAD', progress_percentage: 0,
  claiming_session_id: null, dependencies: [], metadata: {}, target_application: 'EHG_Engineer',
  parent_sd_id: null, ...extra,
});

describe('FR-4: a DEFERRED parent still gates its children (capacity forecaster)', () => {
  it('children of a deferred, pre-LEAD parent are NOT counted as dispatchable belt', async () => {
    // The parent is status='deferred', so the non-terminal fetch filters it out entirely — it can only
    // be resolved by the explicit parent read. Its current_phase is LEAD, so it has not passed LEAD.
    const parent = leaf('SD-DEFERRED-PARENT-001', {
      id: PARENT_UUID, status: 'deferred', sd_type: 'orchestrator', current_phase: 'LEAD',
    });
    const kids = Array.from({ length: 3 }, (_, i) => leaf(`SD-DEFERRED-KID-${i + 1}`, { parent_sd_id: PARENT_UUID }));
    const client = faithfulClient({ sds: [parent, ...kids, leaf('SD-CLEAN-LEAF-001')] });

    const out = await gatherCapacityInputs(client);

    // Only the unparented clean leaf is dispatchable. Before the fix the three children counted too,
    // because the deferred parent was invisible and an absent parent reads as not-pending.
    expect(out.claimableCount).toBe(1);
    // And the fix must actually have issued the bounded parent read rather than guessing.
    const parentRead = client.reads.find((r) => r.refs.includes(PARENT_UUID));
    expect(parentRead).toBeDefined();
    expect(parentRead.col).toBe('id'); // uuid-shaped ref routed to the id column, not sd_key
  });

  it('control: the SAME children with the parent PAST LEAD are dispatchable — not a hardcoded drop', async () => {
    const parent = leaf('SD-DEFERRED-PARENT-002', {
      id: PARENT_UUID, status: 'deferred', sd_type: 'orchestrator', current_phase: 'EXEC',
    });
    const kids = Array.from({ length: 3 }, (_, i) => leaf(`SD-PASTLEAD-KID-${i + 1}`, { parent_sd_id: PARENT_UUID }));
    const client = faithfulClient({ sds: [parent, ...kids, leaf('SD-CLEAN-LEAF-002')] });

    const out = await gatherCapacityInputs(client);
    expect(out.claimableCount).toBe(4); // 3 children + the clean leaf
  });

  it('a parent ref that resolves to nothing fails OPEN, matching the claim path contract', async () => {
    // parentLeadPendingVerdict treats an absent parent as NOT pending. The forecaster deliberately
    // matches that rather than diverging — a belt count that disagreed with the claim path would be a
    // second representation of dispatchability.
    const kids = Array.from({ length: 2 }, (_, i) => leaf(`SD-DANGLE-KID-${i + 1}`, { parent_sd_id: PARENT_UUID }));
    const client = faithfulClient({ sds: [...kids] }); // no parent row anywhere
    const out = await gatherCapacityInputs(client);
    expect(out.claimableCount).toBe(2);
  });
});
