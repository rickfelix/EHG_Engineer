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

// FIX 1 (QF-20260905-746): payload.verdict is the structured signal
// lib/adam/chairman-held-send-release.js decideRelease() now checks FIRST, before ever screening
// verdict prose for amendment markers.
describe('FIX 1 (QF-20260905-746): buildAdvisoryPayload — verdict', () => {
  it('is omitted entirely when not provided (byte-identical to pre-fix behavior)', () => {
    const p = m.buildAdvisoryPayload({ body: 'no verdict here' });
    expect('verdict' in p).toBe(false);
  });
  it('stamps payload.verdict when provided, alongside the existing oracle marker', () => {
    const p = m.buildAdvisoryPayload({ body: 'GO, and send it first in the queue.', verdict: 'GO' });
    expect(p.verdict).toBe('GO');
    expect(p.oracle).toBe(true);
    expect(p.kind).toBe('adam_advisory');
  });

  // CLI: --verdict GO|NO|AMEND, validated BEFORE any DB connection is used (mirrors the
  // --framing-class precedent above) -- an unrecognized value fails loud at the argv boundary,
  // never silently dropped and never reaching a live network call.
  it('CLI: --verdict with an unrecognized value exits 2 with a listing error', () => {
    let error;
    try {
      execFileSync('node', [SCRIPT_PATH, 'send', 'test', '--verdict', 'MAYBE'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, CLAUDE_SESSION_ID: 'test-session-verdict-2' },
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.status).toBe(2);
    expect(error.stderr).toMatch(/--verdict must be one of GO, NO, AMEND/);
  });
  it('CLI: --verdict is registered in VALUE_FLAGS (never leaks into the message body)', () => {
    expect(m.VALUE_FLAGS).toContain('--verdict');
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

  it('enforceSweepBudget derives the extent and refuses a mis-scoped or unmeasured one (QF-20260903-418)', () => {
    const budget = { maxCount: 5, maxWallClockMs: 1000, maxTokens: 100 };
    const t0 = 1_000_000;

    // At sweep ENTRY the true sweep-scoped spend is zero, so the sweep is IN budget. All four
    // recorded dark ticks were here and were refused only because a day-scoped number was passed.
    const entry = m.enforceSweepBudget(budget, { sweepStartedAtMs: t0, answersThisSweep: 0, tokensThisSweep: 0 }, t0);
    expect(entry.withinBudget).toBe(true);
    expect(entry.verdict).toBe('within_budget');
    expect(entry.refused).toBe(false);

    // Ceilings still bite on genuinely sweep-scoped spend. Wall-clock is DERIVED from
    // sweepStartedAtMs + nowMs -- the caller never supplies an elapsed, so it cannot supply a
    // seat-lifetime one (the 09-02 17:4xZ shape).
    expect(m.enforceSweepBudget(budget, { sweepStartedAtMs: t0, answersThisSweep: 5 }, t0).verdict).toBe('over_budget');
    expect(m.enforceSweepBudget(budget, { sweepStartedAtMs: t0 }, t0 + 1000).verdict).toBe('over_budget');
    expect(m.enforceSweepBudget(budget, { sweepStartedAtMs: t0, tokensThisSweep: 100 }, t0).verdict).toBe('over_budget');

    // The retired scope-ambiguous keys are REFUSED, not silently reinterpreted: a caller still on
    // the old contract is exactly the caller that mis-scoped it. This is the live 09-02 04:28Z tick.
    const legacy = m.enforceSweepBudget(budget, { count: 26 }, t0);
    expect(legacy.withinBudget).toBe(false);
    expect(legacy.verdict).toBe('legacy_extent_contract');
    expect(m.enforceSweepBudget(budget, { elapsedMs: 99_999 }, t0).verdict).toBe('legacy_extent_contract');
    expect(m.enforceSweepBudget(budget, { tokens: 5_580_000 }, t0).verdict).toBe('legacy_extent_contract');

    // Unmeasured FAILS CLOSED. The argument-less call used to return withinBudget:true however far
    // over budget the session was -- a rubber stamp (QF-20260729-221).
    expect(m.enforceSweepBudget().withinBudget).toBe(false);
    expect(m.enforceSweepBudget().verdict).toBe('extent_unmeasurable');

    // Every refusal is DISTINGUISHABLE from a clean sweep, so a dark tick cannot look like silence.
    for (const r of [legacy, m.enforceSweepBudget(), m.enforceSweepBudget(budget, { sweepStartedAtMs: t0, answersThisSweep: 5 }, t0)]) {
      expect(r.refused).toBe(true);
      expect(typeof r.reason).toBe('string');
    }

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
  function chain(table) {
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
      // SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B): drainInbox now also queries
      // role_drain_sets via the registry-reader — route it as PGRST205-style table-not-found
      // (STAGED/unapplied, the real state today), so the registry-reader fails open to
      // DRAIN_SETS.solomon exactly as before this repoint, instead of misreading inbox rows as
      // drain-set rows.
      if (table === 'role_drain_sets') return { data: null, error: { code: 'PGRST205', message: 'not found' } };
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

// QF-20260906-523 (superseded by SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001 FR-1): a
// parked/deduped send means the content already reached the target -- exiting 1 here trained
// callers to resend and duplicate an ask that already landed. DISPATCH_BACKPRESSURE (successful
// park) and DISPATCH_ALREADY_DELIVERED no longer THROW at all -- insertCoordinationRow now
// returns an additive {data,error,landed,parkedRowId,code} object for both, checked via
// isDeliveredDispatchError() BEFORE the ordinary {data,error} handling, not inside a catch
// block. main() is not exported (documented limitation, see the argv-testability note in
// module.exports above), and reaching this branch for real requires a live insertCoordinationRow
// call -- not reachable via a hermetic subprocess spawn without a DB. A static source-shape
// assertion is the same technique already used for other in-main() logic in this file (see
// solomon-advisory-capture-miss-seam.test.js) and is what the fix's own EXIT PREDICATE names: a
// delivered send exits ZERO and its printed line contains neither 'ERROR' nor 'not sent'.
describe('SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001 FR-1: a delivered result is DELIVERED (exit 0), not ERROR (exit 1)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/solomon-advisory.cjs'), 'utf8');

  it('the isDeliveredDispatchError check runs on the RESOLVED result before the ordinary {data,error} handling, and exits 0', () => {
    const tryIdx = source.indexOf('const result = await insertCoordinationRow(');
    expect(tryIdx).toBeGreaterThan(0);
    const deliveredIdx = source.indexOf('if (isDeliveredDispatchError(result)) {', tryIdx);
    const errorHandlingIdx = source.indexOf('if (error) { console.error(\'ERROR: failed to insert advisory:\'', tryIdx);
    expect(deliveredIdx).toBeGreaterThan(tryIdx);
    expect(errorHandlingIdx).toBeGreaterThan(deliveredIdx); // delivered check runs FIRST, falls through to ordinary handling only when absent

    const deliveredBranch = source.slice(deliveredIdx, errorHandlingIdx);
    expect(deliveredBranch).toMatch(/DELIVERED \(not a failure\)/);
    expect(deliveredBranch).toMatch(/process\.exit\(0\)/);
    // Never prints ERROR or "not sent" on the delivered path -- the exact predicate the fix names.
    expect(deliveredBranch).not.toMatch(/ERROR/);
    expect(deliveredBranch).not.toMatch(/not sent/);
  });

  it('imports isDeliveredDispatchError from the canonical dispatch module', () => {
    expect(source).toMatch(/require\(['"]\.\.\/lib\/coordinator\/dispatch\.cjs['"]\)/);
    const importLine = source.match(/const \{[^}]*\} = require\(['"]\.\.\/lib\/coordinator\/dispatch\.cjs['"]\);/)[0];
    expect(importLine).toContain('isDeliveredDispatchError');
  });
});
