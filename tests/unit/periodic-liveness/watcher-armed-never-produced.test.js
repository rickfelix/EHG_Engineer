/**
 * SD-LEO-INFRA-STAMP-ARMING-TIME-001 FR-2 / TS-2, TS-3, TS-4.
 *
 * A null last_fired_at CONFLATES "not due yet" with "never produced when it should have". This
 * suite proves the watcher now separates them — and, just as importantly, that it does NOT reach
 * the rows it must never alarm on.
 *
 * BOTH ARMS ON EVERY ASSERTION. A test that only shows the alarm firing has not shown that the
 * branch DISCRIMINATES; it is equally satisfied by a branch that fires on everything, which is
 * precisely the 60-alarm failure mode this design was corrected away from.
 */
import { describe, it, expect } from 'vitest';
import { evaluateRow, STATE } from '../../../scripts/periodic-liveness-watcher.mjs';

const HOUR = 3600;
const daysAgo = (n) => new Date(Date.now() - n * 86400 * 1000).toISOString();

/** A self_stamped row that has never been stamped — the ARMED signature. */
function armedRow(overrides = {}) {
  return {
    process_key: 'g3-armed-sd-test-001',
    // evaluateRow short-circuits to INTENTIONALLY_DOWN without this. All 66 real rows carrying a
    // null last_fired_at are currently_expected_active=true, so omitting it made the fixture
    // unlike production and every case passed through a branch under test.
    currently_expected_active: true,
    // EVERY real row has a created_at, and most of the blind ones are ancient (role_session:adam
    // is ~1487 cadences old). Omitting it here made the regression guard below BLIND: a mutation
    // that fell back to created_at when armed_at was absent — the exact 60-alarm design this SD
    // was corrected away from — passed 6/6 against a fixture where created_at was undefined.
    // A fixture unlike production does not merely weaken a test, it can nullify it entirely.
    created_at: daysAgo(30),
    liveness_source: 'self_stamped',
    expected_interval_seconds: 24 * HOUR,
    grace_multiplier: 2,
    last_fired_at: null,
    liveness_source_ref: { sd_key: 'SD-TEST-001', activation_trigger: 'when X ships' },
    ...overrides,
  };
}

describe('watcher FR-2: armed_never_produced', () => {
  it('ARM 1 — armed and PAST the grace window with no stamp: OVERDUE', async () => {
    const row = armedRow({
      liveness_source_ref: { sd_key: 'SD-TEST-001', activation_trigger: 't', armed_at: daysAgo(5) },
    });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OVERDUE);
    expect(result.reason).toBe('armed_never_produced');
    expect(result.armed_at).toBe(row.liveness_source_ref.armed_at);
  });

  it('ARM 2 — armed but INSIDE the grace window: UNVERIFIED, not an alarm', async () => {
    // Same row, same code path, only the age differs. 24h interval x2 grace = 48h window; 1 day in
    // is not yet due. Without this arm, a branch that fired unconditionally would look correct.
    const row = armedRow({
      liveness_source_ref: { sd_key: 'SD-TEST-001', activation_trigger: 't', armed_at: daysAgo(1) },
    });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.UNVERIFIED);
    expect(result.reason).toBe('no_last_fired_data_available');
  });

  it('REGRESSION GUARD — NO armed_at, very old row, null last_fired_at: still UNVERIFIED', async () => {
    // This is the never-false-OVERDUE acceptance criterion of
    // SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B, held intact. It mirrors real production rows:
    // role_session:adam/coordinator/solomon sit at ~1487 cadences elapsed with a null
    // last_fired_at and last_state OK. An OVERDUE here means the change reached the 39
    // non-self_stamped blind rows it must not touch.
    const row = armedRow({
      process_key: 'role_session:adam',
      expected_interval_seconds: 1800,
      liveness_source_ref: { sd_key: 'SD-OTHER-001', activation_trigger: 't' },
    });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.UNVERIFIED);
    expect(result.reason).toBe('no_last_fired_data_available');
  });

  it('a MALFORMED armed_at fails soft to UNVERIFIED — an unparseable date is not evidence', async () => {
    const row = armedRow({
      liveness_source_ref: { sd_key: 'SD-TEST-001', activation_trigger: 't', armed_at: 'not-a-date' },
    });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.UNVERIFIED);
  });

  it('a null grace_multiplier does NOT produce an instant alarm', async () => {
    // overdueThresholdMs does Number(row.grace_multiplier); Number(null) is 0, which would make
    // every armed row instantly "past" a zero-length window. Unreachable today because the only
    // writer of armed_at also writes grace_multiplier — which is exactly the sort of cross-file
    // coupling a later edit severs silently.
    const row = armedRow({
      grace_multiplier: null,
      liveness_source_ref: { sd_key: 'SD-TEST-001', activation_trigger: 't', armed_at: daysAgo(5) },
    });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.UNVERIFIED);
  });

  it('an already-stamped row is untouched by the new branch', async () => {
    // last_fired_at non-null must still take the pre-existing age-vs-threshold path. Fresh stamp
    // with an old armed_at: the arming time must NOT drag a healthy row into OVERDUE.
    const row = armedRow({
      last_fired_at: new Date(Date.now() - 60_000).toISOString(),
      liveness_source_ref: { sd_key: 'SD-TEST-001', activation_trigger: 't', armed_at: daysAgo(90) },
    });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OK);
    expect(result.reason).not.toBe('armed_never_produced');
  });
});
