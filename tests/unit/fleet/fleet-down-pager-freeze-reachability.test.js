/**
 * SD-LEO-INFRA-FLEET-DOWN-PAGER-001 — the fleet-down pager must be REACHABLE by a frozen fleet.
 *
 * THE DEFECT: fleet-down-alert.mjs:120 pages only when N consecutive fleet_worker_pulse rows carry
 * active_count===0. That count came from liveFleetWorkers(), which tested heartbeat freshness alone.
 * heartbeat_at is stamped by a SEPARATE daemon (session-tick.cjs:342), so it stays fresh on a wedged
 * seat — active_count could only reach 0 by sessions VANISHING, never by them FREEZING. The one
 * predicate that escalates to a human was unreachable by the most likely form of total failure.
 *
 * WHY THE EXISTING SUITE COULD NOT CATCH IT, which dictates the shape of this file:
 * tests/unit/fleet-down-alert.test.js:8 builds pulses from bare active_count values and never
 * touches a session row. It is green, correct, and structurally incapable of noticing that the
 * number feeding it had gone blind. So this file drives the WHOLE chain — session rows ->
 * PULSE SELECT PROJECTION -> liveFleetWorkers -> active_count -> evaluateFleetDownAlert — and
 * projects every fixture through the pulse's REAL exported column list. A fixture that carries a
 * column the shipped query does not select would otherwise prove nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  liveFleetWorkers, isFleetWorker, isKnownWedged,
  FREEZE_CUT_MINUTES, FREEZE_TERM_COLUMNS
} from '../../../lib/fleet/genuine-worker.mjs';
import { PULSE_SESSION_COLUMNS, fetchPulseSessions } from '../../../scripts/fleet-worker-pulse.mjs';
import { evaluateFleetDownAlert } from '../../../scripts/fleet-down-alert.mjs';

const ME = 'coord-1';
const NOW = Date.parse('2026-08-03T04:00:00.000Z');
/** Read the liveness window from the shipped default rather than retyping 900000. */
const WINDOW_MS = 900000;
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();

/**
 * A FULL session row — every column the table has that we care about. Fixtures are built full and
 * then PROJECTED, never hand-trimmed, so the projection is what decides what the predicate sees.
 */
const fullRow = (over = {}) => ({
  session_id: 'w1',
  status: 'active',
  metadata: {},
  sd_key: 'SD-X-001',
  claimed_at: null,
  worktree_path: null,
  continuous_sds_completed: 0,
  heartbeat_at: minsAgo(0),        // FRESH — see the closing assertion in assertOnlyFreezeExcluded
  last_tool_at: minsAgo(0),
  loop_state: 'awaiting_tick',
  ...over
});

/** A wedged seat: mid-iteration (loop_state=active) and tool-silent well past the cut. */
const frozenSeat = (id) => fullRow({
  session_id: id, loop_state: 'active', last_tool_at: minsAgo(FREEZE_CUT_MINUTES + 180)
});
/** A seat legitimately parked between iterations on a long wakeup — silent, but ALIVE. */
const parkedSeat = (id) => fullRow({
  session_id: id, loop_state: 'awaiting_tick', last_tool_at: minsAgo(FREEZE_CUT_MINUTES + 180)
});
/** A seat actively working. */
const workingSeat = (id) => fullRow({ session_id: id, loop_state: 'active', last_tool_at: minsAgo(0) });

/**
 * THE PROJECTION. A fake whose select(cols) APPLIES the column list by filtering keys, rather than
 * merely recording it — the same discipline already enforced at stuck-seat-predicate.test.js:220-236
 * and drive-state-axes.test.js:113-127. A recording-only fake would let a fixture keep a column the
 * shipped query never asked for, which is exactly how this class of test lies.
 */
const project = (rows, columns) => {
  const keep = columns.split(',').map((c) => c.trim());
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => keep.includes(k))));
};

/** A supabase double that honours the real query chain and applies the projection. */
const fakeDb = (rows) => ({
  from: () => ({
    select: (columns) => ({
      order: () => ({
        limit: () => Promise.resolve({ data: project(rows, columns), error: null })
      })
    })
  })
});

