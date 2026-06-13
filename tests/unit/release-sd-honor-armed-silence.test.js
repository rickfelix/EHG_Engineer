/**
 * SD-LEO-INFRA-RELEASE-SD-HONOR-ARMED-SILENCE-001 — the 3rd/last armed-silence reaper seam.
 * Pins: the sd-next auto-release path honors a parked worker's armed-silence window (within-window ->
 * NOT reaped/phase-reset) while preserving the fail-safe (expired / over-cap / absent window -> still reaps).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { analyzeClaimRelationship, autoReleaseStaleDeadClaim } from '../../scripts/modules/sd-next/claim-analysis.js';
const require = createRequire(import.meta.url);
const { SILENCE_HARD_CAP_MS } = require('../../lib/fleet/silence-cap.cjs');

const NOW = Date.now();
const iso = (deltaMs) => new Date(NOW + deltaMs).toISOString();
// A claiming session that the STATUS path would auto-release (status=idle), with a dead-looking PID +
// stale heartbeat — so any 'not reaped' result is solely due to the armed-silence guard firing first.
const reapableSession = (overrides = {}) => ({ status: 'idle', heartbeat_age_seconds: 99999, pid: null, hostname: 'h', ...overrides });

describe('analyzeClaimRelationship — armed-silence guard (FR-1/FR-3)', () => {
  it('within the armed-silence window -> parked_armed_silence, NOT auto-releasable (even when status=idle)', () => {
    const r = analyzeClaimRelationship({ claimingSession: reapableSession({ expected_silence_until: iso(5 * 60 * 1000) }), currentSession: null });
    expect(r.relationship).toBe('parked_armed_silence');
    expect(r.canAutoRelease).toBe(false);
  });

  it('FAIL-SAFE: an EXPIRED window falls through -> stale_inactive, still auto-releasable', () => {
    const r = analyzeClaimRelationship({ claimingSession: reapableSession({ expected_silence_until: iso(-5 * 60 * 1000) }), currentSession: null });
    expect(r.relationship).toBe('stale_inactive');
    expect(r.canAutoRelease).toBe(true);
  });

  it('FAIL-SAFE: an OVER-CAP window (> SILENCE_HARD_CAP_MS) falls through -> still auto-releasable', () => {
    const r = analyzeClaimRelationship({ claimingSession: reapableSession({ expected_silence_until: iso(SILENCE_HARD_CAP_MS + 60 * 1000) }), currentSession: null });
    expect(r.canAutoRelease).toBe(true);
  });

  it('FAIL-SAFE: an ABSENT window falls through -> still auto-releasable', () => {
    const r = analyzeClaimRelationship({ claimingSession: reapableSession(), currentSession: null });
    expect(r.canAutoRelease).toBe(true);
  });

  it('a fresh-heartbeat foreign claim with no window is other_active (unaffected)', () => {
    const r = analyzeClaimRelationship({ claimingSession: { status: 'active', heartbeat_age_seconds: 1, pid: null, hostname: 'h' }, currentSession: null });
    expect(r.relationship).toBe('other_active');
    expect(r.canAutoRelease).toBe(false);
  });
});

// Fake supabase that records whether release_sd was invoked.
function fakeSb({ expectedSilenceUntil = null } = {}) {
  const calls = { rpc: [] };
  return {
    calls,
    from() {
      return { select() { return this; }, eq() { return this; }, maybeSingle: () => Promise.resolve({ data: { expected_silence_until: expectedSilenceUntil }, error: null }), update() { return { eq: () => Promise.resolve({ error: null }) }; } };
    },
    rpc(name, args) { calls.rpc.push({ name, args }); return Promise.resolve({ error: null }); },
  };
}

describe('autoReleaseStaleDeadClaim — authoritative DB-backed armed-silence gate (FR-1/FR-2/FR-3)', () => {
  it('within the armed-silence window -> SKIPS release_sd (returns false, no reap/phase-reset)', async () => {
    const sb = fakeSb({ expectedSilenceUntil: iso(5 * 60 * 1000) });
    const released = await autoReleaseStaleDeadClaim(sb, 'sess-parked');
    expect(released).toBe(false);
    expect(sb.calls.rpc.find((c) => c.name === 'release_sd')).toBeUndefined(); // never released
  });

  it('FAIL-SAFE: expired window -> release_sd IS called (genuinely-dead claim still reaps)', async () => {
    const sb = fakeSb({ expectedSilenceUntil: iso(-5 * 60 * 1000) });
    const released = await autoReleaseStaleDeadClaim(sb, 'sess-dead');
    expect(released).toBe(true);
    expect(sb.calls.rpc.find((c) => c.name === 'release_sd')).toBeDefined();
  });

  it('FAIL-SAFE: absent window -> release_sd IS called', async () => {
    const sb = fakeSb({ expectedSilenceUntil: null });
    const released = await autoReleaseStaleDeadClaim(sb, 'sess-dead');
    expect(released).toBe(true);
    expect(sb.calls.rpc.find((c) => c.name === 'release_sd')).toBeDefined();
  });
});
