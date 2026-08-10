/**
 * SD-LEO-INFRA-DRIVE-STATE-FORCING-001 — the forcing-function, TWO-SIDED on every clause.
 *
 * The subsystem's own history is the reason every assertion here has a positive AND a negative
 * control: a gauge rendered-but-not-acted-on read as healthy while an axis stalled, and the fix
 * for that class must prove both that a stalled axis FORCES and that a moving/idle axis does NOT
 * (a forcing-function that cries wolf gets routed around, which is the same death by a different
 * door). The meta-control gets a planted-miss positive control — a self-check never proven able
 * to fail is a self-check that cannot fail, which is a self-check that checks nothing.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  OWED_ACTS, deriveOwedActions, basisStaleness, composeDriveStateReport, assertForcingRan,
} = require_('../../../lib/governance/drive-state/owed-actions.cjs');
const { AXES, STATE, ACTION } = require_('../../../lib/governance/drive-state/contract.cjs');
const { renderDriveState } = require_('../../../lib/governance/drive-state/render.cjs');
const { emitOwedActions, readbackOwedActions, ACTION_KIND } = require_('../../../scripts/lib/drive-state-owed-emitter.cjs');
const { currentStallSpans, newestRecordedAt } = require_('../../../scripts/lib/drive-state-verdict-store.cjs');

const NOW = new Date('2026-08-10T12:00:00.000Z');
const MEASURED_AT = '2026-08-10T11:59:00.000Z';

/** Only these four can emit STALLED today — roadmap_motion and learning_conversion classify() as
 *  pinned UNMEASURABLE constants. The meta-control's honest coverage claim is exactly this set. */
const STALL_CAPABLE = ['chairman_decisions', 'coordinator_performance', 'venture_stage_motion', 'fleet_health'];

function entry(axis, over = {}) {
  const state = over.state || STATE.CLEAR;
  return {
    axis,
    state,
    citation: `${axis} checked`,
    action_taken: over.action_taken || ACTION.NONE,
    reason: state === STATE.UNMEASURABLE ? (over.reason || 'idle_population') : null,
    owed: null, in_motion: null, stalled: null,
    ...over,
  };
}

function verdict(overrides = {}) {
  return {
    axes: AXES.map((axis) => entry(axis, overrides[axis] || {})),
    measured_at: MEASURED_AT,
  };
}

describe('FR-1 / AC-1 — the forcing-function is two-sided', () => {
  for (const axis of STALL_CAPABLE) {
    it(`${axis}: STALLED derives exactly one owed-action; CLEAR derives none`, () => {
      const stalled = deriveOwedActions({ verdict: verdict({ [axis]: { state: STATE.STALLED } }) });
      expect(stalled).toHaveLength(1);
      expect(stalled[0].axis).toBe(axis);
      expect(stalled[0].act).toBe(OWED_ACTS[axis]);
      expect(String(stalled[0].citation).length).toBeGreaterThan(0);

      const moving = deriveOwedActions({ verdict: verdict() });
      expect(moving).toHaveLength(0);
    });
  }

  it('a stalled axis WITHHOLDS the summary tail and emits an OWED-ACTION line', () => {
    const v = verdict({ fleet_health: { state: STATE.STALLED } });
    const { lines, owedActions } = composeDriveStateReport({ verdict: v, now: NOW });
    const joined = lines.join('\n');
    expect(owedActions).toHaveLength(1);
    expect(joined).toContain('OWED-ACTION');
    expect(joined).toContain('fleet_health');
    expect(joined).toContain(OWED_ACTS.fleet_health);
    // The summary tail is the closest thing to an all-green line this subsystem has; while an
    // action is owed it must be absent, not merely annotated.
    expect(joined).not.toContain('  axes=');
  });

  it('with nothing owed and a fresh basis, output is BYTE-IDENTICAL to renderDriveState', () => {
    const v = verdict();
    const { lines, owedActions } = composeDriveStateReport({ verdict: v, now: NOW });
    expect(owedActions).toHaveLength(0);
    expect(lines).toEqual(renderDriveState(v));
  });
});