/** active_count exactly as the pulse computes it, through the shipped SELECT. */
const activeCountVia = async (rows) => {
  const sess = await fetchPulseSessions(fakeDb(rows));
  return liveFleetWorkers(sess, ME, NOW).length;
};

/** The pager's own verdict, given a sustained run of this active_count. */
const pagesOn = (active) => evaluateFleetDownAlert({
  // newest-first: three at the measured count, then a prior pulse that was UP so the
  // edge-trigger dedup at fleet-down-alert.mjs:126 does not suppress the first alert.
  pulses: [{ active_count: active }, { active_count: active }, { active_count: active }, { active_count: 4 }],
  claimableCount: 12,
  requiredConsecutive: 3
}).alert;

/**
 * CLOSES THE STALE-HEARTBEAT TRAP (PRD FR-3 / TESTING finding D). If a frozen fixture were given a
 * STALE heartbeat, the OLD predicate would already exclude it and this whole file would pass without
 * the new code ever running. "Set a fresh heartbeat" is a fixture property nothing detects an edit
 * to — this asserts it with SHIPPED symbols instead. isFleetWorker is unchanged by this SD, so
 * genuine + in-window + excluded is a closed proof that ONLY the freeze term could have removed it.
 */
const assertOnlyFreezeExcluded = (rows) => {
  for (const r of rows) {
    expect(isFleetWorker(r, ME), `${r.session_id} must be a genuine worker`).toBe(true);
    expect(NOW - Date.parse(r.heartbeat_at), `${r.session_id} heartbeat must be FRESH`).toBeLessThan(WINDOW_MS);
  }
};

describe('FR-3 acceptance: a fully-frozen fleet PAGES', () => {
  it('TS-1: all seats frozen -> active_count===0 -> the pager fires', async () => {
    const fleet = [frozenSeat('a'), frozenSeat('b'), frozenSeat('c'), frozenSeat('d')];
    assertOnlyFreezeExcluded(fleet);

    const active = await activeCountVia(fleet);
    expect(active).toBe(0);
    expect(pagesOn(active)).toBe(true);
  });

  it('TS-1b: the frozen seats are excluded ONLY by the freeze term, not by heartbeat staleness', async () => {
    const fleet = [frozenSeat('a'), frozenSeat('b')];
    // Every seat is genuine and heartbeat-fresh...
    assertOnlyFreezeExcluded(fleet);
    // ...and each is individually judged wedged.
    for (const r of fleet) expect(isKnownWedged(r, NOW)).toBe(true);
    // ...so the empty live set can only be the new term's doing.
    expect(liveFleetWorkers(fleet, ME, NOW)).toHaveLength(0);
  });
});

describe('TS-2 falsification: the freeze term is load-bearing', () => {
  it('ARM 1: same fixture, ONLY last_tool_at moved back across the cut -> no page', async () => {
    const frozen = frozenSeat('a');
    const recovered = structuredClone(frozen);
    recovered.last_tool_at = minsAgo(1);

    // The two rows differ in exactly one key — so the arms cannot decay into two
    // independently-authored fixtures that differ in ways nobody is tracking.
    const diffs = Object.keys(frozen).filter((k) => JSON.stringify(frozen[k]) !== JSON.stringify(recovered[k]));
    expect(diffs).toEqual(['last_tool_at']);

    expect(await activeCountVia([frozen])).toBe(0);
    const active = await activeCountVia([recovered]);
    expect(active).toBe(1);
    expect(pagesOn(active)).toBe(false);
  });

  it('ARM 2: same fixture, ONLY loop_state active->awaiting_tick -> no page', async () => {
    const frozen = frozenSeat('a');
    const parked = structuredClone(frozen);
    parked.loop_state = 'awaiting_tick';

    const diffs = Object.keys(frozen).filter((k) => JSON.stringify(frozen[k]) !== JSON.stringify(parked[k]));
    expect(diffs).toEqual(['loop_state']);

    const active = await activeCountVia([parked]);
    expect(active).toBe(1);
    expect(pagesOn(active)).toBe(false);
  });

  it('ARM 3: the SAME fixture projected through the PRE-FR-2 column list does NOT page', async () => {
    // This is the historical defect reproduced exactly: the classifier is correct, the fixture is
    // genuinely frozen, and the query simply never fetched the column. It is the only arm that
    // proves the SELECT WIDENING — not just the predicate — is load-bearing.
    const PRE_WIDENING_COLUMNS =
      'session_id,heartbeat_at,sd_key,status,claimed_at,worktree_path,continuous_sds_completed,metadata';
    expect(PRE_WIDENING_COLUMNS).not.toBe(PULSE_SESSION_COLUMNS);

    const fleet = [frozenSeat('a'), frozenSeat('b'), frozenSeat('c')];
    const blind = project(fleet, PRE_WIDENING_COLUMNS);
    const active = liveFleetWorkers(blind, ME, NOW).length;

    expect(active).toBe(3);            // every frozen seat counted as alive
    expect(pagesOn(active)).toBe(false); // ...so nobody is paged. This was production.
  });
});

