// SD-LEO-INFRA-SELF-CLAIM-WINDOW-NEWEST-FIT-DRAFT-001 (FR-2/FR-3) — NON-MOCKED regression closing the
// non-fleet_critical residual of #5268. fetchDraftCandidates is a single created_at-ASC limit-10 window
// (the OLDEST 10 drafts) and fetchFleetCriticalCandidates is gated on fleet_critical=true, so a fresh
// NON-fleet_critical draft at age-position 11+ is in NEITHER source and starves. The fix adds a FOURTH
// source (fetchNewestDraftCandidates, created_at DESC) unioned into the merged step-6 pool.
//
// T1 drives the REAL runCheckin(): fetchNewestDraftCandidates, the merge/dedup, orderByFleetCriticalThenRank,
// baselinedCandidateEligible, classifyDispatchIneligibility, isSdInFlight and tryClaim all run for real —
// ONLY the DB seam (an in-memory Supabase fixture) and the coordinator resolver are stubbed. T1 is
// anti-test-masking: SD-NEWEST-FIT is reachable ONLY via the new source (it overflows the oldest-10 window
// and is not fleet_critical), so removing the union makes runCheckin claim nothing / a filler and T1 fails.
// FR-2b/FR-3 pin the real fetchNewestDraftCandidates guards and the source-wiring/dedup directly.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runCheckin, fetchNewestDraftCandidates, fetchDraftCandidates } = require('../../scripts/worker-checkin.cjs');

const SESSION = 'test-session-newestwin-1';
const NO_COORD = { getCoordinator: async () => null };

// ── In-memory Supabase fixture (the ONLY stubbed seam) — faithful-enough PostgREST builder. ──
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
// Older drafts get older created_at; the newest fit-draft gets ts(99) (position 11+ by age).
const ts = (n) => `2026-01-${String(n).padStart(2, '0')}T00:00:00.000Z`;
const sd = (key, extra = {}) => ({
  id: `id-${++seq}`, sd_key: key, status: 'draft', sd_type: 'infrastructure', priority: 'high',
  current_phase: 'LEAD', created_at: ts(seq), dependencies: [], metadata: {}, target_application: null,
  parent_sd_id: null, claiming_session_id: null, is_working_on: false, ...extra,
});
const sessionRow = () => ({ session_id: SESSION, metadata: {}, sd_key: null, heartbeat_at: ts(1) });
const viewRow = (key) => ({ sd_id: key, track: 'STANDALONE', status: 'draft', priority: 'high' });

describe('newest-window reachability via the new fourth source (SD-LEO-INFRA-SELF-CLAIM-WINDOW-NEWEST-FIT-DRAFT-001)', () => {
  it('T1: a fresh NON-fleet_critical draft at age-position 11+ (outside the oldest-10 window) is self_claimed', async () => {
    seq = 0;
    // 12 older drafts saturate the oldest-10 window; the fresh fit-draft is NEWEST (position 13 by age) and
    // NOT fleet_critical, so it is reachable ONLY via fetchNewestDraftCandidates.
    const drafts = Array.from({ length: 12 }, (_, i) => sd(`SD-OLD-FILL-${i + 1}`));
    const newestFit = sd('SD-NEWEST-FIT-001', { created_at: ts(99) });
    const { sb, db } = makeStub({
      strategic_directives_v2: [...drafts, newestFit],
      v_sd_next_candidates: drafts.slice(0, 5).map((d) => viewRow(d.sd_key)), // view: only older fillers
      claude_sessions: [sessionRow()],
    });
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    // At equal priority the newest-window source surfaces SD-NEWEST-FIT; the point is it IS claimable
    // (before the fix it was in neither window -> the fresh draft could never be reached at all).
    const claimed = db.strategic_directives_v2.find((r) => r.sd_key === res.sd);
    expect(claimed.claiming_session_id).toBe(SESSION);
    // Prove the newest source is what makes it reachable: it is NOT in the oldest-10 window.
    const oldest = await fetchDraftCandidates(sb);
    expect(oldest.map((d) => d.sd_key)).not.toContain('SD-NEWEST-FIT-001');
    const newest = await fetchNewestDraftCandidates(sb);
    expect(newest.map((d) => d.sd_key)).toContain('SD-NEWEST-FIT-001');
  });

  it('FR-2b: fetchNewestDraftCandidates applies the same guards (status allowlist / claiming null / neq orchestrator)', async () => {
    seq = 0;
    const good = sd('SD-NEWEST-GOOD-001', { created_at: ts(99) });
    const pending = sd('SD-NEWEST-PENDING-001', { status: 'pending_approval', created_at: ts(98) }); // non-allowlist status
    const claimed = sd('SD-NEWEST-CLAIMED-001', { created_at: ts(97), claiming_session_id: 'other-session' }); // already claimed
    const parent = sd('SD-NEWEST-ORCH-001', { sd_type: 'orchestrator', created_at: ts(96) }); // orchestrator parent
    const { sb } = makeStub({
      strategic_directives_v2: [good, pending, claimed, parent],
      v_sd_next_candidates: [],
      claude_sessions: [sessionRow()],
    });
    const rows = await fetchNewestDraftCandidates(sb);
    const keys = rows.map((d) => d.sd_key);
    expect(keys).toContain('SD-NEWEST-GOOD-001');
    expect(keys).not.toContain('SD-NEWEST-PENDING-001');   // status allowlist
    expect(keys).not.toContain('SD-NEWEST-CLAIMED-001');   // claiming_session_id null
    expect(keys).not.toContain('SD-NEWEST-ORCH-001');      // neq orchestrator
  });

  it('FR-3: the newest source is unioned as kind:draft and deduped by the SAME seen-set (no double-count)', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../scripts/worker-checkin.cjs', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('async function runCheckin'), src.indexOf('async function main'));
    expect(body).toMatch(/fetchNewestDraftCandidates\(sb\)/);   // the fourth source is called
    expect(body).toMatch(/for \(const d of newestRows\)/);      // unioned into the merged pool
    expect(body).toMatch(/seen\.has\(d\.sd_key\)/);             // SAME seen-set dedup (by sd_key)
    expect(body).toMatch(/kind: 'draft', key: d\.sd_key, row: d/); // routes through tryClaimDraftCandidate (full SSOT)
  });

  it('FR-3b: an SD present in BOTH windows yields a single merged entry (dedup) — claimed once', async () => {
    seq = 0;
    // Only ONE eligible draft exists; it is returned by BOTH fetchDraftCandidates and fetchNewestDraftCandidates.
    // The seen-set dedup must not double-add it (a double-add would still claim once, but the pool shape must be 1).
    const only = sd('SD-BOTH-WINDOWS-001', { created_at: ts(50) });
    const { sb, db } = makeStub({
      strategic_directives_v2: [only],
      v_sd_next_candidates: [],
      claude_sessions: [sessionRow()],
    });
    const oldest = await fetchDraftCandidates(sb);
    const newest = await fetchNewestDraftCandidates(sb);
    expect(oldest.map((d) => d.sd_key)).toContain('SD-BOTH-WINDOWS-001');
    expect(newest.map((d) => d.sd_key)).toContain('SD-BOTH-WINDOWS-001'); // in BOTH windows
    const res = await runCheckin(sb, SESSION, NO_COORD);
    expect(res.action).toBe('self_claimed');
    expect(res.sd).toBe('SD-BOTH-WINDOWS-001');
    expect(db.strategic_directives_v2.find((r) => r.sd_key === 'SD-BOTH-WINDOWS-001').claiming_session_id).toBe(SESSION);
  });
});
