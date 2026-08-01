/**
 * Drive-state axis adapters — SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-3 and FR-5.
 *
 * TWO KINDS OF TEST HERE, AND THE SECOND IS THE ONE THAT MATTERS MOST.
 *
 * DISCRIMINATOR tests drive classify() on constructed state. They prove the verdict logic.
 * WIRING tests drive fetch() through a fake that APPLIES its filters, and prove the classifier is
 * fed the field the adapter claims to read. A discriminator test structurally CANNOT catch a
 * mis-fetch: a perfectly correct classify() handed a wrongly-fetched field reports CLEAR forever
 * with a fully green suite. That is exactly how a blind detector passes review, and it is why the
 * fetch/classify split exists at all.
 *
 * The fake below APPLIES what it records. The predecessor double in this repo returns the same rows
 * for ANY table and records .order() without sorting, so .order(x,{ascending}).limit(1) yields
 * fixture[0] regardless of direction — a wrong-table or inverted-order mis-fetch walks straight past
 * it. If the fake cannot catch those, the fake is the defect.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STATE, ACTION } from '../../../lib/governance/drive-state/contract.cjs';
import * as fleetAxis from '../../../lib/governance/drive-state/axes/fleet-health.cjs';
import * as learnAxis from '../../../lib/governance/drive-state/axes/learning-conversion.cjs';

const NOW = Date.parse('2026-08-01T14:00:00.000Z');
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();

/** A fake that APPLIES filters and is TABLE-AWARE and ORDER-AWARE. */
function applyingFake(tables, capture = {}) {
  return {
    from(table) {
      capture.table = table;
      let rows = (tables[table] || []).slice();
      const q = {
        select: (c) => { capture.columns = c; return q; },
        in: (col, vals) => { capture.in = { col, vals }; rows = rows.filter((r) => vals.includes(r[col])); return q; },
        eq: (col, val) => { rows = rows.filter((r) => r[col] === val); return q; },
        order: (col, opts) => {
          capture.order = { col, ...opts };
          const dir = opts && opts.ascending === false ? -1 : 1;
          rows.sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : 1) * dir); // APPLIED, not recorded
          return q;
        },
        gte: (col, val) => { capture.gte = { col, val }; rows = rows.filter((r) => String(r[col] ?? '') >= String(val)); return q; },
        not: (col, op, val) => { capture.not = { col, op, val }; if (op === 'is' && val === null) rows = rows.filter((r) => r[col] != null); return q; },
        limit: async (n) => { capture.limit = n; return { data: rows.slice(0, n), error: null }; },
        // THENABLE, because the real client is. A terminal await with no .limit() — which several
        // adapters use — resolved to the query OBJECT against the old fake, so `data` came back
        // undefined and the adapter silently saw an empty population. A fake that cannot model the
        // real client's await is itself the blind spot.
        then: (res, rej) => Promise.resolve({ data: rows.slice(), error: null }).then(res, rej)
      };
      return q;
    }
  };
}

describe('AXIS 5 fleet_health — discriminator', () => {
  const base = { scanned: 10, truncated: false, unknown: 1 };

  it('STALLED when a seat is tool-silent past the cut point, naming it', () => {
    const r = fleetAxis.classify({ ...base, stuck: [{ session_id: 'ab29dc41-1111', silent: 888 }] }, NOW);
    expect(r.state).toBe(STATE.STALLED);
    expect(r.stalled).toBe(1);
    expect(r.citation).toMatch(/ab29dc41/);
    expect(r.citation).toMatch(/888m/);
  });

  it('CLEAR when none are silent — the matched control, not just the red direction', () => {
    const r = fleetAxis.classify({ ...base, stuck: [] }, NOW);
    expect(r.state).toBe(STATE.CLEAR);
    expect(r.stalled).toBe(0);
  });

  it('SCANNING ZERO SEATS IS UNMEASURABLE, NOT CLEAR', () => {
    // A population of zero means the probe could not see the fleet. Reporting CLEAR here is the
    // silent-zero the predecessor strip had to be corrected for.
    const r = fleetAxis.classify({ ...base, scanned: 0, stuck: [] }, NOW);
    expect(r.state).toBe(STATE.UNMEASURABLE);
    expect(r.reason).toBe('scanned_zero_seats');
  });

  it('an all-CLEAR citation still reports the unknown count and the cut point it used', () => {
    const r = fleetAxis.classify({ ...base, stuck: [] }, NOW);
    expect(r.citation).toMatch(/1 unknown/);
    expect(r.citation).toMatch(new RegExp(String(fleetAxis.TOOL_SILENCE_CUT_MINUTES)));
  });

  it('truncation is surfaced in the citation, never swallowed', () => {
    const r = fleetAxis.classify({ ...base, truncated: true, stuck: [] }, NOW);
    expect(r.citation).toMatch(/TRUNCATED/);
  });
});

