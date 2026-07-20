// SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001 FR-1 — pure session-registry SSOT join/resolve.
// Fully in-memory (no DB, no supabase import): proves the 4-namespace join and the collision-VISIBLE
// resolution (the anti-Method-3-marker-collapse guarantee).
import { describe, it, expect } from 'vitest';
import { joinSessionIdentity, resolveSessionIdentity, tableAbsent } from '../../../lib/fleet/session-registry.js';

describe('session-registry SSOT (FR-1)', () => {
  const sessions = [
    { session_id: 's1', terminal_id: 't1', pid: 100 },
    { session_id: 's2', terminal_id: 't2', pid: 200 },
    { session_id: 's3', terminal_id: 't1', pid: 300 }, // shares terminal_id t1 with s1 (collision surface)
  ];
  const callsignBySession = { s1: 'Alpha', s2: 'Bravo' };

  it('joins the four namespaces (session_id/terminal_id/pid/callsign)', () => {
    const joined = joinSessionIdentity({ sessions, callsignBySession });
    expect(joined).toHaveLength(3);
    expect(joined[0]).toEqual({ session_id: 's1', terminal_id: 't1', pid: 100, callsign: 'Alpha' });
    expect(joined[2].callsign).toBeNull(); // s3 has no SET_IDENTITY callsign
  });

  it('resolves a unique key to exactly one identity', () => {
    const joined = joinSessionIdentity({ sessions, callsignBySession });
    const r = resolveSessionIdentity(joined, { by: 'session_id', value: 's2' });
    expect(r.resolved).toBe(true);
    expect(r.identity.callsign).toBe('Bravo');
  });

  it('COLLISION-VISIBLE: a terminal_id shared by two sessions resolves AMBIGUOUS, never a silent match', () => {
    const joined = joinSessionIdentity({ sessions, callsignBySession });
    const r = resolveSessionIdentity(joined, { by: 'terminal_id', value: 't1' });
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe('ambiguous');
    expect(r.count).toBe(2);
  });

  it('not_found / no_key are explicit (never a wrong guess)', () => {
    const joined = joinSessionIdentity({ sessions });
    expect(resolveSessionIdentity(joined, { by: 'session_id', value: 'nope' }).reason).toBe('not_found');
    expect(resolveSessionIdentity(joined, { by: 'session_id', value: '' }).reason).toBe('no_key');
    expect(resolveSessionIdentity(joined, {}).reason).toBe('no_key');
  });

  it('join is fail-safe on empty/absent input', () => {
    expect(joinSessionIdentity()).toEqual([]);
    expect(joinSessionIdentity({ sessions: null })).toEqual([]);
  });

  it('tableAbsent detects 42P01/PGRST205 (fail-soft), false otherwise', () => {
    expect(tableAbsent({ code: '42P01' })).toBe(true);
    expect(tableAbsent({ code: 'PGRST205' })).toBe(true);
    expect(tableAbsent({ message: 'relation "x" does not exist' })).toBe(true);
    expect(tableAbsent(null)).toBe(false);
    expect(tableAbsent({ code: '23505' })).toBe(false);
  });
});
