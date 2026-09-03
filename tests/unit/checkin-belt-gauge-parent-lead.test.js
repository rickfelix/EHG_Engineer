// SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D — the belt gauge must report ELIGIBLE depth, not raw pool size.
//
// MEASURED DEFECT (2026-09-03T09:53Z, live): a check-in tick returned action='idle' with the message
// "No assignment and nothing claimable. IDLE." while simultaneously reporting belt_ranked_claimable=10,
// belt_claimable_at_my_tier=10 and belt_block={verdict:'OK', claimableDepth:10}. All ten ranked
// candidates were children of a pre-LEAD orchestrator parent and none was claimable. The gauge advertised
// depth no claim path could convert, and the fleet's own starvation detector read healthy.
//
// THESE TESTS DRIVE THE REAL runCheckin(). Only the DB seam is stubbed. claimableForTier,
// claimableForRepo, classifyDispatchIneligibility, parentLeadPendingVerdict and the claim loop all run
// for real.
//
// PINNING PROPERTY (FR-3): T1 must FAIL against a fix applied to lib/fleet/belt-census.cjs, which is
// ALREADY correct (it applies parentLeadPending at :186). The defect is in the check-in gauge, and these
// tests only pass when THAT file changes. T2 is the control that proves the fixture itself is claimable
// when the parent axis is genuinely clear — without it, T1 would also pass against a gauge hardcoded to 0.
//
// STUB FIDELITY IS LOAD-BEARING. `.or()` is implemented for real, not stubbed to a passthrough:
// parentLeadPending resolves parents via .or(id.eq.X,sd_key.eq.X) (claim-eligibility.cjs:583), and a
// no-op .or() followed by .maybeSingle() returns the FIRST ROW OF THE WHOLE TABLE as the "parent" —
// which would make these tests pass for entirely the wrong reason. A sibling scenario in this SD was
// measured passing AGAINST the bug for exactly this class of fixture infidelity.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runCheckin } = require('../../scripts/worker-checkin.cjs');

const SESSION = 'test-session-belt-gauge-1';
const NO_COORD = { getCoordinator: async () => null };

