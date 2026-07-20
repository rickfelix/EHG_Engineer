/**
 * SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A -- sandboxed agent-browser pane control plane.
 * Covers PRD test_scenarios TS-1..TS-5, the 3 coverage gaps the TESTING sub-agent flagged
 * (GAP-FR1-AC2 agent-vs-agent profile isolation, GAP-FR4-AC3 revoke-while-active, GAP-FR3-AC2
 * log-before-action ordering), and the SECURITY/adversarial-review findings:
 * - session_id path-traversal guard (SECURITY, EXEC-TO-PLAN)
 * - FR-5 AC2 takeover/handback event logging (SECURITY, EXEC-TO-PLAN)
 * - durable (DB-backed, not in-memory) takeover pause state (adversarial ship-gate review)
 * - driveAction surfaces a lost audit-log write instead of silently discarding it (adversarial ship-gate review)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/coordinator/coordination-events.cjs', () => ({
  logCoordinationEvent: vi.fn(async () => ({ ok: true })),
}));

import { logCoordinationEvent } from '../../../lib/coordinator/coordination-events.cjs';
import {
  isBrowserMcpEnabled,
  assertLocalhostBind,
  resolveSessionProfileDir,
  buildBrowserLaunchOptions,
  logBrowserAction,
  signalTakeover,
  signalHandBack,
  isPaused,
  requestBrowserSession,
  driveAction,
} from '../../../lib/fleet/browser-control.js';

const BASE_OPTS = { baseDir: 'C:/fleet/browser-profiles' };

/** Minimal fluent mock for the claude_sessions read-merge-write persistPauseState() uses. */
function makeSessionsTableMock(initialMetadata = {}) {
  const state = { metadata: { ...initialMetadata } };
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { metadata: state.metadata }, error: null })),
        })),
      })),
      update: vi.fn((patch) => ({
        eq: vi.fn(async () => {
          state.metadata = patch.metadata;
          return { data: null, error: null };
        }),
      })),
    })),
  };
  return { client, state };
}

/** Fluent mock where the metadata UPDATE fails -- exercises persistPauseState's throw-on-write-failure path. */
function makeWriteFailingSessionsTableMock(initialMetadata = {}) {
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { metadata: initialMetadata }, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: { message: 'simulated write failure' } })),
      })),
    })),
  };
  return { client };
}

beforeEach(() => {
  logCoordinationEvent.mockClear();
});

describe('isBrowserMcpEnabled — FR-4 manifest gate (default OFF)', () => {
  it('is false when the field is absent (default)', () => {
    expect(isBrowserMcpEnabled({ session_id: 'a', metadata: {} })).toBe(false);
    expect(isBrowserMcpEnabled({ session_id: 'a' })).toBe(false);
    expect(isBrowserMcpEnabled(null)).toBe(false);
  });

  it('is false when explicitly false', () => {
    expect(isBrowserMcpEnabled({ metadata: { browser_mcp_enabled: false } })).toBe(false);
  });

  it('is true only when explicitly true', () => {
    expect(isBrowserMcpEnabled({ metadata: { browser_mcp_enabled: true } })).toBe(true);
  });
});

describe('assertLocalhostBind — FR-2 CDP localhost-only', () => {
  it('accepts localhost addresses', () => {
    expect(assertLocalhostBind('127.0.0.1')).toBe('127.0.0.1');
    expect(assertLocalhostBind('::1')).toBe('::1');
    expect(assertLocalhostBind('localhost')).toBe('localhost');
    expect(assertLocalhostBind(undefined)).toBe('127.0.0.1'); // default
  });

  it('rejects any non-localhost address (TS-2)', () => {
    expect(() => assertLocalhostBind('0.0.0.0')).toThrow(/refusing non-localhost/);
    expect(() => assertLocalhostBind('10.0.0.5')).toThrow(/refusing non-localhost/);
    expect(() => assertLocalhostBind('example.com')).toThrow(/refusing non-localhost/);
  });
});

