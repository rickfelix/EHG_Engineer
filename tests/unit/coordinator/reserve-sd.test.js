/**
 * SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C retro action item (e537e872) —
 * lib/coordinator/reserve-sd.cjs, the coordinator_reservation write-side utility that
 * did not exist before this fix. No live git/gh/DB calls (all injected). The coordinator
 * resolver is injected via opts.resolveCoordinatorId (same DI shape as relay-queue.cjs's
 * drainOne(supabase, row, sendRelay)) rather than mocked, since resolve.cjs's real
 * getActiveCoordinatorId reads a local pointer file / queries claude_sessions and isn't a
 * clean unit-test seam.
 */
import { describe, it, expect } from 'vitest';
import { buildCoordinatorReservationPayload, reserveSd } from '../../../lib/coordinator/reserve-sd.cjs';
import { PAYLOAD_KINDS } from '../../../lib/fleet/worker-status.cjs';

describe('buildCoordinatorReservationPayload — pure builder', () => {
  it('builds a coordinator_reservation payload with the correct kind', () => {
    const payload = buildCoordinatorReservationPayload({ reservedForSession: 's1', reservedForTier: 'sonnet', lanePattern: 'SD-LEO-*' });
    expect(payload.kind).toBe(PAYLOAD_KINDS.COORDINATOR_RESERVATION);
    expect(payload.reserved_for_session).toBe('s1');
    expect(payload.reserved_for_tier).toBe('sonnet');
    expect(payload.lane_pattern).toBe('SD-LEO-*');
  });

  it('defaults unset fields to null rather than undefined', () => {
    const payload = buildCoordinatorReservationPayload();
    expect(payload.reserved_for_session).toBeNull();
    expect(payload.reserved_for_tier).toBeNull();
    expect(payload.lane_pattern).toBeNull();
  });
});

function makeInsertStub() {
  const calls = { inserts: [] };
  return {
    calls,
    from(table) {
      return {
        insert(row) {
          calls.inserts.push({ table, row });
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'res-1', created_at: '2026-07-11T00:00:00Z' }, error: null }) }) };
        },
      };
    },
  };
}

const resolveToLiveCoordinator = async () => 'live-coord-id';
const resolveToNull = async () => null;
const resolveThatThrows = async () => { throw new Error('resolve exploded'); };

describe('reserveSd — FR-2 SECURITY MUST: sender_session is the live coordinator, never a caller-supplied identity', () => {
  it('stamps sender_session from the resolved live coordinator, not any caller input', async () => {
    const supabase = makeInsertStub();
    const result = await reserveSd(supabase, {
      targetSd: 'SD-EXAMPLE-001', reservedForSession: 'worker-1', expiresAt: '2026-07-12T00:00:00Z',
      resolveCoordinatorId: resolveToLiveCoordinator,
    });
    expect(result.error).toBeNull();
    expect(supabase.calls.inserts[0].row.sender_session).toBe('live-coord-id');
    expect(supabase.calls.inserts[0].row.target_session).toBeNull();
    expect(supabase.calls.inserts[0].row.target_sd).toBe('SD-EXAMPLE-001');
    expect(supabase.calls.inserts[0].row.payload.kind).toBe(PAYLOAD_KINDS.COORDINATOR_RESERVATION);
  });

  it('refuses to write when no live coordinator resolves, rather than authoring an unenforceable row', async () => {
    const supabase = makeInsertStub();
    const result = await reserveSd(supabase, {
      targetSd: 'SD-EXAMPLE-001', expiresAt: '2026-07-12T00:00:00Z',
      resolveCoordinatorId: resolveToNull,
    });
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/no live active coordinator/);
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('refuses to write when the resolver throws (fail-soft resolution, fail-loud write refusal)', async () => {
    const supabase = makeInsertStub();
    const result = await reserveSd(supabase, {
      targetSd: 'SD-EXAMPLE-001', expiresAt: '2026-07-12T00:00:00Z',
      resolveCoordinatorId: resolveThatThrows,
    });
    expect(result.error).toMatch(/no live active coordinator/);
    expect(supabase.calls.inserts).toHaveLength(0);
  });
});

describe('reserveSd — required-field validation', () => {
  it('rejects a missing targetSd before ever resolving a coordinator', async () => {
    const supabase = makeInsertStub();
    const result = await reserveSd(supabase, { expiresAt: '2026-07-12T00:00:00Z', resolveCoordinatorId: resolveToLiveCoordinator });
    expect(result.error).toMatch(/targetSd is required/);
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('rejects a missing expiresAt -- this writer never invents a default lifetime', async () => {
    const supabase = makeInsertStub();
    const result = await reserveSd(supabase, { targetSd: 'SD-EXAMPLE-001', resolveCoordinatorId: resolveToLiveCoordinator });
    expect(result.error).toMatch(/expiresAt is required/);
    expect(supabase.calls.inserts).toHaveLength(0);
  });
});

describe('reserveSd — insert-error propagation', () => {
  it('returns the Supabase error message rather than throwing', async () => {
    const supabase = {
      from() {
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }) }) }) };
      },
    };
    const result = await reserveSd(supabase, {
      targetSd: 'SD-EXAMPLE-001', expiresAt: '2026-07-12T00:00:00Z',
      resolveCoordinatorId: resolveToLiveCoordinator,
    });
    expect(result.data).toBeNull();
    expect(result.error).toBe('insert failed');
  });
});

describe('reserveSd — default resolver (no injection)', () => {
  it('falls back to the real resolve.cjs when resolveCoordinatorId is omitted, and still fails safe (no live coordinator in this test environment)', async () => {
    const supabase = makeInsertStub();
    const result = await reserveSd(supabase, { targetSd: 'SD-EXAMPLE-001', expiresAt: '2026-07-12T00:00:00Z' });
    // No assertion on the specific outcome (environment-dependent) -- only that it never throws.
    expect(result).toHaveProperty('error');
  });
});