describe('FR-2 / AC-2 — the cry-wolf guard: idle is not stalled', () => {
  for (const axis of STALL_CAPABLE) {
    it(`${axis}: a legitimately-idle axis (UNMEASURABLE, e.g. zero pending) derives nothing — while genuinely stalled still derives`, () => {
      const idle = deriveOwedActions({ verdict: verdict({ [axis]: { state: STATE.UNMEASURABLE, reason: 'idle_population' } }) });
      expect(idle).toHaveLength(0);
      // Two-sided in the same test: the same axis genuinely stalled DOES owe.
      const stalled = deriveOwedActions({ verdict: verdict({ [axis]: { state: STATE.STALLED } }) });
      expect(stalled).toHaveLength(1);
    });
  }

  it('the pinned axes structurally cannot owe — the meta-control claims 4 axes, never 6', () => {
    // roadmap_motion and learning_conversion classify() are constants that ignore their input;
    // this pins that the act set covers them anyway (future unpinning cannot make derivation
    // throw) while today they can never appear in an owed list.
    expect(Object.keys(OWED_ACTS).sort()).toEqual([...AXES].sort());
    const roadmap = require_('../../../lib/governance/drive-state/axes/roadmap-motion.cjs');
    const learning = require_('../../../lib/governance/drive-state/axes/learning-conversion.cjs');
    expect(roadmap.classify({ anything: true }).state).toBe(STATE.UNMEASURABLE);
    expect(learning.classify({ anything: true }).state).toBe(STATE.UNMEASURABLE);
  });
});

describe('FR-1 AC-4 / TS-8 — action_taken is never a silencer', () => {
  it('UNVERIFIABLE on a STALLED axis still derives (it is the shipped value on 3 of 6 axis paths)', () => {
    const out = deriveOwedActions({
      verdict: verdict({ coordinator_performance: { state: STATE.STALLED, action_taken: ACTION.UNVERIFIABLE } }),
    });
    expect(out).toHaveLength(1);
    expect(out[0].axis).toBe('coordinator_performance');
  });

  it('RECORDED on a STALLED axis still derives — an action noted is not an axis moving', () => {
    const out = deriveOwedActions({
      verdict: verdict({ chairman_decisions: { state: STATE.STALLED, action_taken: ACTION.RECORDED, action_citation: 'existing artifact' } }),
    });
    expect(out).toHaveLength(1);
  });

  it('UNVERIFIABLE on a CLEAR axis derives nothing (two-sided)', () => {
    const out = deriveOwedActions({
      verdict: verdict({ coordinator_performance: { state: STATE.CLEAR, action_taken: ACTION.UNVERIFIABLE } }),
    });
    expect(out).toHaveLength(0);
  });
});

describe('FR-4 ground truth / TS-4 — the basis is the probe-state chain, never a status string', () => {
  it('a lagging status-string field claiming a stall does NOT force while the probe says CLEAR — and the inverse flips', () => {
    // The measured hazard (2026-08-08): planBreach read a lagging remainder_state and over-reported
    // an 18-item stall that was actually zero. The derivation layer's enforceable half of FR-4 is
    // that it reads ONLY entry.state (produced by probes measuring real motion) — any status-ish
    // string riding on the entry must be inert in both directions.
    const laggingSaysStalled = verdict({ venture_stage_motion: { state: STATE.CLEAR, remainder_state: 'stalled', status: 'stalled' } });
    expect(deriveOwedActions({ verdict: laggingSaysStalled })).toHaveLength(0);

    const laggingSaysActive = verdict({ venture_stage_motion: { state: STATE.STALLED, remainder_state: 'active', status: 'completed' } });
    const out = deriveOwedActions({ verdict: laggingSaysActive });
    expect(out).toHaveLength(1);
    expect(out[0].axis).toBe('venture_stage_motion');
  });

  it('since comes from the persisted span (recorded_at ground truth) when spans are supplied', () => {
    const spans = [{ axis: 'fleet_health', since: '2026-08-09T01:00:00.000Z', runs: 35, truncated: false }];
    const out = deriveOwedActions({ verdict: verdict({ fleet_health: { state: STATE.STALLED } }), spans });
    expect(out[0].since).toBe('2026-08-09T01:00:00.000Z');
    expect(out[0].runs).toBe(35);
    // And with spans withheld (the board's no-store rule) it falls back to this verdict's clock.
    const noSpans = deriveOwedActions({ verdict: verdict({ fleet_health: { state: STATE.STALLED } }) });
    expect(noSpans[0].since).toBe(MEASURED_AT);
  });
});