describe('AXIS 5 fleet_health — WIRING (what a discriminator test cannot catch)', () => {
  const seats = [
    { session_id: 'aaaaaaaa-0000-0000-0000-000000000001', status: 'active', last_tool_at: minsAgo(600), metadata: {} },
    { session_id: 'bbbbbbbb-0000-0000-0000-000000000002', status: 'idle', last_tool_at: minsAgo(0), metadata: {} }
  ];

  it('reads the claude_sessions table and reaches the classifier with the seats it fetched', async () => {
    const cap = {};
    const state = await fleetAxis.fetch(applyingFake({ claude_sessions: seats }, cap), { now: NOW });
    expect(cap.table).toBe('claude_sessions');
    expect(state.scanned).toBe(2);
    expect(state.stuck.map((s) => s.session_id)).toContain(seats[0].session_id);
  });

  it('a WRONG-TABLE fetch yields an empty population — which the classifier must call UNMEASURABLE', async () => {
    // The mis-fetch class a table-blind fake cannot see. Note the axis does NOT report CLEAR here.
    const state = await fleetAxis.fetch(applyingFake({ some_other_table: seats }), { now: NOW });
    expect(state.scanned).toBe(0);
    expect(fleetAxis.classify(state, NOW).state).toBe(STATE.UNMEASURABLE);
  });

  it('the fake APPLIES .order() rather than recording it — proven by direction', async () => {
    // If .order() were merely recorded, both directions would return the same first row and this
    // assertion would pass vacuously. Driving both directions is what makes the fake trustworthy.
    const cap = {};
    const fake = applyingFake({ t: [{ k: 'b' }, { k: 'a' }, { k: 'c' }] }, cap);
    const asc = await fake.from('t').select('*').order('k', { ascending: true }).limit(1);
    const desc = await fake.from('t').select('*').order('k', { ascending: false }).limit(1);
    expect(asc.data[0].k).toBe('a');
    expect(desc.data[0].k).toBe('c');
    expect(asc.data[0].k).not.toBe(desc.data[0].k);
  });
});

describe('AXIS 6 learning_conversion — ships UNMEASURABLE, and that is the point', () => {
  it('reports UNMEASURABLE with a citation, and explicitly NOT clear', () => {
    const r = learnAxis.classify({ blocked: true }, NOW);
    expect(r.state).toBe(STATE.UNMEASURABLE);
    expect(r.state).not.toBe(STATE.CLEAR);
    expect(r.reason).toBe('conversion_gauge_structurally_untrippable');
    expect(r.citation).toMatch(/LOOPS_WITHOUT_PREVENT/);
    expect(r.citation).toMatch(/can never trip/);
    expect(r.action_taken).toBe(ACTION.UNVERIFIABLE);
  });

  it('fetches NOTHING — a recorded-lesson count is not a conversion rate', () => {
    // Querying the broken inputs would produce numbers that LOOK like measurements. Presenting a
    // filing count as a conversion rate is the confusion this axis exists to refuse.
    expect(learnAxis.classify(null, NOW).state).toBe(STATE.UNMEASURABLE);
  });

  it('the DISCRIMINATOR is implemented and capable of BOTH verdicts on constructed state', () => {
    // TS-9 is scoped to the discriminator precisely because FR-3.1 pins the ADAPTER to UNMEASURABLE.
    // Requiring the adapter to emit both directions would have forced axis 6 to report CLEAR — the
    // exact defect this SD removes, introduced in order to pass its own test.
    expect(learnAxis.classifyConversion({ recorded: 5, prevented: 5, reWitnessedAfterPrevention: 2 }).state).toBe(STATE.STALLED);
    expect(learnAxis.classifyConversion({ recorded: 5, prevented: 5, reWitnessedAfterPrevention: 0 }).state).toBe(STATE.CLEAR);
  });

  it('the discriminator refuses to guess when recurrence is unmeasured', () => {
    expect(learnAxis.classifyConversion({ recorded: 5, prevented: 5 }).state).toBe(STATE.UNMEASURABLE);
    expect(learnAxis.classifyConversion({ recorded: 0, prevented: 0, reWitnessedAfterPrevention: 0 }).state).toBe(STATE.UNMEASURABLE);
  });
});

