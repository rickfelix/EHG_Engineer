// SD-LEO-INFRA-FLEET-WATCHDOG-001 — pure watchdog classifier + badge + fail-soft adapter (U5).
import { describe, it, expect } from 'vitest';
import { classifyWatchdogState, summarizeWatchdog, tableAbsent, runWatchdog } from '../../../lib/fleet/session-watchdog.js';

const NOW = 1_750_000_000_000;
const STALE = 5 * 60 * 1000; // 5 min
const ago = (ms) => new Date(NOW - ms).toISOString();
const ctx = (over = {}) => ({ nowMs: NOW, staleThresholdMs: STALE, isPidAlive: () => false, isWithinArmedSilence: () => false, ...over });

describe('watchdog classifier (FR-1, U5 distinct states)', () => {
  it('ALIVE on a fresh heartbeat', () => {
    expect(classifyWatchdogState({ session_id: 'a', heartbeat_at: ago(1000) }, ctx()).state).toBe('ALIVE');
  });
  it('STOPPED when stale but intentionally parked (never CRASHED)', () => {
    const parkedAwaiting = classifyWatchdogState({ session_id: 'p1', heartbeat_at: ago(STALE * 2), loop_state: 'awaiting_tick' }, ctx({ isPidAlive: () => false }));
    expect(parkedAwaiting.state).toBe('STOPPED');
    expect(parkedAwaiting.remediation).toBeNull();
    const released = classifyWatchdogState({ session_id: 'p2', heartbeat_at: ago(STALE * 2), status: 'released' }, ctx());
    expect(released.state).toBe('STOPPED');
    const armed = classifyWatchdogState({ session_id: 'p3', heartbeat_at: ago(STALE * 2), expected_silence_until: ago(-1000) }, ctx({ isWithinArmedSilence: () => true }));
    expect(armed.state).toBe('STOPPED');
  });
  it('AUTH-LOST when stale + not parked + PID ALIVE (wake-from-sleep/logout class)', () => {
    const r = classifyWatchdogState({ session_id: 'w', heartbeat_at: ago(STALE * 3), pid: 123 }, ctx({ isPidAlive: () => true }));
    expect(r.state).toBe('AUTH-LOST');
    expect(r.remediation).toMatch(/re-auth/);
  });
  it('CRASHED when stale + not parked + PID DEAD', () => {
    const r = classifyWatchdogState({ session_id: 'c', heartbeat_at: ago(STALE * 3), pid: 456 }, ctx({ isPidAlive: () => false }));
    expect(r.state).toBe('CRASHED');
    expect(r.remediation).toMatch(/restart/);
  });
  it('missing heartbeat_at → treated as infinitely stale', () => {
    expect(classifyWatchdogState({ session_id: 'x' }, ctx({ isPidAlive: () => true })).state).toBe('AUTH-LOST');
  });
});

describe('watchdog badge summary (FR-3)', () => {
  it('counts all states; actionable = CRASHED + AUTH-LOST only', () => {
    const classified = [
      { state: 'ALIVE', session_id: 'a' },
      { state: 'STOPPED', session_id: 's' },
      { state: 'AUTH-LOST', session_id: 'w', remediation: 're-auth' },
      { state: 'CRASHED', session_id: 'c', remediation: 'restart' },
      { state: 'CRASHED', session_id: 'c2', remediation: 'restart' },
    ];
    const sum = summarizeWatchdog(classified);
    expect(sum.counts).toEqual({ CRASHED: 2, 'AUTH-LOST': 1, STOPPED: 1, ALIVE: 1 });
    expect(sum.actionable.map((a) => a.session_id).sort()).toEqual(['c', 'c2', 'w']);
    expect(sum.actionable.every((a) => a.remediation)).toBe(true);
  });
  it('empty input → zeroed counts, empty actionable', () => {
    expect(summarizeWatchdog().counts).toEqual({ CRASHED: 0, 'AUTH-LOST': 0, STOPPED: 0, ALIVE: 0 });
    expect(summarizeWatchdog([]).actionable).toEqual([]);
  });
});

describe('watchdog adapter (FR-2) + tableAbsent', () => {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: runWatchdog now reads via
  // fetchAllPaginated, which calls queryFactory().range(offset, to) after .order() — the mock
  // must be chainable through order()/range() rather than resolving directly off select().
  const fakeSupabase = ({ rows = [], absent = false } = {}) => ({
    from: () => ({ select: () => ({ order: () => ({ range: () => absent
      ? Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "claude_sessions" does not exist' } })
      : Promise.resolve({ data: rows, error: null }) }) }) }),
  });
  it('classifies live rows via injected isPidAlive', async () => {
    const rows = [
      { session_id: 'a', heartbeat_at: ago(1000) },
      { session_id: 'c', heartbeat_at: ago(STALE * 3), pid: 9 },
    ];
    const res = await runWatchdog({ supabase: fakeSupabase({ rows }), isPidAlive: () => false }, { nowMs: NOW, staleThresholdMs: STALE });
    expect(res.counts.ALIVE).toBe(1);
    expect(res.counts.CRASHED).toBe(1);
  });
  it('fail-soft on absent table → inert empty set, no throw', async () => {
    const res = await runWatchdog({ supabase: fakeSupabase({ absent: true }) }, { nowMs: NOW, staleThresholdMs: STALE });
    expect(res.inert).toBe(true);
    expect(res.total).toBe(0);
  });
  it('tableAbsent detects 42P01/PGRST205', () => {
    expect(tableAbsent({ code: '42P01' })).toBe(true);
    expect(tableAbsent({ code: 'PGRST205' })).toBe(true);
    expect(tableAbsent(null)).toBe(false);
  });
  it('tableAbsent detects the real-world PGRST205 "schema cache" message shape even when .code is dropped (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 adversarial-review fix)', () => {
    expect(tableAbsent({ message: "fetchAllPaginated: page at offset 0 failed: Could not find the table 'public.claude_sessions' in the schema cache" })).toBe(true);
  });
  it('fail-soft on a PGRST205-shaped ("schema cache") error routed through fetchAllPaginated → inert, not error', async () => {
    const supabase = {
      from: () => ({ select: () => ({ order: () => ({ range: () => Promise.resolve({
        data: null,
        error: { message: "Could not find the table 'public.claude_sessions' in the schema cache" },
      }) }) }) }),
    };
    const res = await runWatchdog({ supabase }, { nowMs: NOW, staleThresholdMs: STALE });
    expect(res.inert).toBe(true);
    expect(res.total).toBe(0);
  });
});
