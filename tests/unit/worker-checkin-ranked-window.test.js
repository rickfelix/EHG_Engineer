// SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-B (FR-1/FR-2) — NON-MOCKED regression through real
// runCheckin(). sortByDispatchRank/orderByFleetCriticalThenRank can only REORDER an item already in
// the merged pool, never inject one. A claimable SD the coordinator HAS ranked (metadata.dispatch_rank
// set) but that sits outside every existing window (baselined view, oldest-10 draft, newest-10 draft,
// fleet_critical-direct) is therefore invisible to self-claim. The fix adds a FIFTH source
// (fetchRankedCandidates) unioned into the merged step-6 pool.
//
// These tests drive the REAL runCheckin(): orderByFleetCriticalThenRank, sortByDispatchRank,
// baselinedCandidateEligible, classifyDispatchIneligibility, isSdInFlight and tryClaim all run for
// real — ONLY the DB seam (an in-memory Supabase fixture) and the coordinator resolver are stubbed.
// T1 is inherently anti-test-masking: SD-RANKED-ONLY is reachable ONLY via the new source, so
// removing the union makes runCheckin claim a filler and the assertion fails.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runCheckin } = require('../../scripts/worker-checkin.cjs');

const SESSION = 'test-session-ranked-1';
const NO_COORD = { getCoordinator: async () => null }; // bypass coordinator resolution (broadcast)

