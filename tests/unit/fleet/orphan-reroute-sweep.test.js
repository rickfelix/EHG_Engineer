/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-D (Child C) — lib/fleet/orphan-reroute-sweep.js.
 * TS-1: a real orphan row re-routed within one tick with a full audit stamp.
 * TS-2: repeat-offender alarm fires only once the threshold is met, not before.
 * TS-3: idempotency — a non-orphan / already-rerouted / read row is never touched.
 * TS-4: per-row and whole-tick fail-soft (never throws).
 */
import { describe, it, expect, vi } from 'vitest';
import { sweepOrphanRows, isOrphanCandidate, REROUTE_TO_KIND, REPEAT_OFFENDER_THRESHOLD } from '../../../lib/fleet/orphan-reroute-sweep.js';

function buildSupabase({ candidates = [], priorReroutes = [], priorReroutesError = null, existingAlarms = [], updateResult = { data: [{ id: 'x' }], error: null } } = {}) {
  const updateCalls = [];
  return {
    from: vi.fn((table) => {
      if (table !== 'session_coordination') throw new Error(`unexpected table ${table}`);
      return {
        select: vi.fn((cols) => {
          // Three distinct read shapes: the candidate scan (multi-column, chains .is()),
          // the prior-reroute tally (selects 'payload', chains .eq().gte()), and the
          // alarm-dedup check (selects 'id', chains .eq().is()).
          const isCandidateScan = typeof cols === 'string' && cols.includes('target_session');
          const isAlarmDedupCheck = cols === 'id';
          if (isCandidateScan) {
            return {
              is: () => ({ gte: () => ({ limit: async () => ({ data: candidates, error: null }) }) }),
            };
          }
          if (isAlarmDedupCheck) {
            return {
              eq: () => ({ is: () => ({ limit: async () => ({ data: existingAlarms, error: null }) }) }),
            };
          }
          return {
            eq: () => ({ gte: () => ({ limit: async () => (priorReroutesError ? { data: null, error: priorReroutesError } : { data: priorReroutes, error: null }) }) }),
          };
        }),
        update: vi.fn((patch) => {
          updateCalls.push(patch);
          return {
            eq: () => ({ is: () => ({ select: async () => updateResult }) }),
          };
        }),
      };
    }),
    __updateCalls: updateCalls,
  };
}

const roleFor = (map) => async (_sb, target) => map[target] ?? null;
const recognizedFor = (map) => async ({ role }) => map[role] || [];
const coordinatorId = async () => 'coordinator-uuid';
const insertRow = vi.fn(async () => ({ data: [{ id: 'alarm' }], error: null }));

describe('isOrphanCandidate (pure)', () => {
  it('a null/undefined kind is never an orphan', () => {
    expect(isOrphanCandidate({ kind: null, recognizedKinds: [] })).toBe(false);
  });
  it('a terminal reply kind is never an orphan even if unrecognized', () => {
    expect(isOrphanCandidate({ kind: 'ack', recognizedKinds: [] })).toBe(false);
  });
  it('a kind absent from the recognized set is an orphan', () => {
    expect(isOrphanCandidate({ kind: 'mystery_kind', recognizedKinds: ['known'] })).toBe(true);
  });
  it('a kind present in the recognized set is not an orphan', () => {
    expect(isOrphanCandidate({ kind: 'known', recognizedKinds: ['known'] })).toBe(false);
  });
});

describe('sweepOrphanRows — TS-1 reroute with full audit stamp', () => {
  it('reroutes a real orphan row and stamps payload.reroute', async () => {
    const row = { id: 'row-1', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' }, created_at: new Date().toISOString() };
    const sb = buildSupabase({ candidates: [row] });
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: ['comms_check'] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow,
    });
    expect(out.swept).toBe(1);
    expect(out.rerouted).toBe(1);
    expect(out.alarmed).toBe(0); // first occurrence, below threshold
    const patch = sb.__updateCalls[0];
    expect(patch.target_session).toBe('coordinator-uuid');
    expect(patch.payload.kind).toBe(REROUTE_TO_KIND);
    expect(patch.payload.reroute).toEqual({
      from_kind: 'mystery_kind', to_kind: REROUTE_TO_KIND,
      from_target: 'solomon-uuid', to_target: 'coordinator-uuid',
      from_role: 'solomon', at: expect.any(String), by_sweep: true,
    });
  });

  it('falls back to broadcast-coordinator when no coordinator is live', async () => {
    const row = { id: 'row-1', target_session: 'adam-uuid', payload: { kind: 'weird' }, created_at: new Date().toISOString() };
    const sb = buildSupabase({ candidates: [row] });
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'adam-uuid': 'adam' }),
      resolveRecognizedKinds: recognizedFor({ adam: [] }),
      getActiveCoordinatorId: async () => { throw new Error('no coordinator'); },
      insertRow,
    });
    expect(out.rerouted).toBe(1);
    expect(sb.__updateCalls[0].target_session).toBe('broadcast-coordinator');
  });
});