describe('FR-5 — the meta-control fails loud and re-derives', () => {
  it('TS-3 planted miss: stalled axis with no read-back emission THROWS naming the axis', () => {
    const v = verdict({ fleet_health: { state: STATE.STALLED } });
    let threw = null;
    try { assertForcingRan({ verdict: v, emittedReadback: [] }); } catch (e) { threw = e; }
    expect(threw, 'the planted miss MUST throw — silent green here is the defect itself').not.toBeNull();
    expect(threw.code).toBe('DRIVE_STATE_FORCING_MISS');
    // The axis travels IN THE MESSAGE: both production catches stringify, so the message string is
    // the only channel that survives.
    expect(threw.message).toContain('fleet_health');
  });

  it('green path: every stalled axis read back → returns the honest count, no throw', () => {
    const v = verdict({ fleet_health: { state: STATE.STALLED }, chairman_decisions: { state: STATE.STALLED } });
    const readback = [
      { id: 1, payload: { owed_axis: 'fleet_health' } },
      { id: 2, payload: { owed_axis: 'chairman_decisions' } },
    ];
    expect(assertForcingRan({ verdict: v, emittedReadback: readback })).toEqual({ checked: 2 });
  });

  it('nothing stalled → nothing to assert, checked=0 (the control is two-sided too)', () => {
    expect(assertForcingRan({ verdict: verdict(), emittedReadback: [] })).toEqual({ checked: 0 });
  });

  it('TS-9 cached-list divergence: the assert re-derives from the VERDICT — a cached list cannot vouch', () => {
    // The verdict says fleet_health is stalled. A stale cached owed list (computed when it was
    // CLEAR) says nothing is owed, and the readback agrees with the cache. An implementation that
    // trusted any cached/supplied list would pass; re-derivation catches the miss.
    const v = verdict({ fleet_health: { state: STATE.STALLED } });
    const readbackAgreeingWithStaleCache = []; // the cache said "nothing owed", so nothing was emitted
    expect(() => assertForcingRan({ verdict: v, emittedReadback: readbackAgreeingWithStaleCache }))
      .toThrow(/DRIVE_STATE_FORCING_MISS[\s\S]*fleet_health/);
  });
});

describe('FR-6 — stale-basis guard (reachable: prior-newest is measured BEFORE this tick persists)', () => {
  it('TS-6 two-sided: a >2h-old prior-newest emits STALE-BASIS and withholds the tail; fresh emits neither', () => {
    const v = verdict();
    const stale = composeDriveStateReport({
      verdict: v, priorNewestRecordedAt: '2026-08-10T08:00:00.000Z', now: NOW, // 4h gap
    });
    const staleJoined = stale.lines.join('\n');
    expect(stale.staleBasis).toBe(true);
    expect(staleJoined).toContain('STALE-BASIS');
    expect(staleJoined).toContain('NOT an all-clear');
    expect(staleJoined).not.toContain('  axes=');

    const fresh = composeDriveStateReport({
      verdict: v, priorNewestRecordedAt: '2026-08-10T11:00:00.000Z', now: NOW, // 1h gap
    });
    expect(fresh.staleBasis).toBe(false);
    expect(fresh.lines).toEqual(renderDriveState(v));
  });

  it('no prior history at all (first-ever run) is NOT stale — there is nothing to be stale about', () => {
    const out = composeDriveStateReport({ verdict: verdict(), priorNewestRecordedAt: null, now: NOW });
    expect(out.staleBasis).toBe(false);
  });

  it('basisStaleness measures the gap it claims', () => {
    expect(basisStaleness({ priorNewestRecordedAt: '2026-08-10T09:59:00.000Z', now: NOW }).stale).toBe(true);
    expect(basisStaleness({ priorNewestRecordedAt: '2026-08-10T10:01:00.000Z', now: NOW }).stale).toBe(false);
  });
});

