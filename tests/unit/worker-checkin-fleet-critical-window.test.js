// SD-LEO-INFRA-SELF-CLAIM-WINDOW-FLEET-CRITICAL-001 (FR-4) — NON-MOCKED regression through real
// runCheckin(). The fleet_critical reorder runs DOWNSTREAM of two fleet_critical-BLIND candidate
// windows (v_sd_next_candidates limit-5 + fetchDraftCandidates created_at-ASC limit-10), so a
// claimable fleet_critical SD OUTSIDE both windows never enters the pool to be lifted. The fix adds a
// THIRD source (fetchFleetCriticalCandidates) unioned into the merged step-6 pool.
//
// These tests drive the REAL runCheckin(): orderByFleetCriticalThenRank, sortByDispatchRank,
// baselinedCandidateEligible, classifyDispatchIneligibility, isSdInFlight and tryClaim all run for
// real — ONLY the DB seam (an in-memory Supabase fixture) and the coordinator resolver are stubbed.
// T1/T4 are inherently anti-test-masking: SD-FC-ONLY is reachable ONLY via the new source, so removing
// the union makes runCheckin claim a filler and the assertions fail (the smoke step-4 removal check).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runCheckin } = require('../../scripts/worker-checkin.cjs');

// A ghost-prefixed session id (assign-fleet-identities GHOST_SESSION_ID_PREFIXES) so the post-claim
// fleet-naming path is skipped (it never burns the 8-name pool for test sessions).
const SESSION = 'test-session-fleetcrit-1';
const NO_COORD = { getCoordinator: async () => null }; // bypass coordinator resolution (broadcast)

// ── In-memory Supabase fixture (the ONLY stubbed seam) ──────────────────────────────────────────────
// A faithful-enough PostgREST query builder: chainable filters + order + limit, terminal
// maybeSingle/single, thenable resolution, insert/update, and the claim_sd RPC. JSON `->>'k'` extraction
// stringifies the value (so eq('metadata->>fleet_critical','true') admits BOTH a boolean true and a
// string 'true' — exactly the surfaced-but-not-lifted hazard the strict-boolean filter (FR-3) closes).
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
      return v === undefined || v === null ? null : String(v); // PostgREST text extraction
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
      not() { return b; },                                   // not exercised on the claim path
      or() { return b; },                                    // parentLeadPending short-circuits before .or
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

// ── Seed builders ───────────────────────────────────────────────────────────────────────────────────
let seq = 0;
const ts = (n) => `2026-01-${String(n).padStart(2, '0')}T00:00:00.000Z`;
// A plain, fully-eligible draft SD (no target_application -> repo-fit; no human-action / co-author /
// clone-tree markers; current_phase LEAD -> not in-flight; status draft -> claimable).
const sd = (key, extra = {}) => ({
  id: `id-${++seq}`, sd_key: key, status: 'draft', sd_type: 'infrastructure', priority: 'high',
  current_phase: 'LEAD', created_at: ts(seq), dependencies: [], metadata: {}, target_application: null,
  parent_sd_id: null, claiming_session_id: null, is_working_on: false, ...extra,
});
const fleetCriticalSd = (key, extra = {}) => sd(key, { metadata: { fleet_critical: true }, ...extra });
const sessionRow = () => ({ session_id: SESSION, metadata: {}, sd_key: null, heartbeat_at: ts(1) });
// v_sd_next_candidates row (the view exposes sd_id = the sd_key STRING).
const viewRow = (key) => ({ sd_id: key, track: 'STANDALONE', status: 'draft', priority: 'high' });

