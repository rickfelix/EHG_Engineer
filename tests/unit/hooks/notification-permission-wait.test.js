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
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CORE_PATH = resolve(process.cwd(), 'lib/hooks/notification-permission-wait-core.cjs');
const HOOK_PATH = resolve(process.cwd(), 'scripts/hooks/notification-permission-wait.cjs');

async function freshCore() {
  vi.resetModules();
  return import(CORE_PATH + '?t=' + Date.now());
}

// Deliberately never `process.env.SUPABASE_URL = ...` / `delete process.env.SUPABASE_...` here.
// Credentials are injected via deps.credentials instead (resolveCredentials in the core module) —
// see that module's header comment: audit-db-test-guards.mjs flags the bare identifiers
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in a unit-tier test file as a live-DB-credential
// signal, and tests/unit/hooks/loop-state-resume-clear.test.js already found that narrowing the
// guard's regex to except a "safe" write is not distinguishable from a genuine credential read.
const PRESENT_CREDS = { supabaseUrl: 'https://example.test', serviceKey: 'test-service-key' };
const ABSENT_CREDS = {};

describe('notification-permission-wait-core', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs a session_coordination row targeting the active coordinator when one is on file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await writeNotificationRow(
      { session_id: 'seat-abc', hook_event_name: 'Notification', message: 'Claude needs your permission to run a Bash command' },
      { readPointerFile: () => ({ session_id: 'coord-123' }), credentials: PRESENT_CREDS },
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
      { readPointerFile: () => null, credentials: PRESENT_CREDS },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // valid_target requires at least one of target_session/target_sd non-null -- self-target
    // keeps the row from being silently rejected by the DB CHECK constraint (reproduced live
    // against production: a null/null row is refused with 23514 valid_target).
    expect(body.target_session).toBe('seat-solo');
  });

  it('never throws and skips the write when Supabase credentials are absent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await expect(writeNotificationRow({ session_id: 'x', message: 'y' }, { readPointerFile: () => null, credentials: ABSENT_CREDS })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a rejected fetch instead of throwing (fire-and-forget contract)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await expect(writeNotificationRow({ session_id: 'x', message: 'y' }, { readPointerFile: () => null, credentials: PRESENT_CREDS })).resolves.toBeUndefined();
  });

  it('truncates an overlong message to 2000 chars', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await writeNotificationRow({ session_id: 'x', message: 'a'.repeat(3000) }, { readPointerFile: () => null, credentials: PRESENT_CREDS });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.body.length).toBe(2000);
    expect(body.payload.message.length).toBe(2000);
  });
});

// QF-20260905-884 (second appended half): the row must name the blocked command, not just
// "Claude needs your permission" — read from the last assistant tool_use in the transcript.
describe('extractBlockedAction (QF-20260905-884)', () => {
  it('returns the last assistant tool_use block (name + input.command), truncated', async () => {
    const { extractBlockedAction } = await freshCore();
    const entries = [
      { type: 'user', message: { content: [{ type: 'text', text: 'go' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'about to run something' }, { type: 'tool_use', name: 'Bash', input: { command: 'git push --force-with-lease origin main' } }] } },
    ];
    const result = extractBlockedAction('/fake/transcript.jsonl', { readTailEntries: () => entries });
    expect(result).toEqual({ tool: 'Bash', detail: 'git push --force-with-lease origin main' });
  });

  it('falls back to input.file_path when there is no input.command (e.g. Edit/Write)', async () => {
    const { extractBlockedAction } = await freshCore();
    const entries = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/repo/src/foo.js', content: 'irrelevant' } }] } },
    ];
    const result = extractBlockedAction('/fake/transcript.jsonl', { readTailEntries: () => entries });
    expect(result).toEqual({ tool: 'Write', detail: '/repo/src/foo.js' });
  });

  it('truncates an overlong command to 200 chars', async () => {
    const { extractBlockedAction } = await freshCore();
    const longCmd = 'x'.repeat(500);
    const entries = [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: longCmd } }] } }];
    const result = extractBlockedAction('/fake/transcript.jsonl', { readTailEntries: () => entries });
    expect(result.detail.length).toBe(200);
  });

  it('returns null when no transcript_path is given', async () => {
    const { extractBlockedAction } = await freshCore();
    expect(extractBlockedAction(null, {})).toBeNull();
    expect(extractBlockedAction(undefined, {})).toBeNull();
  });

  it('returns null (fail-open) when the transcript reader throws', async () => {
    const { extractBlockedAction } = await freshCore();
    const result = extractBlockedAction('/fake/transcript.jsonl', { readTailEntries: () => { throw new Error('boom'); } });
    expect(result).toBeNull();
  });

  it('returns null when no assistant tool_use block exists in the tail', async () => {
    const { extractBlockedAction } = await freshCore();
    const entries = [{ type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } }, { type: 'assistant', message: { content: [{ type: 'text', text: 'thinking...' }] } }];
    const result = extractBlockedAction('/fake/transcript.jsonl', { readTailEntries: () => entries });
    expect(result).toBeNull();
  });

  it('writeNotificationRow threads payload.blocked_action from the transcript into the persisted row', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    const entries = [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'rm -rf .worktrees/stale' } }] } }];
    await writeNotificationRow(
      { session_id: 'seat-abc', message: 'Claude needs your permission', transcript_path: '/fake/transcript.jsonl' },
      { readPointerFile: () => null, credentials: PRESENT_CREDS, readTailEntries: () => entries },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.payload.blocked_action).toEqual({ tool: 'Bash', detail: 'rm -rf .worktrees/stale' });
  });

  it('writeNotificationRow writes blocked_action: null when transcript_path is absent (no regression on the QF-346 shape)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { writeNotificationRow } = await freshCore();
    await writeNotificationRow({ session_id: 'seat-abc', message: 'Claude needs your permission' }, { readPointerFile: () => null, credentials: PRESENT_CREDS });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.payload.blocked_action).toBeNull();
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
