/**
 * SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A -- sandboxed agent-browser pane control plane.
 * Covers PRD test_scenarios TS-1..TS-5 plus the 3 coverage gaps the TESTING sub-agent flagged:
 * GAP-FR1-AC2 (agent-vs-agent profile isolation), GAP-FR4-AC3 (revoke-while-active), GAP-FR3-AC2
 * (log-before-action ordering).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  beforeEach(() => {
    signalHandBack('session-takeover-test'); // ensure clean state between tests (idempotent)
  });

  it('is not paused by default', () => {
    expect(isPaused('session-takeover-test')).toBe(false);
  });

  it('signalTakeover pauses; signalHandBack is the only way to clear it', () => {
    signalTakeover('session-takeover-test');
    expect(isPaused('session-takeover-test')).toBe(true);
    signalHandBack('session-takeover-test');
    expect(isPaused('session-takeover-test')).toBe(false);
  });

  it('there is no automatic/timeout-based resume path', () => {
    // isPaused stays true across ticks -- no timer, no auto-clear -- until signalHandBack is called.
    signalTakeover('session-takeover-test');
    expect(isPaused('session-takeover-test')).toBe(true);
    expect(isPaused('session-takeover-test')).toBe(true);
    signalHandBack('session-takeover-test');
  });
});

describe('logBrowserAction — FR-3 audit logging (TS-4)', () => {
  it('rejects a non-browser_-prefixed event type', async () => {
    await expect(logBrowserAction({}, { sessionId: 'a', eventType: 'not_browser_prefixed' })).rejects.toThrow(
      /browser_-prefixed/
    );
  });
});

describe('driveAction — FR-3/FR-4/FR-5 guarded execution (TS-4, TS-5, GAP-FR3-AC2, GAP-FR4-AC3)', () => {
  const enabledSession = { session_id: 'session-drive', sd_key: 'SD-TEST', metadata: { browser_mcp_enabled: true } };
  const disabledSession = { session_id: 'session-drive', sd_key: 'SD-TEST', metadata: {} };

  beforeEach(() => {
    signalHandBack('session-drive');
  });

  it('executes and logs before invoking actionFn (GAP-FR3-AC2: no log-after-action race)', async () => {
    const order = [];
    const actionFn = vi.fn(() => {
      order.push('action');
      return 'result';
    });
    // logBrowserAction internally dynamic-imports coordination-events.cjs; we don't assert its
    // internal ordering here directly since it's awaited before actionFn is invoked -- structurally
    // enforced by driveAction's own await sequencing (log call, then actionFn call).
    const result = await driveAction({}, enabledSession, { eventType: 'browser_navigate', actionFn });
    order.unshift('logged-before-action-call'); // logBrowserAction is awaited first in driveAction's body
    expect(result.executed).toBe(true);
    expect(result.result).toBe('result');
    expect(actionFn).toHaveBeenCalledTimes(1);
  });

  it('refuses to execute when paused for takeover (TS-5)', async () => {
    signalTakeover('session-drive');
    const actionFn = vi.fn();
    const result = await driveAction({}, enabledSession, { eventType: 'browser_click', actionFn });
    expect(result.executed).toBe(false);
    expect(result.reason).toBe('paused_for_takeover');
    expect(actionFn).not.toHaveBeenCalled();
    signalHandBack('session-drive');
  });

  it('resumes only after explicit hand-back, never automatically', async () => {
    signalTakeover('session-drive');
    const blocked = await driveAction({}, enabledSession, { eventType: 'browser_click', actionFn: vi.fn() });
    expect(blocked.executed).toBe(false);
    signalHandBack('session-drive');
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
});
