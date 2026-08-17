/**
 * SD-LEO-INFRA-QUIET-HOURS-GATE-001 — measured chairman-presence reply window.
 *
 * Covers the resolver (window predicate, phone normalization, fail-closed edges), the
 * chokepoint wiring in sendChairmanSMS (reply-class-only consultation, once-per-grant
 * dedupeKey, preference-path independence), and the lint's reason-aware quiet_hours detail.
 *
 * Mock doctrine (from tests/unit/adam/adam-quiet-tick-sms-inbound.test.js): the supabase mock
 * APPLIES the gte filter so the test observes the resolver's predicate, not a pre-filtered
 * fixture. CHAIRMAN_PHONE is saved/restored around every case that touches it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolvePresenceReplyWindow, PRESENCE_WINDOW_MINUTES } from '../../../../lib/comms/adam-outbound/presence-reply-window.js';
import { sendChairmanSMS } from '../../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { lint } from '../../../../lib/comms/adam-outbound/rubric-engine/lint.js';
import { WATCHDOG_BODY_PREFIX } from '../../../../lib/comms/adam-outbound/watchdog-detector.js';

const NOW = Date.parse('2026-08-10T03:25:00Z'); // 23:25 ET on 2026-08-09 (inside 22:00-06:00)

/**
 * A supabase mock whose query builder APPLIES the received_at >= gte filter AND actually sorts
 * by the order() column/direction, matching real Supabase behavior.
 *
 * SD-LEO-FIX-QUIET-HOURS-GATE-001 (TESTING finding B2, 2026-08-17): order() was previously a
 * no-op that discarded both arguments, so limit() resolved rows in FIXTURE ARRAY ORDER, not
 * received_at order -- a mixed-row test could pass green with zero code changes if the fixture
 * happened to be built in a favorable order. Confirmed empirically before this fix.
 */
function makeStagingMock(rows, { error = null } = {}) {
  const calls = { gte: null, table: null, order: null };
  const builder = (table) => {
    calls.table = table;
    const state = { gteCol: null, gteVal: null, orderCol: null, orderAsc: true };
    const chain = {
      select: () => chain,
      gte: (col, val) => { state.gteCol = col; state.gteVal = val; calls.gte = { col, val }; return chain; },
      order: (col, opts = {}) => {
        state.orderCol = col;
        state.orderAsc = opts.ascending !== false;
        calls.order = { col, ascending: state.orderAsc };
        return chain;
      },
      limit: () => {
        if (error) return Promise.resolve({ data: null, error });
        let filtered = rows.filter((r) => !state.gteVal || r.received_at >= state.gteVal);
        if (state.orderCol) {
          filtered = [...filtered].sort((a, b) => {
            const av = a[state.orderCol];
            const bv = b[state.orderCol];
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return state.orderAsc ? cmp : -cmp;
          });
        }
        return Promise.resolve({ data: filtered, error: null });
      },
    };
    return chain;
  };
  return { from: vi.fn(builder), calls };
}

const minutesAgo = (n) => new Date(NOW - n * 60_000).toISOString();

