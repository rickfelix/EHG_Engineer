/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-D (Child C) — lib/fleet/orphan-reroute-sweep.js.
 * TS-1: a real orphan row re-routed within one tick with a full audit stamp.
 * TS-2: repeat-offender alarm fires only once the threshold is met, not before.
 * TS-3: idempotency — a non-orphan / already-rerouted / read row is never touched.
 * TS-4: per-row and whole-tick fail-soft (never throws).
 */
import { describe, it, expect, vi } from 'vitest';
import { sweepOrphanRows, isOrphanCandidate, REROUTE_TO_KIND, REPEAT_OFFENDER_THRESHOLD } from '../../../lib/fleet/orphan-reroute-sweep.js';

function buildSupabase({ candidates = [], priorReroutes = [], updateResult = { data: [{ id: 'x' }], error: null } } = {}) {
  const updateCalls = [];
  return {
    from: vi.fn((table) => {
      if (table !== 'session_coordination') throw new Error(`unexpected table ${table}`);
      return {
        select: vi.fn((cols) => {
          // Two distinct read shapes: the candidate scan (has .is) and the
          // prior-reroute tally (has .eq on payload->>kind, no .is call).
          const isCandidateScan = typeof cols === 'string' && cols.includes('target_session');
          if (isCandidateScan) {
            return {
              is: () => ({ gte: () => ({ limit: async () => ({ data: candidates, error: null }) }) }),
            };
          }
          return {
            eq: () => ({ gte: () => ({ limit: async () => ({ data: priorReroutes, error: null }) }) }),
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