function makeStub(tables) {
  const db = {};
  for (const k of Object.keys(tables)) db[k] = tables[k].map((r) => ({ ...r }));

  const getCol = (row, col) => {
    if (typeof col === 'string' && col.includes('->>')) {
      const [base, rawKey] = col.split('->>');
      const key = rawKey.replace(/['"]/g, '').trim();
      const container = row[base.trim()];
      const v = container ? container[key] : undefined;
      return v === undefined || v === null ? null : String(v);
    }
    return row[col];
  };

  function query(table) {
    let mode = 'select';
    let payload = null;
    const preds = [];
    const orders = [];
    let limitN = null;

    const read = () => {
      let rows = (db[table] || []).filter((r) => preds.every((p) => p(r)));
      for (const o of orders.slice().reverse()) {
        rows = rows.slice().sort((a, b) => {
          const av = a[o.col], bv = b[o.col];
          if (av === bv) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av < bv ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    };

    const resolve = () => {
      if (mode === 'insert') {
        const arr = Array.isArray(payload) ? payload : [payload];
        const inserted = arr.map((r, i) => ({ id: `gen-${i}`, ...r }));
        db[table] = (db[table] || []).concat(inserted);
        return { data: inserted, error: null };
      }
      if (mode === 'update') {
        const matched = (db[table] || []).filter((r) => preds.every((p) => p(r)));
        for (const r of matched) Object.assign(r, payload);
        return { data: matched, error: null };
      }
      return { data: read(), error: null };
    };

    const b = {
      select() { return b; },
      insert(p) { mode = 'insert'; payload = p; return b; },
      update(p) { mode = 'update'; payload = p; return b; },
      upsert(p) { mode = 'insert'; payload = p; return b; },
      delete() { mode = 'delete'; return b; },
      eq(c, v) { preds.push((r) => getCol(r, c) === v); return b; },
      neq(c, v) { preds.push((r) => getCol(r, c) !== v); return b; },
      is(c, v) { preds.push((r) => (v === null ? getCol(r, c) == null : getCol(r, c) === v)); return b; },
      in(c, arr) { preds.push((r) => Array.isArray(arr) && arr.includes(getCol(r, c))); return b; },
      gte(c, v) { preds.push((r) => getCol(r, c) != null && getCol(r, c) >= v); return b; },
      lte(c, v) { preds.push((r) => getCol(r, c) != null && getCol(r, c) <= v); return b; },
      gt(c, v) { preds.push((r) => getCol(r, c) != null && getCol(r, c) > v); return b; },
      lt(c, v) { preds.push((r) => getCol(r, c) != null && getCol(r, c) < v); return b; },
      not() { return b; },
      // REAL .or() — see the header note. Parses the PostgREST `col.eq.value,col.eq.value` form and
      // matches if ANY clause holds. A passthrough here silently resolves the wrong parent row.
      or(expr) {
        const clauses = String(expr || '').split(',').map((c) => {
          const m = c.match(/^([^.]+)\.eq\.(.*)$/);
          return m ? { col: m[1], val: m[2] } : null;
        }).filter(Boolean);
        if (clauses.length) preds.push((r) => clauses.some((c) => String(getCol(r, c.col)) === c.val));
        return b;
      },
      order(c, opts) { orders.push({ col: c, asc: !(opts && opts.ascending === false) }); return b; },
      limit(n) { limitN = n; return b; },
      range() { return b; },
      maybeSingle() { const r = resolve(); const a = r.data || []; return Promise.resolve({ data: a.length ? a[0] : null, error: r.error }); },
      single() { const r = resolve(); const a = r.data || []; return Promise.resolve({ data: a.length ? a[0] : null, error: a.length ? r.error : { message: 'no rows' } }); },
      then(onF, onR) { return Promise.resolve(resolve()).then(onF, onR); },
    };
    return b;
  }

  const sb = {
    from(t) { return query(t); },
    rpc(fn, args = {}) {
      if (fn === 'claim_sd') {
        const row = (db.strategic_directives_v2 || []).find((r) => r.sd_key === args.p_sd_id);
        if (!row) return Promise.resolve({ data: { success: false, error: 'not_found' }, error: null });
        if (row.claiming_session_id && row.claiming_session_id !== args.p_session_id) {
          return Promise.resolve({ data: { success: false, claimed_by: row.claiming_session_id }, error: null });
        }
        row.claiming_session_id = args.p_session_id;
        row.is_working_on = true;
        return Promise.resolve({ data: { success: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { sb, db };
}

// parent_sd_id is UUID-shaped in production (sampled 1000/1000), and the implementation splits refs by
// shape before fetching, so the fixture uses real UUID shapes rather than synthetic ids.
const PARENT_UUID = '8188060b-d2e1-44d5-902b-f254d6867231';
const DANGLING_UUID = '00000000-0000-4000-8000-00000000dead';
let seq = 0;
const ts = (n) => `2026-01-${String(n).padStart(2, '0')}T00:00:00.000Z`;

// A DISTINCT, non-empty description is load-bearing on these fixtures, not decoration. isBareShell
// (lib/coordinator/sd-exclusion.mjs:65-76) treats an empty description — or one equal to the title —
// as a non-distributable stub and drops it from the belt via isExcludedFromBelt BEFORE the parent axis
// is ever consulted. A description-less fixture therefore counts 0 in BOTH arms, which would make the
// pre-LEAD assertion pass for entirely the wrong reason. The T2 control is what exposed exactly that.
const child = (key, extra = {}) => ({
  id: `1111111${String(++seq).padStart(1, '0')}-0000-4000-8000-000000000001`.slice(0, 36),
  sd_key: key, status: 'draft', sd_type: 'bugfix', priority: 'high',
  title: `${key} title`,
  description: `Regression fixture for ${key}: a claimable leaf whose only ineligibility axis under test is the parent-LEAD gate.`,
  current_phase: 'LEAD', created_at: ts(Math.min(seq, 28)), dependencies: [], metadata: {},
  target_application: 'EHG_Engineer', parent_sd_id: PARENT_UUID, claiming_session_id: null, is_working_on: false,
  ...extra,
});
const parentRow = (phase, extra = {}) => ({
  id: PARENT_UUID, sd_key: 'SD-ORCH-PARENT-FIXTURE-001', status: 'active', sd_type: 'orchestrator',
  priority: 'critical', current_phase: phase, created_at: ts(1), dependencies: [], metadata: {},
  title: 'Orchestrator parent fixture',
  description: 'Orchestrator parent fixture whose current_phase drives the parent-LEAD axis under test.',
  target_application: 'EHG_Engineer', parent_sd_id: null, claiming_session_id: null, ...extra,
});
const sessionRow = () => ({ session_id: SESSION, metadata: {}, sd_key: null, heartbeat_at: ts(1) });
const viewRow = (key) => ({ sd_id: key, track: 'STANDALONE', status: 'draft', priority: 'high' });

const fleetOf = (children, parent) => makeStub({
  strategic_directives_v2: parent ? [parent, ...children] : [...children],
  v_sd_next_candidates: children.map((c) => viewRow(c.sd_key)),
  claude_sessions: [sessionRow()],
});

describe('belt gauge reports ELIGIBLE depth, not raw pool size (SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D)', () => {
  it('T1: N children of a PRE-LEAD parent report claimable depth 0, not N', async () => {
    seq = 0;
    const children = Array.from({ length: 10 }, (_, i) => child(`SD-CHILD-PRELEAD-${i + 1}`));
    const { sb } = fleetOf(children, parentRow('LEAD'));
    const res = await runCheckin(sb, SESSION, NO_COORD);

    // The regression itself: every one of these was counted as claimable before the fix.
    expect(res.belt_claimable_at_my_tier).toBe(0);
    expect(res.belt_claimable_for_my_repo).toBe(0);
    expect(res.belt_ranked_claimable).toBe(0);
    // The raw pool size is preserved so the gap between advertised and eligible stays visible.
    expect(res.belt_ranked_pool_size).toBe(10);
    // The predicate actually ran — distinguishes a real 0 from a fail-open that skipped it (M-3).
    expect(res.belt_eligibility_applied).toBe(true);
  });

  it('T2 (control): the SAME fleet with the parent PAST LEAD is claimable — proving T1 is not a hardcoded 0', async () => {
    seq = 0;
    const children = Array.from({ length: 10 }, (_, i) => child(`SD-CHILD-POSTLEAD-${i + 1}`));
    const { sb } = fleetOf(children, parentRow('EXEC'));
    const res = await runCheckin(sb, SESSION, NO_COORD);

    expect(res.belt_claimable_at_my_tier).toBe(10);
    expect(res.belt_ranked_claimable).toBe(10);
    expect(res.belt_eligibility_applied).toBe(true);
  });

  it('M-1: the self-contradiction invariant — an idle tick never advertises claimable depth', async () => {
    seq = 0;
    const children = Array.from({ length: 10 }, (_, i) => child(`SD-CHILD-INVAR-${i + 1}`));
    const { sb } = fleetOf(children, parentRow('LEAD_APPROVAL'));
    const res = await runCheckin(sb, SESSION, NO_COORD);

    // Asserted UNCONDITIONALLY. An earlier cut wrapped this in `if (res.action === 'idle')`, which
    // would go silently vacuous the day the action changed — a test that stops testing without failing.
    expect(res.belt_ranked_claimable).toBe(0);
    expect(res.belt_claimable_at_my_tier).toBe(0);
    // The reported symptom was action='idle' AND belt_block={verdict:'OK', claimableDepth:10} in the
    // SAME tick. belt_block is the coordinator-belt-block.js consumer FR-1 names in its blast radius,
    // and no other scenario reaches it, so the invariant is asserted on the verdict itself.
    if (res.belt_block) {
      // THE ASSERTION IS ON THE NUMBER, NOT THE VERDICT — and that distinction was measured, not
      // assumed. assessCoordinatorBeltBlock's OK means "not blocked on COORDINATOR-OWNED fences"
      // (COORDINATOR_OWNED_REASONS = ['needs_coordinator_review']), NOT "the belt is healthy". A
      // parent-LEAD block is not the coordinator's to clear, so OK is the correct verdict here and
      // asserting otherwise would assert something false about that function. What WAS a lie in the
      // live symptom is the depth: it reported claimableDepth=10 against a true eligible depth of 0,
      // and that is the input this fix corrects.
      expect(res.belt_block.claimableDepth).toBe(0);
    }
  });

  it('REGRESSION: the idle note still fires — belt_ranked_claimable changing meaning must not kill its consumer', async () => {
    seq = 0;
    // Making belt_ranked_claimable report ELIGIBLE depth made it equal to belt_claimable_at_my_tier by
    // construction. idle.cjs gates BOTH the QF-20260719-144 ineligibility note and QF-20260831-738
    // SELF-IDENTIFY (chairman-proposed, ratification f48e0abf) on `rankedAgnostic > 0 && claimableAtTier
    // === 0` — equality makes that UNSATISFIABLE and silently kills two shipped features. The existing
    // suite missed it because it hand-builds ctx.base with a raw/eligible split production can no
    // longer produce, so this drives the REAL runCheckin instead.
    const children = Array.from({ length: 10 }, (_, i) => child(`SD-CHILD-IDLENOTE-${i + 1}`));
    const { sb } = fleetOf(children, parentRow('LEAD'));
    const res = await runCheckin(sb, SESSION, NO_COORD);

    // The gap must remain EXPRESSIBLE: a non-zero pool with zero eligible is exactly what the note
    // explains. If these are equal, the guard can never fire again.
    expect(res.belt_ranked_pool_size).toBeGreaterThan(0);
    expect(res.belt_claimable_at_my_tier).toBe(0);
    expect(res.belt_ranked_pool_size).not.toBe(res.belt_claimable_at_my_tier);
    // And the note actually reaches the worker rather than being computed and dropped.
    expect(res.message).toMatch(/ranked, but 0 claimable/);
  });

  it('TS-2 arm (b): a parent OUTSIDE the ranked pool is still resolved and still gates its children', async () => {
    seq = 0;
    // The parent is in the table but NOT in v_sd_next_candidates, so it is absent from the fetched
    // pool and must be picked up by the implementation's bounded parent fetch.
    const children = Array.from({ length: 5 }, (_, i) => child(`SD-CHILD-OUTPOOL-${i + 1}`));
    const { sb } = makeStub({
      strategic_directives_v2: [parentRow('LEAD'), ...children],
      v_sd_next_candidates: children.map((c) => viewRow(c.sd_key)), // parent deliberately absent
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.belt_claimable_at_my_tier).toBe(0);
    expect(res.belt_dangling_parent_refs).toBe(0); // resolved, not dangling
  });

  it('TS-2 arm (c): a DANGLING parent ref fails OPEN and is counted, matching the claim path exactly', async () => {
    seq = 0;
    // parentLeadPendingVerdict treats an absent parent as NOT pending (claim-eligibility.cjs:570-571).
    // The gauge deliberately MATCHES that contract rather than diverging — a gauge that disagreed with
    // the claim path would be a second representation. The count makes the condition observable.
    const children = Array.from({ length: 3 }, (_, i) => child(`SD-CHILD-DANGLE-${i + 1}`, { parent_sd_id: DANGLING_UUID }));
    const { sb } = makeStub({
      strategic_directives_v2: [...children], // no parent row anywhere
      v_sd_next_candidates: children.map((c) => viewRow(c.sd_key)),
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.belt_dangling_parent_refs).toBe(1); // one distinct unresolved ref, surfaced not silent
    expect(res.belt_eligibility_applied).toBe(true);
  });
});

describe('M-4: source-pinned wiring (the columns and the predicate are actually passed)', () => {
  it('the pool fetch selects parent_sd_id and dependencies, and BOTH counters receive depSatisfied', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../lib/checkin/steps/merged-pool-self-claim.cjs', import.meta.url), 'utf8');

    // A behavioural test alone passes a fix that adds the CALL but not the COLUMN — the call succeeds,
    // the data is absent, and the behaviour silently reverts. The sibling fix QF-20260812-281 in
    // belt-depth.cjs records exactly that failure, so the columns are pinned explicitly.
    expect(src).toMatch(/const cols = '[^']*parent_sd_id[^']*'/);
    expect(src).toMatch(/const cols = '[^']*dependencies[^']*'/);
    // depSatisfied must reach BOTH counters; passing it to only one leaves the repo-scoped count lying.
    expect(src).toMatch(/claimableForTier\(pool, \{[\s\S]*?depSatisfied,[\s\S]*?\}\)/);
    expect(src).toMatch(/claimableForRepo\(pool, \{[\s\S]*?depSatisfied,[\s\S]*?\}\)/);
    // The shared pure verdict is reused, never re-derived (TR-1).
    expect(src).toMatch(/parentLeadPendingVerdict/);
    // A bare .in('id', ...) parent fetch repeats the QF-20260629-597 scar recorded in this same file.
    expect(src).toMatch(/uuidRefs/);
    expect(src).toMatch(/keyRefs/);
  });
});
