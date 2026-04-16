/**
 * Calibration back-fill tests (PRD TS-8) for fleet-liveness-mc.cjs.
 *
 * Uses a fake in-memory Supabase double to verify:
 *   - First call back-fills rows observed > 5m ago.
 *   - Second call is idempotent (updates nothing).
 *   - actual_liveness_t5 reflects heartbeat proximity.
 *
 * No production code is mocked — only the supabase client used by the backfill
 * loop, which is a dependency of the test.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mc = require('../../scripts/fleet-liveness-mc.cjs');

/**
 * Minimal in-memory Supabase double implementing just the query shapes used
 * by backfillCalibration():
 *   - select().is('actual_liveness_t5', null).lte('observed_at', since).order().limit()
 *   - select().eq('session_id', id).maybeSingle()
 *   - update(payload).eq('id', id).is('actual_liveness_t5', null)
 */
function makeFakeSupabase({ estimates, sessions }) {
  // Key the in-memory DB by the actual table names the production code uses.
  // Share references with the caller so the test can assert mutations in the
  // original arrays (slicing here would hide writes the production code made).
  const db = {
    fleet_liveness_estimates: estimates,
    claude_sessions: sessions,
  };
  let updateCount = 0;
  const builder = (table) => {
    const state = {
      table,
      filters: [],
      _order: null,
      _limit: null,
      _updatePayload: null,
      select() { return this; },
      is(col, val) { this.filters.push({ type: 'is', col, val }); return this; },
      eq(col, val) { this.filters.push({ type: 'eq', col, val }); return this; },
      lte(col, val) { this.filters.push({ type: 'lte', col, val }); return this; },
      in(col, vals) { this.filters.push({ type: 'in', col, vals }); return this; },
      order(col, opts) { this._order = { col, opts }; return this; },
      limit(n) { this._limit = n; return this; },
      maybeSingle() { return Promise.resolve({ data: this._resolve()[0] ?? null, error: null }); },
      update(payload) { this._updatePayload = payload; return this; },
      _resolve() {
        let rows = db[this.table].slice();
        for (const f of this.filters) {
          if (f.type === 'is') rows = rows.filter(r => (f.val === null ? r[f.col] == null : r[f.col] === f.val));
          else if (f.type === 'eq') rows = rows.filter(r => r[f.col] === f.val);
          else if (f.type === 'lte') rows = rows.filter(r => r[f.col] <= f.val);
          else if (f.type === 'in') rows = rows.filter(r => f.vals.includes(r[f.col]));
        }
        if (this._order) {
          const { col, opts } = this._order;
          const asc = opts?.ascending !== false;
          rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
        }
        if (this._limit) rows = rows.slice(0, this._limit);
        return rows;
      },
      then(onFulfilled, onRejected) {
        // Chainable-await: when awaited directly (not via maybeSingle), resolve
        // as a query result OR run the update if _updatePayload is set.
        if (this._updatePayload) {
          const targets = this._resolve();
          for (const row of targets) {
            Object.assign(row, this._updatePayload);
            updateCount++;
          }
          return Promise.resolve({ data: targets, error: null }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({ data: this._resolve(), error: null }).then(onFulfilled, onRejected);
      },
    };
    return state;
  };
  return {
    from: builder,
    __getUpdateCount: () => updateCount,
    __estimates: db.estimates,
  };
}

describe('fleet-liveness-mc — backfillCalibration (TS-8)', () => {
  it('first call updates rows older than 5m, second call is idempotent', async () => {
    const now = Date.now();
    const mins = (n) => new Date(now - n * 60000).toISOString();
    const estimates = [
      // 3 rows observed 6m ago, all still pending back-fill
      { id: 'e1', session_id: 'S1', observed_at: mins(6), actual_liveness_t5: null },
      { id: 'e2', session_id: 'S2', observed_at: mins(6), actual_liveness_t5: null },
      { id: 'e3', session_id: 'S3', observed_at: mins(6), actual_liveness_t5: null },
      // 1 row observed 2m ago — should NOT be back-filled yet
      { id: 'e4', session_id: 'S1', observed_at: mins(2), actual_liveness_t5: null },
      // 1 row already back-filled — must not be touched
      { id: 'e5', session_id: 'S2', observed_at: mins(7), actual_liveness_t5: true },
    ];
    const sessions = [
      // Worker S1 heartbeat fresh → alive at observed time
      { session_id: 'S1', heartbeat_at: mins(5), worktree_path: null },
      // Worker S2 heartbeat very old → dead
      { session_id: 'S2', heartbeat_at: mins(30), worktree_path: null },
      // Worker S3 has no heartbeat available → default false
    ];
    const fake = makeFakeSupabase({ estimates, sessions });
    const res1 = await mc.backfillCalibration(fake);
    expect(res1.updated).toBeGreaterThanOrEqual(3);
    // e1, e2, e3 back-filled; e4 too fresh; e5 already set
    expect(estimates.find(e => e.id === 'e1').actual_liveness_t5).toBe(true); // S1 hb within tolerance
    expect(estimates.find(e => e.id === 'e2').actual_liveness_t5).toBe(false); // S2 hb far out
    expect(estimates.find(e => e.id === 'e3').actual_liveness_t5).toBe(false); // no session row
    expect(estimates.find(e => e.id === 'e4').actual_liveness_t5).toBe(null); // under 5m
    expect(estimates.find(e => e.id === 'e5').actual_liveness_t5).toBe(true); // untouched

    // Second call — idempotent.
    const res2 = await mc.backfillCalibration(fake);
    expect(res2.updated).toBe(0);
  });
});