describe('sweepOrphanRows — TS-2 repeat-offender alarm', () => {
  it('does NOT alarm on the first occurrence (below threshold)', async () => {
    const row = { id: 'row-1', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const sb = buildSupabase({ candidates: [row], priorReroutes: [] });
    const localInsert = vi.fn();
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow: localInsert,
    });
    expect(out.alarmed).toBe(0);
    expect(localInsert).not.toHaveBeenCalled();
    expect(REPEAT_OFFENDER_THRESHOLD).toBeGreaterThan(1);
  });

  it('DOES alarm once the (role,kind) pair hits the threshold, with a coordinator-recognized alarm kind', async () => {
    const row = { id: 'row-2', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const priorReroutes = [{ payload: { reroute: { from_role: 'solomon', from_kind: 'mystery_kind' } } }];
    const sb = buildSupabase({ candidates: [row], priorReroutes });
    const localInsert = vi.fn(async () => ({ data: [{ id: 'a' }], error: null }));
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow: localInsert,
    });
    expect(out.alarmed).toBe(1);
    expect(localInsert).toHaveBeenCalledOnce();
    const [, alarmRow, alarmOpts] = localInsert.mock.calls[0];
    expect(alarmRow.payload.kind).toBe('coordinator_request');
    expect(alarmRow.subject).toContain('solomon');
    expect(alarmRow.subject).toContain('mystery_kind');
    expect(alarmOpts).toEqual({ targetRoleHint: 'coordinator' });
  });

  // Adversarial-review fix: fires EXACTLY ONCE at the threshold, never again for later
  // occurrences of the same (role,kind) pair (was `>=`, spamming one alarm per orphan).
  it('does NOT re-alarm past the threshold (3rd occurrence, prior count already >= threshold)', async () => {
    const row = { id: 'row-3', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const priorReroutes = [
      { payload: { reroute: { from_role: 'solomon', from_kind: 'mystery_kind' } } },
      { payload: { reroute: { from_role: 'solomon', from_kind: 'mystery_kind' } } },
    ];
    const sb = buildSupabase({ candidates: [row], priorReroutes });
    const localInsert = vi.fn(async () => ({ data: [{ id: 'a' }], error: null }));
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow: localInsert,
    });
    expect(out.rerouted).toBe(1);
    expect(out.alarmed).toBe(0);
    expect(localInsert).not.toHaveBeenCalled();
  });

  it('fires only ONE alarm even when two rows in the SAME tick both cross the threshold sequentially', async () => {
    const rowA = { id: 'row-a', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const rowB = { id: 'row-b', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const priorReroutes = [{ payload: { reroute: { from_role: 'solomon', from_kind: 'mystery_kind' } } }]; // count=1 already
    const sb = buildSupabase({ candidates: [rowA, rowB], priorReroutes });
    const localInsert = vi.fn(async () => ({ data: [{ id: 'a' }], error: null }));
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow: localInsert,
    });
    expect(out.rerouted).toBe(2);
    expect(out.alarmed).toBe(1); // rowA brings count to 2 (=threshold, alarms); rowB brings it to 3 (no re-alarm)
    expect(localInsert).toHaveBeenCalledOnce();
  });

  it('a failed repeat-offender tally read degrades to no-false-alarm and is surfaced structurally, never silently indistinguishable from a quiet tick', async () => {
    const row = { id: 'row-1', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const sb = buildSupabase({ candidates: [row], priorReroutesError: { message: 'tally read boom' } });
    const localInsert = vi.fn();
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow: localInsert,
    });
    expect(out.rerouted).toBe(1); // the reroute itself still proceeds
    expect(out.alarmed).toBe(0);
    expect(localInsert).not.toHaveBeenCalled();
    expect(out.offenderTallyError).toBe('tally read boom');
  });

  // Round-2 adversarial-review fix: a durable alarm-dedup check narrows the race between
  // overlapping sweep invocations (e.g. a manual CLI run racing the cron) that could each
  // independently cross the in-memory threshold and double-alarm.
  it('skips the alarm insert when a durable dedup check finds an existing unread alarm for the same (role,kind) pair', async () => {
    const row = { id: 'row-2', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const priorReroutes = [{ payload: { reroute: { from_role: 'solomon', from_kind: 'mystery_kind' } } }];
    const sb = buildSupabase({ candidates: [row], priorReroutes, existingAlarms: [{ id: 'already-alarmed' }] });
    const localInsert = vi.fn(async () => ({ data: [{ id: 'a' }], error: null }));
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow: localInsert,
    });
    expect(out.rerouted).toBe(1); // the reroute itself still proceeds
    expect(out.alarmed).toBe(0); // dedup check found an existing alarm -> no new insert
    expect(localInsert).not.toHaveBeenCalled();
  });

  it('stamps a stable alarm_key on the alarm payload for future dedup checks to match against', async () => {
    const row = { id: 'row-2', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const priorReroutes = [{ payload: { reroute: { from_role: 'solomon', from_kind: 'mystery_kind' } } }];
    const sb = buildSupabase({ candidates: [row], priorReroutes });
    const localInsert = vi.fn(async () => ({ data: [{ id: 'a' }], error: null }));
    await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow: localInsert,
    });
    const [, alarmRow] = localInsert.mock.calls[0];
    expect(alarmRow.payload.alarm_key).toBe('orphan-repeat-offender:solomon:mystery_kind');
  });
});

