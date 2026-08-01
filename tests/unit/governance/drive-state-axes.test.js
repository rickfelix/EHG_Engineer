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
        limit: async (n) => { capture.limit = n; return { data: rows.slice(0, n), error: null }; }
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
  const capture = {};
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
