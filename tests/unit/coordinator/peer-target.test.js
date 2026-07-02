/**
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-4
 *
 * lib/coordinator/peer-target.cjs -- the single shared peer-resolution module
 * closing the incident #2 root cause (both advisory scripts hardcoded
 * target=coordinatorId, so a reply could never target the asker session directly).
 * Deps are injected (no vi.mock on nested CJS requires -- an intentionally
 * testable seam, mirroring receipts.cjs / pending-question-timer.cjs).
 */
import { describe, it, expect, vi } from 'vitest';
import { resolvePeerTarget, PEER_KINDS } from '../../../lib/coordinator/peer-target.cjs';

const supabase = {};

describe('PEER_KINDS registry', () => {
  it('classifies adam/solomon/coordinator as session-class and eva/ceo as relay-class', () => {
    expect(PEER_KINDS.adam.class).toBe('session');
    expect(PEER_KINDS.solomon.class).toBe('session');
    expect(PEER_KINDS.coordinator.class).toBe('session');
    expect(PEER_KINDS.eva.class).toBe('relay');
    expect(PEER_KINDS.ceo.class).toBe('relay');
  });
});

describe('resolvePeerTarget — session-class peers (TS-1)', () => {
  it('resolves a live adam session (no originator -- fresh send)', async () => {
    const deps = { getActiveAdamId: vi.fn().mockResolvedValue('adam-session-live') };
    const result = await resolvePeerTarget(supabase, 'adam', {}, deps);
    expect(result).toEqual({ kind: 'session', target: 'adam-session-live', sentinel: 'broadcast-adam', peer: 'adam', live: true, retargeted: false, relayVia: null });
  });

  it('resolves a live solomon session (no originator)', async () => {
    const deps = { getActiveSolomonId: vi.fn().mockResolvedValue('solomon-session-live') };
    const result = await resolvePeerTarget(supabase, 'solomon', {}, deps);
    expect(result.kind).toBe('session');
    expect(result.target).toBe('solomon-session-live');
    expect(result.live).toBe(true);
  });

  it('resolves the coordinator via getActiveCoordinatorId', async () => {
    const deps = { getActiveCoordinatorId: vi.fn().mockResolvedValue('coord-session-live') };
    const result = await resolvePeerTarget(supabase, 'coordinator', {}, deps);
    expect(result.target).toBe('coord-session-live');
  });

  it('peer names are case-insensitive', async () => {
    const deps = { getActiveAdamId: vi.fn().mockResolvedValue('adam-session-live') };
    const result = await resolvePeerTarget(supabase, 'ADAM', {}, deps);
    expect(result.peer).toBe('adam');
  });

  it('delegates to resolveAdamReplyTarget (prefer-live + retarget) when originator is set', async () => {
    const resolveAdamReplyTarget = vi.fn().mockResolvedValue({ target: 'adam-live', live: 'adam-live', originator: 'adam-stale', retargeted: true });
    const result = await resolvePeerTarget(supabase, 'adam', { originator: 'adam-stale' }, { resolveAdamReplyTarget });
    expect(resolveAdamReplyTarget).toHaveBeenCalledWith(supabase, 'adam-stale', {});
    expect(result.target).toBe('adam-live');
    expect(result.retargeted).toBe(true);
  });

  it('delegates to resolveSolomonReplyTarget when originator is set', async () => {
    const resolveSolomonReplyTarget = vi.fn().mockResolvedValue({ target: 'solomon-live', live: 'solomon-live', originator: 'solomon-stale', retargeted: true });
    const result = await resolvePeerTarget(supabase, 'solomon', { originator: 'solomon-stale' }, { resolveSolomonReplyTarget });
    expect(resolveSolomonReplyTarget).toHaveBeenCalledWith(supabase, 'solomon-stale', {});
    expect(result.retargeted).toBe(true);
  });
});

describe('resolvePeerTarget — relay-class peers (TS-2)', () => {
  it('returns kind:relay for eva without calling any session resolver', async () => {
    const getActiveAdamId = vi.fn();
    const result = await resolvePeerTarget(supabase, 'eva', {}, { getActiveAdamId });
    expect(result).toEqual({ kind: 'relay', target: null, sentinel: null, peer: 'eva', live: false, retargeted: false, relayVia: 'coordinator' });
    expect(getActiveAdamId).not.toHaveBeenCalled();
  });

  it('returns kind:relay for ceo', async () => {
    const result = await resolvePeerTarget(supabase, 'ceo', {});
    expect(result.kind).toBe('relay');
    expect(result.relayVia).toBe('coordinator');
  });
});

describe('resolvePeerTarget — unknown peer', () => {
  it('throws a clear error listing known peers', async () => {
    await expect(resolvePeerTarget(supabase, 'nobody', {})).rejects.toThrow(/unknown peer "nobody"/);
  });
});

describe('resolvePeerTarget — adam falls back to its sentinel when no live session', () => {
  it('returns broadcast-adam when no live adam session exists', async () => {
    const deps = { getActiveAdamId: vi.fn().mockResolvedValue(null) };
    const result = await resolvePeerTarget(supabase, 'adam', {}, deps);
    expect(result.target).toBe('broadcast-adam');
    expect(result.live).toBe(false);
  });
});

describe('resolvePeerTarget — solomon falls back to its sentinel when no live session', () => {
  it('returns broadcast-solomon when no live solomon session exists', async () => {
    const deps = { getActiveSolomonId: vi.fn().mockResolvedValue(null) };
    const result = await resolvePeerTarget(supabase, 'solomon', {}, deps);
    expect(result.target).toBe('broadcast-solomon');
    expect(result.live).toBe(false);
  });
});