describe('sweepOrphanRows — TS-3 idempotency / non-orphan skips', () => {
  it('skips a row whose kind IS recognized by its target role', async () => {
    const row = { id: 'row-1', target_session: 'solomon-uuid', payload: { kind: 'comms_check' } };
    const sb = buildSupabase({ candidates: [row] });
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: ['comms_check'] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow,
    });
    expect(out.rerouted).toBe(0);
    expect(sb.__updateCalls).toHaveLength(0);
  });

  it('skips a row already carrying payload.reroute (already processed)', async () => {
    const row = { id: 'row-1', target_session: 'solomon-uuid', payload: { kind: 'coordinator_reminder', reroute: { from_kind: 'x' } } };
    const sb = buildSupabase({ candidates: [row] });
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow,
    });
    expect(out.rerouted).toBe(0);
  });

  it('skips a row whose target role cannot be resolved (e.g. a worker session)', async () => {
    const row = { id: 'row-1', target_session: 'some-worker-uuid', payload: { kind: 'anything' } };
    const sb = buildSupabase({ candidates: [row] });
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({}), // no mapping -> null
      resolveRecognizedKinds: recognizedFor({}),
      getActiveCoordinatorId: coordinatorId,
      insertRow,
    });
    expect(out.rerouted).toBe(0);
  });
});

describe('sweepOrphanRows — TS-4 fail-soft', () => {
  // Round-2 adversarial-review fix: a resolveRecognizedKinds() failure must SKIP the row,
  // never default to [] (which would force every kind to read as orphan and misroute a
  // legitimately-targeted, correctly-typed message away from its real recipient).
  it('skips a row when resolveRecognizedKinds() throws, rather than misclassifying it as orphan', async () => {
    const row = { id: 'row-1', target_session: 'solomon-uuid', payload: { kind: 'a_real_recognized_kind' } };
    const sb = buildSupabase({ candidates: [row] });
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: async () => { throw new Error('registry read boom'); },
      getActiveCoordinatorId: coordinatorId,
      insertRow,
    });
    expect(out.rerouted).toBe(0);
    expect(sb.__updateCalls).toHaveLength(0);
  });

  it('never throws on a candidate-read error; reports it structurally', async () => {
    const sb = {
      from: () => ({
        select: (cols) => {
          const isCandidateScan = typeof cols === 'string' && cols.includes('target_session');
          if (isCandidateScan) return { is: () => ({ gte: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) };
          return { eq: () => ({ gte: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
        },
      }),
    };
    const out = await sweepOrphanRows(sb, { insertRow });
    expect(out).toEqual({ swept: 0, rerouted: 0, alarmed: 0, error: 'boom' });
  });

  it('one row erroring on update never blocks the rest of the tick', async () => {
    const rowA = { id: 'a', target_session: 'solomon-uuid', payload: { kind: 'bad1' } };
    const rowB = { id: 'b', target_session: 'solomon-uuid', payload: { kind: 'bad2' } };
    const sb = buildSupabase({ candidates: [rowA, rowB] });
    let call = 0;
    // Override update to fail on the first row, succeed on the second.
    sb.from = vi.fn(() => ({
      select: vi.fn((cols) => {
        const isCandidateScan = typeof cols === 'string' && cols.includes('target_session');
        if (isCandidateScan) return { is: () => ({ gte: () => ({ limit: async () => ({ data: [rowA, rowB], error: null }) }) }) };
        return { eq: () => ({ gte: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
      }),
      update: () => ({
        eq: () => ({
          is: () => ({
            select: async () => {
              call += 1;
              return call === 1 ? { data: null, error: { message: 'race lost' } } : { data: [{ id: 'b' }], error: null };
            },
          }),
        }),
      }),
    }));
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow,
    });
    expect(out.swept).toBe(2);
    expect(out.rerouted).toBe(1); // rowA failed, rowB succeeded
  });

  it('an alarm-send failure never rolls back an already-successful reroute', async () => {
    const row = { id: 'row-2', target_session: 'solomon-uuid', payload: { kind: 'mystery_kind' } };
    const priorReroutes = [{ payload: { reroute: { from_role: 'solomon', from_kind: 'mystery_kind' } } }];
    const sb = buildSupabase({ candidates: [row], priorReroutes });
    const failingInsert = vi.fn(async () => { throw new Error('alarm send failed'); });
    const out = await sweepOrphanRows(sb, {
      resolveTargetRole: roleFor({ 'solomon-uuid': 'solomon' }),
      resolveRecognizedKinds: recognizedFor({ solomon: [] }),
      getActiveCoordinatorId: coordinatorId,
      insertRow: failingInsert,
    });
    expect(out.rerouted).toBe(1);
    expect(out.alarmed).toBe(0); // the alarm failed, but the reroute is still counted
  });
});
