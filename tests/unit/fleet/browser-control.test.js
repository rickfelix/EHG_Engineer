/**
 * SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A -- sandboxed agent-browser pane control plane.
 * Covers PRD test_scenarios TS-1..TS-5, the 3 coverage gaps the TESTING sub-agent flagged
 * (GAP-FR1-AC2 agent-vs-agent profile isolation, GAP-FR4-AC3 revoke-while-active, GAP-FR3-AC2
 * log-before-action ordering), and the SECURITY sub-agent's path-traversal + event-emission findings
 * (session_id traversal guard, FR-5 AC2 takeover/handback event logging).
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
const SB = {};

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

describe('signalTakeover / signalHandBack / isPaused — FR-5 human takeover', () => {
  beforeEach(async () => {
    await signalHandBack(SB, 'session-takeover-test'); // ensure clean state between tests (idempotent)
    logCoordinationEvent.mockClear();
  });

  it('is not paused by default', () => {
    expect(isPaused('session-takeover-test')).toBe(false);
  });

  it('signalTakeover pauses; signalHandBack is the only way to clear it', async () => {
    await signalTakeover(SB, 'session-takeover-test');
    expect(isPaused('session-takeover-test')).toBe(true);
    await signalHandBack(SB, 'session-takeover-test');
    expect(isPaused('session-takeover-test')).toBe(false);
  });

  it('there is no automatic/timeout-based resume path', async () => {
    // isPaused stays true across ticks -- no timer, no auto-clear -- until signalHandBack is called.
    await signalTakeover(SB, 'session-takeover-test');
    expect(isPaused('session-takeover-test')).toBe(true);
    expect(isPaused('session-takeover-test')).toBe(true);
    await signalHandBack(SB, 'session-takeover-test');
  });

  it('logs a browser_takeover event to the fleet feed (FR-5 AC2)', async () => {
    await signalTakeover(SB, 'session-takeover-test', 'SD-TEST');
    expect(logCoordinationEvent).toHaveBeenCalledWith(
      SB,
      expect.objectContaining({ event_type: 'browser_takeover', session_id: 'session-takeover-test', sd_key: 'SD-TEST' })
    );
  });

  it('logs a browser_handback event to the fleet feed (FR-5 AC3)', async () => {
    await signalTakeover(SB, 'session-takeover-test');
    logCoordinationEvent.mockClear();
    await signalHandBack(SB, 'session-takeover-test', 'SD-TEST');
    expect(logCoordinationEvent).toHaveBeenCalledWith(
      SB,
      expect.objectContaining({ event_type: 'browser_handback', session_id: 'session-takeover-test', sd_key: 'SD-TEST' })
    );
  });
});

describe('logBrowserAction — FR-3 audit logging (TS-4, GAP-FR3-AC1)', () => {
  it('rejects a non-browser_-prefixed event type', async () => {
    await expect(logBrowserAction({}, { sessionId: 'a', eventType: 'not_browser_prefixed' })).rejects.toThrow(
      /browser_-prefixed/
    );
  });

  it('calls logCoordinationEvent with the browser_-prefixed shape (GAP-FR3-AC1: was previously unverified)', async () => {
    await logBrowserAction(SB, { sessionId: 'session-x', sdKey: 'SD-TEST', eventType: 'browser_navigate', payload: { url: 'https://example.test' } });
    expect(logCoordinationEvent).toHaveBeenCalledWith(SB, {
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
    const result = await logBrowserAction(SB, { sessionId: 'session-x', eventType: 'browser_navigate' });
    expect(result.ok).toBe(false);
  });
});

describe('driveAction — FR-3/FR-4/FR-5 guarded execution (TS-4, TS-5, GAP-FR3-AC2, GAP-FR4-AC3)', () => {
  const enabledSession = { session_id: 'session-drive', sd_key: 'SD-TEST', metadata: { browser_mcp_enabled: true } };
  const disabledSession = { session_id: 'session-drive', sd_key: 'SD-TEST', metadata: {} };

  beforeEach(async () => {
    await signalHandBack(SB, 'session-drive');
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
    const result = await driveAction(SB, enabledSession, { eventType: 'browser_navigate', actionFn });
    expect(order).toEqual(['logged', 'action']);
    expect(result.executed).toBe(true);
    expect(result.result).toBe('result');
    expect(actionFn).toHaveBeenCalledTimes(1);
    expect(logCoordinationEvent).toHaveBeenCalledWith(
      SB,
      expect.objectContaining({ event_type: 'browser_navigate', session_id: 'session-drive' })
    );
  });

  it('refuses to execute when paused for takeover (TS-5)', async () => {
    await signalTakeover(SB, 'session-drive');
    const actionFn = vi.fn();
    const result = await driveAction(SB, enabledSession, { eventType: 'browser_click', actionFn });
    expect(result.executed).toBe(false);
    expect(result.reason).toBe('paused_for_takeover');
    expect(actionFn).not.toHaveBeenCalled();
    await signalHandBack(SB, 'session-drive');
  });

  it('resumes only after explicit hand-back, never automatically', async () => {
    await signalTakeover(SB, 'session-drive');
    const blocked = await driveAction(SB, enabledSession, { eventType: 'browser_click', actionFn: vi.fn() });
    expect(blocked.executed).toBe(false);
    await signalHandBack(SB, 'session-drive');
    const allowed = await driveAction(SB, enabledSession, { eventType: 'browser_click', actionFn: vi.fn() });
    expect(allowed.executed).toBe(true);
  });

  it('revoking the manifest field blocks the very next action (GAP-FR4-AC3: revoke-while-active)', async () => {
    const first = await driveAction(SB, enabledSession, { eventType: 'browser_navigate', actionFn: vi.fn() });
    expect(first.executed).toBe(true);

    // Caller re-fetches a fresh session row with the field now revoked -- next call must block.
    const second = await driveAction(SB, disabledSession, { eventType: 'browser_navigate', actionFn: vi.fn() });
    expect(second.executed).toBe(false);
    expect(second.reason).toBe('browser_mcp_disabled');
  });
});