describe('resolveSessionProfileDir / buildBrowserLaunchOptions — FR-1 per-session isolation', () => {
  it('requires FLEET_BROWSER_PROFILES_DIR (no implicit default profile dir)', () => {
    expect(() => resolveSessionProfileDir('session-a', {})).toThrow(/not configured/);
  });

  it('two different sessions resolve to two different, disjoint profile dirs (GAP-FR1-AC2: agent-vs-agent isolation)', () => {
    const dirA = resolveSessionProfileDir('session-a', BASE_OPTS);
    const dirB = resolveSessionProfileDir('session-b', BASE_OPTS);
    expect(dirA).not.toBe(dirB);
    expect(dirA).toContain('session-a');
    expect(dirB).toContain('session-b');
  });

  it('never reuses/derives from an existing (e.g. chairman) profile path -- always base + session_id only', () => {
    const dir = resolveSessionProfileDir('session-a', BASE_OPTS);
    const normalize = (p) => p.replace(/\\/g, '/');
    expect(normalize(dir).startsWith(normalize(BASE_OPTS.baseDir))).toBe(true);
  });

  it('rejects a path-traversal session_id instead of resolving outside the base dir (SECURITY finding)', () => {
    expect(() => resolveSessionProfileDir('../../../etc/passwd', BASE_OPTS)).toThrow(/unsafe sessionId/);
    expect(() => resolveSessionProfileDir('..', BASE_OPTS)).toThrow(/unsafe sessionId/);
    expect(() => resolveSessionProfileDir('a/../../b', BASE_OPTS)).toThrow(/unsafe sessionId/);
    expect(() => resolveSessionProfileDir('C:\\Users\\rick\\chrome-profile', BASE_OPTS)).toThrow(/unsafe sessionId/);
  });

  it('accepts realistic session_id shapes (UUID, epoch, epoch_pid)', () => {
    expect(() => resolveSessionProfileDir('65d08634-9ded-4c8f-96e8-2f4cfd991a2a', BASE_OPTS)).not.toThrow();
    expect(() => resolveSessionProfileDir('session_1776019751948', BASE_OPTS)).not.toThrow();
    expect(() => resolveSessionProfileDir('session_1774443726642_4821', BASE_OPTS)).not.toThrow();
  });

  it('buildBrowserLaunchOptions composes userDataDir + localhost CDP args, rejects bad host', () => {
    const opts = buildBrowserLaunchOptions('session-a', { ...BASE_OPTS, host: '127.0.0.1', port: 9222 });
    expect(opts.userDataDir).toContain('session-a');
    expect(opts.args).toContain('--remote-debugging-address=127.0.0.1');
    expect(() => buildBrowserLaunchOptions('session-a', { ...BASE_OPTS, host: '0.0.0.0' })).toThrow();
  });
});

describe('requestBrowserSession — FR-4 entry guard (TS-3)', () => {
  it('refuses when the manifest field is absent/false (default OFF)', () => {
    const result = requestBrowserSession({ session_id: 'session-a', metadata: {} }, BASE_OPTS);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('browser_mcp_disabled');
  });

  it('proceeds and returns launch options when explicitly enabled', () => {
    const result = requestBrowserSession(
      { session_id: 'session-a', metadata: { browser_mcp_enabled: true } },
      BASE_OPTS
    );
    expect(result.ok).toBe(true);
    expect(result.launchOptions.userDataDir).toContain('session-a');
  });
});

describe('isPaused — FR-5 pure read (durable, DB-backed via session.metadata)', () => {
  it('is false when the field is absent/false', () => {
    expect(isPaused({ metadata: {} })).toBe(false);
    expect(isPaused({ metadata: { browser_takeover_paused: false } })).toBe(false);
    expect(isPaused(null)).toBe(false);
  });

  it('is true only when explicitly true', () => {
    expect(isPaused({ metadata: { browser_takeover_paused: true } })).toBe(true);
  });
});

describe('signalTakeover / signalHandBack — FR-5 durable takeover (adversarial-review fix)', () => {
  it('persists browser_takeover_paused=true to claude_sessions.metadata (survives a process restart, unlike in-memory state)', async () => {
    const { client, state } = makeSessionsTableMock({ some_other_key: 'preserved' });
    await signalTakeover(client, 'session-x', 'SD-TEST');
    expect(state.metadata.browser_takeover_paused).toBe(true);
    expect(state.metadata.some_other_key).toBe('preserved'); // read-merge-write, not a blind replace
  });

  it('persists browser_takeover_paused=false on hand-back', async () => {
    const { client, state } = makeSessionsTableMock({ browser_takeover_paused: true });
    await signalHandBack(client, 'session-x', 'SD-TEST');
    expect(state.metadata.browser_takeover_paused).toBe(false);
  });

  it('logs a browser_takeover event to the fleet feed (FR-5 AC2)', async () => {
    const { client } = makeSessionsTableMock();
    await signalTakeover(client, 'session-x', 'SD-TEST');
    expect(logCoordinationEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ event_type: 'browser_takeover', session_id: 'session-x', sd_key: 'SD-TEST' })
    );
  });

  it('logs a browser_handback event to the fleet feed (FR-5 AC3)', async () => {
    const { client } = makeSessionsTableMock({ browser_takeover_paused: true });
    logCoordinationEvent.mockClear();
    await signalHandBack(client, 'session-x', 'SD-TEST');
    expect(logCoordinationEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ event_type: 'browser_handback', session_id: 'session-x', sd_key: 'SD-TEST' })
    );
  });

  it('throws (never silently succeeds) when the pause state fails to persist, and does NOT log a false takeover event (adversarial-review round 2 fix)', async () => {
    const { client } = makeWriteFailingSessionsTableMock();
    await expect(signalTakeover(client, 'session-x', 'SD-TEST')).rejects.toThrow(/write failed/);
    expect(logCoordinationEvent).not.toHaveBeenCalled();
  });

  it('throws when hand-back fails to persist, and does NOT log a false handback event', async () => {
    const { client } = makeWriteFailingSessionsTableMock({ browser_takeover_paused: true });
    await expect(signalHandBack(client, 'session-x', 'SD-TEST')).rejects.toThrow(/write failed/);
    expect(logCoordinationEvent).not.toHaveBeenCalled();
  });
});

