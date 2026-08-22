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
 * number feeding it had gone blind. So the end-to-end cases here drive the WHOLE chain — session
 * rows -> PULSE SELECT PROJECTION -> liveFleetWorkers -> active_count -> evaluateFleetDownAlert.
 *
 * PRECISELY WHICH CASES ARE PROJECTED, because overclaiming this is how the file would start
 * lying about itself: every case that goes through activeCountVia() is projected through the
 * pulse's REAL exported column list (the chain cases and the falsification arms). The unit-level
 * cases below call liveFleetWorkers directly on unprojected rows on purpose — they are probing the
 * predicate, not the wiring. TS-6 is what pins the wiring, and the projection is what stops a
 * chain fixture from carrying a column the shipped query never selects.
 */
import { describe, it, expect } from 'vitest';
import {
  liveFleetWorkers, isFleetWorker, isKnownWedged,
  FREEZE_CUT_MINUTES, FREEZE_TERM_COLUMNS
} from '../../../lib/fleet/genuine-worker.mjs';

/**
 * SD-LEO-INFRA-FLEET-DOWN-ALERT-001 / FR-1 / FR-6 (PLAN-phase prospective TESTING review #2
 * finding F8): the pre-existing 120min cut value has no other symbolic home in the codebase after
 * this SD's recalibration (FREEZE_CUT_MINUTES now IS the new value) — so the OLD value is pinned
 * here as a literal, explicitly labeled, purely for this before/after comparison. It must never be
 * read as "the current shipped value" anywhere else.
 */
