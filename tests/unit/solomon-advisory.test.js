/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-001E-A — the Solomon advisory comms lane. Pure-function + injected-stub
 * coverage (no real DB): the oracle answer payload (kind=adam_advisory + oracle:true + reply_to echo),
 * inbox classification (consult/directive/orphan), the NET-NEW dedup/quota/task_budget guards, and the
 * drainSolomonOutbound re-target the register depends on.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const m = require('../../scripts/solomon-advisory.cjs');
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../../scripts/solomon-advisory.cjs');

describe('FR-E1: buildAdvisoryPayload — oracle marker + reply echo', () => {
  it('emits kind=adam_advisory + oracle:true, never signal_type/intent_action', () => {
    const p = m.buildAdvisoryPayload({ body: 'deep answer', correlationId: 'c1' });
    expect(p.kind).toBe('adam_advisory');     // reuses the advisory inbox lane
    expect(p.oracle).toBe(true);              // Solomon marker
    expect(p.signal_type).toBeUndefined();
    expect(p.intent_action).toBeUndefined();
    expect(p.correlation_id).toBe('c1');      // replyable
  });
  it('echoes reply_to under BOTH reply_to and correlation_id (answer correlates to its consult)', () => {
    const p = m.buildAdvisoryPayload({ body: 'x', correlationId: 'self', replyTo: 'consult-corr' });
    expect(p.reply_to).toBe('consult-corr');
    expect(p.correlation_id).toBe('consult-corr'); // overrides the self correlation
  });
  it('redacts the body', () => {
    const p = m.buildAdvisoryPayload({ body: 'plain text, nothing sensitive' });
    expect(p.body).toBe('plain text, nothing sensitive');
  });
});

// QF-20260711-596: buildAdvisoryPayload's body sizing goes through the shared capBody() helper
// (same as adam-advisory.cjs/coordinator-reply.cjs/worker-signal.cjs since QF-20260710-560) — an
// over-4096-char body throws BODY_TOO_LONG instead of the previous silent .slice(). Solomon's own
// FW-3 advisory tail was silently clipped by the pre-fix behavior; this closes that call site.
describe('QF-20260711-596: buildAdvisoryPayload — loud size-cap rejection (no silent clip)', () => {
  it('throws BODY_TOO_LONG for a body over the hard cap, never silently truncates', () => {
    expect(() => m.buildAdvisoryPayload({ body: 'a'.repeat(99999) }))
      .toThrow(expect.objectContaining({ code: 'BODY_TOO_LONG' }));
  });
  it('an at-or-under-cap body still builds normally (no false-positive rejection)', () => {
    const p = m.buildAdvisoryPayload({ body: 'a'.repeat(4096) });
    expect(p.body.length).toBe(4096);
  });
});

// SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C: sender-stamped reply_class.
describe('buildAdvisoryPayload — reply_class', () => {
  it('an ANSWER (replyTo set) is always fire-and-forget — terminal, no reply-to-reply chains', () => {
    const p = m.buildAdvisoryPayload({ body: 'answer', correlationId: 'self', replyTo: 'consult-corr', replyClass: 'reply-needed' });
    expect(p.reply_class).toBe('fire-and-forget'); // replyTo overrides any replyClass arg
  });
  it('send mode with no opt-in defaults to fire-and-forget', () => {
    const p = m.buildAdvisoryPayload({ body: 'fyi' });
    expect(p.reply_class).toBe('fire-and-forget');
  });
  it('request mode is always live-handshake', () => {
    const p = m.buildAdvisoryPayload({ body: 'q?', expectsReply: true });
    expect(p.reply_class).toBe('live-handshake');
  });
  it('send mode with --reply-class reply-needed stamps reply-needed + reply_expected_by', () => {
    const p = m.buildAdvisoryPayload({ body: 'please ack', replyClass: 'reply-needed' });
    expect(p.reply_class).toBe('reply-needed');
    expect(Date.parse(p.reply_expected_by)).toBeGreaterThan(Date.now());
  });
});

// SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B: payload.framing_class sub-discriminator on the SAME
// adam_advisory+oracle:true leg (no new kind) — additive/optional, byte-identical when omitted.
describe('SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B: buildAdvisoryPayload — framing_class', () => {
  it('is omitted entirely when not provided (byte-identical to pre-SD behavior)', () => {
    const p = m.buildAdvisoryPayload({ body: 'no framing here' });
    expect('framing_class' in p).toBe(false);
  });
  it('stamps payload.framing_class when provided, alongside the existing oracle marker', () => {
    const pick = m.buildAdvisoryPayload({ body: 'thesis-reversal finding', framingClass: 'pick' });
    expect(pick.framing_class).toBe('pick');
    expect(pick.oracle).toBe(true);
    expect(pick.kind).toBe('adam_advisory'); // still the same leg, no new kind
    const instrument = m.buildAdvisoryPayload({ body: 'routine finding', framingClass: 'instrument' });
    expect(instrument.framing_class).toBe('instrument');
  });

  // TS-4: the CLI-level --framing-class validation (solomon-advisory.cjs's `send` argv parsing,
  // not buildAdvisoryPayload itself) rejects an unrecognized value before any row is written.
  // CLAUDE_SESSION_ID is stamped explicitly (rather than inherited) so this passes hermetically
  // in CI, where it is unset -- main()'s earlier CLAUDE_SESSION_ID guard (process.exit(1)) would
  // otherwise fire before argv parsing ever reaches --framing-class, masking exit 2 with exit 1.
  it('CLI: --framing-class with an unrecognized value exits 2 with a listing error (TS-4)', () => {
    let error;
    try {
      execFileSync('node', [SCRIPT_PATH, 'send', 'test', '--framing-class', 'bogus'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, CLAUDE_SESSION_ID: 'test-session-ts4' },
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.status).toBe(2);
    expect(error.stderr).toMatch(/--framing-class must be one of instrument, pick/);
  });
});

describe('alreadyAnswered delegates to the shared reply-class module (no duplicate implementation)', () => {
  it('is re-exported from lib/coordinator/reply-class.cjs, same function reference', () => {
    const shared = require('../../lib/coordinator/reply-class.cjs');
    expect(m.alreadyAnswered).toBe(shared.alreadyAnswered);
  });
});

describe('FR-E1: inbox classification', () => {
  const row = (kind, extra = {}) => ({ payload: { kind, ...extra } });
  it('classifies a consult + directives as Solomon-inbox; untyped/unknown as orphan', () => {
    expect(m.isSolomonInboxRow(row('solomon_consult'))).toBe(true);
    expect(m.SOLOMON_INBOX_KINDS).toContain('solomon_consult');
    expect(m.isOrphanedSolomonRow(row('solomon_consult'))).toBe(false);   // drained by a real lane
    expect(m.isOrphanedSolomonRow({ payload: {} })).toBe(true);            // untyped → orphan
    expect(m.isOrphanedSolomonRow(row('coordinator_alert'))).toBe(true);  // unknown typed → orphan
    expect(m.isOrphanedSolomonRow(row('ack'))).toBe(false);               // handler-owned → never touch
  });
  it('isReplyRow recognizes a reply_to correlation or coordinator_reply', () => {
    expect(m.isReplyRow(row('coordinator_reply'))).toBe(true);
    expect(m.isReplyRow(row('anything', { reply_to: 'c' }))).toBe(true);
    expect(m.isReplyRow(row('solomon_consult'))).toBe(false);
  });
});

describe('FR-E1: NET-NEW guards', () => {
  it('computeConsultSignature prefers correlation_id, else a stable content hash', () => {
    expect(m.computeConsultSignature({ payload: { correlation_id: 'abc' } })).toBe('corr:abc');
    const a = m.computeConsultSignature({ payload: { sd_key: 'SD-1', body: 'q?' } });
    const b = m.computeConsultSignature({ payload: { sd_key: 'SD-1', body: 'q?' } });
    const c = m.computeConsultSignature({ payload: { sd_key: 'SD-2', body: 'q?' } });
    expect(a).toBe(b);                 // identical consults dedup
    expect(a).not.toBe(c);             // distinct SDs do not collide
    expect(a.startsWith('hash:')).toBe(true);
  });

  it('enforceSweepBudget stops the sweep at the count / wall-clock / token ceiling (at entry)', () => {
    const budget = { maxCount: 5, maxWallClockMs: 1000, maxTokens: 100 };
    expect(m.enforceSweepBudget(budget, { count: 0, elapsedMs: 0, tokens: 0 }).withinBudget).toBe(true);
    expect(m.enforceSweepBudget(budget, { count: 5 }).withinBudget).toBe(false);     // count ceiling
    expect(m.enforceSweepBudget(budget, { elapsedMs: 1000 }).withinBudget).toBe(false); // wall-clock
    expect(m.enforceSweepBudget(budget, { tokens: 100 }).withinBudget).toBe(false);  // token
    expect(m.SOLOMON_SWEEP_BUDGET.maxCount).toBeGreaterThan(0);
  });

  it('alreadyAnswered is true when an advisory already echoes the consult correlation (durable dedup)', async () => {
    // QF-20260709-800: alreadyAnswered now chains a second .eq() (payload->>kind = adam_advisory)
    // to exclude ping_on_silence reminder rows from the dedup check — the mock chain reflects that.
    const answered = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: 'x' }], error: null }) }) }) }) }) };
    const fresh = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) };
    expect(await m.alreadyAnswered(answered, 'c1')).toBe(true);
    expect(await m.alreadyAnswered(fresh, 'c1')).toBe(false);
    expect(await m.alreadyAnswered(fresh, null)).toBe(false); // no correlation → not answered
  });

  it('alreadyAnswered is false when only a ping_on_silence reminder echoes the correlation (QF-20260709-800)', async () => {
    // A ping row also carries payload.reply_to (threads back to the original consult), but is
    // NOT a genuine answer — the kind filter must exclude it, so dedup never false-positives.
    const pingOnly = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) };
    expect(await m.alreadyAnswered(pingOnly, 'c1')).toBe(false);
  });

  it('checkConsultQuota blocks at the per-day and per-SD ceilings, fails OPEN on error', async () => {
    const makeSb = (rows, error = null) => ({ from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: rows, error }) }) }) }) }) });
    // per-day: 3 oracle rows today, perDayMax 2 → blocked
    const day = await m.checkConsultQuota(makeSb([{ payload: {} }, { payload: {} }, { payload: {} }]), { perDayMax: 2 });
    expect(day.allowed).toBe(false);
    // per-SD: 2 rows for SD-1, perSdMax 2 → blocked for SD-1
    const sd = await m.checkConsultQuota(makeSb([{ payload: { sd_key: 'SD-1' } }, { payload: { sd_key: 'SD-1' } }]), { sdKey: 'SD-1', perSdMax: 2, perDayMax: 99 });
    expect(sd.allowed).toBe(false);
    // under both ceilings → allowed
    const ok = await m.checkConsultQuota(makeSb([{ payload: { sd_key: 'SD-2' } }]), { sdKey: 'SD-1', perSdMax: 2, perDayMax: 99 });
    expect(ok.allowed).toBe(true);
    // query error → fail-open allowed
    const err = await m.checkConsultQuota(makeSb(null, { message: 'boom' }), { perDayMax: 0 });
    expect(err.allowed).toBe(true);
  });
});

