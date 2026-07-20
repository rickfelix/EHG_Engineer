/**
 * QF-20260719-662 — assertFleetAssignmentTarget choke guard.
 * A WORK_ASSIGNMENT must target a FLEET WORKER: a role singleton
 * (non_fleet / role=adam / is_coordinator) never claims work_assignment rows,
 * so the dispatch would sit invisible (live incident b8eb6111 → Adam c514430f).
 * Same chain-stub convention as dispatch-topic-id.test.js at this choke point.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { assertFleetAssignmentTarget } = require('../../../lib/coordinator/dispatch.cjs');

const silentLog = { warn() {}, error() {}, log() {} };

function fakeSupabaseWithSession(sessRow, { throwOnLookup = false } = {}) {
  return {
    from() {
      if (throwOnLookup) throw new Error('lookup exploded');
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: sessRow, error: null }); },
      };
      return chain;
    },
  };
}

const waRow = (target = 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000') => ({
  message_type: 'WORK_ASSIGNMENT',
  target_session: target,
  payload: { assigned_sd: 'QF-20260719-162' },
});

describe('assertFleetAssignmentTarget (QF-20260719-662)', () => {
  it('REFUSES a WORK_ASSIGNMENT to an is_coordinator target (fail-closed, typed code)', async () => {
    const sb = fakeSupabaseWithSession({ metadata: { is_coordinator: true } });
    await expect(assertFleetAssignmentTarget(sb, waRow(), silentLog))
      .rejects.toMatchObject({ code: 'DISPATCH_NON_FLEET_TARGET' });
  });

  it('REFUSES a WORK_ASSIGNMENT to a non_fleet role singleton (the Adam incident shape)', async () => {
    const sb = fakeSupabaseWithSession({ metadata: { non_fleet: true, role: 'adam' } });
    await expect(assertFleetAssignmentTarget(sb, waRow(), silentLog))
      .rejects.toMatchObject({ code: 'DISPATCH_NON_FLEET_TARGET' });
  });

  it('allows a WORK_ASSIGNMENT to a plain fleet worker', async () => {
    const sb = fakeSupabaseWithSession({ metadata: { fleet_identity: 'Alpha-2', model: 'opus' } });
    await expect(assertFleetAssignmentTarget(sb, waRow(), silentLog)).resolves.toBeUndefined();
  });

  it('bails without any lookup for non-WORK_ASSIGNMENT rows', async () => {
    let looked = false;
    const sb = { from() { looked = true; throw new Error('should not be called'); } };
    await assertFleetAssignmentTarget(sb, { message_type: 'coordinator_reply', target_session: 'x' }, silentLog);
    expect(looked).toBe(false);
  });

  it('fail-open on unknown/sentinel target (no session row)', async () => {
    const sb = fakeSupabaseWithSession(null);
    await expect(assertFleetAssignmentTarget(sb, waRow('broadcast-coordinator'), silentLog)).resolves.toBeUndefined();
  });

  it('fail-open on a lookup fault (transient DB error never blocks a real dispatch)', async () => {
    const sb = fakeSupabaseWithSession(null, { throwOnLookup: true });
    await expect(assertFleetAssignmentTarget(sb, waRow(), silentLog)).resolves.toBeUndefined();
  });
});
