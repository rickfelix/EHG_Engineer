/**
 * SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B FR-3 -- unit coverage for
 * lib/periodic-liveness/ladder-escalation.mjs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  incrementConsecutiveMiss,
  resetConsecutiveMiss,
  emitCoordinatorRung,
  climbLadder,
  emitLadderDigest,
} from '../../../lib/periodic-liveness/ladder-escalation.mjs';

describe('incrementConsecutiveMiss', () => {
  it('returns the incremented count on success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const result = await incrementConsecutiveMiss({}, 'proc-1', { rpc });
    expect(result).toEqual({ ok: true, count: 2 });
    expect(rpc).toHaveBeenCalledWith('periodic_registry_increment_consecutive_miss', { p_process_key: 'proc-1' });
  });

  it('normalizes an array-wrapped scalar RPC response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [3], error: null });
    const result = await incrementConsecutiveMiss({}, 'proc-1', { rpc });
    expect(result).toEqual({ ok: true, count: 3 });
  });

  it('fails soft (does not throw) when the migration has not landed yet', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'function periodic_registry_increment_consecutive_miss does not exist' } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await incrementConsecutiveMiss({}, 'proc-1', { rpc });
    expect(result.ok).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('LADDER ESCALATION DISABLED'));
    errSpy.mockRestore();
  });

  it('fails soft on a thrown exception', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network blip'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await incrementConsecutiveMiss({}, 'proc-1', { rpc });
    expect(result).toEqual({ ok: false, reason: 'network blip' });
    errSpy.mockRestore();
  });
});

describe('resetConsecutiveMiss', () => {
  it('updates the row to 0', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: () => ({ update }) };
    await resetConsecutiveMiss(supabase, 'proc-1');
    expect(update).toHaveBeenCalledWith({ consecutive_miss_count: 0 });
    expect(eq).toHaveBeenCalledWith('process_key', 'proc-1');
  });

  it('fails soft on error (never throws)', async () => {
    const supabase = { from: () => { throw new Error('down'); } };
    await expect(resetConsecutiveMiss(supabase, 'proc-1')).resolves.toBeUndefined();
  });
});

describe('emitCoordinatorRung', () => {
  it('skips when the owner target already IS the coordinator (kind marker)', async () => {
    const supabase = { from: vi.fn() };
    const result = await emitCoordinatorRung(supabase, { process_key: 'p1' }, { kind: 'coordinator' });
    expect(result).toEqual({ emitted: false, reason: 'owner_already_coordinator' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  // Adversarial-review regression (PR #5940, HIGH): a SUCCESSFULLY resolved owner label that
  // happens to BE the coordinator peer comes back as kind:'session', resolvedPeer:'coordinator'
  // -- the original guard (kind==='coordinator' only) missed this and would have fired a
  // redundant ladder rung on top of the owner-first message, both to the same coordinator.
  it('skips when the owner target resolved TO the coordinator peer (resolvedPeer marker, kind still session)', async () => {
    const supabase = { from: vi.fn() };
    const result = await emitCoordinatorRung(supabase, { process_key: 'p1' }, { kind: 'session', target: 'sess-coord', resolvedPeer: 'coordinator', live: true });
    expect(result).toEqual({ emitted: false, reason: 'owner_already_coordinator' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('inserts a coordinator-targeted row when owner is a non-coordinator session', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ insert }) };
    const getCoordinatorId = vi.fn().mockResolvedValue('sess-coord');
    const result = await emitCoordinatorRung(supabase, { process_key: 'p1', display_name: 'P1', owner: 'adam-fleet' }, { kind: 'session', target: 'sess-adam', resolvedPeer: 'adam' }, { getCoordinatorId });
    expect(result.emitted).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ target_session: 'sess-coord', payload: expect.objectContaining({ rung: 'coordinator', process_key: 'p1' }) }));
  });

  it('fails soft (does not throw) on an insert exception', async () => {
    const supabase = { from: () => ({ insert: () => { throw new Error('network blip'); } }) };
    const getCoordinatorId = vi.fn().mockResolvedValue('sess-coord');
    const result = await emitCoordinatorRung(supabase, { process_key: 'p1' }, { kind: 'session', target: 'sess-adam', resolvedPeer: 'adam' }, { getCoordinatorId });
    expect(result.emitted).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('climbLadder', () => {
  it('does not ladder below threshold', async () => {
    const increment = vi.fn().mockResolvedValue({ ok: true, count: 0 });
    const emitCoordRung = vi.fn();
    const result = await climbLadder({ supabase: {}, row: { process_key: 'p1' }, ownerTarget: { kind: 'session' }, deps: { increment, emitCoordRung } });
    expect(result).toEqual({ laddered: false, reason: 'below_ladder_threshold', count: 0 });
    expect(emitCoordRung).not.toHaveBeenCalled();
  });

  it('ladders and fires the coordinator rung at threshold (count=1 -- the first non-transition tick IS the second consecutive miss)', async () => {
    const increment = vi.fn().mockResolvedValue({ ok: true, count: 1 });
    const emitCoordRung = vi.fn().mockResolvedValue({ emitted: true });
    const result = await climbLadder({ supabase: {}, row: { process_key: 'p1' }, ownerTarget: { kind: 'session' }, deps: { increment, emitCoordRung } });
    expect(result.laddered).toBe(true);
    expect(result.count).toBe(1);
    expect(emitCoordRung).toHaveBeenCalled();
  });

  // Adversarial-review regression (PR #5940, MEDIUM-HIGH): the counter only ever grows while
  // OVERDUE persists, so an "at or past threshold" check would fire the coordinator rung on
  // EVERY subsequent tick forever. Once-per-episode: only the tick where count EXACTLY equals
  // the threshold ladders; later ticks (count=2, 3, ...) must not re-fire.
  it('does not re-ladder on ticks past the threshold (fires once per escalation episode)', async () => {
    const increment = vi.fn().mockResolvedValue({ ok: true, count: 2 });
    const emitCoordRung = vi.fn();
    const result = await climbLadder({ supabase: {}, row: { process_key: 'p1' }, ownerTarget: { kind: 'session' }, deps: { increment, emitCoordRung } });
    expect(result).toEqual({ laddered: false, reason: 'already_laddered_this_episode', count: 2 });
    expect(emitCoordRung).not.toHaveBeenCalled();
  });

  it('does not ladder when the increment fails soft', async () => {
    const increment = vi.fn().mockResolvedValue({ ok: false, reason: 'column does not exist' });
    const emitCoordRung = vi.fn();
    const result = await climbLadder({ supabase: {}, row: { process_key: 'p1' }, ownerTarget: { kind: 'session' }, deps: { increment, emitCoordRung } });
    expect(result).toEqual({ laddered: false, reason: 'column does not exist' });
    expect(emitCoordRung).not.toHaveBeenCalled();
  });
});

describe('emitLadderDigest', () => {
  let recordPending;
  let escalate;

  beforeEach(() => {
    recordPending = vi.fn().mockResolvedValue({ id: 'decision-1', escalated: true });
    escalate = vi.fn().mockResolvedValue({ escalated: true });
  });

  it('no-ops for an empty candidate list', async () => {
    const result = await emitLadderDigest({}, [], { recordPending, escalate });
    expect(result).toEqual({ emitted: false });
    expect(recordPending).not.toHaveBeenCalled();
  });

  it('creates ONE digest row for multiple candidates in the same tick', async () => {
    const findExisting = vi.fn().mockResolvedValue(null);
    const candidates = [{ process_key: 'p1', display_name: 'P1' }, { process_key: 'p2', display_name: 'P2' }];
    const result = await emitLadderDigest({}, candidates, { findExisting, recordPending, escalate });
    expect(recordPending).toHaveBeenCalledTimes(1);
    expect(recordPending).toHaveBeenCalledWith({}, expect.objectContaining({
      title: 'Periodic-liveness ladder: 2 processes escalated',
      blocking: true,
      context: { process_keys: ['p1', 'p2'] },
    }));
    expect(result).toEqual({ emitted: true, decisionId: 'decision-1', refreshed: false, escalated: true });
  });

  it('refreshes an existing pending digest in place instead of creating a new row', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const supabase = { from: () => ({ update }) };
    const findExisting = vi.fn().mockResolvedValue({ id: 'decision-existing', brief_data: { foo: 'bar' } });
    const candidates = [{ process_key: 'p1', display_name: 'P1' }];
    const result = await emitLadderDigest(supabase, candidates, { findExisting, recordPending, escalate });
    expect(recordPending).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Periodic-liveness ladder: P1' }));
    expect(escalate).toHaveBeenCalledWith(supabase, 'decision-existing');
    expect(result).toEqual({ emitted: true, decisionId: 'decision-existing', refreshed: true, escalated: true });
  });

  it('throws if the caller does not inject recordPending/escalate deps', async () => {
    await expect(emitLadderDigest({}, [{ process_key: 'p1' }])).rejects.toThrow(/requires recordPending and escalate/);
  });

  // Adversarial-review regression (PR #5940, HIGH): ports lib/adam/stall-alert.js's
  // QF-20260710-818 fix. Without this, dismissing the digest (moving it off 'pending') gets
  // immediately re-escalated on the very next tick while the underlying processes are still
  // overdue, defeating the dismissal.
  it('suppresses re-escalation when a recently-dismissed digest overlaps the current candidates', async () => {
    const findExisting = vi.fn().mockResolvedValue(null);
    const findDismissed = vi.fn().mockResolvedValue({ id: 'decision-dismissed', updated_at: new Date().toISOString() });
    const candidates = [{ process_key: 'p1', display_name: 'P1' }];
    const result = await emitLadderDigest({}, candidates, { findExisting, findDismissed, recordPending, escalate });
    expect(recordPending).not.toHaveBeenCalled();
    expect(result).toEqual({ emitted: true, decisionId: 'decision-dismissed', refreshed: false, escalated: false, suppressed: true });
  });

  it('does NOT suppress and creates a new digest when no dismissed digest overlaps', async () => {
    const findExisting = vi.fn().mockResolvedValue(null);
    const findDismissed = vi.fn().mockResolvedValue(null);
    const candidates = [{ process_key: 'p1', display_name: 'P1' }];
    const result = await emitLadderDigest({}, candidates, { findExisting, findDismissed, recordPending, escalate });
    expect(recordPending).toHaveBeenCalledTimes(1);
    expect(result.emitted).toBe(true);
    expect(result.suppressed).toBeUndefined();
  });

  it('fails soft (does not throw) when the underlying chairman_decisions calls error out', async () => {
    const findExisting = vi.fn().mockRejectedValue(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await emitLadderDigest({}, [{ process_key: 'p1' }], { findExisting, recordPending, escalate });
    expect(result.emitted).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    errSpy.mockRestore();
  });
});
