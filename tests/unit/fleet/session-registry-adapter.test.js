/**
 * SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001 FR-8: DB adapter over SD-A's pure registry/manifest libs (TS-6).
 */
import { describe, it, expect } from 'vitest';
import {
  loadLiveSessionIdentity,
  joinLiveSessionIdentity,
  resolveLiveSession,
  actualByRole,
  computeLiveManifestDrift,
  loadLiveSlotIdentity,
  computeLiveSlotDrift,
} from '../../../lib/fleet/session-registry-adapter.js';

function makeFakeSupabase(sessions, error = null) {
  return {
    from(table) {
      expect(table).toBe('claude_sessions');
      return {
        select() {
          return { in: async () => ({ data: sessions, error }) };
        },
      };
    },
  };
}

describe('loadLiveSessionIdentity', () => {
  it('derives callsign from the SET_IDENTITY row (metadata.fleet_identity.callsign), never a column', async () => {
    const sb = makeFakeSupabase([
      { session_id: 's1', pid: 111, metadata: { fleet_identity: { callsign: 'Alpha-5' } } },
      { session_id: 's2', pid: 222, metadata: {} },
    ]);
    const { sessions, callsignBySession } = await loadLiveSessionIdentity(sb);
    expect(sessions).toHaveLength(2);
    expect(callsignBySession).toEqual({ s1: 'Alpha-5' });
  });

  it('fails soft to an empty set on a DB error', async () => {
    const sb = makeFakeSupabase(null, { code: '42P01', message: 'relation does not exist' });
    const result = await loadLiveSessionIdentity(sb);
    expect(result.sessions).toEqual([]);
    expect(result.callsignBySession).toEqual({});
  });
});

describe('joinLiveSessionIdentity + resolveLiveSession (collision-visible, TS-6)', () => {
  it('resolves a unique callsign to one identity', async () => {
    const sb = makeFakeSupabase([
      { session_id: 's1', pid: 111, metadata: { fleet_identity: { callsign: 'Alpha-5' } } },
    ]);
    const result = await resolveLiveSession(sb, { by: 'callsign', value: 'Alpha-5' });
    expect(result.resolved).toBe(true);
    expect(result.identity.session_id).toBe('s1');
  });

  it('surfaces ambiguous when two sessions collide on the same key (never silently picks one)', async () => {
    const sb = makeFakeSupabase([
      { session_id: 's1', pid: 111, metadata: { fleet_identity: { callsign: 'Alpha-5' } } },
      { session_id: 's2', pid: 222, metadata: { fleet_identity: { callsign: 'Alpha-5' } } },
    ]);
    const joined = await joinLiveSessionIdentity(sb);
    expect(joined).toHaveLength(2);
    const result = await resolveLiveSession(sb, { by: 'callsign', value: 'Alpha-5' });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('ambiguous');
  });

  it('surfaces not_found for a card with no matching live session', async () => {
    const sb = makeFakeSupabase([]);
    const result = await resolveLiveSession(sb, { by: 'callsign', value: 'Ghost-1' });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('not_found');
  });
});

describe('actualByRole + computeLiveManifestDrift (TS-6)', () => {
  const roleOf = (callsign) => (callsign === 'Coordinator-1' ? 'coordinator' : callsign?.startsWith('Alpha') ? 'worker' : null);

  it('identifies under-staffed roles from live data', async () => {
    const sb = makeFakeSupabase([
      { session_id: 's1', metadata: { fleet_identity: { callsign: 'Alpha-5' } } },
    ]);
    const verdict = await computeLiveManifestDrift(sb, {
      desired: [{ role: 'coordinator', min: 1 }, { role: 'worker', min: 2 }],
      roleOf,
    });
    expect(verdict.drift).toBe(true);
    expect(verdict.under).toEqual(
      expect.arrayContaining([
        { role: 'coordinator', desired: 1, actual: 0 },
        { role: 'worker', desired: 2, actual: 1 },
      ]),
    );
  });

  it('reports satisfied when live counts meet the desired minimums', async () => {
    const sb = makeFakeSupabase([
      { session_id: 's1', metadata: { fleet_identity: { callsign: 'Coordinator-1' } } },
    ]);
    const verdict = await computeLiveManifestDrift(sb, { desired: [{ role: 'coordinator', min: 1 }], roleOf });
    expect(verdict.drift).toBe(false);
  });

  it('actualByRole ignores identities with no resolvable role', () => {
    const joined = [{ callsign: 'Alpha-5' }, { callsign: null }, { callsign: 'Unknown-9' }];
    expect(actualByRole(joined, roleOf)).toEqual({ worker: 1 });
  });
});

// DESIRED-STATE SLOT DRIFT (SD-LEO-INFRA-LEO-COMPLETION-001-B, FR-1/FR-2) — the real call-site that
// discharges the "new schema is actually called, not dead code" acceptance criterion (TS-3a).
describe('loadLiveSlotIdentity + computeLiveSlotDrift (FR-1/FR-2)', () => {
  it('loadLiveSlotIdentity reads name (callsign) + slot fields from claude_sessions.metadata', async () => {
    const sb = makeFakeSupabase([
      { session_id: 's1', metadata: { fleet_identity: { callsign: 'Alpha-5', color: 'blue' }, role: 'worker', account_profile: 'default', model: 'sonnet', effort: 'high', worktree: 'C:/wt/a5', resume_uuid: 'u1' } },
      { session_id: 's2', metadata: {} },
    ]);
    const slots = await loadLiveSlotIdentity(sb);
    expect(slots).toEqual([
      { name: 'Alpha-5', color: 'blue', role: 'worker', account_profile: 'default', model: 'sonnet', effort: 'high', worktree: 'C:/wt/a5', resume_uuid: 'u1' },
    ]);
  });

  it('computeLiveSlotDrift: MISSING slot surfaced when no live session matches the desired name', async () => {
    const sb = makeFakeSupabase([]);
    const verdict = await computeLiveSlotDrift(sb, { desiredSlots: [{ name: 'Alpha-5', account_profile: 'default' }] });
    expect(verdict.drift).toBe(true);
    expect(verdict.missing).toEqual([{ name: 'Alpha-5' }]);
  });

  it('computeLiveSlotDrift: satisfied + field mismatch surfaced when live data diverges from desired', async () => {
    const sb = makeFakeSupabase([
      { session_id: 's1', metadata: { fleet_identity: { callsign: 'Alpha-5' }, model: 'opus' } },
    ]);
    const verdict = await computeLiveSlotDrift(sb, { desiredSlots: [{ name: 'Alpha-5', model: 'sonnet' }] });
    expect(verdict.drift).toBe(false);
    expect(verdict.present).toEqual([{ name: 'Alpha-5', mismatches: ['model'] }]);
  });
});
