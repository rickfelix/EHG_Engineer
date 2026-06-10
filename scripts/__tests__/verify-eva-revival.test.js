/**
 * Unit tests for the EVA revival verification harness
 * (SD-LEO-INFRA-REVIVE-EVA-VERIFY-READINESS-001). Hermetic — a stub Supabase returns canned
 * counts/rows per table so the pure verifyEvaRevival logic is exercised without a live DB.
 */
import { describe, it, expect } from 'vitest';
import { verifyEvaRevival } from '../verify-eva-revival.mjs';

const NOW = Date.parse('2026-06-10T12:00:00.000Z');
const fresh = new Date(NOW - 60_000).toISOString();       // 1 min old → fresh
const stale = new Date(NOW - 3_600_000).toISOString();    // 60 min old → stale

/**
 * Build a stub supabase whose .from(table) returns canned data. `counts` maps a "table:status"
 * (or "table") key to a count; `heartbeat` is the single heartbeat row.
 */
function stub({ heartbeat, counts = {} }) {
  return {
    from(table) {
      let eqStatus = null;
      const b = {
        select(_cols, opts) { this._head = !!(opts && opts.head); return this; },
        eq(col, val) { if (col === 'status') eqStatus = val; return this; },
        limit() { return this; },
        maybeSingle() { return Promise.resolve({ data: table === 'eva_scheduler_heartbeat' ? heartbeat : null, error: null }); },
        then(resolve) {
          const key = eqStatus ? `${table}:${eqStatus}` : table;
          return resolve({ count: counts[key] ?? 0, data: [], error: null });
        },
      };
      return b;
    },
  };
}

describe('verifyEvaRevival', () => {
  it('PASSES when daemon fresh, alarm correct, acceptance wired, purge genuine', async () => {
    const sb = stub({
      heartbeat: { id: 1, instance_id: 'scheduler-abc', last_poll_at: fresh, status: 'running', poll_count: 76, metadata: { observe_only: true } },
      counts: { 'okr_generation_log:pending_chairman_acceptance': 0, okr_snapshots: 30, management_reviews: 1 },
    });
    const r = await verifyEvaRevival(sb, { now: () => NOW });
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.id === 'C1_liveness').pass).toBe(true);
    expect(r.checks.find((c) => c.id === 'C2_alarm').pass).toBe(true);
    expect(r.checks.find((c) => c.id === 'C3_acceptance').pass).toBe(true);
    expect(r.checks.find((c) => c.id === 'C4_purge').pass).toBe(true);
  });

  it('FAILS C1 + C2-quiet when the heartbeat is stale (daemon down)', async () => {
    const sb = stub({
      heartbeat: { id: 1, instance_id: 'scheduler-dead', last_poll_at: stale, status: 'running', poll_count: 5, metadata: {} },
      counts: { okr_snapshots: 30, management_reviews: 1 },
    });
    const r = await verifyEvaRevival(sb, { now: () => NOW });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'C1_liveness').pass).toBe(false);
    // alarm should NOT be quiet on a stale heartbeat → C2 fails
    expect(r.checks.find((c) => c.id === 'C2_alarm').pass).toBe(false);
    expect(r.summary.hard_failed).toContain('C1_liveness');
  });

  it('FAILS C4 when management_reviews still holds the pollution count', async () => {
    const sb = stub({
      heartbeat: { id: 1, instance_id: 'scheduler-abc', last_poll_at: fresh, status: 'running', poll_count: 76, metadata: {} },
      counts: { okr_snapshots: 30, management_reviews: 43935 },
    });
    const r = await verifyEvaRevival(sb, { now: () => NOW });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'C4_purge').pass).toBe(false);
    expect(r.checks.find((c) => c.id === 'C4_purge').evidence.count).toBe(43935);
  });

  it('FAILS C1 + C2 when the heartbeat row is missing entirely (fresh deploy / wiped)', async () => {
    const sb = stub({ heartbeat: null, counts: { okr_snapshots: 30, management_reviews: 1 } });
    const r = await verifyEvaRevival(sb, { now: () => NOW });
    expect(r.ok).toBe(false);
    const c1 = r.checks.find((c) => c.id === 'C1_liveness');
    expect(c1.pass).toBe(false);
    expect(c1.evidence.age_s).toBeNull();
    // no row → alarm cannot confirm "quiet on fresh" → C2 fails too
    expect(r.checks.find((c) => c.id === 'C2_alarm').pass).toBe(false);
  });

  it('throws (→ exit 2 in main) when the heartbeat read errors', async () => {
    const sb = {
      from() {
        return {
          select() { return this; }, eq() { return this; }, limit() { return this; },
          maybeSingle() { return Promise.resolve({ data: null, error: { message: 'boom' } }); },
          then(resolve) { return resolve({ count: 0, data: [], error: null }); },
        };
      },
    };
    await expect(verifyEvaRevival(sb, { now: () => NOW })).rejects.toThrow(/heartbeat read failed: boom/);
  });

  it('C2 alarm fires on a synthetic stale row regardless of live freshness', async () => {
    const sb = stub({
      heartbeat: { id: 1, instance_id: 'scheduler-abc', last_poll_at: fresh, status: 'running', poll_count: 76, metadata: {} },
      counts: { okr_snapshots: 30, management_reviews: 1 },
    });
    const r = await verifyEvaRevival(sb, { now: () => NOW });
    const c2 = r.checks.find((c) => c.id === 'C2_alarm');
    expect(c2.evidence.fires_on_synthetic_stale).toBe(true);
    expect(c2.evidence.quiet_on_live_fresh).toBe(true);
  });
});