describe('FR-3a: a legitimately PARKED fleet does NOT page', () => {
  it('TS-3: all seats awaiting_tick and tool-silent past the cut -> still alive, no page', async () => {
    const fleet = [parkedSeat('a'), parkedSeat('b'), parkedSeat('c')];
    const active = await activeCountVia(fleet);
    expect(active).toBe(3);
    expect(pagesOn(active)).toBe(false);
  });

  it('TS-7: mixed fleet counts only the non-frozen seats', async () => {
    const fleet = [
      frozenSeat('f1'), frozenSeat('f2'),
      parkedSeat('p1'), parkedSeat('p2'),
      workingSeat('w1')
    ];
    expect(await activeCountVia(fleet)).toBe(3);
  });
});

describe('FR-1a: an absent tool clock FAILS OPEN', () => {
  // Three DISTINCT cases reaching UNKNOWN via three different typeof branches
  // (stuck-seat-predicate.cjs:116-119). Separate it() blocks deliberately: a shared body cannot
  // catch a guard that special-cases one shape.
  it('last_tool_at === null -> seat stays live', () => {
    const r = fullRow({ loop_state: 'active', last_tool_at: null });
    expect(isKnownWedged(r, NOW)).toBe(false);
    expect(liveFleetWorkers([r], ME, NOW)).toHaveLength(1);
  });

  it('last_tool_at unparseable -> seat stays live', () => {
    const r = fullRow({ loop_state: 'active', last_tool_at: 'not-a-timestamp' });
    expect(isKnownWedged(r, NOW)).toBe(false);
    expect(liveFleetWorkers([r], ME, NOW)).toHaveLength(1);
  });

  it('last_tool_at KEY MISSING ENTIRELY -> seat stays live (the case that occurs in production)', () => {
    // Built by delete, not by `last_tool_at: undefined` — the absent-key shape is what every
    // non-widened caller actually produces, and it is the case an author forgets rather than writes.
    const r = fullRow({ loop_state: 'active' });
    delete r.last_tool_at;
    expect('last_tool_at' in r).toBe(false);
    expect(isKnownWedged(r, NOW)).toBe(false);
    expect(liveFleetWorkers([r], ME, NOW)).toHaveLength(1);
  });

  it('loop_state null or absent -> seat stays live (nullable in production)', () => {
    const nullState = fullRow({ loop_state: null, last_tool_at: minsAgo(FREEZE_CUT_MINUTES + 180) });
    expect(isKnownWedged(nullState, NOW)).toBe(false);

    const noState = fullRow({ last_tool_at: minsAgo(FREEZE_CUT_MINUTES + 180) });
    delete noState.loop_state;
    expect(isKnownWedged(noState, NOW)).toBe(false);
    expect(liveFleetWorkers([nullState, noState], ME, NOW)).toHaveLength(2);
  });

  it('a THROW inside the verdict leaves the seat live and does not escape liveFleetWorkers', () => {
    // Fail-CLOSED-by-crash would take out all nine callers, in a pager that runs unattended in
    // GitHub Actions. A getter that throws simulates the CJS-interop failure mode of TR-3.
    const r = fullRow({ loop_state: 'active' });
    Object.defineProperty(r, 'last_tool_at', { get() { throw new Error('interop exploded'); } });
    expect(() => isKnownWedged(r, NOW)).not.toThrow();
    expect(isKnownWedged(r, NOW)).toBe(false);
    expect(() => liveFleetWorkers([r], ME, NOW)).not.toThrow();
  });
});