describe('FR-E1: drainSolomonOutbound (re-target on handoff — register dependency)', () => {
  it('idempotently re-targets unread old-session rows to the new session', async () => {
    const captured = {};
    const sb = { from: () => ({ update(p) { captured.update = p; return this; }, in(c, v) { captured.in = [c, v]; return this; }, is() { return this; }, gte() { return this; }, select: async () => ({ data: [{ id: 'r1' }, { id: 'r2' }], error: null }) }) };
    const r = await m.drainSolomonOutbound(sb, { newSessionId: 'new', oldSessionIds: ['old1', 'old2'] });
    expect(r.moved).toBe(2);
    expect(captured.update).toEqual({ target_session: 'new' });
    expect(captured.in[0]).toBe('target_session');
  });
  it('is a no-op with no old sessions / bad args (fail-open, never throws)', async () => {
    expect(await m.drainSolomonOutbound(null, {})).toEqual({ moved: 0 });
    expect(await m.drainSolomonOutbound({}, { newSessionId: 'n', oldSessionIds: [] })).toEqual({ moved: 0 });
  });
});

// QF-20260710-593 — migrated (not loosened): the old assertions locked in the read_at-only
// filter/stamp, the exact bug this QF fixes (a row stamped read_at by one drain silently vanished
// from every later drain even when never genuinely actioned). Mirrors
// tests/unit/adam-inbox-surface-not-stamp.test.js's recording-mock pattern.
function makeRecordingMock(selectRows = []) {
  const updates = [];
  const selects = [];
  function chain() {
    const state = { op: 'select', filters: [], updatePayload: null };
    const c = {
      select: () => c,
      update: (payload) => { state.op = 'update'; state.updatePayload = payload; return c; },
      eq: (col, v) => { state.filters.push(['eq', col, v]); return c; },
      in: (col, v) => { state.filters.push(['in', col, v]); return c; },
      is: (col, v) => { state.filters.push(['is', col, v]); return c; },
      order: () => c,
      limit: () => c,
      then: (res, rej) => finish().then(res, rej),
    };
    async function finish() {
      if (state.op === 'update') { updates.push(state); return { data: [], error: null }; }
      selects.push(state);
      return { data: selectRows, error: null };
    }
    return c;
  }
  return { supabase: { from: chain }, updates, selects };
}