describe('AXIS 4 venture_stage_motion — a fail-safe for an ALARM is a fail-OPEN for a drive axis', () => {
  const ventureAxis = require('../../../lib/governance/drive-state/axes/venture-stage-motion.cjs');

  it('STALLED when a venture is divergent-and-stalled past its tier clock, naming it', () => {
    const r = ventureAxis.classify({ evaluated: [
      { id: 'v1', name: 'alpha', alarm: true, reason: 'divergent-and-stalled', elapsed_days: 9, clock_days: 5 },
      { id: 'v2', name: 'beta', alarm: false, reason: 'real-build-or-not-divergent' }
    ] }, NOW);
    expect(r.state).toBe(STATE.STALLED);
    expect(r.stalled).toBe(1);
    expect(r.citation).toMatch(/alpha@9d\/5d/);
  });

  it('CLEAR when ventures are moving — the matched control', () => {
    const r = ventureAxis.classify({ evaluated: [
      { id: 'v1', alarm: false, reason: 'real-build-or-not-divergent' },
      { id: 'v2', alarm: false, reason: 'real-build-or-not-divergent' }
    ] }, NOW);
    expect(r.state).toBe(STATE.CLEAR);
    expect(r.in_motion).toBe(2);
  });

  it('THE TRANSLATION: no-stall-signal on EVERY venture is UNMEASURABLE, never CLEAR', () => {
    // evaluateRealBuildStall returns {alarm:false, reason:'no-stall-signal'} when the venture has no
    // forward-motion timestamp — a deliberate fail-safe so missing data cannot raise a false alarm.
    // Correct for an alarm; catastrophic for a drive axis, where it would report health FROM AN
    // ABSENCE. Reusing the discriminator without re-reading its null contract would have shipped an
    // axis that reads healthiest exactly when it is blindest.
    const r = ventureAxis.classify({ evaluated: [
      { id: 'v1', alarm: false, reason: ventureAxis.NO_SIGNAL_REASON },
      { id: 'v2', alarm: false, reason: ventureAxis.NO_SIGNAL_REASON }
    ] }, NOW);
    expect(r.state).toBe(STATE.UNMEASURABLE);
    expect(r.state).not.toBe(STATE.CLEAR);
    expect(r.reason).toBe('no_motion_signal_on_any_venture');
    expect(r.citation).toMatch(/not evidence of motion/);
  });

  it('a PARTIAL blind set still reports CLEAR but SAYS how many it could not see', () => {
    const r = ventureAxis.classify({ evaluated: [
      { id: 'v1', alarm: false, reason: 'real-build-or-not-divergent' },
      { id: 'v2', alarm: false, reason: ventureAxis.NO_SIGNAL_REASON }
    ] }, NOW);
    expect(r.state).toBe(STATE.CLEAR);
    expect(r.citation).toMatch(/1 with no motion signal/);
  });

  it('zero ACTIVE ventures is legitimately CLEAR — distinct from fleet-health zero seats', () => {
    // Nothing that could stall actually exists. That is different from a population query returning
    // zero against a fleet that certainly does exist, which is a blind probe.
    const r = ventureAxis.classify({ evaluated: [] }, NOW);
    expect(r.state).toBe(STATE.CLEAR);
    expect(r.citation).toMatch(/nothing to stall/);
  });

  it('the real evaluateRealBuildStall DOES fail-safe to no-stall-signal — the premise, executed', async () => {
    // The translation above is only justified if the upstream contract really behaves this way.
    // Run it rather than cite it.
    const { evaluateRealBuildStall } = await import('../../../lib/governance/real-build-stall-alarm.mjs');
    const out = evaluateRealBuildStall(
      { id: 'v', current_lifecycle_stage: 25, metadata: {} },
      { now: NOW, lastStageAdvanceAt: null }
    );
    expect(out.alarm).toBe(false);
    expect(out.reason).toBe(ventureAxis.NO_SIGNAL_REASON);
  });
});

