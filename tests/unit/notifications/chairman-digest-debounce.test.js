/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-EMAIL-001 FR-3 — send-choke content-hash debounce.
 * The durable, cross-process, FAIL-OPEN backstop: an identical chairman email reaching the send
 * choke within the window is suppressed. Pure hash/evaluation + IO fail-open + the sendEmail wiring
 * (the incident repro at the send layer: N identical digests -> exactly ONE POST).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  digestContentHash, evaluateDigestDebounce,
  checkChairmanDigestDebounce, recordChairmanDigestSent,
  CHAIRMAN_DIGEST_DEBOUNCE_MS,
} from '../../../lib/notifications/channel-health-recorder.js';
import { sendEmail } from '../../../lib/notifications/resend-adapter.js';

const payload = { to: 'chairman@ehg.ai', subject: '3 decisions need you', html: '<b>digest</b>' };

/** Shared-store singleton stub for chairman_email_channel_health (select/eq/maybeSingle/upsert). */
function makeSingletonStub(initial = {}) {
  const store = { ...initial };
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    async maybeSingle() {
      return { data: {
        last_chairman_digest_hash: store.last_chairman_digest_hash ?? null,
        last_chairman_digest_sent_at: store.last_chairman_digest_sent_at ?? null,
      }, error: store._readError ? { message: store._readError } : null };
    },
    upsert(vals) { Object.assign(store, vals); return Promise.resolve({ error: null }); },
  };
  return { store, from() { return chain; } };
}

describe('digestContentHash (pure)', () => {
  it('is deterministic for identical payloads and differs on any field change', () => {
    expect(digestContentHash(payload)).toBe(digestContentHash({ ...payload }));
    expect(digestContentHash(payload)).not.toBe(digestContentHash({ ...payload, html: '<b>other</b>' }));
    expect(digestContentHash(payload)).not.toBe(digestContentHash({ ...payload, to: 'someone@else.com' }));
    expect(digestContentHash({})).toBe(digestContentHash({})); // total on empty
  });
});

describe('evaluateDigestDebounce (pure)', () => {
  const now = new Date('2026-07-16T18:00:00Z');
  const hash = 'abc';
  it('suppresses an identical hash sent within the window', () => {
    const row = { last_chairman_digest_hash: hash, last_chairman_digest_sent_at: new Date(now.getTime() - 60_000).toISOString() };
    expect(evaluateDigestDebounce(row, hash, now).suppress).toBe(true);
  });
  it('does NOT suppress a different hash', () => {
    const row = { last_chairman_digest_hash: 'zzz', last_chairman_digest_sent_at: new Date(now.getTime() - 60_000).toISOString() };
    expect(evaluateDigestDebounce(row, hash, now).suppress).toBe(false);
  });
  it('does NOT suppress once the window has elapsed', () => {
    const row = { last_chairman_digest_hash: hash, last_chairman_digest_sent_at: new Date(now.getTime() - CHAIRMAN_DIGEST_DEBOUNCE_MS - 1000).toISOString() };
    expect(evaluateDigestDebounce(row, hash, now).suppress).toBe(false);
  });
  it('does NOT suppress when there is no prior send (null state)', () => {
    expect(evaluateDigestDebounce(null, hash, now).suppress).toBe(false);
    expect(evaluateDigestDebounce({}, hash, now).suppress).toBe(false);
  });
});

describe('checkChairmanDigestDebounce / recordChairmanDigestSent (IO, fail-open)', () => {
  it('suppresses via the injected singleton when hash matches within window', async () => {
    const sb = makeSingletonStub();
    await recordChairmanDigestSent(payload, { supabase: sb, now: new Date('2026-07-16T18:00:00Z') });
    const r = await checkChairmanDigestDebounce(payload, { supabase: sb, now: new Date('2026-07-16T18:01:00Z') });
    expect(r.suppress).toBe(true);
  });
  it('FAILS OPEN (suppress:false) on a singleton read error', async () => {
    const sb = makeSingletonStub({ _readError: 'columns not applied yet' });
    const r = await checkChairmanDigestDebounce(payload, { supabase: sb });
    expect(r.suppress).toBe(false);
  });
  it('is a no-op under Vitest with no injected supabase (never touches the DB)', async () => {
    const r = await checkChairmanDigestDebounce(payload);
    expect(r).toEqual({ suppress: false, skipped: true });
  });
});

describe('sendEmail integration — identical chairman digests collapse to ONE POST (incident repro)', () => {
  const OLD_ENV = process.env.RESEND_API_KEY;
  beforeEach(() => { process.env.RESEND_API_KEY = 'test-key'; });
  afterEach(() => { process.env.RESEND_API_KEY = OLD_ENV; vi.restoreAllMocks(); });

  it('two identical digests within the window: first POSTs, second is SUPPRESSED (no 2nd POST)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'msg_1' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const sb = makeSingletonStub();
    const notifyChairman = vi.fn();
    const noon = new Date('2026-07-16T17:00:00Z'); // ~1pm ET — outside the quiet window

    const r1 = await sendEmail(payload, { supabase: sb, notifyChairman, now: noon });
    expect(r1.success).toBe(true);
    expect(r1.suppressed).toBeUndefined();

    const r2 = await sendEmail(payload, { supabase: sb, notifyChairman, now: new Date(noon.getTime() + 60_000) });
    expect(r2.suppressed).toBe(true);
    expect(r2.errorCode).toBe('SUPPRESSED_DEBOUNCE');

    // exactly ONE Resend POST across the two identical sends — the flood backstop
    const posts = fetchMock.mock.calls.filter(c => String(c[0]).includes('api.resend.com'));
    expect(posts.length).toBe(1);
  });

  it('a DIFFERENT digest is NOT suppressed (POSTs normally)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'msg_2' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const sb = makeSingletonStub();
    const notifyChairman = vi.fn();
    const noon = new Date('2026-07-16T17:00:00Z');

    await sendEmail(payload, { supabase: sb, notifyChairman, now: noon });
    const r2 = await sendEmail({ ...payload, html: '<b>different content</b>' }, { supabase: sb, notifyChairman, now: new Date(noon.getTime() + 60_000) });
    expect(r2.suppressed).toBeUndefined();
    const posts = fetchMock.mock.calls.filter(c => String(c[0]).includes('api.resend.com'));
    expect(posts.length).toBe(2);
  });
});
