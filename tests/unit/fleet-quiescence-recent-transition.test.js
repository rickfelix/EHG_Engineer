/**
 * SD-REFILL-00C7I5BY — fleet-quiescence recentTransitions must be anchored on the IMMUTABLE
 * sd_phase_handoffs.created_at, not strategic_directives_v2.updated_at.
 *
 * Regression target: a parked/stale completed|pending_approval SD whose updated_at is bumped by a
 * sweep was counted as a fresh "recent transition" — inflating the belt-burn the Adam belt-countdown
 * tick reads (2 vs real 1) AND flipping fleet quiescence from idle to active (witnessed 2026-06-14,
 * SD-LEO-INFRA-CLOUD-CAP-LIVE-FEEDER-001 re-touched at 14:54). The fix queries recent handoffs first
 * (created_at only stamps on a real transition), then intersects with currently near-terminal SDs.
 */
import { describe, it, expect } from 'vitest';
import fleetQuiescence from '../../lib/coordinator/fleet-quiescence.cjs';

const { assessFleetActivity } = fleetQuiescence;

/**
 * Minimal chainable Supabase mock. `.from(table)` returns a builder whose select/eq/gte/in all
 * return the same builder; awaiting it resolves to resolver({ table, columns, filters }).
 * resolver may THROW to simulate a query error (the assessor must fail-OPEN to active).
 */
function makeSb(resolver) {
  function builder(table) {
    const ctx = { table, columns: null, filters: [] };
    const b = {
      select(cols) { ctx.columns = cols; return b; },
      eq(col, val) { ctx.filters.push(['eq', col, val]); return b; },
      gte(col, val) { ctx.filters.push(['gte', col, val]); return b; },
      in(col, val) { ctx.filters.push(['in', col, val]); return b; },
      order(col, opts) { ctx.filters.push(['order', col, opts]); return b; },
      limit(n) { ctx.filters.push(['limit', n]); return b; },
      then(onF, onR) {
        let result;
        try { result = resolver(ctx); } catch (e) { return Promise.resolve().then(function () { throw e; }).then(onF, onR); }
        return Promise.resolve(result).then(onF, onR);
      },
    };
    return b;
  }
  return { from: function (table) { return builder(table); } };
}

// Common no-activity baseline: no live workers, no in_progress builds.
function baseResolver(ctx, overrides) {
  if (ctx.table === 'v_active_sessions') return { data: [], error: null };
  if (ctx.table === 'strategic_directives_v2') {
    const isInProgress = ctx.filters.some(function (f) { return f[0] === 'eq' && f[1] === 'status' && f[2] === 'in_progress'; });
    // FR-6 (count-truncation discipline): the in_progress gauge is now an exact head-count.
    if (isInProgress) return { data: null, count: 0, error: null };
    // the near-terminal intersect query (select id, .in id, .in status)
    return overrides.nearTerminal || { data: [], error: null };
  }
  if (ctx.table === 'sd_phase_handoffs') return overrides.handoffs || { data: [], error: null };
  throw new Error('unexpected table ' + ctx.table);
}

describe('SD-REFILL-00C7I5BY: assessFleetActivity recentTransitions anchor', () => {
  it('a parked/stale near-terminal SD with NO in-window handoff is NOT counted (recentTransitions=0)', async () => {
    // No handoff rows in the window → recentSdIds is empty → the near-terminal query never runs.
    // (The SD exists in completed/pending_approval with a freshly-bumped updated_at, but with no
    // matching handoff event it must not register as activity.)
    const sb = makeSb(function (ctx) {
      return baseResolver(ctx, { handoffs: { data: [], error: null } });
    });
    const r = await assessFleetActivity(sb, { now: Date.now() });
    expect(r.signals.recentTransitions).toBe(0);
    expect(r.quiescent).toBe(true);
  });

  it('does NOT count an in-window handoff whose SD is no longer near-terminal', async () => {
    // A handoff happened in-window (e.g. LEAD-TO-PLAN) but the SD is now in_progress, not
    // completed/pending_approval → the intersect drops it.
    const sb = makeSb(function (ctx) {
      return baseResolver(ctx, {
        handoffs: { data: [{ sd_id: 'uuid-moving' }], error: null },
        nearTerminal: { data: [], error: null },
      });
    });
    const r = await assessFleetActivity(sb, { now: Date.now() });
    expect(r.signals.recentTransitions).toBe(0);
  });

  it('counts a genuine recent completion: in-window handoff + currently near-terminal (recentTransitions=1)', async () => {
    const sb = makeSb(function (ctx) {
      return baseResolver(ctx, {
        handoffs: { data: [{ sd_id: 'uuid-done' }], error: null },
        nearTerminal: { data: [{ id: 'uuid-done' }], error: null },
      });
    });
    const r = await assessFleetActivity(sb, { now: Date.now() });
    expect(r.signals.recentTransitions).toBe(1);
    expect(r.quiescent).toBe(false); // recent activity → not quiescent
  });

  it('dedups duplicate handoff rows for the same SD before intersecting', async () => {
    const sb = makeSb(function (ctx) {
      if (ctx.table === 'sd_phase_handoffs') {
        return { data: [{ sd_id: 'uuid-done' }, { sd_id: 'uuid-done' }, { sd_id: null }], error: null };
      }
      return baseResolver(ctx, { nearTerminal: { data: [{ id: 'uuid-done' }], error: null } });
    });
    const r = await assessFleetActivity(sb, { now: Date.now() });
    expect(r.signals.recentTransitions).toBe(1);
  });

  it('fails OPEN to active when the handoff query throws', async () => {
    const sb = makeSb(function (ctx) {
      if (ctx.table === 'sd_phase_handoffs') throw new Error('handoff query boom');
      return baseResolver(ctx, {});
    });
    const r = await assessFleetActivity(sb, { now: Date.now() });
    expect(r.quiescent).toBe(false);
    expect(r.reason).toMatch(/^assessment_error_fail_active/);
    expect(r.signals.error).toBe('handoff query boom');
  });

  it('does NOT reference updated_at in the recency path (gte is on a handoff created_at)', async () => {
    const seen = [];
    const sb = makeSb(function (ctx) {
      ctx.filters.forEach(function (f) { if (f[0] === 'gte') seen.push({ table: ctx.table, col: f[1] }); });
      return baseResolver(ctx, {});
    });
    await assessFleetActivity(sb, { now: Date.now() });
    // the only gte filter must be on sd_phase_handoffs.created_at — never strategic_directives_v2.updated_at
    expect(seen).toContainEqual({ table: 'sd_phase_handoffs', col: 'created_at' });
    expect(seen.some(function (s) { return s.col === 'updated_at'; })).toBe(false);
  });
});