describe('AXIS 1 chairman_decisions — blind to CRITICAL is the defect this axis exists to avoid', () => {
  const chairAxis = require('../../../lib/governance/drive-state/axes/chairman-decisions.cjs');
  const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
  const PRIORITIES = ['critical', 'high', 'normal', 'low'];

  it('FR-4.1: a CRITICAL decision aged past the threshold is STALLED', () => {
    // The acceptance criterion the axis exists for, and the one the obvious implementation fails.
    const r = chairAxis.classify({ pending: [
      { id: 'd1', title: 'ship the thing', priority: 'critical', created_at: hoursAgo(100) }
    ] }, NOW);
    expect(r.state).toBe(STATE.STALLED);
    expect(r.citation).toMatch(/critical@100h/);
  });

  it('THE FULL PRIORITY-BY-AGE MATRIX — no priority class may be structurally incapable of STALLED', () => {
    // A both-directions test written against a single `normal` seed passes while every CRITICAL
    // decision reports CLEAR forever. Driving the whole matrix is what makes the claim real.
    for (const priority of PRIORITIES) {
      const stale = chairAxis.classify({ pending: [{ id: 'x', title: 't', priority, created_at: hoursAgo(100) }] }, NOW);
      expect(stale.state, priority + ' @100h must be STALLED').toBe(STATE.STALLED);
      const fresh = chairAxis.classify({ pending: [{ id: 'x', title: 't', priority, created_at: hoursAgo(1) }] }, NOW);
      expect(fresh.state, priority + ' @1h must be CLEAR').toBe(STATE.CLEAR);
    }
  });

  it('PROVES THE UPSTREAM HOLE IS REAL — effectivePriority cannot escalate a critical row at ANY age', async () => {
    // The justification for not reusing age_escalated, executed rather than cited. rank =
    // Math.max(1, baseRank - bump) and escalated = rank < baseRank; for critical baseRank is 1, so
    // the floor absorbs the bump and the comparison is 1 < 1.
    const { effectivePriority } = await import('../../../lib/chairman/decision-queue.mjs');
    for (const h of [1, 71, 73, 100, 1000]) {
      const out = effectivePriority({ priority: 'critical', created_at: hoursAgo(h) }, new Date(NOW));
      expect(out.escalated, `critical @${h}h`).toBe(false);
    }
    // ...while a lower class DOES escalate, which is why the hole is easy to miss.
    expect(effectivePriority({ priority: 'normal', created_at: hoursAgo(100) }, new Date(NOW)).escalated).toBe(true);
  });

  it('the axis source does NOT read age_escalated or effectivePriority', () => {
    const src = readFileSync('lib/governance/drive-state/axes/chairman-decisions.cjs', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[^\S\r\n]*\/\/[^\n]*$/gm, ' ');
    expect(src).not.toContain('age_escalated');
    expect(src).not.toContain('effectivePriority');
  });

  it('the four named sub-states report UNMEASURABLE rather than being invented', () => {
    expect(chairAxis.UNMEASURABLE_SUBSTATES).toEqual(['surfaced', 'packaged', 'retried', 'resolved']);
    const r = chairAxis.classify({ pending: [{ id: 'd', title: 't', priority: 'low', created_at: hoursAgo(1) }] }, NOW);
    expect(r.citation).toMatch(/UNMEASURABLE \(no columns exist\)/);
  });

  it('unparseable timestamps on EVERY row are UNMEASURABLE, not CLEAR', () => {
    const r = chairAxis.classify({ pending: [{ id: 'd', created_at: 'nonsense' }] }, NOW);
    expect(r.state).toBe(STATE.UNMEASURABLE);
    expect(r.reason).toBe('no_parseable_created_at');
  });

  it('UNTRUSTED population: attacker-controlled titles are control-stripped and bounded', () => {
    const ESC = String.fromCharCode(27), BEL = String.fromCharCode(7);
    const r = chairAxis.classify({ pending: [
      { id: 'd', title: 'evil' + ESC + '[31m' + BEL + 'x'.repeat(500), priority: 'critical', created_at: hoursAgo(100) }
    ] }, NOW);
    expect(r.state).toBe(STATE.STALLED);
    expect(r.citation.includes(ESC), 'ESC must be stripped').toBe(false);
    expect(r.citation.includes(BEL), 'BEL must be stripped').toBe(false);
    expect(r.citation.length).toBeLessThanOrEqual(400);
  });

  it('zero pending is legitimately CLEAR', () => {
    expect(chairAxis.classify({ pending: [] }, NOW).state).toBe(STATE.CLEAR);
  });
});

