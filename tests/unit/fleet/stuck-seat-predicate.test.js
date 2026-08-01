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
import { POPULATION_STATUSES, POPULATION_COLUMNS, POPULATION_ROW_LIMIT, fetchPopulation } from '../../../lib/fleet/stuck-seat-population.cjs';
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

  it('heartbeat_at cannot change any verdict — it carries no information and must not be consulted', () => {
    // REWRITTEN AFTER REVIEW. The first version compared `rowFor()` output to itself: it asserted a
    // constant the fixture builder had just written, stayed green under BOTH predicate mutations,
    // and its own comment claimed it would catch "a future change that consults heartbeat_at" — which
    // is not what it checked. This is that check: drive heartbeat_at across its whole plausible range
    // and require every verdict to be byte-identical.
    for (const spec of SPECIMENS) {
      const base = classifySeat(rowFor(spec), { cutPointMinutes: TEST_CUT, now: MEASURED_AT });
      for (const beat of [MEASURED_AT, MEASURED_AT - 3600_000, MEASURED_AT - 86_400_000, null]) {
        const r = classifySeat(rowFor(spec, { heartbeat_at: beat === null ? null : new Date(beat).toISOString() }),
          { cutPointMinutes: TEST_CUT, now: MEASURED_AT });
        expect(r, spec.label + ' heartbeat=' + beat).toEqual(base);
      }
    }
  });

  it('the ORDERING is a property of the code, not of the fixture literal', () => {
    // REWRITTEN AFTER REVIEW. The first version compared numbers inside the SPECIMENS array to each
    // other and never called the module — it could not fail for any reason involving the code.
    // Now: run the shipped predicate over the specimens and require that no cut point anywhere in the
    // gap produces a misclassification. That is what "separates with no overlap" actually means.
    const healthyMax = Math.max(...SPECIMENS.filter((s) => s.truth === 'healthy').map((s) => s.lta_min));
    const stuckMin = Math.min(...SPECIMENS.filter((s) => s.truth === 'stuck').map((s) => s.lta_min));
    expect(healthyMax).toBeLessThan(stuckMin);
    for (const cut of [healthyMax + 1, Math.floor((healthyMax + stuckMin) / 2), stuckMin]) {
      for (const spec of SPECIMENS) {
        const r = classifySeat(rowFor(spec), { cutPointMinutes: cut, now: MEASURED_AT });
        expect(r.verdict, spec.label + ' at cut=' + cut).toBe(spec.truth === 'stuck' ? VERDICT.STUCK : VERDICT.HEALTHY);
      }
    }
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

describe('fetchPopulation BEHAVIOURALLY — the gap that let the defect through twice', () => {
  /**
   * A reviewer proved the hole: rewriting everClaimed as a computed property evaded the source scan
   * AND passed 21/21, because NOTHING CALLED fetchPopulation. Measured blast radius under that
   * evasion: population=0, stuck=0 — a permanently blind detector with a fully green suite. In the
   * predicate the same evasion was caught (the invariance test still failed); the population had no
   * equivalent. This is that equivalent.
   *
   * The fake APPLIES its filters instead of recording them. A double that records a predicate and
   * then returns the fixture regardless answers "found it" to a query no row can satisfy — the exact
   * shape that let a provably-dead predicate pass 162 tests earlier in this SD family.
   */
  function fakeSupabase(rows, { capture = {} } = {}) {
    return {
      from(table) {
        capture.table = table;
        let working = rows.slice();
        const q = {
          select(cols) { capture.columns = cols; return q; },
          in(col, vals) { capture.statusFilter = { col, vals }; working = working.filter((r) => vals.includes(r[col])); return q; },
          order(col, opts) { capture.order = { col, ...opts }; return q; },
          async limit(n) { capture.limit = n; return { data: working.slice(0, n), error: null }; }
        };
        return q;
      }
    };
  }

  const LIVE_SHAPED = [
    // The four stuck specimens: every one has NO claim state. Three are status='idle'.
    { session_id: 'ab29dc41-0382-4bdb-8d79-5306874e8dbb', status: 'active', last_tool_at: '2026-07-31T18:38:14Z', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0, metadata: {} },
    { session_id: 'e3610a71-688e-4184-a323-261ad135f0d3', status: 'idle',   last_tool_at: '2026-08-01T01:02:00Z', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0, metadata: {} },
    { session_id: 'e7c92ad8-6be0-42a6-870e-cfb5d9f73098', status: 'idle',   last_tool_at: '2026-07-31T21:47:00Z', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0, metadata: {} },
    { session_id: '06521203-f370-4666-a40c-7801bcc192ef', status: 'idle',   last_tool_at: '2026-08-01T05:11:00Z', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0, metadata: {} },
    // A healthy claim-HOLDING seat, and a fixture that must be excluded by ID SHAPE not claim state.
    { session_id: '2bd03a3c-aaaa-bbbb-cccc-dddddddddddd', status: 'active', last_tool_at: '2026-08-01T09:25:00Z', sd_key: 'SD-X-001', claimed_at: '2026-08-01T08:00:00Z', worktree_path: '/wt', continuous_sds_completed: 2, metadata: {} },
    { session_id: 'test-session-fixture-1',                status: 'active', last_tool_at: '2026-08-01T09:25:00Z', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0, metadata: {} },
    // status='released' — outside the population entirely.
    { session_id: 'ffffffff-dead-dead-dead-ffffffffffff', status: 'released', last_tool_at: '2026-07-01T00:00:00Z', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0, metadata: {} }
  ];

  it('returns all four CLAIM-FREE stuck seats — the regression test for returning 1 of 4', async () => {
    const seats = await fetchPopulation(fakeSupabase(LIVE_SHAPED));
    const ids = seats.map((s) => s.session_id);
    for (const stuck of ['ab29dc41-0382-4bdb-8d79-5306874e8dbb', 'e3610a71-688e-4184-a323-261ad135f0d3',
                         'e7c92ad8-6be0-42a6-870e-cfb5d9f73098', '06521203-f370-4666-a40c-7801bcc192ef']) {
      expect(ids, 'stuck seat must survive the population').toContain(stuck);
    }
    // Under the everClaimed evasion this returned ZERO. Asserting the count pins the whole class,
    // not just the four ids: any claim-derived filter drops all four at once.
    expect(seats.length).toBe(5);
  });

  it('excludes fixtures by ID SHAPE and excludes released seats — but never by claim state', async () => {
    const ids = (await fetchPopulation(fakeSupabase(LIVE_SHAPED))).map((s) => s.session_id);
    expect(ids).not.toContain('test-session-fixture-1');          // isFixtureSession, id shape
    expect(ids).not.toContain('ffffffff-dead-dead-dead-ffffffffffff'); // status filter
    expect(ids).toContain('2bd03a3c-aaaa-bbbb-cccc-dddddddddddd');     // claim-HOLDING seat still in
  });

  it('bounds the read and orders it stalest-first, so a row-cap truncation cannot silently hide stuck seats', async () => {
    const capture = {};
    await fetchPopulation(fakeSupabase(LIVE_SHAPED, { capture }));
    expect(capture.limit).toBe(POPULATION_ROW_LIMIT);
    expect(capture.order).toMatchObject({ col: 'last_tool_at', ascending: true });
    expect(capture.statusFilter).toEqual({ col: 'status', vals: POPULATION_STATUSES });
  });

  it('reports truncation rather than swallowing it', async () => {
    const many = Array.from({ length: POPULATION_ROW_LIMIT }, (_, i) => ({
      session_id: 'aaaaaaaa-0000-0000-0000-' + String(i).padStart(12, '0'),
      status: 'active', last_tool_at: '2026-08-01T00:00:00Z', metadata: {}
    }));
    expect((await fetchPopulation(fakeSupabase(many))).truncated).toBe(true);
    expect((await fetchPopulation(fakeSupabase(LIVE_SHAPED))).truncated).toBe(false);
  });

  it('throws on a query error instead of returning an empty population', async () => {
    // An empty population and a failed query render identically as "0 stuck" — the failure must be loud.
    const failing = { from: () => ({ select: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) };
    await expect(fetchPopulation(failing)).rejects.toThrow(/boom/);
  });
});