describe('fleet_critical reachability via the new third source (SD-LEO-INFRA-SELF-CLAIM-WINDOW-FLEET-CRITICAL-001)', () => {
  it('T1: a fleet_critical SD present ONLY in the new source is self_claimed past equally-claimable fillers', async () => {
    seq = 0;
    // 10 draft fillers (older) saturate the limit-10 draft window; 5 of them also populate the limit-5 view.
    const drafts = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-FILL-${i + 1}`));
    const fcOnly = fleetCriticalSd('SD-FC-ONLY-001', { created_at: ts(99) }); // NEWEST -> outside the draft window
    const all = [...drafts, fcOnly];
    const view = drafts.slice(0, 5).map((d) => viewRow(d.sd_key)); // limit-5 view: only fillers, never FC
    const { sb, db } = makeStub({
      strategic_directives_v2: all,
      v_sd_next_candidates: view,
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-FC-ONLY-001'); // lifted above every filler
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-FC-ONLY-001').claiming_session_id).toBe(SESSION);
  });

  it('T2 (control): with NO fleet_critical SD, a filler is claimed — proving FC was reachable ONLY via the new source', async () => {
    seq = 0;
    const drafts = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-FILL-${i + 1}`));
    const view = drafts.slice(0, 5).map((d) => viewRow(d.sd_key));
    const { sb } = makeStub({
      strategic_directives_v2: [...drafts], // no fleet_critical SD at all
      v_sd_next_candidates: view,
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toMatch(/^SD-DRAFT-FILL-/); // a filler, not FC
  });

  it('T3: fleet_critical beats a fresher dispatch_rank at full-runCheckin level (stale-proof)', async () => {
    seq = 0;
    // A filler with a FRESH (lower) dispatch_rank that would otherwise win the ordering.
    const fresh = sd('SD-FRESH-RANK-001', { metadata: { dispatch_rank: 0, dispatch_rank_at: new Date().toISOString() } });
    const fc = fleetCriticalSd('SD-FC-STALEPROOF-001', { created_at: ts(99) }); // no dispatch_rank
    const { sb } = makeStub({
      strategic_directives_v2: [fresh, fc],
      v_sd_next_candidates: [viewRow('SD-FRESH-RANK-001')],
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-FC-STALEPROOF-001'); // fleet_critical lift beats the fresher rank
  });

  it('T4: the NEWEST-draft fleet_critical SD (overflowing the limit-10 draft window) is surfaced', async () => {
    seq = 0;
    const drafts = Array.from({ length: 12 }, (_, i) => sd(`SD-DRAFT-OVF-${i + 1}`)); // 12 > limit-10
    const fcNewest = fleetCriticalSd('SD-FC-NEWEST-001', { created_at: ts(99) }); // position 13 by age
    const { sb } = makeStub({
      strategic_directives_v2: [...drafts, fcNewest],
      v_sd_next_candidates: drafts.slice(0, 5).map((d) => viewRow(d.sd_key)),
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-FC-NEWEST-001');
  });

  it('FR-3: a string "true" fleet_critical is surfaced-but-not-lifted hazard — NOT treated as fleet_critical', async () => {
    seq = 0;
    // metadata.fleet_critical = the STRING 'true'. The DB text-match (metadata->>fleet_critical) would
    // admit it, but the strict-boolean JS filter excludes it (it would otherwise be in the pool yet never
    // lifted by sortByDispatchRank's `=== true` check). With it excluded and outside both windows, the
    // claim falls to a real filler.
    const strung = sd('SD-FC-STRING-001', { metadata: { fleet_critical: 'true' }, created_at: ts(99) });
    const drafts = Array.from({ length: 10 }, (_, i) => sd(`SD-DRAFT-S-${i + 1}`));
    const { sb, db } = makeStub({
      strategic_directives_v2: [...drafts, strung],
      v_sd_next_candidates: drafts.slice(0, 5).map((d) => viewRow(d.sd_key)),
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).not.toBe('SD-FC-STRING-001');         // string 'true' is NOT fleet_critical
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-FC-STRING-001').claiming_session_id).toBeNull();
  });

  it('a fleet_critical SD in a NON-allowlist status (pending_approval) is NOT surfaced or claimed', async () => {
    seq = 0;
    // Positive allowlist status IN (draft,active): a pending_approval fleet_critical SD that never passed
    // LEAD must never be surfaced (a negative denylist would have admitted it -> wrong EXEC start).
    const pending = fleetCriticalSd('SD-FC-PENDING-001', { status: 'pending_approval', created_at: ts(99) });
    const drafts = Array.from({ length: 4 }, (_, i) => sd(`SD-DRAFT-P-${i + 1}`));
    const { sb, db } = makeStub({
      strategic_directives_v2: [...drafts, pending],
      v_sd_next_candidates: drafts.map((d) => viewRow(d.sd_key)),
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.sd).not.toBe('SD-FC-PENDING-001');
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-FC-PENDING-001').claiming_session_id).toBeNull();
  });
});

describe('FR-2/FR-5 source-pinned wiring (the union exists and routes through the SSOT)', () => {
  it('runCheckin fetches the fleet_critical source and unions it as kind:baselined via the seen-set', async () => {
    const { readFileSync } = await import('fs');
    // SD-ARCH-HOTSPOT-CHECKIN-001: merged-pool rung moved verbatim to lib/checkin/steps/merged-pool-self-claim.cjs — pin follows the code.
    const src = readFileSync(new URL('../../lib/checkin/steps/merged-pool-self-claim.cjs', import.meta.url), 'utf8');
    const body = src;
    expect(body).toMatch(/fetchFleetCriticalCandidates\(sb\)/);          // the third source is called
    expect(body).toMatch(/for \(const f of fcRows\)/);                   // unioned into the merged pool
    expect(body).toMatch(/seen\.has\(f\.sd_key\)/);                      // SAME seen-set dedup
    expect(body).toMatch(/kind: 'baselined', key: f\.sd_key/);          // routes through the full SSOT
  });
});