describe('AXIS 3 roadmap_motion — motion is a RATE, and state however complete is not a rate', () => {
  const roadAxis = require('../../../lib/governance/drive-state/axes/roadmap-motion.cjs');
  const DAY = 86400000;
  const at = (d) => new Date(NOW - d * DAY).toISOString();

  it('ships UNMEASURABLE, with a citation carrying the measured population figures', () => {
    const r = roadAxis.classify({}, NOW);
    expect(r.state).toBe(STATE.UNMEASURABLE);
    expect(r.reason).toBe('no_per_item_commitment_clock');
    expect(r.action_taken).toBe(ACTION.UNVERIFIABLE);
    // Provenance, not adjectives: the numbers a reader can go re-measure.
    expect(r.citation).toMatch(/1864/);
    expect(r.citation).toMatch(/0\.9%/);
    expect(r.citation).toMatch(/SD-FDBK-INFRA-ROADMAP-COMMITMENT-CLOCK-001/);
  });

  it('does NOT claim storage is missing — the store exists and is named', () => {
    // The wrong artifact would have been "no table fits". Guard against regressing to it.
    expect(roadAxis.BLOCKED_CITATION).toMatch(/roadmap_baseline_snapshots exists/);
    expect(roadAxis.BLOCKED_CITATION).toMatch(/Storage is NOT the blocker/);
  });

  it('fetch() deliberately retrieves nothing rather than returning a state census', () => {
    return roadAxis.fetch(null, {}).then((s) => expect(s).toEqual({ blocked: true }));
  });

  // ===== THE DISCRIMINATOR, both directions =====

  it('STALLED when a dated commitment sits past the stall window unadvanced', () => {
    const r = roadAxis.classifyMotion({
      committed: [{ id: 'a', committedAt: at(90) }, { id: 'b', committedAt: at(2) }],
      advanced: new Set(['b']), voidedByDecision: new Set(), asOf: NOW, stallDays: 30
    });
    expect(r.state).toBe(STATE.STALLED);
    expect(r.stalled).toBe(1);
  });

  it('CLEAR when every dated commitment advanced or is inside the window', () => {
    const r = roadAxis.classifyMotion({
      committed: [{ id: 'a', committedAt: at(90) }, { id: 'b', committedAt: at(2) }],
      advanced: new Set(['a']), voidedByDecision: new Set(), asOf: NOW, stallDays: 30
    });
    expect(r.state).toBe(STATE.CLEAR);
    expect(r.stalled).toBe(0);
  });

  // ===== THE FINDING THAT KILLED THE OBVIOUS IMPLEMENTATION =====

  it('REFUSES a single-backfill date set instead of computing ages against a batch stamp', () => {
    // The live condition: 1843 of 1864 rows share one stamp written by one writer in one pass.
    // Ages computed against it are ages of the backfill, so "stalled past 14d" returns 0 BY
    // CONSTRUCTION. Reporting CLEAR here is the axis-1 escalated:false defect in a new column.
    const sameDay = at(10);
    const r = roadAxis.classifyMotion({
      committed: Array.from({ length: 50 }, (_, i) => ({ id: 'i' + i, committedAt: sameDay })),
      advanced: new Set(), voidedByDecision: new Set(), asOf: NOW, stallDays: 5
    });
    expect(r.state).toBe(STATE.UNMEASURABLE);
    expect(r.reason).toBe('commitment_dates_are_a_single_backfill');
  });

  it('...and that refusal is NOT a blanket refusal — genuine spread still classifies', () => {
    const r = roadAxis.classifyMotion({
      committed: [{ id: 'a', committedAt: at(10) }, { id: 'b', committedAt: at(40) }],
      advanced: new Set(), voidedByDecision: new Set(), asOf: NOW, stallDays: 5
    });
    expect(r.state).toBe(STATE.STALLED);
  });

  it('an item VOIDED BY DECISION is not a stall — scope discipline must not read as neglect', () => {
    // Live: 226 cancelled SDs map to remainder_state 'void', reasons naming "Chairman final cut"
    // and "All items already built in codebase". Counting those as stalls is a false alarm.
    const r = roadAxis.classifyMotion({
      committed: [{ id: 'a', committedAt: at(90) }, { id: 'b', committedAt: at(80) }],
      advanced: new Set(), voidedByDecision: new Set(['a', 'b']), asOf: NOW, stallDays: 30
    });
    expect(r.state).toBe(STATE.CLEAR);
    expect(r.stalled).toBe(0);
  });

  it('state-only input cannot yield CLEAR — undated commitments are UNMEASURABLE', () => {
    const r = roadAxis.classifyMotion({
      committed: [{ id: 'a', state: 'promotable_now' }, { id: 'b', state: 'promotable_now' }],
      advanced: new Set(), voidedByDecision: new Set(), asOf: NOW, stallDays: 30
    });
    expect(r.state).toBe(STATE.UNMEASURABLE);
    expect(r.reason).toBe('no_parseable_commitment_dates');
  });

  it('malformed input returns null rather than a verdict', () => {
    expect(roadAxis.classifyMotion(null)).toBe(null);
    expect(roadAxis.classifyMotion({ committed: [], advanced: [] })).toBe(null);
  });
});

