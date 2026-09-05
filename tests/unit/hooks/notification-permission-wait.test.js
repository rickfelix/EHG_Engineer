/**
 * QF-20260905-346: the Notification hook must write one session_coordination row per
 * notification (observe-only — no SMS paging yet), and must never crash the CLI turn: no
 * credentials, no active coordinator, or a rejected fetch must all be swallowed silently.
 *
 * Tests the pure logic in lib/hooks/notification-permission-wait-core.cjs directly, never
 * the scripts/hooks/notification-permission-wait.cjs CLI wrapper — that file does a
 * synchronous fs.readFileSync(0) at import time, which blocks waiting for EOF unless Claude
 * Code is the one piping-then-closing stdin (never true for a plain `require()` under a
 * test runner).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CORE_PATH = resolve(process.cwd(), 'lib/hooks/notification-permission-wait-core.cjs');
const HOOK_PATH = resolve(process.cwd(), 'scripts/hooks/notification-permission-wait.cjs');

async function freshCore() {
  vi.resetModules();
  return import(CORE_PATH + '?t=' + Date.now());
}

describe('notification-permission-wait-core', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs a session_coordination row targeting the active coordinator when one is on file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await writeNotificationRow(
      { session_id: 'seat-abc', hook_event_name: 'Notification', message: 'Claude needs your permission to run a Bash command' },
      { readPointerFile: () => ({ session_id: 'coord-123' }) },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/rest/v1/session_coordination');
    expect(opts.method).toBe('POST');
    expect(opts.headers.apikey).toBe('test-service-key');

    const body = JSON.parse(opts.body);
    expect(body.target_session).toBe('coord-123');
    expect(body.sender_session).toBe('seat-abc');
    expect(body.sender_type).toBe('worker');
    expect(body.message_type).toBe('INFO');
    expect(body.payload.kind).toBe('notification_permission_wait');
    expect(body.payload.message).toBe('Claude needs your permission to run a Bash command');
  });

  it('falls back to targeting itself when no active coordinator is on file (solo session)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await writeNotificationRow(
      { session_id: 'seat-solo', message: 'permission needed' },
      { readPointerFile: () => null },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // valid_target requires at least one of target_session/target_sd non-null -- self-target
    // keeps the row from being silently rejected by the DB CHECK constraint (reproduced live
    // against production: a null/null row is refused with 23514 valid_target).
    expect(body.target_session).toBe('seat-solo');
  });

  it('never throws and skips the write when Supabase credentials are absent', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await expect(writeNotificationRow({ session_id: 'x', message: 'y' }, { readPointerFile: () => null })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a rejected fetch instead of throwing (fire-and-forget contract)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await expect(writeNotificationRow({ session_id: 'x', message: 'y' }, { readPointerFile: () => null })).resolves.toBeUndefined();
  });

  it('truncates an overlong message to 2000 chars', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await writeNotificationRow({ session_id: 'x', message: 'a'.repeat(3000) }, { readPointerFile: () => null });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.body.length).toBe(2000);
    expect(body.payload.message.length).toBe(2000);
  });
});

describe('notification-permission-wait CLI wrapper (source-level, never required directly)', () => {
  it('reads stdin, calls the core writer, then drains undici before the fire-and-forget exit', () => {
    const src = readFileSync(HOOK_PATH, 'utf8');
    expect(src).toMatch(/readFileSync\(0,/);
    expect(src).toMatch(/require\(.*notification-permission-wait-core\.cjs.*\)/);
    const raceStart = src.indexOf('Promise.race([_writePromise');
    expect(raceStart).toBeGreaterThan(-1);
    const tail = src.slice(raceStart);
    expect(tail.indexOf('drainUndiciPool()')).toBeGreaterThan(-1);
    expect(tail.indexOf('drainUndiciPool()')).toBeLessThan(tail.indexOf('process.exit(0)'));
  });
});
