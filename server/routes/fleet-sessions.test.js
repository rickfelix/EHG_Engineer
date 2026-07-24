/**
 * Unit tests for the Session View API routes (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-B).
 * Covers TS-1..TS-7 from the PRD plus the supporting GET /:id view endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseFromBuilder = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (...args) => mockSupabaseFromBuilder(...args),
  })),
}));

const mockAttach = vi.fn();
vi.mock('../../lib/fleet/spawn-control.js', () => ({
  attach: (...args) => mockAttach(...args),
}));

const mockRequestBrowserSession = vi.fn();
const mockSignalTakeover = vi.fn();
const mockSignalHandBack = vi.fn();
const mockIsPaused = vi.fn();
const mockIsBrowserMcpEnabled = vi.fn();
vi.mock('../../lib/fleet/browser-control.js', () => ({
  requestBrowserSession: (...args) => mockRequestBrowserSession(...args),
  signalTakeover: (...args) => mockSignalTakeover(...args),
  signalHandBack: (...args) => mockSignalHandBack(...args),
  isPaused: (...args) => mockIsPaused(...args),
  isBrowserMcpEnabled: (...args) => mockIsBrowserMcpEnabled(...args),
}));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const { default: fleetSessionsRouter } = await import('./fleet-sessions.js');

function mockReq(overrides = {}) {
  return { params: {}, body: {}, query: {}, headers: {}, ...overrides };
}
function mockRes() {
  const res = { headers: {} };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn((k, v) => { res.headers[k] = v; });
  return res;
}

/** Invoke a router handler directly via its stack, without spinning up Express. */
async function invokeRoute(method, path, { params = {}, body = {}, query = {} } = {}) {
  const layer = fleetSessionsRouter.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`Route ${method} ${path} not found`);
  const handler = layer.route.stack[0].handle;
  const req = mockReq({ params, body, query });
  const res = mockRes();
  await handler(req, res);
  return { req, res };
}

function mockFromReturningSession(row) {
  mockSupabaseFromBuilder.mockImplementation((table) => {
    if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
    };
  });
}