describe('TS-5: the term is not decorative', () => {
  it('one row, only last_tool_at mutated across the cut, flips the verdict', () => {
    const base = fullRow({ loop_state: 'active' });
    const justInside = { ...base, last_tool_at: minsAgo(FREEZE_CUT_MINUTES - 1) };
    const justOutside = { ...base, last_tool_at: minsAgo(FREEZE_CUT_MINUTES + 1) };
    expect(liveFleetWorkers([justInside], ME, NOW)).toHaveLength(1);
    expect(liveFleetWorkers([justOutside], ME, NOW)).toHaveLength(0);
  });
});

describe('TS-10 regression: the heartbeat window still applies', () => {
  it('a stale heartbeat still excludes, exactly as before the freeze term', () => {
    const stale = fullRow({ heartbeat_at: minsAgo(60) }); // well past the 15-min window
    expect(liveFleetWorkers([stale], ME, NOW)).toHaveLength(0);
  });
});

describe('TS-6 wiring: the shipped SELECT actually fetches what the predicate reads', () => {
  // Tested independently of any verdict — "a correct classifier fed a wrongly-fetched field reports
  // CLEAR forever" (drive-state-axes.test.js:95-127).
  it('PULSE_SESSION_COLUMNS contains last_tool_at and loop_state', () => {
    const cols = PULSE_SESSION_COLUMNS.split(',').map((c) => c.trim());
    expect(cols).toContain('last_tool_at');
    expect(cols).toContain('loop_state');
  });

  it('the pulse select list covers every column the freeze term reads', () => {
    const cols = PULSE_SESSION_COLUMNS.split(',').map((c) => c.trim());
    for (const c of FREEZE_TERM_COLUMNS) expect(cols).toContain(c);
  });

  it('importing the pulse module performs no I/O (main is CLI-guarded)', () => {
    // If main() ran on import this suite would have hit the live DB and inserted a pulse row.
    expect(typeof fetchPulseSessions).toBe('function');
    expect(typeof PULSE_SESSION_COLUMNS).toBe('string');
  });
});

describe('TS-11: the two select(*) callers', () => {
  // adam-coordinator-health.mjs:65 and coordinator-idle-qf-hint.mjs:249 both select('*'), so
  // production WILL feed them the new columns and their counts WILL move. RECORDED RESIDUAL: their
  // own suites cannot prove this — adam-coordinator-health.test.js:36 uses a fake that discards the
  // column list, and coordinator-idle-qf-hint.mjs has no test file at all. This pins the predicate's
  // behaviour on the full-column row shape those callers actually receive.
  it('a full-column row (the select(*) shape) is judged on tool advancement', async () => {
    const frozen = frozenSeat('star');
    expect(Object.keys(frozen)).toEqual(expect.arrayContaining([...FREEZE_TERM_COLUMNS]));
    expect(liveFleetWorkers([frozen], ME, NOW)).toHaveLength(0);
    expect(liveFleetWorkers([workingSeat('star2')], ME, NOW)).toHaveLength(1);
  });
});

describe('TS-12: ACCEPTED RESIDUAL — a fleet latched in awaiting_tick still cannot page', () => {
  it('documents, rather than fixes, the remaining blind spot', async () => {
    // post-tool-loop-state.cjs:96-97 records awaiting_tick as a ONE-WAY LATCH that nothing clears on
    // resume, and :87-92 records ten seats parked 4-17h while all looking healthy. Such a fleet is
    // indistinguishable here from a healthy parked one, so it counts alive and does NOT page.
    // classifySeat already computes wake.state='armed_overdue' (stuck-seat-predicate.cjs:73-75) and
    // isKnownWedged discards it — that is the natural follow-on, deliberately out of scope for this
    // SD. This test exists so the gap is pinned and visible, not so it passes.
    const latched = [parkedSeat('l1'), parkedSeat('l2')].map((r) => ({ ...r, last_tool_at: minsAgo(17 * 60) }));
    const active = await activeCountVia(latched);
    expect(active).toBe(2);
    expect(pagesOn(active)).toBe(false);
  });
});
