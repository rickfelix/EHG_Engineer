/**
 * Unit tests for the worktree-isolation reminder rendered by sd:next.
 * Covers countPeerSessions (pure) and displayWorktreeIsolationReminder (renderer)
 * in scripts/modules/sd-next/display/recommendations.js.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  countPeerSessions,
  displayWorktreeIsolationReminder,
} from '../../../scripts/modules/sd-next/display/recommendations.js';

const SESSION_CURRENT = '00000000-0000-0000-0000-000000000001';
const SESSION_PEER_A  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_PEER_B  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('countPeerSessions', () => {
  it('returns 0 for an empty active-sessions array', () => {
    expect(countPeerSessions([], { session_id: SESSION_CURRENT })).toBe(0);
  });

  it('returns 0 when currentSession is null (cannot identify self)', () => {
    expect(countPeerSessions([{ session_id: SESSION_PEER_A }], null)).toBe(0);
  });

  it('returns 0 when only the current session is present', () => {
    expect(
      countPeerSessions(
        [{ session_id: SESSION_CURRENT }],
        { session_id: SESSION_CURRENT }
      )
    ).toBe(0);
  });

  it('returns the count of peers when multiple peer sessions are active', () => {
    expect(
      countPeerSessions(
        [
          { session_id: SESSION_CURRENT },
          { session_id: SESSION_PEER_A },
          { session_id: SESSION_PEER_B },
        ],
        { session_id: SESSION_CURRENT }
      )
    ).toBe(2);
  });

  it('tolerates malformed entries (null/undefined) without crashing', () => {
    expect(
      countPeerSessions(
        [null, undefined, { session_id: SESSION_PEER_A }],
        { session_id: SESSION_CURRENT }
      )
    ).toBe(1);
  });

  it('returns 0 when activeSessions is not an array', () => {
    expect(countPeerSessions(undefined, { session_id: SESSION_CURRENT })).toBe(0);
    expect(countPeerSessions(null, { session_id: SESSION_CURRENT })).toBe(0);
  });
});

describe('displayWorktreeIsolationReminder', () => {
  let logSpy;

  // Filter spy calls to those produced by our reminder, ignoring unrelated
  // console.log noise (e.g. dotenv injection banners that fire during lazy
  // module resolution inside vitest).
  const reminderCalls = () =>
    logSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Claude Code session')
    );

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints nothing when there are no peer sessions', () => {
    displayWorktreeIsolationReminder([], { session_id: SESSION_CURRENT });
    expect(reminderCalls()).toHaveLength(0);
  });

  it('prints nothing when only the current session is active', () => {
    displayWorktreeIsolationReminder(
      [{ session_id: SESSION_CURRENT }],
      { session_id: SESSION_CURRENT }
    );
    expect(reminderCalls()).toHaveLength(0);
  });

  it('prints nothing when currentSession is unknown', () => {
    displayWorktreeIsolationReminder(
      [{ session_id: SESSION_PEER_A }],
      null
    );
    expect(reminderCalls()).toHaveLength(0);
  });

  it('prints two lines when one peer is active, including the peer count and both commands', () => {
    displayWorktreeIsolationReminder(
      [{ session_id: SESSION_CURRENT }, { session_id: SESSION_PEER_A }],
      { session_id: SESSION_CURRENT }
    );
    const calls = reminderCalls();
    expect(calls).toHaveLength(1);
    const combined = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(combined).toMatch(/1 other Claude Code session/);
    expect(combined).toContain('npm run session:check-concurrency');
    expect(combined).toContain('npm run session:worktree');
  });

  it('reports the correct peer count when multiple peers are active', () => {
    displayWorktreeIsolationReminder(
      [
        { session_id: SESSION_CURRENT },
        { session_id: SESSION_PEER_A },
        { session_id: SESSION_PEER_B },
      ],
      { session_id: SESSION_CURRENT }
    );
    const calls = reminderCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatch(/2 other Claude Code session\(s\)/);
  });
});