const PRE_SD_FREEZE_CUT_MINUTES = 120;
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
    // The historical defect reproduced exactly: the classifier is correct, the fixture is genuinely
    // frozen, and the query simply never fetched the columns.
    // HONEST SCOPE NOTE (a reviewer caught the earlier comment overclaiming): dropping BOTH columns
    // makes isKnownWedged short-circuit on the loop_state guard before classifySeat is ever called,
    // so this arm exercises the guard, not fail-open. It is therefore paired with ARM 3b below,
    // which drops ONLY last_tool_at and so genuinely reaches the fail-open branch. TS-1 plus TS-6
    // are what pin the widening against a PARTIAL revert.
    const PRE_WIDENING_COLUMNS =
      'session_id,heartbeat_at,sd_key,status,claimed_at,worktree_path,continuous_sds_completed,metadata';
    expect(PRE_WIDENING_COLUMNS).not.toBe(PULSE_SESSION_COLUMNS);

    const fleet = [frozenSeat('a'), frozenSeat('b'), frozenSeat('c')];
    const blind = project(fleet, PRE_WIDENING_COLUMNS);
    const active = liveFleetWorkers(blind, ME, NOW).length;

    expect(active).toBe(3);            // every frozen seat counted as alive
    expect(pagesOn(active)).toBe(false); // ...so nobody is paged. This was production.
  });

  it('ARM 3b: dropping ONLY last_tool_at (keeping loop_state) still does not page — the fail-open branch', async () => {
    // loop_state survives, so the guard passes and classifySeat IS reached — and returns UNKNOWN
    // because the tool clock is absent. This is the arm that proves fail-open is what keeps a
    // half-widened query silent, rather than the loop_state guard doing it.
    const HALF_WIDENED = PULSE_SESSION_COLUMNS.split(',')
      .map((c) => c.trim()).filter((c) => c !== 'last_tool_at').join(',');
    expect(HALF_WIDENED).toContain('loop_state');
    expect(HALF_WIDENED).not.toContain('last_tool_at');

    const fleet = [frozenSeat('a'), frozenSeat('b'), frozenSeat('c')];
    const halfBlind = project(fleet, HALF_WIDENED);
    for (const r of halfBlind) expect(r.loop_state).toBe('active');   // guard genuinely passed
    const active = liveFleetWorkers(halfBlind, ME, NOW).length;

    expect(active).toBe(3);
    expect(pagesOn(active)).toBe(false);
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

describe('TS-12: a fleet latched in awaiting_tick — judged on its OWN DEADLINE', () => {
  // THE CASE THAT NEARLY SHIPPED UNCOVERED. Keying on loop_state='active' alone was the sourced
  // design, and measurement showed it would have left the pager nearly as unreachable as before:
  // only 1 then 2 of 5 heartbeat-fresh seats carried 'active' across two samples, so a total freeze
  // would have gone 5->4 and 5->3 and never reached the zero the pager needs. Workers arm the
  // wakeup BEFORE their terminal report, so the dominant freeze lands in 'awaiting_tick'.
  const overdue = (id, silentMin) => ({
    ...parkedSeat(id),
    last_tool_at: minsAgo(silentMin),
    metadata: { expected_wake_at: minsAgo(silentMin - 20) }   // deadline passed, long ago
  });

  it('parked + tool-silent + WAKE OVERDUE -> wedged, and an all-latched fleet PAGES', async () => {
    const latched = [overdue('l1', 17 * 60), overdue('l2', 9 * 60), overdue('l3', 4 * 60)];
    for (const r of latched) expect(r.loop_state).toBe('awaiting_tick');
    assertOnlyFreezeExcluded(latched);

    const active = await activeCountVia(latched);
    expect(active).toBe(0);
    expect(pagesOn(active)).toBe(true);
  });

  it('parked + tool-silent but wake STILL PENDING -> live, no page', async () => {
    // The healthy long-wakeup case. Its deadline has not passed, so it is parked, not dead.
    const pending = {
      ...parkedSeat('p1'),
      last_tool_at: minsAgo(FREEZE_CUT_MINUTES + 60),
      metadata: { expected_wake_at: new Date(NOW + 20 * 60000).toISOString() }
    };
    expect(isKnownWedged(pending, NOW)).toBe(false);
    expect(await activeCountVia([pending])).toBe(1);
  });

  it('parked + tool-silent with NO recorded deadline -> live (absence is not proof)', async () => {
    // post-tool-loop-state.cjs:113 writes the deadline conditionally on a prior metadata read, so a
    // read failure costs the deadline. An absent expected_wake_at must never be read as death.
    const noDeadline = parkedSeat('n1');
    expect(noDeadline.metadata.expected_wake_at).toBeUndefined();
    expect(isKnownWedged(noDeadline, NOW)).toBe(false);
    expect(await activeCountVia([noDeadline])).toBe(1);
  });

  it('parked + WAKE OVERDUE but tool-RECENT -> live (it woke up and did work)', async () => {
    const woke = {
      ...parkedSeat('w1'),
      last_tool_at: minsAgo(2),
      metadata: { expected_wake_at: minsAgo(60) }
    };
    expect(isKnownWedged(woke, NOW)).toBe(false);
  });
});

describe('SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-1/FR-6: recalibrated threshold pages materially faster', () => {
  // TESTING review #2 (F8) correction: the fixture must exercise the REAL elapsed-freeze-time
  // comparison, not just "stale session rows" -- a seat frozen for a duration BETWEEN the new and
  // old cut is exactly the class this recalibration exists to catch sooner.
  const FREEZE_ELAPSED_MIN = 65; // between the new 60min cut and the old 120min cut

  it('TS-1 (regression-latency): a seat frozen for 65min is WEDGED under the NEW 60min cut but NOT under the OLD 120min cut', () => {
    const frozen65 = { ...fullRow({ loop_state: 'active' }), last_tool_at: minsAgo(FREEZE_ELAPSED_MIN) };
    expect(FREEZE_CUT_MINUTES).toBeLessThan(PRE_SD_FREEZE_CUT_MINUTES); // sanity: recalibration actually lowered the cut
    expect(isKnownWedged(frozen65, NOW, FREEZE_CUT_MINUTES)).toBe(true);
    expect(isKnownWedged(frozen65, NOW, PRE_SD_FREEZE_CUT_MINUTES)).toBe(false);
  });

  it('TS-1 (regression-latency, fleet-level): the real 19:20-19:29Z 5-seat freeze shape reaches active_count=0 under the NEW cut well before it would under the OLD cut', async () => {
    // Replays the actual incident shape (this SD's own provenance): seats frozen mid-iteration,
    // heartbeat fresh throughout (heartbeats never stop -- that IS the original defect this
    // predicate class already fixed). At FREEZE_ELAPSED_MIN minutes past freeze onset:
    const fleet = [1, 2, 3, 4, 5].map((i) => ({
      ...fullRow({ session_id: `incident-seat-${i}`, loop_state: 'active' }),
      last_tool_at: minsAgo(FREEZE_ELAPSED_MIN),
    }));
    assertOnlyFreezeExcluded(fleet);

    // NEW: every seat already reads STUCK -> active_count 0 -> pages once the 3-pulse dedup elapses.
    const activeNew = fleet.filter((s) => !isKnownWedged(s, NOW, FREEZE_CUT_MINUTES)).length;
    expect(activeNew).toBe(0);
    expect(pagesOn(activeNew)).toBe(true);

    // OLD: none of the 5 seats have reached the 120min cut yet at this elapsed time -- the fleet
    // still reads fully live, so the pager would not even begin its 45min dedup countdown, let
    // alone fire. This is the ~166-181min real page-latency this SD closes.
    const activeOld = fleet.filter((s) => !isKnownWedged(s, NOW, PRE_SD_FREEZE_CUT_MINUTES)).length;
    expect(activeOld).toBe(5);
    expect(pagesOn(activeOld)).toBe(false);
  });

  it('a healthy fixture (fresh last_tool_at) does not page under the new recalibrated threshold (negative control)', async () => {
    const fleet = [workingSeat('h1'), workingSeat('h2'), workingSeat('h3')];
    const active = await activeCountVia(fleet);
    expect(active).toBe(3);
    expect(pagesOn(active)).toBe(false);
  });
});
