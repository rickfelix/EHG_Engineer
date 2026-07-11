/**
 * SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B FR-1 -- unit coverage for
 * lib/periodic-liveness/owner-target-resolver.mjs.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveOwnerTarget, candidatePeerKey } from '../../../lib/periodic-liveness/owner-target-resolver.mjs';

describe('candidatePeerKey', () => {
  it('strips known suffixes to recover a known peer key', () => {
    expect(candidatePeerKey('coordinator-fleet')).toBe('coordinator');
    expect(candidatePeerKey('adam-fleet')).toBe('adam');
    expect(candidatePeerKey('solomon-fleet')).toBe('solomon');
  });

  it('matches a bare known peer key with no suffix', () => {
    expect(candidatePeerKey('coordinator')).toBe('coordinator');
  });

  it('returns null for labels with no known-peer match', () => {
    expect(candidatePeerKey('eva-scheduler')).toBeNull();
    expect(candidatePeerKey('chairman-fleet')).toBeNull();
    expect(candidatePeerKey('ops-product-health-collector')).toBeNull();
    expect(candidatePeerKey('venture-uptime-probe')).toBeNull();
  });
});

describe('resolveOwnerTarget', () => {
  it('resolves a known live owner label to its session target', async () => {
    const resolvePeer = vi.fn().mockResolvedValue({ kind: 'session', target: 'sess-coordinator-1', live: true });
    const getCoordinatorId = vi.fn();
    const result = await resolveOwnerTarget({}, 'coordinator-fleet', { resolvePeer, getCoordinatorId });
    expect(result).toEqual({ kind: 'session', target: 'sess-coordinator-1', resolvedPeer: 'coordinator', live: true });
    expect(getCoordinatorId).not.toHaveBeenCalled();
  });

  it('falls back to coordinator for an unknown owner label', async () => {
    const resolvePeer = vi.fn();
    const getCoordinatorId = vi.fn().mockResolvedValue('sess-coordinator-2');
    const result = await resolveOwnerTarget({}, 'eva-scheduler', { resolvePeer, getCoordinatorId });
    expect(resolvePeer).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'coordinator', target: 'sess-coordinator-2', resolvedPeer: null, live: true });
  });

  it('falls back to coordinator when the resolved owner session is not live (stale)', async () => {
    const resolvePeer = vi.fn().mockResolvedValue({ kind: 'session', target: 'sess-stale', live: false });
    const getCoordinatorId = vi.fn().mockResolvedValue('sess-coordinator-3');
    const result = await resolveOwnerTarget({}, 'adam-fleet', { resolvePeer, getCoordinatorId });
    expect(result).toEqual({ kind: 'coordinator', target: 'sess-coordinator-3', resolvedPeer: 'adam', live: true });
  });

  it('falls back to broadcast-coordinator when even the coordinator cannot be resolved', async () => {
    const resolvePeer = vi.fn();
    const getCoordinatorId = vi.fn().mockResolvedValue(null);
    const result = await resolveOwnerTarget({}, 'chairman-fleet', { resolvePeer, getCoordinatorId });
    expect(result).toEqual({ kind: 'coordinator', target: 'broadcast-coordinator', resolvedPeer: null, live: false });
  });

  it('falls back to coordinator when the peer resolver throws', async () => {
    const resolvePeer = vi.fn().mockRejectedValue(new Error('boom'));
    const getCoordinatorId = vi.fn().mockResolvedValue('sess-coordinator-4');
    const result = await resolveOwnerTarget({}, 'solomon-fleet', { resolvePeer, getCoordinatorId });
    expect(result).toEqual({ kind: 'coordinator', target: 'sess-coordinator-4', resolvedPeer: 'solomon', live: true });
  });
});