// ── In-memory Supabase fixture (mirrors tests/unit/worker-checkin-fleet-critical-window.test.js) ──
// `.not()` is intentionally a no-op passthrough here (the real DB-side filter is a hint per this
// file's own established pattern) — fetchRankedCandidates' JS-side re-filter is what these tests
// actually exercise, exactly mirroring the production authoritative-JS-filter design.
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
      if (mode === 'delete') {
        db[table] = (db[table] || []).filter((r) => !preds.every((p) => p(r)));
        return { data: null, error: null };
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
      not() { return b; },                                   // DB-hint no-op — JS-side filter is authoritative
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
const ts = (n) => `2026-01-${String(n).padStart(2, '0')}T00:00:00.000Z`;
const sd = (key, extra = {}) => ({
  id: `id-${++seq}`, sd_key: key, status: 'draft', sd_type: 'infrastructure', priority: 'high',
  current_phase: 'LEAD', created_at: ts(seq), dependencies: [], metadata: {}, target_application: null,
  parent_sd_id: null, claiming_session_id: null, is_working_on: false, ...extra,
});
const rankedSd = (key, rank, extra = {}) =>
  sd(key, { metadata: { dispatch_rank: rank, dispatch_rank_at: new Date().toISOString() }, ...extra });
const sessionRow = () => ({ session_id: SESSION, metadata: {}, sd_key: null, heartbeat_at: ts(1) });
const viewRow = (key) => ({ sd_id: key, track: 'STANDALONE', status: 'draft', priority: 'high' });

describe('ranked-SD reachability via the fifth source (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-B)', () => {
  it('T1: a ranked SD present ONLY in the new source is self_claimed past equally-claimable fillers', async () => {
    seq = 0;
    // 12 fillers saturate BOTH the oldest-10 and newest-10 draft windows once the ranked SD sits
    // in the middle of the age range (created between filler #6 and filler #7 by construction below).
    const oldFillers = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-OLD-${i + 1}`));
    const rankedOnly = rankedSd('SD-RANKED-ONLY-001', 1, { created_at: ts(11) }); // middle age position
    const newFillers = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-NEW-${i + 1}`, { created_at: ts(100 + i) }));
    const all = [...oldFillers, rankedOnly, ...newFillers];
    const view = oldFillers.slice(0, 5).map((d) => viewRow(d.sd_key)); // baselined view: only old fillers
    const { sb, db } = makeStub({
      strategic_directives_v2: all,
      v_sd_next_candidates: view,
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-RANKED-ONLY-001'); // reachable ONLY via fetchRankedCandidates + lifted by its rank
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-RANKED-ONLY-001').claiming_session_id).toBe(SESSION);
  });

  it('T2 (control): with NO ranked SD outside the windows, a filler is claimed — proving the ranked SD was reachable ONLY via the new source', async () => {
    seq = 0;
    const oldFillers = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-OLD-${i + 1}`));
    const newFillers = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-NEW-${i + 1}`, { created_at: ts(100 + i) }));
    const view = oldFillers.slice(0, 5).map((d) => viewRow(d.sd_key));
    const { sb } = makeStub({
      strategic_directives_v2: [...oldFillers, ...newFillers], // no ranked SD at all
      v_sd_next_candidates: view,
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toMatch(/^SD-DRAFT-/); // a filler, not the (absent) ranked SD
  });

  it('T3: an unranked SD (no metadata.dispatch_rank) outside the windows is NOT surfaced or claimed', async () => {
    seq = 0;
    const oldFillers = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-OLD-${i + 1}`));
    const newFillers = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-NEW-${i + 1}`, { created_at: ts(100 + i) }));
    const unranked = sd('SD-UNRANKED-MID-001', { created_at: ts(11) }); // middle age, no dispatch_rank
    const view = oldFillers.slice(0, 5).map((d) => viewRow(d.sd_key));
    const { sb, db } = makeStub({
      strategic_directives_v2: [...oldFillers, unranked, ...newFillers],
      v_sd_next_candidates: view,
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.sd).not.toBe('SD-UNRANKED-MID-001');
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-UNRANKED-MID-001').claiming_session_id).toBeNull();
  });

  it('T4: dedup — a ranked SD ALSO in the oldest-10 window is claimed once, not double-entered', async () => {
    seq = 0;
    const rankedInWindow = rankedSd('SD-RANKED-INWINDOW-001', 0); // oldest -> already in fetchDraftCandidates
    const otherOld = Array.from({ length: 9 }, (_, i) => sd(`SD-DRAFT-OLD-${i + 1}`));
    const { sb, db } = makeStub({
      strategic_directives_v2: [rankedInWindow, ...otherOld],
      v_sd_next_candidates: [],
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-RANKED-INWINDOW-001'); // lifted by its rank regardless of which source surfaced it
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-RANKED-INWINDOW-001').claiming_session_id).toBe(SESSION);
  });

  it('a ranked SD in a NON-allowlist status (pending_approval) is NOT surfaced or claimed', async () => {
    seq = 0;
    const pending = rankedSd('SD-RANKED-PENDING-001', 0, { status: 'pending_approval', created_at: ts(11) });
    const drafts = Array.from({ length: 4 }, (_, i) => sd(`SD-DRAFT-P-${i + 1}`));
    const { sb, db } = makeStub({
      strategic_directives_v2: [...drafts, pending],
      v_sd_next_candidates: drafts.map((d) => viewRow(d.sd_key)),
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.sd).not.toBe('SD-RANKED-PENDING-001');
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-RANKED-PENDING-001').claiming_session_id).toBeNull();
  });
});

describe('FR-1/FR-2 source-pinned wiring (the union exists and routes through the SSOT)', () => {
  it('runCheckin fetches the ranked-direct source and unions it as kind:baselined via the seen-set', async () => {
    const { readFileSync } = await import('fs');
    // SD-ARCH-HOTSPOT-CHECKIN-001: merged-pool rung moved verbatim to lib/checkin/steps/merged-pool-self-claim.cjs — pin follows the code.
    const src = readFileSync(new URL('../../lib/checkin/steps/merged-pool-self-claim.cjs', import.meta.url), 'utf8');
    const body = src;
    expect(body).toMatch(/fetchRankedCandidates\(sb\)/);                 // the fifth source is called
    expect(body).toMatch(/for \(const r of rankedRows\)/);               // unioned into the merged pool
    expect(body).toMatch(/seen\.has\(r\.sd_key\)/);                      // SAME seen-set dedup
    expect(body).toMatch(/kind: 'baselined', key: r\.sd_key/);          // routes through the full SSOT
  });
});