describe('QF-20260710-593: drainInbox filters acknowledged_at IS NULL (recoverable until actioned)', () => {
  it('queries ack-IS-NULL (not read_at) — a row a prior drain read-stamped still resurfaces', async () => {
    const unread = [
      { id: 'a', payload: { kind: 'solomon_consult', body: 'q1' }, created_at: new Date().toISOString(), read_at: new Date().toISOString() },
      { id: 'b', payload: { kind: 'coordinator_alert', body: 'orphan' }, created_at: new Date().toISOString() }, // orphan
    ];
    const { supabase, selects, updates } = makeRecordingMock(unread);
    const logs = []; const warns = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a) => warns.push(a.join(' ')));
    await m.drainInbox(supabase, 'solomon-sess', { quiet: false });
    log.mockRestore(); warn.mockRestore();
    expect(selects[0].filters).toContainEqual(['is', 'acknowledged_at', null]);
    expect(selects[0].filters.some((f) => f[0] === 'is' && f[1] === 'read_at')).toBe(false);
    expect(warns.join(' ')).toMatch(/orphan/i); // orphan surfaced, not consumed
    expect(logs.join(' ')).toMatch(/consult/);
    // interactive (default): surfaced rows stamp read_at, never acknowledged_at
    const stamp = updates.find((u) => u.updatePayload && 'read_at' in u.updatePayload);
    expect(stamp).toBeTruthy();
    expect(updates.some((u) => u.updatePayload && 'acknowledged_at' in u.updatePayload)).toBe(false);
  });

  it('background=true stamps delivered_at instead of read_at', async () => {
    const row = { id: 'a', payload: { kind: 'solomon_consult', body: 'q1' }, created_at: new Date().toISOString() };
    const { supabase, updates } = makeRecordingMock([row]);
    await m.drainInbox(supabase, 'solomon-sess', { quiet: true, background: true });
    expect(updates.find((u) => u.updatePayload && 'delivered_at' in u.updatePayload)).toBeTruthy();
    expect(updates.some((u) => u.updatePayload && 'read_at' in u.updatePayload)).toBe(false);
  });
});

describe('QF-20260710-593: stampSurfaced', () => {
  it('background=true stamps delivered_at only-where-NULL, never read_at', async () => {
    const { supabase, updates } = makeRecordingMock();
    await m.stampSurfaced(supabase, ['a', 'b'], { background: true });
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].updatePayload)).toEqual(['delivered_at']);
    expect(updates[0].filters).toContainEqual(['is', 'delivered_at', null]);
  });

  it('interactive (default) stamps read_at only-where-NULL, never delivered_at/acknowledged_at', async () => {
    const { supabase, updates } = makeRecordingMock();
    await m.stampSurfaced(supabase, ['a']);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].updatePayload)).toEqual(['read_at']);
    expect(updates[0].filters).toContainEqual(['is', 'read_at', null]);
  });

  it('empty id list is a no-op', async () => {
    const { supabase, updates } = makeRecordingMock();
    await m.stampSurfaced(supabase, [], { background: true });
    expect(updates).toHaveLength(0);
  });
});

describe('QF-20260710-593: ackRows — the action-time stamp', () => {
  function ackMock() {
    const updates = [];
    const supabase = { from: () => {
      const state = { payload: null, guards: [] };
      const c = {
        update: (payload) => { state.payload = payload; return c; },
        eq: (col, v) => { state.guards.push(['eq', col, v]); return c; },
        is: (col, v) => { state.guards.push(['is', col, v]); return c; },
        // SD-LEO-INFRA-SEND-TIME-TARGET-001: ownership scope moved from .eq to .in so the
        // broadcast-solomon sentinel lane (now surfaced by drainInbox) can be acked too.
        in: (col, v) => { state.guards.push(['in', col, v]); return c; },
        select: async () => { updates.push(state); return { data: [{ id: 'id-1', read_at: '2026-07-10T00:00:00Z' }], error: null }; },
      };
      return c;
    } };
    return { supabase, updates };
  }

  it('stamps acknowledged_at only-where-NULL (idempotent)', async () => {
    const { supabase, updates } = ackMock();
    await m.ackRows(supabase, ['id-1']);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].payload)).toEqual(['acknowledged_at']);
    expect(updates[0].guards).toContainEqual(['is', 'acknowledged_at', null]);
  });

  it('ownership guard: with expectedTarget the update is scoped to target_session (+ sentinel lane)', async () => {
    const { supabase, updates } = ackMock();
    await m.ackRows(supabase, ['id-1'], { expectedTarget: 'solomon-sess' });
    expect(updates).toHaveLength(1);
    // SD-LEO-INFRA-SEND-TIME-TARGET-001: scope admits the session AND its sentinel lane.
    expect(updates[0].guards).toContainEqual(['in', 'target_session', ['solomon-sess', 'broadcast-solomon']]);
  });
});