describe('GET /:id', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseFromBuilder.mockReset(); });

  it('returns 404 when the session does not exist', async () => {
    mockFromReturningSession(null);
    const { res } = await invokeRoute('GET', '/:id', { params: { id: 'sess-x' } });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns the view-model + paused + browserMcpEnabled for an existing session', async () => {
    mockFromReturningSession({
      session_id: 'sess-1', current_tool: 'Read', last_tool_at: '2026-01-01T00:00:00Z',
      last_activity_kind: 'tool', expected_silence_until: null, metadata: {},
    });
    mockIsPaused.mockReturnValue(false);
    mockIsBrowserMcpEnabled.mockReturnValue(true);

    const { res } = await invokeRoute('GET', '/:id', { params: { id: 'sess-1' } });
    expect(res.status).not.toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.lastTool).toBe('Read');
    expect(payload.paused).toBe(false);
    expect(payload.browserMcpEnabled).toBe(true);
    expect(payload.attachState).toEqual({ ok: null, reason: null, degraded: false, message: null });
  });

  it('SD-LEO-INFRA-LEO-APP-RENDERED-001-B TR-1: includes additive badge/model/effort/role/callsign fields', async () => {
    mockFromReturningSession({
      session_id: 'sess-1', status: 'active', loop_state: 'active', current_tool: 'Read',
      last_tool_at: '2026-01-01T00:00:00Z', last_activity_kind: 'tool', expected_silence_until: null,
      metadata: { model: 'opus', effort: 'xhigh', fleet_identity: { role: 'advisor', callsign: 'Alpha-5' } },
    });
    mockIsPaused.mockReturnValue(false);
    mockIsBrowserMcpEnabled.mockReturnValue(true);

    const { res } = await invokeRoute('GET', '/:id', { params: { id: 'sess-1' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.badge).toBe('DEEP WORK');
    expect(payload.model).toBe('opus');
    expect(payload.effort).toBe('xhigh');
    expect(payload.role).toBe('advisor');
    expect(payload.callsign).toBe('Alpha-5');
  });

  it('SD-LEO-INFRA-LEO-APP-RENDERED-001-B TR-1: additive fields degrade to null/safe defaults when metadata is empty', async () => {
    mockFromReturningSession({ session_id: 'sess-1', status: 'active', metadata: {} });
    mockIsPaused.mockReturnValue(false);
    mockIsBrowserMcpEnabled.mockReturnValue(false);

    const { res } = await invokeRoute('GET', '/:id', { params: { id: 'sess-1' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.badge).toBe('WORKING');
    expect(payload.model).toBeNull();
    expect(payload.effort).toBeNull();
    expect(payload.role).toBeNull();
    expect(payload.callsign).toBeNull();
  });
});

describe('GET /:id/browser-log', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseFromBuilder.mockReset(); });

  it('FR-5: returns the take-over/hand-back audit trail for this session, newest first', async () => {
    const events = [
      { id: 'ev-2', event_type: 'browser_handback', created_at: '2026-01-01T00:05:00Z', sd_key: null },
      { id: 'ev-1', event_type: 'browser_takeover', created_at: '2026-01-01T00:00:00Z', sd_key: null },
    ];
    mockSupabaseFromBuilder.mockImplementation((table) => {
      if (table !== 'coordination_events') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: events, error: null }),
              }),
            }),
          }),
        }),
      };
    });
    const { res } = await invokeRoute('GET', '/:id/browser-log', { params: { id: 'sess-1' } });
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual({ ok: true, events });
  });

  it('surfaces a query error as 500 rather than a false empty list', async () => {
    mockSupabaseFromBuilder.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: 'relation missing' } }),
            }),
          }),
        }),
      }),
    }));
    const { res } = await invokeRoute('GET', '/:id/browser-log', { params: { id: 'sess-1' } });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('POST /:id/attach', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseFromBuilder.mockReset(); });

  it('TS-1: attach() ok:true is returned as the non-degraded ok state', async () => {
    mockAttach.mockResolvedValue({ ok: true, reason: null, session_id: 'sess-1' });
    const { res } = await invokeRoute('POST', '/:id/attach', { params: { id: 'sess-1' } });
    expect(res.status).not.toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.degraded).toBe(false);
  });

  it('TS-2: attach() ok:false reason=not_found returns a distinct degraded state, not a generic failure', async () => {
    mockAttach.mockResolvedValue({ ok: false, reason: 'not_found' });
    const { res } = await invokeRoute('POST', '/:id/attach', { params: { id: 'sess-x' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(false);
    expect(payload.degraded).toBe(true);
    expect(payload.message).toMatch(/not found/i);
  });

  it('resolves the URL :id as a session_id (by=session_id), not a callsign', async () => {
    mockAttach.mockResolvedValue({ ok: true, reason: null, session_id: 'sess-1' });
    await invokeRoute('POST', '/:id/attach', { params: { id: 'sess-1' } });
    expect(mockAttach).toHaveBeenCalledWith('sess-1', expect.objectContaining({ by: 'session_id' }));
  });

  it('propagates a thrown error from attach() as 500', async () => {
    mockAttach.mockRejectedValue(new Error('boom'));
    const { res } = await invokeRoute('POST', '/:id/attach', { params: { id: 'sess-1' } });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('POST /:id/browser-session', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseFromBuilder.mockReset(); });

  it('TS-3: gated off returns browser_mcp_disabled without exposing launchOptions', async () => {
    mockFromReturningSession({ session_id: 'sess-1', metadata: {} });
    mockRequestBrowserSession.mockReturnValue({ ok: false, reason: 'browser_mcp_disabled' });
    const { res } = await invokeRoute('POST', '/:id/browser-session', { params: { id: 'sess-1' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(false);
    expect(payload.launchOptions).toBeUndefined();
  });

  it('TS-4: gated on returns launchOptions verbatim', async () => {
    mockFromReturningSession({ session_id: 'sess-1', metadata: { browser_mcp_enabled: true } });
    const launchOptions = { userDataDir: '/profiles/sess-1', headless: true, args: [] };
    mockRequestBrowserSession.mockReturnValue({ ok: true, launchOptions });
    const { res } = await invokeRoute('POST', '/:id/browser-session', { params: { id: 'sess-1' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.launchOptions).toEqual(launchOptions);
  });

  it('never forwards a client-supplied opts object (body) to requestBrowserSession (SECURITY review condition)', async () => {
    const session = { session_id: 'sess-1', metadata: { browser_mcp_enabled: true } };
    mockFromReturningSession(session);
    mockRequestBrowserSession.mockReturnValue({ ok: true, launchOptions: {} });
    await invokeRoute('POST', '/:id/browser-session', {
      params: { id: 'sess-1' },
      body: { opts: { baseDir: '/etc', host: '0.0.0.0' } },
    });
    expect(mockRequestBrowserSession).toHaveBeenCalledTimes(1);
    // Value check, not just arg count: the exact fetched session, nothing else appended/merged.
    expect(mockRequestBrowserSession).toHaveBeenCalledWith(session);
    expect(mockRequestBrowserSession.mock.calls[0].length).toBe(1);
  });

  it('never forwards a client-supplied opts object (query string) to requestBrowserSession', async () => {
    const session = { session_id: 'sess-1', metadata: { browser_mcp_enabled: true } };
    mockFromReturningSession(session);
    mockRequestBrowserSession.mockReturnValue({ ok: true, launchOptions: {} });
    await invokeRoute('POST', '/:id/browser-session', {
      params: { id: 'sess-1' },
      query: { baseDir: '/etc', host: '0.0.0.0', port: '9222' },
    });
    expect(mockRequestBrowserSession).toHaveBeenCalledWith(session);
    expect(mockRequestBrowserSession.mock.calls[0].length).toBe(1);
  });
});

describe('POST /:id/takeover', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseFromBuilder.mockReset(); });

  it('TS-5: propagates a signalTakeover persistence failure as 500, not a false ok:true', async () => {
    mockFromReturningSession({ session_id: 'sess-1', metadata: {} });
    mockSignalTakeover.mockRejectedValue(new Error('persistPauseState: write failed'));
    const { res } = await invokeRoute('POST', '/:id/takeover', { params: { id: 'sess-1' } });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].ok).toBe(false);
  });

  it('returns paused:true on success', async () => {
    mockFromReturningSession({ session_id: 'sess-1', metadata: {} });
    mockSignalTakeover.mockResolvedValue(undefined);
    const { res } = await invokeRoute('POST', '/:id/takeover', { params: { id: 'sess-1' } });
    expect(res.json.mock.calls[0][0]).toEqual({ ok: true, paused: true });
  });

  it('passes a valid string sdKey through to signalTakeover', async () => {
    mockFromReturningSession({ session_id: 'sess-1', metadata: {} });
    mockSignalTakeover.mockResolvedValue(undefined);
    await invokeRoute('POST', '/:id/takeover', { params: { id: 'sess-1' }, body: { sdKey: 'SD-LEO-FOO-001' } });
    expect(mockSignalTakeover).toHaveBeenCalledWith(expect.anything(), 'sess-1', 'SD-LEO-FOO-001');
  });

  it('normalizes a malformed sdKey (object, oversized string) to null rather than passing it through', async () => {
    mockFromReturningSession({ session_id: 'sess-1', metadata: {} });
    mockSignalTakeover.mockResolvedValue(undefined);
    await invokeRoute('POST', '/:id/takeover', { params: { id: 'sess-1' }, body: { sdKey: { nested: 'object' } } });
    expect(mockSignalTakeover).toHaveBeenCalledWith(expect.anything(), 'sess-1', null);

    mockSignalTakeover.mockClear();
    await invokeRoute('POST', '/:id/takeover', { params: { id: 'sess-1' }, body: { sdKey: 'x'.repeat(500) } });
    expect(mockSignalTakeover).toHaveBeenCalledWith(expect.anything(), 'sess-1', null);
  });
});

describe('POST /:id/hand-back', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseFromBuilder.mockReset(); });

  it('TS-7: clears pause state on success', async () => {
    mockFromReturningSession({ session_id: 'sess-1', metadata: {} });
    mockSignalHandBack.mockResolvedValue(undefined);
    const { res } = await invokeRoute('POST', '/:id/hand-back', { params: { id: 'sess-1' } });
    expect(res.json.mock.calls[0][0]).toEqual({ ok: true, paused: false });
  });

  it('propagates a signalHandBack persistence failure as 500', async () => {
    mockFromReturningSession({ session_id: 'sess-1', metadata: {} });
    mockSignalHandBack.mockRejectedValue(new Error('persistPauseState: write failed'));
    const { res } = await invokeRoute('POST', '/:id/hand-back', { params: { id: 'sess-1' } });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('TS-6: per-session-fresh-fetch discipline', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSupabaseFromBuilder.mockReset(); });

  it('two sequential GET /:id calls observe a mutation made between them (no stale-read/caching)', async () => {
    let call = 0;
    mockSupabaseFromBuilder.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            call += 1;
            const current_tool = call === 1 ? 'Read' : 'Edit';
            return Promise.resolve({ data: { session_id: 'sess-1', current_tool, metadata: {} }, error: null });
          },
        }),
      }),
    }));
    mockIsPaused.mockReturnValue(false);
    mockIsBrowserMcpEnabled.mockReturnValue(false);

    const first = await invokeRoute('GET', '/:id', { params: { id: 'sess-1' } });
    const second = await invokeRoute('GET', '/:id', { params: { id: 'sess-1' } });

    expect(first.res.json.mock.calls[0][0].lastTool).toBe('Read');
    expect(second.res.json.mock.calls[0][0].lastTool).toBe('Edit');
  });
});