describe('AXIS 2 coordinator_performance — the breach is measurable, the ACTION is not', () => {
  const coordAxis = require('../../../lib/governance/drive-state/axes/coordinator-performance.cjs');
  const HOURS = 3600000;
  const ago = (h) => new Date(NOW - h * HOURS).toISOString();

  it('a fresh breach reading (score 50) is STALLED', () => {
    const r = coordAxis.classify({ snapshots: [{ score: 50, at: ago(1) }] }, NOW);
    expect(r.state).toBe(STATE.STALLED);
    expect(r.stalled).toBe(1);
  });

  it('a fresh clean reading (score 100) is CLEAR — both directions', () => {
    const r = coordAxis.classify({ snapshots: [{ score: 100, at: ago(1) }] }, NOW);
    expect(r.state).toBe(STATE.CLEAR);
    expect(r.stalled).toBe(0);
  });

  // ===== THE LOAD-BEARING CONSTRAINT =====

  it('action_taken is UNVERIFIABLE on EVERY outcome — a bare self-stamp is not evidence of action', () => {
    // Measured: 82 of 82 advisories retired, 78 recording no actor, 4 naming the measured party.
    // If any path ever returns RECORDED, the axis is grading the coordinator on its own receipt.
    const paths = [
      coordAxis.classify({ snapshots: [{ score: 50, at: ago(1) }] }, NOW),
      coordAxis.classify({ snapshots: [{ score: 100, at: ago(1) }] }, NOW),
      coordAxis.classify({ snapshots: [] }, NOW),
      coordAxis.classify(null, NOW),
      coordAxis.classify({ snapshots: [{ score: 100, at: ago(1) }], probe: { status: 'no_cohort' } }, NOW)
    ];
    for (const r of paths) expect(r.action_taken).toBe(ACTION.UNVERIFIABLE);
    expect(paths.some((r) => r.action_taken === ACTION.RECORDED)).toBe(false);
  });

  it('the citation states WHY action is unverifiable, with the counts', () => {
    const r = coordAxis.classify({ snapshots: [{ score: 50, at: ago(1) }] }, NOW);
    expect(r.citation).toMatch(/82 of 82/);
    expect(r.citation).toMatch(/78 recording NO actor/);
  });

  // ===== FRESHNESS: SILENCE IS NOT HEALTH =====

  it('no reading inside the stale window is UNMEASURABLE, never CLEAR', () => {
    const r = coordAxis.classify({ snapshots: [{ score: 100, at: ago(48) }] }, NOW);
    expect(r.state).toBe(STATE.UNMEASURABLE);
    expect(r.reason).toBe('unavailable');
    expect(r.citation).toMatch(/not evidence it is well/);
  });

  it('a stale BREACH does not linger as STALLED either — staleness dominates both verdicts', () => {
    const r = coordAxis.classify({ snapshots: [{ score: 50, at: ago(48) }] }, NOW);
    expect(r.state).toBe(STATE.UNMEASURABLE);
  });

  // ===== HONEST-NULL VOCABULARY IS PROPAGATED, NOT COLLAPSED =====

  it('every honest-null probe status propagates as itself rather than becoming CLEAR', () => {
    expect(coordAxis.HONEST_NULL).toEqual(['no_cohort', 'unmeasurable_until_linkage', 'unavailable', 'unverifiable']);
    for (const status of coordAxis.HONEST_NULL) {
      // Note the snapshot says CLEAN and is FRESH — only the probe's honest-null must win.
      const r = coordAxis.classify({ snapshots: [{ score: 100, at: ago(1) }], probe: { status } }, NOW);
      expect(r.state, `${status} must not collapse to CLEAR`).toBe(STATE.UNMEASURABLE);
      expect(r.reason).toBe(status);
    }
  });

  it('a normal probe status does NOT trigger the honest-null path', () => {
    const r = coordAxis.classify({ snapshots: [{ score: 100, at: ago(1) }], probe: { status: 'measured' } }, NOW);
    expect(r.state).toBe(STATE.CLEAR);
  });

  it('unparseable timestamps count as not-fresh rather than as fresh', () => {
    const r = coordAxis.classify({ snapshots: [{ score: 100, at: 'nonsense' }] }, NOW);
    expect(r.state).toBe(STATE.UNMEASURABLE);
  });

  // ===== WIRING =====

  const DIM = 'adam_coordinator_health';

  it('reads codebase_health_snapshots — the durable sink, not the advisory lane', async () => {
    const cap = {};
    const state = await coordAxis.fetch(applyingFake({
      codebase_health_snapshots: [{ score: 50, dimension: DIM, scanned_at: ago(1) }]
    }, cap), { now: NOW });
    expect(cap.table).toBe('codebase_health_snapshots');
    expect(state.snapshots.length).toBe(1);
  });

  // REGRESSION GUARD. codebase_health_snapshots is a SHARED table. The first version of fetch()
  // omitted the dimension filter and ordered by created_at, so it read whatever writer touched the
  // table last and classified a foreign score — reporting CLEAR off someone else's row. The probe
  // emits ONLY 50 or 100, so a live 99.98 was the tell; no unit test caught it because the fake held
  // only this table. This asserts the filter, not merely the table name.
  it('EXCLUDES other writers rows — the shared table is filtered by dimension', async () => {
    const state = await coordAxis.fetch(applyingFake({
      codebase_health_snapshots: [
        { score: 99.98, dimension: 'some_other_probe', scanned_at: ago(0) },   // newer, foreign
        { score: 50, dimension: DIM, scanned_at: ago(2) }                      // older, ours
      ]
    }), { now: NOW });
    expect(state.snapshots.length, 'foreign rows must not enter the population').toBe(1);
    expect(state.snapshots[0].score).toBe(50);
    // And the verdict must follow OUR row, not the fresher foreign one.
    expect(coordAxis.classify(state, NOW).state).toBe(STATE.STALLED);
  });

  it('orders by scanned_at — the column the probe itself reads back on', async () => {
    const cap = {};
    await coordAxis.fetch(applyingFake({
      codebase_health_snapshots: [{ score: 100, dimension: DIM, scanned_at: ago(1) }]
    }, cap), { now: NOW });
    expect(cap.order.col).toBe('scanned_at');
    expect(cap.order.ascending).toBe(false);
  });

  it('a WRONG-TABLE fetch yields no snapshots — which classify must call UNMEASURABLE, not CLEAR', async () => {
    const state = await coordAxis.fetch(applyingFake({ session_coordination: [{ score: 100, at: ago(1) }] }), { now: NOW });
    expect(state.snapshots.length).toBe(0);
    expect(coordAxis.classify(state, NOW).state).toBe(STATE.UNMEASURABLE);
  });
});