describe('logBrowserAction — FR-3 audit logging (TS-4, GAP-FR3-AC1)', () => {
  it('rejects a non-browser_-prefixed event type', async () => {
    await expect(logBrowserAction({}, { sessionId: 'a', eventType: 'not_browser_prefixed' })).rejects.toThrow(
      /browser_-prefixed/
    );
  });

  it('calls logCoordinationEvent with the browser_-prefixed shape (GAP-FR3-AC1: was previously unverified)', async () => {
    await logBrowserAction({}, { sessionId: 'session-x', sdKey: 'SD-TEST', eventType: 'browser_navigate', payload: { url: 'https://example.test' } });
    expect(logCoordinationEvent).toHaveBeenCalledWith({}, {
      event_type: 'browser_navigate',
      session_id: 'session-x',
      sd_key: 'SD-TEST',
      payload: { url: 'https://example.test' },
    });
  });

  it('is fail-open: a logCoordinationEvent throw does not propagate', async () => {
    logCoordinationEvent.mockImplementationOnce(async () => {
      throw new Error('simulated feed outage');
    });
    const result = await logBrowserAction({}, { sessionId: 'session-x', eventType: 'browser_navigate' });
    expect(result.ok).toBe(false);
  });
});

describe('driveAction — FR-3/FR-4/FR-5 guarded execution (TS-4, TS-5, GAP-FR3-AC2, GAP-FR4-AC3)', () => {
  const enabledSession = { session_id: 'session-drive', sd_key: 'SD-TEST', metadata: { browser_mcp_enabled: true } };
  const disabledSession = { session_id: 'session-drive', sd_key: 'SD-TEST', metadata: {} };
  const enabledPausedSession = {
    session_id: 'session-drive',
    sd_key: 'SD-TEST',
    metadata: { browser_mcp_enabled: true, browser_takeover_paused: true },
  };

  beforeEach(() => {
    logCoordinationEvent.mockClear();
  });

  it('logs BEFORE invoking actionFn -- verified call order, not just source inspection (GAP-FR3-AC2)', async () => {
    const order = [];
    logCoordinationEvent.mockImplementationOnce(async () => {
      order.push('logged');
      return { ok: true };
    });
    const actionFn = vi.fn(() => {
      order.push('action');
      return 'result';
    });
    const result = await driveAction({}, enabledSession, { eventType: 'browser_navigate', actionFn });
    expect(order).toEqual(['logged', 'action']);
    expect(result.executed).toBe(true);
    expect(result.result).toBe('result');
    expect(result.auditWarning).toBeUndefined();
    expect(actionFn).toHaveBeenCalledTimes(1);
    expect(logCoordinationEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ event_type: 'browser_navigate', session_id: 'session-drive' })
    );
  });

  it('refuses to execute when the session is paused for takeover (TS-5)', async () => {
    const actionFn = vi.fn();
    const result = await driveAction({}, enabledPausedSession, { eventType: 'browser_click', actionFn });
    expect(result.executed).toBe(false);
    expect(result.reason).toBe('paused_for_takeover');
    expect(actionFn).not.toHaveBeenCalled();
  });

  it('resumes only once the caller passes a fresh, un-paused session -- never automatically', async () => {
    const blocked = await driveAction({}, enabledPausedSession, { eventType: 'browser_click', actionFn: vi.fn() });
    expect(blocked.executed).toBe(false);
    const allowed = await driveAction({}, enabledSession, { eventType: 'browser_click', actionFn: vi.fn() });
    expect(allowed.executed).toBe(true);
  });

  it('revoking the manifest field blocks the very next action (GAP-FR4-AC3: revoke-while-active)', async () => {
    const first = await driveAction({}, enabledSession, { eventType: 'browser_navigate', actionFn: vi.fn() });
    expect(first.executed).toBe(true);

    // Caller re-fetches a fresh session row with the field now revoked -- next call must block.
    const second = await driveAction({}, disabledSession, { eventType: 'browser_navigate', actionFn: vi.fn() });
    expect(second.executed).toBe(false);
    expect(second.reason).toBe('browser_mcp_disabled');
  });

  it('surfaces a lost audit-log write via a generic auditWarning instead of silently discarding it or leaking raw error detail (adversarial-review round 1+2 fixes)', async () => {
    logCoordinationEvent.mockImplementationOnce(async () => {
      throw new Error('simulated feed outage with internal host:port detail');
    });
    const result = await driveAction({}, enabledSession, { eventType: 'browser_navigate', actionFn: vi.fn(() => 'ok') });
    expect(result.executed).toBe(true); // fail-open: the action still runs
    expect(result.auditWarning).toBe('audit log write failed'); // generic -- raw error never surfaced to the caller
  });
});
