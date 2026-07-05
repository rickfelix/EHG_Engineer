/**
 * QF-20260704-081 — HEADLESS_ZOMBIE discriminator.
 *
 * A pre-Cursor-crash claude process (PID 23348) survived windowless for 14.7h holding
 * QF-20260703-665: its parked loop kept waking->heartbeating->rescheduling, so every sweep
 * read it healthy, while terminal_id, tty, AND worktree_path were all NULL -- a binding
 * signature no real windowed session has. The sweep only aged heartbeats, so this
 * work-alive/comms-dead orphan was invisible until a human noticed the callsign had no window.
 *
 * These tests exercise ONLY the pure predicate -- no claude_sessions access, matching the
 * established pattern in stale-session-sweep-dormancy-gate.test.js.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isHeadlessZombie, HEADLESS_ZOMBIE_MIN_MS } = require('../../scripts/stale-session-sweep.cjs');

const NOW = Date.parse('2026-07-04T12:00:00Z');
const OLD_CLAIM = new Date(NOW - HEADLESS_ZOMBIE_MIN_MS - 60_000).toISOString(); // just past the threshold
const RECENT_CLAIM = new Date(NOW - 60_000).toISOString(); // 1 minute ago

describe('isHeadlessZombie', () => {
  it('flags a session with terminal_id/tty/worktree_path all null, claimed well past the threshold', () => {
    const session = { session_id: 's1', terminal_id: null, tty: null, claimed_at: OLD_CLAIM };
    expect(isHeadlessZombie(session, { worktree_path: null }, NOW)).toBe(true);
  });

  it('does NOT flag a real windowed session (terminal_id present)', () => {
    const session = { session_id: 's2', terminal_id: 'win-cc-13596-22408', tty: null, claimed_at: OLD_CLAIM };
    expect(isHeadlessZombie(session, { worktree_path: null }, NOW)).toBe(false);
  });

  it('does NOT flag a session with tty set (Unix terminal)', () => {
    const session = { session_id: 's3', terminal_id: null, tty: '/dev/ttys001', claimed_at: OLD_CLAIM };
    expect(isHeadlessZombie(session, { worktree_path: null }, NOW)).toBe(false);
  });

  it('does NOT flag a session with a worktree_path set', () => {
    const session = { session_id: 's4', terminal_id: null, tty: null, claimed_at: OLD_CLAIM };
    expect(isHeadlessZombie(session, { worktree_path: 'C:/Users/rickf/Projects/foo' }, NOW)).toBe(false);
  });

  it('does NOT flag a session that JUST went headless (grace period, avoids a startup race false-positive)', () => {
    const session = { session_id: 's5', terminal_id: null, tty: null, claimed_at: RECENT_CLAIM };
    expect(isHeadlessZombie(session, { worktree_path: null }, NOW)).toBe(false);
  });

  it('does NOT flag a session with no claimed_at at all (never held a claim long enough to matter)', () => {
    const session = { session_id: 's6', terminal_id: null, tty: null, claimed_at: null };
    expect(isHeadlessZombie(session, { worktree_path: null }, NOW)).toBe(false);
  });

  it('handles a missing telemetry row gracefully (no worktree_path signal available)', () => {
    const session = { session_id: 's7', terminal_id: null, tty: null, claimed_at: OLD_CLAIM };
    expect(isHeadlessZombie(session, undefined, NOW)).toBe(true);
  });
});
