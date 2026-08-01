/**
 * Stuck-seat predicate — SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001.
 *
 * The fixture table below is MEASURED, not narrated. Every interval was computed from two
 * timestamps against live claude_sessions rows at 2026-08-01T09:25:44.546Z (PRD TR-4: a detection
 * predicate calibrated against a duration someone estimated inherits that error as a THRESHOLD,
 * where it becomes invisible).
 */

import { describe, it, expect } from 'vitest';
import { classifySeat, classifyWakeState, VERDICT, REASON, PRECEDENCE } from '../../../lib/fleet/stuck-seat-predicate.cjs';
import { POPULATION_STATUSES, POPULATION_COLUMNS } from '../../../lib/fleet/stuck-seat-population.cjs';
import { readFileSync } from 'node:fs';

const MEASURED_AT = Date.parse('2026-08-01T09:25:44.546Z');

/** Measured live. lta_min = minutes of tool silence at MEASURED_AT. */
const SPECIMENS = [
  { label: 'ALPHA-3', session_id: '2bd03a3c-healthy-control',   truth: 'healthy', lta_min: 0,   status: 'active', everClaimed: true },
  { label: 'ALPHA-2', session_id: '8aa7b984-healthy-this-seat', truth: 'healthy', lta_min: 0,   status: 'active', everClaimed: true },
  { label: 'CHARLIE', session_id: '06521203-stuck-stranded',    truth: 'stuck',   lta_min: 249, status: 'idle',   everClaimed: false },
  { label: 'BRAVO',   session_id: 'e3610a71-stuck-exited',      truth: 'stuck',   lta_min: 499, status: 'idle',   everClaimed: false },
  { label: 'ALPHA',   session_id: 'e7c92ad8-stuck-awaiting',    truth: 'stuck',   lta_min: 694, status: 'idle',   everClaimed: false },
  { label: 'DELTA',   session_id: 'ab29dc41-stuck-frozen',      truth: 'stuck',   lta_min: 888, status: 'active', everClaimed: true }
];

/** A cut point chosen ONLY for these tests. It is NOT shipped and NOT a calibration — see TR-4. */
const TEST_CUT = 120;

function rowFor(spec, overrides = {}) {
  return {
    session_id: spec.session_id,
    status: spec.status,
    loop_state: 'active',
    last_tool_at: new Date(MEASURED_AT - spec.lta_min * 60000).toISOString(),
    heartbeat_at: new Date(MEASURED_AT).toISOString(),   // 0 min on ALL SIX — deliberately uninformative
    metadata: {},
    ...overrides
  };
}

describe('the six measured specimens', () => {
  it('classifies all six correctly — 4 stuck, 2 healthy', () => {
    for (const spec of SPECIMENS) {
      const r = classifySeat(rowFor(spec), { cutPointMinutes: TEST_CUT, now: MEASURED_AT });
      expect(r.verdict, spec.label).toBe(spec.truth === 'stuck' ? VERDICT.STUCK : VERDICT.HEALTHY);
    }
  });

  it('heartbeat_at is identical on all six and therefore carries NO information', () => {
    // This is why the SD exists: four independent liveness indicators read healthy on Delta.
    // If a future change makes the predicate consult heartbeat_at, it consults a constant.
    const beats = new Set(SPECIMENS.map((s) => rowFor(s).heartbeat_at));
    expect(beats.size).toBe(1);
  });

  it('last_tool_at separates the classes with NO overlap — the ordering, not a cut point', () => {
    const healthy = SPECIMENS.filter((s) => s.truth === 'healthy').map((s) => s.lta_min);
    const stuck = SPECIMENS.filter((s) => s.truth === 'stuck').map((s) => s.lta_min);
    expect(Math.max(...healthy)).toBeLessThan(Math.min(...stuck));
  });
});

describe('CLAIM STATE MUST NOT REACH THE VERDICT — the defect this SD already produced once', () => {
  // The sourced predicate led with has_live_claim. Measured on these same six rows it agrees with
  // ground truth 0/6 (TRUE for both healthy controls, FALSE for all four stuck seats) because the
  // sweep releases a stuck seat's claim before it is detectably stuck. The first PRD dropped it from
  // the predicate and then reintroduced it in the POPULATION via isFleetWorker/everClaimed, which
  // returned 1 of 4 stuck specimens. THIS IS A BEHAVIOURAL ASSERTION AGAINST THE SHIPPED MODULE:
  // an earlier version of this test scored a locally-defined helper, which would have stayed green
  // if the conjunct came back.
  const CLAIM_FIELDS = ['sd_key', 'claimed_at', 'worktree_path', 'continuous_sds_completed'];

  it('mutating every claim-derived field leaves each verdict byte-identical', () => {
    for (const spec of SPECIMENS) {
      const base = classifySeat(rowFor(spec), { cutPointMinutes: TEST_CUT, now: MEASURED_AT });
      const claimed = classifySeat(
        rowFor(spec, { sd_key: 'SD-ANY-001', claimed_at: new Date(MEASURED_AT).toISOString(), worktree_path: '/tmp/wt', continuous_sds_completed: 3 }),
        { cutPointMinutes: TEST_CUT, now: MEASURED_AT }
      );
      const unclaimed = classifySeat(
        rowFor(spec, { sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0 }),
        { cutPointMinutes: TEST_CUT, now: MEASURED_AT }
      );
      expect(claimed, spec.label + ' claimed').toEqual(base);
      expect(unclaimed, spec.label + ' unclaimed').toEqual(base);
    }
  });

  it('no claim-derived field name appears in the predicate or the population source', () => {
    // A source-level backstop for the behavioural test above: the invariance assertion proves claim
    // state does not change the ANSWER, this proves it is not consulted at all — including in a
    // branch these fixtures happen not to exercise.
    const files = ['lib/fleet/stuck-seat-predicate.cjs', 'lib/fleet/stuck-seat-population.cjs'];
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
        // strip comments: the rationale NECESSARILY names these fields, and a source scan that
        // cannot tell an explanation from a use would make the honest comment unwritable.
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^[^\S\r\n]*\/\/[^\n]*$/gm, ' ');
      for (const field of CLAIM_FIELDS.concat(['everClaimed', 'isFleetWorker'])) {
        expect(src, f + ' must not consult ' + field).not.toContain(field);
      }
    }
  });

  it('the population includes idle seats — 3 of 4 stuck specimens are status=idle', () => {
    expect(POPULATION_STATUSES).toContain('idle');
    expect(POPULATION_STATUSES).toContain('active');
    // and it must not select the uuid PK, so nothing downstream can join on the wrong key
    expect(POPULATION_COLUMNS).toContain('session_id');
    expect(POPULATION_COLUMNS.split(',').map((c) => c.trim())).not.toContain('id');
  });
});

