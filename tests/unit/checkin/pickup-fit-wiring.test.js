// SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-2) — THE WIRE, NOT JUST THE ENDS.
//
// tests/unit/fleet/dispatch-suggestions.test.js pins shouldDeferForBetterFit as a PURE function.
// This file drives the REAL runCheckin() -> tier-context.cjs -> merged-pool-self-claim.cjs
// pipeline against an in-memory Supabase fixture with TWO live claude_sessions rows, proving the
// defer check actually reaches the claim loop wired to liveWorkerCapabilitySnapshot's
// selfRank/ranks (not merely that the primitive is correct in isolation) — the exact gap
// testing-agent evidence db80264a flagged as TS-2 "partial".
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runCheckin } = require('../../../scripts/worker-checkin.cjs');

const SESSION = 'weak-session-0000';
const PEER = 'peer-session-0000';
const NO_COORD = { getCoordinator: async () => null };
// tier-context.cjs calls isTieringActive(ctx.sb) with NO nowMs override, so it always measures
// against REAL wall-clock time -- a fixed historical timestamp here would silently read as stale
// and tiering would never activate (the exact failure mode this comment exists to prevent a
// future edit from reintroducing).
const NOW = Date.now();
const FRESH = new Date(NOW - 60_000).toISOString();

// Same in-memory Supabase fixture shape as tests/unit/worker-checkin-ranked-window.test.js.
function makeStub(tables, { onClaim } = {}) {
  const db = {};
  for (const k of Object.keys(tables)) db[k] = tables[k].map((r) => ({ ...r }));
  let idc = 1;

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
        const inserted = arr.map((r) => ({ id: `gen-${idc++}`, ...r }));
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
      eq(c, v) { preds.push((r) => getCol(r, c) === v); return b; },
      neq(c, v) { preds.push((r) => getCol(r, c) !== v); return b; },
      is(c, v) { preds.push((r) => (v === null ? getCol(r, c) == null : getCol(r, c) === v)); return b; },
      in(c, arr) { preds.push((r) => Array.isArray(arr) && arr.includes(getCol(r, c))); return b; },
      gte(c, v) { preds.push((r) => getCol(r, c) != null && getCol(r, c) >= v); return b; },
      lte(c, v) { preds.push((r) => getCol(r, c) != null && getCol(r, c) <= v); return b; },
      gt(c, v) { preds.push((r) => getCol(r, c) != null && getCol(r, c) > v); return b; },
      lt(c, v) { preds.push((r) => getCol(r, c) != null && getCol(r, c) < v); return b; },
      not() { return b; },
      or() { return b; },
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
        if (['completed', 'cancelled', 'deferred'].includes(row.status)) {
          return Promise.resolve({ data: { success: false, error: 'terminal' }, error: null });
        }
        row.claiming_session_id = args.p_session_id;
        row.is_working_on = true;
        if (onClaim) onClaim(args.p_sd_id);
        return Promise.resolve({ data: { success: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { sb, db };
}

let seq = 0;
const sd = (key, extra = {}) => ({
  id: `id-${++seq}`, sd_key: key, status: 'draft', sd_type: 'infrastructure', priority: 'high',
  current_phase: 'LEAD', created_at: new Date(NOW - 1000 * seq).toISOString(), dependencies: [],
  metadata: {}, target_application: null, parent_sd_id: null, claiming_session_id: null,
  is_working_on: false, ...extra,
});
const viewRow = (key) => ({ sd_id: key, track: 'STANDALONE', status: 'draft', priority: 'high' });
// everClaimed via continuous_sds_completed (NOT sd_key -- setting sd_key here would make
// resolveCheckin() read ctx.mySd as truthy and take the resume-existing-claim path instead of
// ever reaching merged-pool-self-claim.cjs at all, which is exactly the bug this fixture design
// note exists to prevent re-tripping). status active + fresh heartbeat satisfies genuine-worker's
// liveness window.
const sessionRow = (session_id, model, effort) => ({
  session_id, status: 'active', heartbeat_at: FRESH, sd_key: null, continuous_sds_completed: 1,
  metadata: { model, effort },
});

describe('FR-2 pickup-fit defer — wired through the real checkin pipeline', () => {
  it('an over-qualified worker defers a low-floor item to a closer-fit live peer (does not claim it)', async () => {
    seq = 0;
    const target = sd('SD-TARGET-001', { metadata: { min_tier_rank: 1 } });
    const { sb, db } = makeStub({
      strategic_directives_v2: [target],
      v_sd_next_candidates: [viewRow('SD-TARGET-001')],
      // SESSION (opus/xhigh) is the strongest of the two -> over-qualified for a rank-1 floor.
      // PEER (haiku/low) is the weakest -> exact fit for a rank-1 floor, and lives concurrently
      // so tiering_active resolves true (>=2 genuine live workers).
      claude_sessions: [sessionRow(SESSION, 'opus', 'xhigh'), sessionRow(PEER, 'haiku', 'low')],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).not.toBe('self_claimed');
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-TARGET-001').claiming_session_id).toBeNull();
  });

  it('CONTROL — the SAME over-qualified worker claims normally when alone (tiering inactive)', async () => {
    seq = 0;
    const target = sd('SD-TARGET-002', { metadata: { min_tier_rank: 1 } });
    const { sb, db } = makeStub({
      strategic_directives_v2: [target],
      v_sd_next_candidates: [viewRow('SD-TARGET-002')],
      claude_sessions: [sessionRow(SESSION, 'opus', 'xhigh')], // solo -> degrade-to-1, tiering off
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-TARGET-002');
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-TARGET-002').claiming_session_id).toBe(SESSION);
  });

  it('CONTROL — no defer when the peer does NOT meet the item floor (best fit stays with self)', async () => {
    seq = 0;
    // min_tier_rank=2: in the 2-worker live ladder (haiku=1, opus=2), the haiku peer is BELOW the
    // floor and therefore ineligible -- bestFitRankForItem finds no qualifying peer, so the
    // over-qualified-relative-to-a-rank-1-item worker is, correctly, the ONLY eligible candidate
    // for a rank-2 item and must not defer.
    const target = sd('SD-TARGET-003', { metadata: { min_tier_rank: 2 } });
    const { sb, db } = makeStub({
      strategic_directives_v2: [target],
      v_sd_next_candidates: [viewRow('SD-TARGET-003')],
      claude_sessions: [sessionRow(SESSION, 'opus', 'xhigh'), sessionRow(PEER, 'haiku', 'low')],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-TARGET-003');
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-TARGET-003').claiming_session_id).toBe(SESSION);
  });

  it('CONTROL — an unscored item (no min_tier_rank) is never deferred regardless of peers', async () => {
    seq = 0;
    const target = sd('SD-TARGET-004'); // no metadata.min_tier_rank
    const { sb } = makeStub({
      strategic_directives_v2: [target],
      v_sd_next_candidates: [viewRow('SD-TARGET-004')],
      claude_sessions: [sessionRow(SESSION, 'opus', 'xhigh'), sessionRow(PEER, 'haiku', 'low')],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-TARGET-004');
  });
});