describe('AXIS 4 venture_stage_motion — WIRING (the gap a discriminator test cannot see)', () => {
  const ventureAxis = require('../../../lib/governance/drive-state/axes/venture-stage-motion.cjs');

  // REGRESSION GUARD. fetch() originally returned {ventures} while classify() consumed {evaluated},
  // so the two never met and the axis reported UNMEASURABLE/'no_venture_evaluations' forever. Every
  // discriminator test passed throughout, because they construct {evaluated} directly. Only running
  // the composer against the live DB exposed it. This test closes that loop in CI.
  it('fetch() produces the key classify() consumes — not merely a well-shaped object', async () => {
    const cap = {};
    const fake = applyingFake({
      ventures: [{ id: 'v1', name: 'V1', status: 'active', updated_at: minsAgo(60), metadata: {} }],
      stage_executions: []
    }, cap);
    const state = await ventureAxis.fetch(fake, { now: NOW });
    expect(Array.isArray(state.evaluated), 'fetch must emit `evaluated`').toBe(true);
    expect(state.evaluated.length).toBe(1);
    // And the verdict must NOT be the no-evaluations refusal, which is what the gap produced.
    const r = ventureAxis.classify(state, NOW);
    expect(r.reason).not.toBe('no_venture_evaluations');
  });

  it('each evaluated row carries the fields the classifier reads', async () => {
    const state = await ventureAxis.fetch(applyingFake({
      ventures: [{ id: 'v1', name: 'V1', status: 'active', updated_at: minsAgo(60), metadata: {} }],
      stage_executions: []
    }), { now: NOW });
    const row = state.evaluated[0];
    for (const k of ['id', 'name', 'alarm', 'reason']) expect(row, `missing ${k}`).toHaveProperty(k);
    expect(typeof row.alarm).toBe('boolean');
  });

  it('zero active ventures short-circuits to an empty evaluation set, not a crash', async () => {
    const state = await ventureAxis.fetch(applyingFake({ ventures: [], stage_executions: [] }), { now: NOW });
    expect(state.evaluated).toEqual([]);
    expect(ventureAxis.classify(state, NOW).state).toBe(STATE.CLEAR);
  });
});

