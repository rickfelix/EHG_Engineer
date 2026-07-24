// SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-5) — behavioral regression lock for the dead-vs-live
// force-reclaim discrimination (preserves QF-20260722-842 / 4d8fbb5; the source-structure test there
// did not exercise the decision behaviorally).
import { describe, it, expect } from 'vitest';
import { classifyOwnerLiveness } from '../../../lib/claim/owner-liveness.js';

const TTL = 15 * 60 * 1000; // 15m

describe('classifyOwnerLiveness — dead-vs-live force-reclaim discrimination', () => {
  it('LIVE owner (fresh heartbeat + active) is NOT reclaimable — --force-reclaim must refuse', () => {
    const r = classifyOwnerLiveness({ heartbeatAge: 30 * 1000, ownerSession: { status: 'active' }, ttlMs: TTL });
    expect(r.reclaimable).toBe(false);
    expect(r.live).toBe(true);
    expect(r.reason).toMatch(/live/);
  });

  it('STALE owner (heartbeat older than the TTL) IS reclaimable', () => {
    const r = classifyOwnerLiveness({ heartbeatAge: 20 * 60 * 1000, ownerSession: { status: 'active' }, ttlMs: TTL });
    expect(r.isStale).toBe(true);
    expect(r.reclaimable).toBe(true);
    expect(r.reason).toMatch(/stale/);
  });

  it('MISSING owner session IS reclaimable (no live owner to protect)', () => {
    const r = classifyOwnerLiveness({ heartbeatAge: Infinity, ownerSession: null, ttlMs: TTL });
    expect(r.isInactive).toBe(true);
    expect(r.reclaimable).toBe(true);
  });

  it('INACTIVE owner (status != active) IS reclaimable — current 4d8fbb5 behavior (see KNOWN TENSION)', () => {
    const r = classifyOwnerLiveness({ heartbeatAge: 5 * 1000, ownerSession: { status: 'idle' }, ttlMs: TTL });
    expect(r.isInactive).toBe(true);
    expect(r.reclaimable).toBe(true); // documents current behavior; the fresh-heartbeat-idle tension is flagged, not changed here
  });

  it('defaults a missing heartbeatAge to Infinity (stale) rather than throwing', () => {
    const r = classifyOwnerLiveness({ ownerSession: { status: 'active' }, ttlMs: TTL });
    expect(r.isStale).toBe(true);
    expect(r.reclaimable).toBe(true);
  });
});