describe('NULL is UNKNOWN, never healthy — with EXACT reason tokens', () => {
  it('a missing tool clock yields UNKNOWN/last_tool_at_never_written', () => {
    const r = classifySeat(rowFor(SPECIMENS[0], { last_tool_at: null }), { cutPointMinutes: TEST_CUT, now: MEASURED_AT });
    expect(r.verdict).toBe(VERDICT.UNKNOWN);
    // EXACT token, not a truthy check: a truthy assertion cannot distinguish this branch from an
    // earlier guard also returning UNKNOWN, so it would pass without ever reaching the code it names.
    expect(r.reason).toBe(REASON.NO_TOOL_CLOCK);
    expect(r.reason).toBe('last_tool_at_never_written');
  });

  it('an unparseable tool clock is UNKNOWN, not healthy', () => {
    const r = classifySeat(rowFor(SPECIMENS[0], { last_tool_at: 'not-a-date' }), { cutPointMinutes: TEST_CUT, now: MEASURED_AT });
    expect(r.verdict).toBe(VERDICT.UNKNOWN);
    expect(r.reason).toBe('last_tool_at_never_written');
  });
});

describe('wakeup state is THREE-valued — absent is not proof none was armed', () => {
  it('absent expected_wake_at yields not_recorded, NOT no-wakeup-armed', () => {
    const w = classifyWakeState({ metadata: {} }, MEASURED_AT);
    expect(w.state).toBe('not_recorded');
    expect(w.reason).toBe('wake_not_recorded');
  });

  it('Delta shape: an armed deadline hundreds of minutes in the past is armed_overdue', () => {
    // Measured on the live Delta row: metadata.expected_wake_at = 2026-07-31T18:07:27.682Z.
    const w = classifyWakeState({ metadata: { expected_wake_at: '2026-07-31T18:07:27.682Z' } }, MEASURED_AT);
    expect(w.state).toBe('armed_overdue');
    expect(w.overdueMinutes).toBeGreaterThan(800);
  });

  it('a future deadline is armed_pending, not overdue', () => {
    const w = classifyWakeState({ metadata: { expected_wake_at: new Date(MEASURED_AT + 600000).toISOString() } }, MEASURED_AT);
    expect(w.state).toBe('armed_pending');
  });

  it('an unparseable deadline degrades to not_recorded rather than throwing', () => {
    expect(classifyWakeState({ metadata: { expected_wake_at: 'garbage' } }, MEASURED_AT).state).toBe('not_recorded');
  });
});

describe('the module REFUSES to run without an explicit cut point', () => {
  // TR-4: no default may exist. A default here would be an uncalibrated number in the one place
  // nobody looks at again — the false-negative side is n=1 per class and healthy latency is
  // right-censored, so the data cannot support a cut point yet.
  it.each([[undefined], [null], [0], [-5], [NaN], ['120']])('throws for cutPointMinutes=%p', (cut) => {
    expect(() => classifySeat(rowFor(SPECIMENS[0]), { cutPointMinutes: cut, now: MEASURED_AT })).toThrow(/cutPointMinutes is REQUIRED/);
  });

  it('there is no numeric default anywhere in the module source', () => {
    const src = readFileSync('lib/fleet/stuck-seat-predicate.cjs', 'utf8');
    expect(src).not.toMatch(/cutPointMinutes\s*=\s*\d/);
    expect(src).not.toMatch(/DEFAULT_CUT/);
  });
});

describe('precedence against the incumbent detector', () => {
  it('is advisory-only and declares the disagreement rule explicitly', () => {
    // lib/fleet/claim-boundary-probe.cjs returns PASS on Delta (progressed_past_boundary at :129 —
    // NOT outbound_comms_since_anchor at :152, which is unreachable there because Delta has zero
    // outbound since its claim anchor). Both guards blind it to this class; progressed_past_boundary
    // is the more dangerous because it PASSes ANY seat that did work and then froze.
    expect(PRECEDENCE.thisModuleIsAdvisoryOnly).toBe(true);
    expect(PRECEDENCE.onDisagreement).toBe('stuck_wins_for_reporting_incumbent_wins_for_actuation');
    expect(PRECEDENCE.incumbent).toBe('lib/fleet/claim-boundary-probe.cjs');
  });

  it('a Delta-shaped row that the incumbent PASSes is classified STUCK here', () => {
    const delta = SPECIMENS.find((s) => s.label === 'DELTA');
    const r = classifySeat(rowFor(delta), { cutPointMinutes: TEST_CUT, now: MEASURED_AT });
    expect(r.verdict).toBe(VERDICT.STUCK);
    expect(r.toolSilentMinutes).toBe(888);
  });
});