describe('FR-6 / TS-7 — truncation honesty on span run-counts', () => {
  it('a truncated span renders runs>=N; an exact span renders runs=N', () => {
    const v = verdict({ fleet_health: { state: STATE.STALLED } });
    const truncated = composeDriveStateReport({
      verdict: v, spans: [{ axis: 'fleet_health', since: '2026-07-27T00:00:00.000Z', runs: 333, truncated: true }], now: NOW,
    });
    expect(truncated.lines.join('\n')).toContain('runs>=333');

    const exact = composeDriveStateReport({
      verdict: v, spans: [{ axis: 'fleet_health', since: '2026-08-09T00:00:00.000Z', runs: 27, truncated: false }], now: NOW,
    });
    expect(exact.lines.join('\n')).toContain('runs=27');
  });
});

/**
 * STATEFUL lane fake — select returns what insert wrote. The unit project loads no .env and the
 * db project is disabled, so a non-stateful fake here would make every readback assertion a
 * self-fed tautology: the evidence MUST come out of the same store the write went into.
 */
function statefulLane({ failInsert = null } = {}) {
  const rows = [];
  const jsonPath = (col) => (col.startsWith('payload->>') ? col.slice('payload->>'.length) : null);
  const valueOf = (row, col) => {
    const key = jsonPath(col);
    if (key) return row.payload ? row.payload[key] : undefined;
    return row[col];
  };
  class Query {
    constructor() { this.filters = []; this._limit = null; }
    select() { return this; }
    eq(col, val) { this.filters.push((r) => String(valueOf(r, col)) === String(val)); return this; }
    in(col, arr) { this.filters.push((r) => arr.map(String).includes(String(valueOf(r, col)))); return this; }
    is(col, val) { if (val === null) this.filters.push((r) => valueOf(r, col) == null); return this; }
    limit(n) { this._limit = n; return this; }
    then(resolve) {
      let out = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this._limit != null) out = out.slice(0, this._limit);
      resolve({ data: out.map((r) => ({ id: r.id, payload: r.payload })), error: null });
    }
  }
  return {
    rows,
    from() {
      return {
        select: () => new Query(),
        insert: (row) => {
          if (failInsert) return Promise.resolve({ error: failInsert });
          rows.push({ id: rows.length + 1, ...row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

describe('FR-3 — emission: idempotent, payload survives, clearance is row-free', () => {
  const owed = () => deriveOwedActions({
    verdict: verdict({ fleet_health: { state: STATE.STALLED } }),
    spans: [{ axis: 'fleet_health', since: '2026-08-09T01:00:00.000Z', runs: 35, truncated: false }],
  });

  it('TS-5: two consecutive runs over the same (axis, since) span leave exactly ONE unactioned row — counted by readback', async () => {
    const lane = statefulLane();
    await emitOwedActions({ supabase: lane, owedActions: owed(), senderSession: 'test-session' });
    const second = await emitOwedActions({ supabase: lane, owedActions: owed(), senderSession: 'test-session' });
    expect(lane.rows).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it('TS-10: owed_axis/since/run_id/citation SURVIVE onto the stored row — buildActionRequiredPayload drops unknown args silently', async () => {
    const lane = statefulLane();
    const readback = await emitOwedActions({ supabase: lane, owedActions: owed(), senderSession: 'test-session' });
    expect(readback).toHaveLength(1);
    const p = readback[0].payload;
    // Asserted on the READ-BACK row, never on the insert argument.
    expect(p.owed_axis).toBe('fleet_health');
    expect(p.since).toBe('2026-08-09T01:00:00.000Z');
    expect(p.run_id).toBe(MEASURED_AT);
    expect(String(p.citation).length).toBeGreaterThan(0);
    // And the lane routing contract held: kind + action flags intact after the spread.
    expect(p.kind).toBe('adam_action_required');
    expect(p.action_kind).toBe(ACTION_KIND);
    expect(p.action_required).toBe(true);
  });

  it('TS-5 clearance: the axis leaving STALLED clears the block with the old row still unstamped', async () => {
    const lane = statefulLane();
    await emitOwedActions({ supabase: lane, owedActions: owed(), senderSession: 'test-session' });
    expect(lane.rows).toHaveLength(1);
    expect(lane.rows[0].payload.actioned_at).toBeUndefined(); // nobody acked it

    // Next tick: the axis moved. Derivation is empty, the tail is restored — clearance keyed on
    // ground-truth motion, not on any acknowledgement row (drain-descriptor prohibition).
    const recovered = verdict();
    const composed = composeDriveStateReport({ verdict: recovered, now: NOW });
    expect(composed.owedActions).toHaveLength(0);
    expect(composed.lines.join('\n')).toContain('  axes=');
    expect(assertForcingRan({ verdict: recovered, emittedReadback: [] })).toEqual({ checked: 0 });
  });

  it('a lane write failure THROWS — a swallowed emission failure is a silent forcing miss', async () => {
    const lane = statefulLane({ failInsert: { message: 'lane down' } });
    await expect(emitOwedActions({ supabase: lane, owedActions: owed(), senderSession: 'test-session' }))
      .rejects.toThrow(/lane write failed/);
  });

  it('readback with nothing owed is [] without touching the lane', async () => {
    expect(await readbackOwedActions({ supabase: statefulLane(), owedActions: [] })).toEqual([]);
  });
});

describe('verdict-store additions — truncation flag and the prior-newest reader', () => {
  /** Applying fake matching the store's query shape (order/limit then resolve). */
  function storeFake(rowsByTable) {
    return {
      from(table) {
        const rows = rowsByTable[table] || [];
        const q = {
          select: () => q, order: () => q,
          limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
        };
        return q;
      },
    };
  }
  const at = (i) => new Date(Date.UTC(2026, 7, 10, 0, i)).toISOString();
  const row = (axis, state, i) => ({ axis, state, recorded_at: at(i), run_id: `r${i}` });

  it('a span consuming every fetched row for its axis under a FULL window is truncated; a bounded span is not', async () => {
    // 4-row window, all fleet_health STALLED → the span may extend beyond the window.
    const full = await currentStallSpans({
      supabase: storeFake({ drive_state_verdicts: [3, 2, 1, 0].map((i) => row('fleet_health', 'STALLED', i)) }),
      limit: 4,
    });
    expect(full).toEqual([{ axis: 'fleet_health', since: at(0), runs: 4, truncated: true }]);

    // Same window but the span ends at a CLEAR inside it → exact, not truncated.
    const bounded = await currentStallSpans({
      supabase: storeFake({
        drive_state_verdicts: [row('fleet_health', 'STALLED', 3), row('fleet_health', 'STALLED', 2), row('fleet_health', 'CLEAR', 1), row('fleet_health', 'STALLED', 0)],
      }),
      limit: 4,
    });
    expect(bounded).toEqual([{ axis: 'fleet_health', since: at(2), runs: 2, truncated: false }]);
  });

  it('an UNDER-FULL fetch is never truncated — the whole history was seen', async () => {
    const out = await currentStallSpans({
      supabase: storeFake({ drive_state_verdicts: [1, 0].map((i) => row('fleet_health', 'STALLED', i)) }),
      limit: 2000,
    });
    expect(out[0].truncated).toBe(false);
  });

  it('newestRecordedAt returns the newest row time, and null on an empty history', async () => {
    const newest = await newestRecordedAt({
      supabase: storeFake({ drive_state_verdicts: [{ recorded_at: at(9) }] }),
    });
    expect(newest).toBe(at(9));
    expect(await newestRecordedAt({ supabase: storeFake({}) })).toBeNull();
  });
});