describe('the ADAPTER REGISTRY binds every frozen axis', () => {
  const { ADAPTERS } = require('../../../lib/governance/drive-state/adapters.cjs');
  const { AXES } = require('../../../lib/governance/drive-state/contract.cjs');

  it('registers exactly the frozen axis list — no gaps, no strangers', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual([...AXES].sort());
  });

  it('every registered adapter exposes the fetch/classify contract', () => {
    for (const axis of AXES) {
      expect(typeof ADAPTERS[axis].classify, `${axis}.classify`).toBe('function');
      expect(typeof ADAPTERS[axis].fetch, `${axis}.fetch`).toBe('function');
      expect(ADAPTERS[axis].AXIS, `${axis} self-name`).toBe(axis);
    }
  });
});

describe('the BOARD is the renderer first consumer — and never degrades quietly', () => {
  // FR-6: the drive state must be reached in the DEFAULT config with no env gate, and the consumer
  // must never fall back to hand-formatting or to silence. renderDriveState THROWS on an incomplete
  // verdict by design; printing the axes we DID get would be the exact defect this SD removes.
  it('the board imports the composer, the registry and BOTH render entry points', () => {
    const src = readFileSync(new URL('../../../scripts/adam-pm-board.mjs', import.meta.url), 'utf8');
    expect(src).toContain('computeDriveState');
    expect(src).toContain('ADAPTERS');
    expect(src).toContain('renderDriveState');
    expect(src).toContain('renderRefusal');
  });

  it('is NOT behind an env gate — a probe that runs only on opt-in is the partial picture again', () => {
    const src = readFileSync(new URL('../../../scripts/adam-pm-board.mjs', import.meta.url), 'utf8');
    const gated = /process\.env\.[A-Z_]*(DRIVE|SPECTRUM|AXIS)[A-Z_]*/.test(src);
    expect(gated, 'drive state must not be conditioned on an env var').toBe(false);
  });

  it('renders the drive state UNCONDITIONALLY — not inside the ledger success branch', () => {
    const src = readFileSync(new URL('../../../scripts/adam-pm-board.mjs', import.meta.url), 'utf8');
    // The ledger and the drive state answer different questions; a failure in one must not
    // suppress the other, which is what nesting the render inside the else-branch would do.
    const renderIdx = src.indexOf('for (const line of drive.lines)');
    const elseIdx = src.indexOf('(no parent nodes on the board)');
    expect(renderIdx).toBeGreaterThan(-1);
    expect(renderIdx, 'drive render must come AFTER the ledger branch, not inside it').toBeGreaterThan(elseIdx);
  });

  it('the JSON path carries the verdict too — a machine reader cannot silently miss it', () => {
    const src = readFileSync(new URL('../../../scripts/adam-pm-board.mjs', import.meta.url), 'utf8');
    expect(src).toContain('drive_state: drive.verdict');
    expect(src).toContain('drive_state_refused: drive.refused');
    // And it must be computed BEFORE the early --json return.
    expect(src.indexOf('await buildDriveStateSection')).toBeLessThan(src.indexOf('if (asJson)'));
  });

  it('buildDriveStateSection ALWAYS yields lines — never empty, on any outcome', async () => {
    const { buildDriveStateSection } = await import('../../../scripts/adam-pm-board.mjs');
    // A client that rejects every query: adapters fail-safe to UNMEASURABLE, so this yields a
    // complete verdict rather than a refusal — but either way it must never yield silence.
    const broken = { from() { throw new Error('db down'); } };
    const out = await buildDriveStateSection(broken, { now: NOW });
    expect(Array.isArray(out.lines)).toBe(true);
    expect(out.lines.length, 'silence is the one unacceptable output').toBeGreaterThan(0);
    expect(out.lines.join('\n')).toMatch(/DRIVE STATE/);
    // And a total failure must be visibly marked, never rendered as an all-clear.
    if (out.refused) expect(out.lines.join('\n')).toMatch(/NOT an all-clear/);
  });
});