describe('resolvePresenceReplyWindow()', () => {
  const savedPhone = process.env.CHAIRMAN_PHONE;
  beforeEach(() => { process.env.CHAIRMAN_PHONE = '5551234567'; });
  afterEach(() => {
    if (savedPhone === undefined) delete process.env.CHAIRMAN_PHONE;
    else process.env.CHAIRMAN_PHONE = savedPhone;
  });

  it('grants on a chairman inbound row inside the trailing window', async () => {
    const sb = makeStagingMock([{ id: 'row-1', from_phone: '5551234567', received_at: minutesAgo(10) }]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(true);
    expect(res.reason).toBe('measured_presence_reply');
    expect(res.grantRowId).toBe('row-1');
    expect(sb.calls.table).toBe('sms_relay_staging');
    // The predicate is the resolver's, observed through the applied filter:
    expect(Date.parse(sb.calls.gte.val)).toBe(NOW - PRESENCE_WINDOW_MINUTES * 60_000);
  });

  it('refuses when the only chairman row is OUTSIDE the window (filter applied, not fixture-trimmed)', async () => {
    const sb = makeStagingMock([{ id: 'row-old', from_phone: '5551234567', received_at: minutesAgo(20) }]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('no_recent_chairman_inbound');
  });

  it('matches across provider format drift via phoneKey normalization', async () => {
    const sb = makeStagingMock([{ id: 'row-fmt', from_phone: '+1 (555) 123-4567', received_at: minutesAgo(5) }]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(true);
    expect(res.grantRowId).toBe('row-fmt');
  });

  it('ignores non-chairman inbound rows inside the window', async () => {
    const sb = makeStagingMock([{ id: 'row-other', from_phone: '9998887777', received_at: minutesAgo(2) }]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(false);
  });

  it('is inert (fail-closed) when CHAIRMAN_PHONE is unset, even with matching rows', async () => {
    delete process.env.CHAIRMAN_PHONE;
    const sb = makeStagingMock([{ id: 'row-1', from_phone: '5551234567', received_at: minutesAgo(1) }]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('no_chairman_phone');
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('fails closed without throwing on a query error', async () => {
    const sb = makeStagingMock([], { error: { message: 'relation is on fire' } });
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/query_error/);
  });

  it('fails closed on an unusable now', async () => {
    const res = await resolvePresenceReplyWindow('not-a-clock', { supabase: makeStagingMock([]) });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('invalid_now');
  });
});

describe('resolvePresenceReplyWindow() — watchdog discrimination (SD-LEO-FIX-QUIET-HOURS-GATE-001)', () => {
  const savedPhone = process.env.CHAIRMAN_PHONE;
  beforeEach(() => { process.env.CHAIRMAN_PHONE = '5551234567'; });
  afterEach(() => {
    if (savedPhone === undefined) delete process.env.CHAIRMAN_PHONE;
    else process.env.CHAIRMAN_PHONE = savedPhone;
  });

  it('QH-TS-1: a watchdog-template inbound, alone in the window, must not grant', async () => {
    const sb = makeStagingMock([
      { id: 'watchdog-1', from_phone: '5551234567', body_raw: `${WATCHDOG_BODY_PREFIX} are you still there?`, received_at: minutesAgo(5) },
    ]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(false);
  });

  it('QH-TS-2: a genuine, distinct chairman text, alone in the window, still grants', async () => {
    const sb = makeStagingMock([
      { id: 'genuine-1', from_phone: '5551234567', body_raw: 'Please fix the asymmetry', received_at: minutesAgo(5) },
    ]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(true);
    expect(res.grantRowId).toBe('genuine-1');
  });

  it("QH-TS-3: the chairman's own REPEATED short decision replies still grant (regression) -- repeated bodies, not distinct single-occurrence bodies", async () => {
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push({ id: `a-${i}`, from_phone: '5551234567', body_raw: 'A', received_at: minutesAgo(1 + i) });
    for (let i = 0; i < 4; i++) rows.push({ id: `yes-${i}`, from_phone: '5551234567', body_raw: 'Yes', received_at: minutesAgo(1 + i) });
    // thumbs-up-medium-dark-skin-tone: short (4 bytes), included per the live-measured corpus
    for (let i = 0; i < 7; i++) rows.push({ id: `thumb-${i}`, from_phone: '5551234567', body_raw: '👍🏿', received_at: minutesAgo(1 + i) });
    const sb = makeStagingMock(rows);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(true);
  });

  it('QH-TS-3b: a differential invariant -- the verdict is unchanged as a fixed non-watchdog body repeats N=1,2,5,10,25 times', async () => {
    for (const n of [1, 2, 5, 10, 25]) {
      const rows = Array.from({ length: n }, (_, i) => ({
        id: `rep-${n}-${i}`, from_phone: '5551234567', body_raw: 'Approved', received_at: minutesAgo(1 + i),
      }));
      const res = await resolvePresenceReplyWindow(NOW, { supabase: makeStagingMock(rows) });
      expect(res.allowed).toBe(true);
    }
  });

  it('QH-TS-4: a watchdog row AND a genuine distinct row both in-window, watchdog more recent -- the genuine row must still be found', async () => {
    const sb = makeStagingMock([
      { id: 'watchdog-recent', from_phone: '5551234567', body_raw: `${WATCHDOG_BODY_PREFIX} are you still there?`, received_at: minutesAgo(2) },
      { id: 'genuine-older', from_phone: '5551234567', body_raw: 'Go with your recommended option', received_at: minutesAgo(8) },
    ]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(true);
    expect(res.grantRowId).toBe('genuine-older');
  });

  it('QH-TS-5: no qualifying (non-watchdog) row in-window refuses, same as the pre-existing no-match path', async () => {
    const sb = makeStagingMock([
      { id: 'watchdog-only', from_phone: '5551234567', body_raw: `${WATCHDOG_BODY_PREFIX} are you still there?`, received_at: minutesAgo(3) },
    ]);
    const res = await resolvePresenceReplyWindow(NOW, { supabase: sb });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('no_recent_chairman_inbound');
  });
});

describe('sendChairmanSMS() presence reply-window wiring', () => {
  const QUIET_REPLY = { nowHourET: 23, rateCap: 10, sentInWindow: 0, replyToInbound: true };
  const makeSender = () => ({ send: vi.fn(async () => ({ sid: 'SM-test' })) });
  const silentConsole = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };
  const ACK = { type: 'status', body: 'ack: workers spinning up now — on it.' };
  const grantResolver = (id = 'grant-1') => vi.fn(async () => ({
    allowed: true, reason: 'measured_presence_reply', grantRowId: id, grantReceivedAt: minutesAgo(3),
  }));
  const refuseResolver = () => vi.fn(async () => ({ allowed: false, reason: 'no_recent_chairman_inbound' }));

  it('TS-1: a reply within the presence window passes during quiet hours and carries the grant dedupeKey', async () => {
    const sender = makeSender();
    const presenceResolver = grantResolver('grant-1');
    const res = await sendChairmanSMS(ACK, QUIET_REPLY, { sender, console: silentConsole, presenceResolver });
    expect(res.sent).toBe(true);
    expect(presenceResolver).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send.mock.calls[0][0].dedupeKey).toBe('presence_reply:grant-1');
  });

  it('TS-2: a reply AFTER the window blocks with the standard quiet_hours finding', async () => {
    const sender = makeSender();
    const res = await sendChairmanSMS(ACK, QUIET_REPLY, { sender, console: silentConsole, presenceResolver: refuseResolver() });
    expect(res.sent).toBe(false);
    expect(res.held).toBe(true);
    expect((res.blockedReasons || []).join(' ')).toMatch(/quiet_hours/);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('TS-3: an unsolicited quiet-hours send never consults the resolver and stays blocked', async () => {
    const sender = makeSender();
    const presenceResolver = grantResolver();
    const { replyToInbound: _omit, ...unsolicited } = QUIET_REPLY;
    const res = await sendChairmanSMS(ACK, unsolicited, { sender, console: silentConsole, presenceResolver });
    expect(res.sent).toBe(false);
    expect(presenceResolver).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('TS-3b: a daytime reply never consults the resolver (no added latency outside the window)', async () => {
    const sender = makeSender();
    const presenceResolver = grantResolver();
    const res = await sendChairmanSMS(ACK, { ...QUIET_REPLY, nowHourET: 14 }, { sender, console: silentConsole, presenceResolver });
    expect(res.sent).toBe(true);
    expect(presenceResolver).not.toHaveBeenCalled();
  });

  it('TS-4: the preference-extension path is untouched — allowQuietHours passes without the resolver', async () => {
    const sender = makeSender();
    const presenceResolver = grantResolver();
    const ctx = { nowHourET: 23, rateCap: 10, sentInWindow: 0, allowQuietHours: true };
    const res = await sendChairmanSMS(ACK, ctx, { sender, console: silentConsole, presenceResolver });
    expect(res.sent).toBe(true);
    expect(presenceResolver).not.toHaveBeenCalled();
    expect(sender.send.mock.calls[0][0].dedupeKey).toBeUndefined();
  });

  it('TS-5: a throwing resolver fails closed to the pre-SD block', async () => {
    const sender = makeSender();
    const presenceResolver = vi.fn(async () => { throw new Error('staging unreachable'); });
    const res = await sendChairmanSMS(ACK, QUIET_REPLY, { sender, console: silentConsole, presenceResolver });
    expect(res.sent).toBe(false);
    expect(res.held).toBe(true);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('TS-6: once-per-grant — a second send on the same granting row carries the SAME dedupeKey (durable upsert dedupes downstream)', async () => {
    const sender = makeSender();
    const presenceResolver = grantResolver('grant-9');
    await sendChairmanSMS(ACK, QUIET_REPLY, { sender, console: silentConsole, presenceResolver });
    await sendChairmanSMS(ACK, QUIET_REPLY, { sender, console: silentConsole, presenceResolver });
    const keys = sender.send.mock.calls.map((c) => c[0].dedupeKey);
    expect(keys).toEqual(['presence_reply:grant-9', 'presence_reply:grant-9']);
    // Uniqueness is enforced by enqueueChairmanSms' upsert (onConflict: 'dedupe_key',
    // ignoreDuplicates: true — sms-bridge.js): the second identical key inserts nothing.
  });

  it('a caller-supplied dedupeKey is never overwritten by the presence grant', async () => {
    const sender = makeSender();
    const res = await sendChairmanSMS({ ...ACK, dedupeKey: 'caller-key' }, QUIET_REPLY, {
      sender, console: silentConsole, presenceResolver: grantResolver('grant-2'),
    });
    expect(res.sent).toBe(true);
    expect(sender.send.mock.calls[0][0].dedupeKey).toBe('caller-key');
  });
});

describe('lint() quiet_hours reason-aware detail', () => {
  const MSG = { type: 'status', body: 'ack: on it.' };

  it('a window-allowed send names its reason in the finding detail', () => {
    const { findings, blocked } = lint(MSG, { nowHourET: 23, allowQuietHours: true, quietHoursAllowReason: 'measured_presence_reply' });
    expect(blocked).toBe(false);
    const qh = findings.find((f) => f.check === 'quiet_hours');
    expect(qh.ok).toBe(true);
    expect(qh.detail).toBe('ok (measured_presence_reply)');
  });

  it('a window-allowed send without a reason reports the default', () => {
    const { findings } = lint(MSG, { nowHourET: 23, allowQuietHours: true });
    expect(findings.find((f) => f.check === 'quiet_hours').detail).toBe('ok (allowed)');
  });

  it('daytime detail and the blocked detail are byte-identical to pre-SD', () => {
    const day = lint(MSG, { nowHourET: 14 });
    expect(day.findings.find((f) => f.check === 'quiet_hours').detail).toBe('ok');
    const night = lint(MSG, { nowHourET: 23 });
    const qh = night.findings.find((f) => f.check === 'quiet_hours');
    expect(qh.ok).toBe(false);
    expect(qh.detail).toBe('within 22:00-06:00 ET quiet window');
  });
});
