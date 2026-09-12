/**
 * SD-REFILL-00IO6NQJ — assessFleetActivity.liveActiveWorkers must count a PID-alive
 * parked /loop worker (stale DB heartbeat, live CC process), not just heartbeat-fresh
 * sessions. The coordinator standing-report was reporting false "quiescent / 0 workers"
 * while 3-4 workers were live. PID-aliveness is OR'd onto the heartbeat window and is
 * injectable via opts.aliveCcPids for hermetic testing.
 */
import { describe, it, expect } from 'vitest';
import fleetQuiescence from '../../lib/coordinator/fleet-quiescence.cjs';

const { assessFleetActivity, decideQuiescence } = fleetQuiescence;

// Chainable Supabase mock: builder methods return the builder; awaiting resolves to
// resolver({table, columns, filters}). resolver may throw to simulate a query error.
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
        try { result = resolver(ctx); } catch (e) { return Promise.resolve().then(() => { throw e; }).then(onF, onR); }
        return Promise.resolve(result).then(onF, onR);
      },
    };
    return b;
  }
  return { from: (table) => builder(table) };
}

// Sessions come from v_active_sessions; everything else (builds, handoffs) is empty so
// only liveActiveWorkers varies. recentTransitions stays 0 (no handoffs in-window).
function sbWithSessions(sessions) {
  return makeSb((ctx) => {
    if (ctx.table === 'v_active_sessions') return { data: sessions, error: null };
    if (ctx.table === 'sd_phase_handoffs') return { data: [], error: null };
    // count: 0 satisfies the FR-6 exact head-count in_progress gauge; data for the intersect query.
    if (ctx.table === 'strategic_directives_v2') return { data: [], count: 0, error: null };
    throw new Error('unexpected table ' + ctx.table);
  });
}

const TERM = (ccPid) => `win-cc-5000-${ccPid}`;

describe('SD-REFILL-00IO6NQJ: liveActiveWorkers PID-aliveness', () => {
  it('counts a PID-alive claim-holder with a STALE heartbeat', async () => {
    const sb = sbWithSessions([
      { session_id: 's1', sd_key: 'SD-X-001', heartbeat_age_seconds: 9999, computed_status: 'active', terminal_id: TERM('12345') },
    ]);
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'ok', aliveCcPids: new Set(['12345']) });
    expect(r.signals.liveActiveWorkers).toBe(1);
    expect(r.quiescent).toBe(false);
  });

  it('still counts a heartbeat-fresh claim-holder even with no alive PIDs (no regression)', async () => {
    const sb = sbWithSessions([
      { session_id: 's1', sd_key: 'SD-X-001', heartbeat_age_seconds: 10, computed_status: 'active', terminal_id: TERM('99999') },
    ]);
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'ok', aliveCcPids: new Set() });
    expect(r.signals.liveActiveWorkers).toBe(1);
  });

  it('does NOT count a stale-heartbeat claim-holder whose PID is dead', async () => {
    const sb = sbWithSessions([
      { session_id: 's1', sd_key: 'SD-X-001', heartbeat_age_seconds: 9999, computed_status: 'active', terminal_id: TERM('77777') },
    ]);
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'ok', aliveCcPids: new Set(['12345']) });
    expect(r.signals.liveActiveWorkers).toBe(0);
    expect(r.quiescent).toBe(true);
  });

  it('does NOT count a PID-alive session that holds NO claim (idle between tasks)', async () => {
    const sb = sbWithSessions([
      { session_id: 's1', sd_key: null, heartbeat_age_seconds: 9999, computed_status: 'active', terminal_id: TERM('12345') },
    ]);
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'ok', aliveCcPids: new Set(['12345']) });
    expect(r.signals.liveActiveWorkers).toBe(0);
  });

  it('does NOT count a PID-alive claim-holder whose computed_status is not active', async () => {
    const sb = sbWithSessions([
      { session_id: 's1', sd_key: 'SD-X-001', heartbeat_age_seconds: 9999, computed_status: 'idle', terminal_id: TERM('12345') },
    ]);
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'ok', aliveCcPids: new Set(['12345']) });
    expect(r.signals.liveActiveWorkers).toBe(0);
  });

  it('off-box (empty alive set) degrades to heartbeat-only: stale worker not counted', async () => {
    const sb = sbWithSessions([
      { session_id: 's1', sd_key: 'SD-X-001', heartbeat_age_seconds: 9999, computed_status: 'active', terminal_id: TERM('12345') },
    ]);
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'ok', aliveCcPids: new Set() });
    expect(r.signals.liveActiveWorkers).toBe(0);
  });
});

// QF-20260911-907: a guard may decline to run but must never report a number it did not
// take. Before this fix, an absent/unreadable marker read silently degraded to
// heartbeat-only counting with no distinct signal -- a parked worker with a stale
// heartbeat could vanish from the live count with the tick reporting a confident
// "quiescent" it never actually measured.
describe('QF-20260911-907: could_not_determine is surfaced and forces not-quiescent', () => {
  it('decideQuiescence: couldNotDetermine forces quiescent=false regardless of the other counts', () => {
    const r = decideQuiescence({ liveActiveWorkers: 0, inProgressBuilds: 0, recentTransitions: 0, couldNotDetermine: true });
    expect(r.quiescent).toBe(false);
    expect(r.reason).toMatch(/^could_not_determine/);
  });

  it('decideQuiescence: couldNotDetermine=false with all-zero counts is still quiescent (no regression)', () => {
    const r = decideQuiescence({ liveActiveWorkers: 0, inProgressBuilds: 0, recentTransitions: 0, couldNotDetermine: false });
    expect(r.quiescent).toBe(true);
  });

  it('assessFleetActivity: markerReadState=absent surfaces couldNotDetermine and forces not-quiescent, even with 0 sessions/builds/transitions', async () => {
    const sb = sbWithSessions([]); // no live sessions, no builds, no transitions -- would be quiescent but for the marker read
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'absent' });
    expect(r.signals.couldNotDetermine).toBe(true);
    expect(r.quiescent).toBe(false);
    expect(r.reason).toMatch(/^could_not_determine/);
  });

  it('assessFleetActivity: markerReadState=unreadable also surfaces couldNotDetermine', async () => {
    const sb = sbWithSessions([]);
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'unreadable' });
    expect(r.signals.couldNotDetermine).toBe(true);
    expect(r.quiescent).toBe(false);
  });

  it('assessFleetActivity: markerReadState=ok with 0 sessions/builds/transitions is genuinely quiescent (no regression)', async () => {
    const sb = sbWithSessions([]);
    const r = await assessFleetActivity(sb, { now: Date.now(), markerReadState: 'ok' });
    expect(r.signals.couldNotDetermine).toBe(false);
    expect(r.quiescent).toBe(true);
  });
});
